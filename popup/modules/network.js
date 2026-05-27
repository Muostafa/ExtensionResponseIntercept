import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { debug } from '../../shared/debug.js';
import { NETWORK_REFRESH_INTERVAL_MS } from '../../shared/constants.js';
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
        displayNetworkLogs([]);
        showToast('Network logs cleared', 'success');
      } catch (error) {
        debug.error('Failed to clear network logs:', error);
        showToast('Failed to clear logs', 'error');
      }
    });
  }
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

function displayNetworkLogs(logs) {
  const networkLogsList = document.getElementById('networkLogsList');
  const networkEmptyState = document.getElementById('networkEmptyState');
  if (!networkLogsList) return;

  let filteredLogs = logs;
  if (state.networkSearchQuery.trim()) {
    const query = state.networkSearchQuery.toLowerCase();
    filteredLogs = logs.filter(log =>
      log.url.toLowerCase().includes(query) ||
      log.method.toLowerCase().includes(query)
    );
  }

  if (filteredLogs.length === 0) {
    networkLogsList.innerHTML = '';
    if (networkEmptyState) {
      networkEmptyState.style.display = 'block';
      if (logs.length > 0 && state.networkSearchQuery.trim()) {
        networkEmptyState.querySelector('h3').textContent = 'No Results';
        networkEmptyState.querySelector('p').textContent = 'No requests match your filter';
      } else {
        networkEmptyState.querySelector('h3').textContent = 'No Network Requests';
        networkEmptyState.querySelector('p').textContent = 'Attach debugger to start capturing network requests';
      }
    }
    return;
  }

  if (networkEmptyState) networkEmptyState.style.display = 'none';

  networkLogsList.innerHTML = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const urlObj = new URL(log.url);
    const shortUrl = urlObj.pathname + urlObj.search;
    const hasResponse = log.responseBody !== null && log.responseBody !== undefined;
    const statusClass = log.responseStatus ? (log.responseStatus >= 400 ? 'error' : 'success') : '';

    return `
      <div class="network-log-item ${log.intercepted ? 'intercepted' : ''} ${hasResponse ? 'has-response' : ''}" data-log-id="${log.id}">
        <div class="network-log-header">
          <div class="network-log-info">
            <div>
              <span class="network-log-method ${log.method}">${log.method}</span>
              ${log.responseStatus ? `<span class="network-log-status ${statusClass}">${log.responseStatus}</span>` : '<span class="network-log-status pending">...</span>'}
              <span class="network-log-time">${time}</span>
            </div>
            <span class="network-log-url" title="${escapeHtml(log.url)}">${escapeHtml(shortUrl)}</span>
            <div class="network-log-meta">
              <span>${urlObj.host}</span>
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
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-create-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const logId = e.currentTarget.dataset.logId;
      const log = state.networkLogs.find(l => l.id === logId);
      if (log) openCreateRuleModal(log);
    });
  });
}
