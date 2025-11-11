// History page script
let historyData = [];
let filteredData = [];
let currentDetailEntry = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  setupEventListeners();
  setupFilters();
});

async function loadHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
    historyData = response.history || [];
    applyFilters();
    updateStats();
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

function setupEventListeners() {
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('exportHistoryBtn').addEventListener('click', exportToHAR);
  document.getElementById('openOptionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('recordResponseBtn').addEventListener('click', recordResponse);

  // Close modal when clicking outside
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.id === 'detailModal') {
      closeModal();
    }
  });
}

function setupFilters() {
  const searchInput = document.getElementById('searchInput');
  const filterModified = document.getElementById('filterModified');
  const filterUnmodified = document.getElementById('filterUnmodified');
  const methodFilter = document.getElementById('methodFilter');

  searchInput.addEventListener('input', applyFilters);
  filterModified.addEventListener('change', applyFilters);
  filterUnmodified.addEventListener('change', applyFilters);
  methodFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const showModified = document.getElementById('filterModified').checked;
  const showUnmodified = document.getElementById('filterUnmodified').checked;
  const methodFilter = document.getElementById('methodFilter').value;

  filteredData = historyData.filter(entry => {
    // Search filter
    const matchesSearch = !searchTerm ||
      entry.url.toLowerCase().includes(searchTerm) ||
      entry.method.toLowerCase().includes(searchTerm) ||
      (entry.ruleApplied && entry.ruleApplied.toLowerCase().includes(searchTerm));

    // Modified filter
    const isModified = entry.modifiedResponse !== null;
    const matchesModified = (showModified && isModified) || (showUnmodified && !isModified);

    // Method filter
    const matchesMethod = !methodFilter || entry.method === methodFilter;

    return matchesSearch && matchesModified && matchesMethod;
  });

  displayHistory();
}

function displayHistory() {
  const historyList = document.getElementById('historyList');
  const emptyState = document.getElementById('emptyState');

  if (filteredData.length === 0) {
    historyList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  historyList.style.display = 'block';
  emptyState.style.display = 'none';

  historyList.innerHTML = filteredData.map(entry => {
    const isModified = entry.modifiedResponse !== null;
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const statusCode = entry.originalResponse.statusCode;
    const finalStatusCode = isModified ? entry.modifiedResponse.statusCode : statusCode;

    return `
      <div class="history-item ${isModified ? 'modified' : ''}" data-entry-id="${entry.id}">
        <div class="history-item-header">
          <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
            <span class="history-item-method method-${entry.method}">${entry.method}</span>
            <span class="history-item-url" title="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</span>
          </div>
          <div class="history-item-badges">
            ${isModified ? '<span class="badge badge-modified">Modified</span>' : ''}
            <span class="badge badge-status">${statusCode}${finalStatusCode !== statusCode ? ' → ' + finalStatusCode : ''}</span>
            ${entry.ruleApplied ? `<span class="badge badge-rule">${escapeHtml(entry.ruleApplied)}</span>` : ''}
          </div>
        </div>
        <div class="history-item-meta">
          <span>🕐 ${timestamp}</span>
          ${entry.processingTime ? `<span>⚡ ${entry.processingTime}ms</span>` : ''}
          <span>📄 ${entry.originalResponse.contentType || 'unknown'}</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const entryId = item.dataset.entryId;
      const entry = filteredData.find(e => e.id === entryId);
      if (entry) {
        showDetailModal(entry);
      }
    });
  });
}

function updateStats() {
  const totalRequests = historyData.length;
  const modifiedRequests = historyData.filter(e => e.modifiedResponse !== null).length;
  const avgTime = historyData.length > 0
    ? Math.round(historyData.reduce((sum, e) => sum + (e.processingTime || 0), 0) / historyData.length)
    : 0;

  document.getElementById('totalRequests').textContent = totalRequests;
  document.getElementById('modifiedRequests').textContent = modifiedRequests;
  document.getElementById('avgProcessingTime').textContent = avgTime + 'ms';
}

function showDetailModal(entry) {
  currentDetailEntry = entry;
  const modal = document.getElementById('detailModal');
  const modalBody = document.getElementById('modalBody');

  const isModified = entry.modifiedResponse !== null;
  const timestamp = new Date(entry.timestamp).toLocaleString();

  let html = `
    <div class="detail-section">
      <h3>Request Information</h3>
      <div class="detail-row">
        <span class="detail-label">URL:</span>
        <span class="detail-value">${escapeHtml(entry.url)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Method:</span>
        <span class="detail-value">${entry.method}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Time:</span>
        <span class="detail-value">${timestamp}</span>
      </div>
      ${entry.processingTime ? `
      <div class="detail-row">
        <span class="detail-label">Processing Time:</span>
        <span class="detail-value">${entry.processingTime}ms</span>
      </div>
      ` : ''}
      ${entry.ruleApplied ? `
      <div class="detail-row">
        <span class="detail-label">Rule Applied:</span>
        <span class="detail-value">${escapeHtml(entry.ruleApplied)}</span>
      </div>
      ` : ''}
    </div>
  `;

  // Request Headers
  if (entry.request && entry.request.headers) {
    html += `
      <div class="detail-section">
        <h3>Request Headers</h3>
        <div class="headers-list">
          ${Object.entries(entry.request.headers).map(([name, value]) => `
            <div class="header-item">
              <span class="header-name">${escapeHtml(name)}:</span>
              <span class="header-value">${escapeHtml(value)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Response comparison
  if (isModified) {
    html += `
      <div class="detail-section">
        <h3>Response Comparison</h3>
        ${createDiffView(entry)}
      </div>
    `;
  } else {
    html += `
      <div class="detail-section">
        <h3>Response</h3>
        ${createResponseView(entry.originalResponse)}
      </div>
    `;
  }

  modalBody.innerHTML = html;
  modal.classList.add('active');
}

function createDiffView(entry) {
  const original = entry.originalResponse;
  const modified = entry.modifiedResponse;

  return `
    <div class="diff-container">
      <div class="diff-panel">
        <div class="diff-panel-header">Original Response</div>
        <div class="diff-panel-body">
          ${createResponseView(original)}
        </div>
      </div>
      <div class="diff-panel">
        <div class="diff-panel-header">Modified Response</div>
        <div class="diff-panel-body">
          ${createResponseView(modified)}
        </div>
      </div>
    </div>
  `;
}

function createResponseView(response) {
  let html = `
    <div class="detail-row">
      <span class="detail-label">Status Code:</span>
      <span class="detail-value">${response.statusCode}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Content-Type:</span>
      <span class="detail-value">${response.contentType || 'unknown'}</span>
    </div>
  `;

  // Headers
  if (response.headers && response.headers.length > 0) {
    html += `
      <div style="margin-top: 15px;">
        <strong>Headers:</strong>
        <div class="headers-list" style="margin-top: 8px;">
          ${response.headers.map(header => `
            <div class="header-item">
              <span class="header-name">${escapeHtml(header.name)}:</span>
              <span class="header-value">${escapeHtml(header.value)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Body
  if (response.body) {
    let bodyDisplay = response.body;

    // Try to pretty-print JSON
    if (response.contentType && response.contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(response.body);
        bodyDisplay = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // Not valid JSON, use as-is
      }
    }

    html += `
      <div style="margin-top: 15px;">
        <strong>Body:</strong>
        <div class="code-block">${escapeHtml(bodyDisplay)}</div>
      </div>
    `;
  }

  return html;
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('active');
  currentDetailEntry = null;
}

async function recordResponse() {
  if (!currentDetailEntry) return;

  const entry = currentDetailEntry;
  const response = entry.modifiedResponse || entry.originalResponse;

  const recording = {
    name: `Recording - ${entry.method} ${new URL(entry.url).pathname}`,
    url: entry.url,
    method: entry.method,
    urlPattern: entry.url,
    matchType: 'exact',
    response: {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      contentType: response.contentType
    }
  };

  try {
    await chrome.runtime.sendMessage({
      action: 'addRecording',
      recording
    });

    alert('Response saved as recording! You can use it in the Recordings tab.');
    closeModal();
  } catch (error) {
    console.error('Failed to save recording:', error);
    alert('Failed to save recording');
  }
}

async function clearHistory() {
  if (!confirm('Are you sure you want to clear all history?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: 'clearHistory' });
    historyData = [];
    applyFilters();
    updateStats();
  } catch (error) {
    console.error('Failed to clear history:', error);
    alert('Failed to clear history');
  }
}

function exportToHAR() {
  // Create HAR format export
  const har = {
    log: {
      version: '1.2',
      creator: {
        name: 'API Response Interceptor',
        version: '1.0'
      },
      entries: historyData.map(entry => ({
        startedDateTime: new Date(entry.timestamp).toISOString(),
        time: entry.processingTime || 0,
        request: {
          method: entry.method,
          url: entry.url,
          httpVersion: 'HTTP/1.1',
          headers: entry.request && entry.request.headers
            ? Object.entries(entry.request.headers).map(([name, value]) => ({ name, value }))
            : [],
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: -1
        },
        response: {
          status: entry.modifiedResponse
            ? entry.modifiedResponse.statusCode
            : entry.originalResponse.statusCode,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: (entry.modifiedResponse || entry.originalResponse).headers || [],
          cookies: [],
          content: {
            size: (entry.modifiedResponse || entry.originalResponse).body
              ? (entry.modifiedResponse || entry.originalResponse).body.length
              : 0,
            mimeType: (entry.modifiedResponse || entry.originalResponse).contentType || 'text/plain',
            text: (entry.modifiedResponse || entry.originalResponse).body || ''
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: -1
        },
        cache: {},
        timings: {
          send: 0,
          wait: entry.processingTime || 0,
          receive: 0
        }
      }))
    }
  };

  const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `api-interceptor-history-${Date.now()}.har`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
