import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { debug } from '../../shared/debug.js';
import { NETWORK_REFRESH_INTERVAL_MS } from '../../shared/constants.js';
import { toCurl } from '../../shared/curl.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { openCreateRuleModal } from './create-rule-modal.js';

export function setupViewTabs() {
  document.getElementById('rulesTabBtn')?.addEventListener('click', () => switchView('rules'));
  document.getElementById('networkTabBtn')?.addEventListener('click', () => switchView('network'));
}

export function switchView(view) {
  state.currentView = view;
  const rulesTabBtn = document.getElementById('rulesTabBtn');
  const networkTabBtn = document.getElementById('networkTabBtn');
  const rulesSection = document.querySelector('.rules-section');
  const networkSection = document.getElementById('networkSection');

  if (view === 'rules') {
    rulesTabBtn?.classList.add('active');
    networkTabBtn?.classList.remove('active');
    if (rulesSection) rulesSection.style.display = 'block';
    if (networkSection) networkSection.style.display = 'none';
    stopNetworkRefresh();
  } else {
    rulesTabBtn?.classList.remove('active');
    networkTabBtn?.classList.add('active');
    if (rulesSection) rulesSection.style.display = 'none';
    if (networkSection) networkSection.style.display = 'block';
    loadNetworkLogs();
    startNetworkRefresh();
  }
}

export function setupNetworkSection() {
  const networkSearchInput = document.getElementById('networkSearchInput');
  if (networkSearchInput) {
    networkSearchInput.addEventListener('input', (e) => {
      state.networkSearchQuery = e.target.value;
      displayNetworkLogs(state.networkLogs);
    });

    networkSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        networkSearchInput.value = '';
        state.networkSearchQuery = '';
        displayNetworkLogs(state.networkLogs);
      }
    });
  }

  const toggleLoggingBtn = document.getElementById('toggleNetworkLogging');
  if (toggleLoggingBtn) {
    toggleLoggingBtn.addEventListener('click', toggleNetworkLogging);
    loadNetworkLoggingStatus();
  }

  const clearNetworkLogsBtn = document.getElementById('clearNetworkLogs');
  if (clearNetworkLogsBtn) {
    clearNetworkLogsBtn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({
          action: MESSAGES.CLEAR_NETWORK_LOGS,
          tabId: state.currentTab?.id
        });
        state.networkLogs = [];
        state.expandedLogIds.clear();
        displayNetworkLogs([]);
        showToast('Network logs cleared', 'success');
      } catch (error) {
        debug.error('Failed to clear network logs:', error);
        showToast('Failed to clear logs', 'error');
      }
    });
  }

  // Method / status quick-filter chips. Selecting one within a group clears the
  // others in that group and re-renders.
  document.querySelectorAll('#networkFilterChips .nfc-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.closest('.nfc-group');
      if (!group) return;
      group.querySelectorAll('.nfc-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (group.dataset.filter === 'method') {
        state.networkMethodFilter = chip.dataset.method || '';
      } else {
        state.networkStatusFilter = chip.dataset.status || '';
      }
      displayNetworkLogs(state.networkLogs);
    });
  });
}

async function loadNetworkLoggingStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_NETWORK_LOGGING_STATUS });
    state.isNetworkLoggingEnabled = response.enabled;
    updateLoggingButtonState();
  } catch (error) {
    debug.error('Failed to load network logging status:', error);
  }
}

async function toggleNetworkLogging() {
  try {
    const newState = !state.isNetworkLoggingEnabled;
    await chrome.runtime.sendMessage({
      action: MESSAGES.SET_NETWORK_LOGGING,
      enabled: newState
    });
    state.isNetworkLoggingEnabled = newState;
    updateLoggingButtonState();
    showToast(newState ? 'Network logging resumed' : 'Network logging paused', 'success');
  } catch (error) {
    debug.error('Failed to toggle network logging:', error);
    showToast('Failed to toggle logging', 'error');
  }
}

function updateLoggingButtonState() {
  const toggleBtn = document.getElementById('toggleNetworkLogging');
  const toggleText = document.getElementById('toggleLoggingText');
  if (!toggleBtn) return;

  if (state.isNetworkLoggingEnabled) {
    toggleBtn.classList.add('logging-active');
    toggleBtn.classList.remove('logging-paused');
    toggleBtn.title = 'Stop logging';
    if (toggleText) toggleText.textContent = 'Recording';
  } else {
    toggleBtn.classList.remove('logging-active');
    toggleBtn.classList.add('logging-paused');
    toggleBtn.title = 'Start logging';
    if (toggleText) toggleText.textContent = 'Paused';
  }
}

export function startNetworkRefresh() {
  if (state.networkRefreshInterval) clearInterval(state.networkRefreshInterval);
  state.networkRefreshInterval = setInterval(() => {
    if (state.currentView === 'network') {
      loadNetworkLogs();
    }
  }, NETWORK_REFRESH_INTERVAL_MS);
}

export function stopNetworkRefresh() {
  if (state.networkRefreshInterval) {
    clearInterval(state.networkRefreshInterval);
    state.networkRefreshInterval = null;
  }
}

async function loadNetworkLogs() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.GET_NETWORK_LOGS,
      tabId: state.currentTab?.id
    });
    state.networkLogs = response.logs || [];
    displayNetworkLogs(state.networkLogs);

    const countBadge = document.getElementById('networkLogsCount');
    if (countBadge) {
      if (state.networkLogs.length > 0) {
        countBadge.textContent = state.networkLogs.length > 99 ? '99+' : state.networkLogs.length;
        countBadge.style.display = 'inline';
      } else {
        countBadge.style.display = 'none';
      }
    }
  } catch (error) {
    debug.error('Failed to load network logs:', error);
  }
}

function hasActiveNetworkFilter() {
  return !!(state.networkSearchQuery.trim() || state.networkMethodFilter || state.networkStatusFilter);
}

function filterLogs(logs) {
  const query = state.networkSearchQuery.trim().toLowerCase();
  const method = state.networkMethodFilter;
  const statusGroup = state.networkStatusFilter; // '', '2xx', '3xx', '4xx', '5xx'
  return logs.filter(log => {
    if (method && log.method !== method) return false;
    if (statusGroup) {
      if (!log.responseStatus) return false;
      if (`${Math.floor(log.responseStatus / 100)}xx` !== statusGroup) return false;
    }
    if (query && !log.url.toLowerCase().includes(query) && !log.method.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

function kvRowsFromObject(obj) {
  const keys = Object.keys(obj || {});
  if (keys.length === 0) return '<div class="nld-empty">None</div>';
  return keys.map(k =>
    `<div class="nld-kv"><span class="nld-k">${escapeHtml(k)}</span><span class="nld-v">${escapeHtml(String(obj[k]))}</span></div>`
  ).join('');
}

function kvRowsFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '<div class="nld-empty">None</div>';
  return arr.map(h =>
    `<div class="nld-kv"><span class="nld-k">${escapeHtml(h.name)}</span><span class="nld-v">${escapeHtml(String(h.value))}</span></div>`
  ).join('');
}

function renderLogDetails(log) {
  const hasResponse = log.responseBody !== null && log.responseBody !== undefined;
  return `
    <div class="network-log-details">
      <div class="nld-section">
        <div class="nld-title">Request headers</div>
        <div class="nld-kv-list">${kvRowsFromObject(log.headers)}</div>
      </div>
      ${log.postData ? `
      <div class="nld-section">
        <div class="nld-title">Request body</div>
        <pre class="nld-body">${escapeHtml(log.postData)}</pre>
      </div>` : ''}
      <div class="nld-section">
        <div class="nld-title">Response headers${log.responseStatus ? ` · ${log.responseStatus}` : ''}</div>
        <div class="nld-kv-list">${kvRowsFromArray(log.responseHeaders)}</div>
      </div>
      <div class="nld-section">
        <div class="nld-title">Response body</div>
        ${hasResponse
          ? `<pre class="nld-body">${escapeHtml(log.responseBody)}</pre>`
          : '<div class="nld-empty">Not captured (binary, empty, or still pending)</div>'}
      </div>
      <div class="nld-actions">
        <button type="button" class="nld-copy-btn" data-copy="curl" data-log-id="${log.id}">Copy as cURL</button>
        ${hasResponse ? `<button type="button" class="nld-copy-btn" data-copy="response" data-log-id="${log.id}">Copy response</button>` : ''}
      </div>
    </div>
  `;
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied`, 'success');
  } catch (error) {
    debug.error('Clipboard write failed:', error);
    showToast('Failed to copy', 'error');
  }
}

function displayNetworkLogs(logs) {
  const networkLogsList = document.getElementById('networkLogsList');
  const networkEmptyState = document.getElementById('networkEmptyState');
  if (!networkLogsList) return;

  const filteredLogs = filterLogs(logs);

  if (filteredLogs.length === 0) {
    networkLogsList.innerHTML = '';
    if (networkEmptyState) {
      networkEmptyState.style.display = 'block';
      if (logs.length > 0 && hasActiveNetworkFilter()) {
        networkEmptyState.querySelector('h3').textContent = 'No Results';
        networkEmptyState.querySelector('p').textContent = 'No requests match your filter';
      } else {
        networkEmptyState.querySelector('h3').textContent = 'No Network Requests';
        networkEmptyState.querySelector('p').textContent = 'Turn on “Intercept this tab” to start capturing requests';
      }
    }
    return;
  }

  if (networkEmptyState) networkEmptyState.style.display = 'none';

  networkLogsList.innerHTML = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    let shortUrl = log.url;
    let host = '';
    try {
      const urlObj = new URL(log.url);
      shortUrl = urlObj.pathname + urlObj.search;
      host = urlObj.host;
    } catch { /* non-standard URL — fall back to the raw string */ }
    const hasResponse = log.responseBody !== null && log.responseBody !== undefined;
    const statusClass = log.responseStatus ? (log.responseStatus >= 400 ? 'error' : 'success') : '';
    const expanded = state.expandedLogIds.has(log.id);

    return `
      <div class="network-log-item ${log.intercepted ? 'intercepted' : ''} ${hasResponse ? 'has-response' : ''} ${expanded ? 'expanded' : ''}" data-log-id="${log.id}">
        <div class="network-log-header" role="button" tabindex="0" aria-expanded="${expanded}">
          <span class="network-log-chevron" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
          <div class="network-log-info">
            <div>
              <span class="network-log-method ${log.method}">${log.method}</span>
              ${log.responseStatus ? `<span class="network-log-status ${statusClass}">${log.responseStatus}</span>` : '<span class="network-log-status pending">...</span>'}
              <span class="network-log-time">${time}</span>
            </div>
            <span class="network-log-url" title="${escapeHtml(log.url)}">${escapeHtml(shortUrl)}</span>
            <div class="network-log-meta">
              <span>${escapeHtml(host)}</span>
              ${log.intercepted ? `<span class="intercepted-badge">Intercepted by: ${escapeHtml(log.ruleName)}</span>` : ''}
              ${hasResponse ? '<span class="response-badge">Response captured</span>' : ''}
            </div>
          </div>
          <div class="network-log-actions">
            <button class="btn-create-rule" data-log-id="${log.id}" title="${hasResponse ? 'Create rule with captured response' : 'Create rule from this request'}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Rule
            </button>
          </div>
        </div>
        ${expanded ? renderLogDetails(log) : ''}
      </div>
    `;
  }).join('');

  attachNetworkLogListeners();
}

function toggleLogExpanded(logId) {
  if (state.expandedLogIds.has(logId)) {
    state.expandedLogIds.delete(logId);
  } else {
    state.expandedLogIds.add(logId);
  }
  displayNetworkLogs(state.networkLogs);
}

function attachNetworkLogListeners() {
  document.querySelectorAll('.network-log-header').forEach(header => {
    const item = header.closest('.network-log-item');
    const logId = item?.dataset.logId;
    if (!logId) return;
    const toggle = (e) => {
      if (e.target.closest('.network-log-actions')) return; // let the Rule button do its thing
      toggleLogExpanded(logId);
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLogExpanded(logId); }
    });
  });

  document.querySelectorAll('.btn-create-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const logId = e.currentTarget.dataset.logId;
      const log = state.networkLogs.find(l => l.id === logId);
      if (log) openCreateRuleModal(log);
    });
  });

  document.querySelectorAll('.nld-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const { copy, logId } = e.currentTarget.dataset;
      const log = state.networkLogs.find(l => l.id === logId);
      if (!log) return;
      if (copy === 'curl') copyText(toCurl(log), 'cURL');
      else if (copy === 'response') copyText(log.responseBody || '', 'Response');
    });
  });
}
