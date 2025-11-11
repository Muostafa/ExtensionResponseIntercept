// Options page script
let currentEditingRuleId = null;
let headerModificationCounter = 0;

// Initialize options page
document.addEventListener('DOMContentLoaded', async () => {
  await loadRules();
  await loadRecordings();
  await loadRecentHistory();
  setupEventListeners();
  setupNavigation();
});

// Setup navigation
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      showTab(tab);

      // Update active nav item
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Show selected tab
  const selectedTab = document.getElementById(`${tabName}-tab`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // Update nav
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.classList.remove('active');
    if (nav.dataset.tab === tabName) {
      nav.classList.add('active');
    }
  });

  // Reset form if switching to new-rule tab
  if (tabName === 'new-rule' && !currentEditingRuleId) {
    resetForm();
  }
}

// Load and display rules
async function loadRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];

    displayRules(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function displayRules(rules) {
  const rulesList = document.getElementById('rulesList');
  const emptyState = document.getElementById('emptyState');

  if (rules.length === 0) {
    rulesList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  rulesList.style.display = 'grid';
  emptyState.style.display = 'none';

  rulesList.innerHTML = rules.map(rule => {
    const methods = rule.methods && rule.methods.length > 0
      ? rule.methods.join(', ')
      : 'All Methods';

    return `
      <div class="rule-card ${rule.enabled ? '' : 'disabled'}">
        <div class="rule-card-header">
          <div>
            <div class="rule-card-title">${escapeHtml(rule.name)}</div>
            ${rule.description ? `<div class="rule-card-description">${escapeHtml(rule.description)}</div>` : ''}
          </div>
          <div class="toggle-switch-small">
            <input type="checkbox" id="toggle-${rule.id}" ${rule.enabled ? 'checked' : ''} data-rule-id="${rule.id}">
            <label for="toggle-${rule.id}"></label>
          </div>
        </div>

        <div class="rule-card-pattern">${escapeHtml(rule.urlPattern)}</div>

        <div class="rule-card-meta">
          <span class="rule-badge">${rule.matchType}</span>
          <span class="rule-badge method">${methods}</span>
          <span class="rule-badge">${getModifyTypeLabel(rule.modifyType)}</span>
        </div>

        <div class="rule-card-actions">
          <button class="btn btn-secondary btn-small edit-btn" data-rule-id="${rule.id}">Edit</button>
          <button class="btn btn-danger btn-small delete-btn" data-rule-id="${rule.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  attachRuleEventListeners();
}

function attachRuleEventListeners() {
  // Toggle switches
  document.querySelectorAll('.toggle-switch-small input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await toggleRule(ruleId);
    });
  });

  // Edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      editRule(ruleId);
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      deleteRule(ruleId);
    });
  });
}

function getModifyTypeLabel(type) {
  const labels = {
    'replace': 'Replace Body',
    'json-path': 'JSON Path',
    'regex': 'Regex',
    'function': 'Function'
  };
  return labels[type] || type;
}

// Setup event listeners
function setupEventListeners() {
  // Add new rule button
  document.getElementById('addNewRuleBtn').addEventListener('click', () => {
    currentEditingRuleId = null;
    resetForm();
    showTab('new-rule');
  });

  // Form submit
  document.getElementById('ruleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveRule();
  });

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    currentEditingRuleId = null;
    resetForm();
    showTab('rules');
  });

  // Modify type change
  document.getElementById('modifyType').addEventListener('change', (e) => {
    updateModificationOptions(e.target.value);
  });

  // Import/Export buttons
  document.getElementById('exportBtn').addEventListener('click', exportRules);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importRules);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllRules);

  // Header modification buttons
  document.getElementById('addHeaderBtn').addEventListener('click', addHeaderModification);
  document.getElementById('clearHeadersBtn').addEventListener('click', () => {
    if (document.querySelectorAll('#headerModifications .header-mod-row').length > 0) {
      if (confirm('Clear all header modifications?')) {
        clearHeaderModifications();
      }
    }
  });

  // History buttons
  document.getElementById('openHistoryPageBtn').addEventListener('click', openHistoryPage);
  document.getElementById('openHistoryPageBtn2').addEventListener('click', openHistoryPage);

  // Recordings button
  document.getElementById('clearRecordingsBtn').addEventListener('click', clearAllRecordings);
}

function updateModificationOptions(type) {
  // Hide all options
  document.querySelectorAll('.modification-options').forEach(el => {
    el.style.display = 'none';
  });

  // Show selected option
  const optionMap = {
    'replace': 'replaceOptions',
    'json-path': 'jsonPathOptions',
    'regex': 'regexOptions',
    'function': 'functionOptions'
  };

  const selectedOption = document.getElementById(optionMap[type]);
  if (selectedOption) {
    selectedOption.style.display = 'block';
  }
}

async function saveRule() {
  const ruleData = collectFormData();

  if (!ruleData) {
    alert('Please fill in all required fields');
    return;
  }

  try {
    if (currentEditingRuleId) {
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: currentEditingRuleId,
        rule: ruleData
      });
    } else {
      await chrome.runtime.sendMessage({
        action: 'addRule',
        rule: ruleData
      });
    }

    currentEditingRuleId = null;
    resetForm();
    await loadRules();
    showTab('rules');
  } catch (error) {
    console.error('Failed to save rule:', error);
    alert('Failed to save rule: ' + error.message);
  }
}

function collectFormData() {
  const name = document.getElementById('ruleName').value.trim();
  const description = document.getElementById('ruleDescription').value.trim();
  const urlPattern = document.getElementById('urlPattern').value.trim();
  const matchType = document.getElementById('matchType').value;
  const modifyType = document.getElementById('modifyType').value;
  const enabled = document.getElementById('ruleEnabled').checked;

  if (!name || !urlPattern) {
    return null;
  }

  // Get selected methods
  const methods = Array.from(document.querySelectorAll('input[name="methods"]:checked'))
    .map(cb => cb.value);

  // Get modification data based on type
  let modification = {};

  switch (modifyType) {
    case 'replace':
      modification = {
        type: 'text',
        value: document.getElementById('replaceValue').value
      };
      break;

    case 'json-path':
      modification = {
        path: document.getElementById('jsonPath').value,
        value: document.getElementById('jsonValue').value
      };
      break;

    case 'regex':
      modification = {
        pattern: document.getElementById('regexPattern').value,
        replacement: document.getElementById('regexReplacement').value,
        flags: document.getElementById('regexFlags').value
      };
      break;

    case 'function':
      modification = {
        code: document.getElementById('functionCode').value
      };
      break;
  }

  // Get status code modification
  const statusCode = document.getElementById('modifyStatusCode').value.trim();
  const modifyStatusCode = statusCode ? parseInt(statusCode, 10) : null;

  // Get header modifications
  const modifyHeaders = getHeaderModifications();

  return {
    name,
    description,
    urlPattern,
    matchType,
    methods,
    modifyType,
    modification,
    modifyStatusCode,
    modifyHeaders: modifyHeaders.length > 0 ? modifyHeaders : undefined,
    enabled
  };
}

async function editRule(ruleId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      alert('Rule not found');
      return;
    }

    currentEditingRuleId = ruleId;
    populateForm(rule);
    showTab('new-rule');
    document.getElementById('formTitle').textContent = 'Edit Rule';
  } catch (error) {
    console.error('Failed to edit rule:', error);
  }
}

function populateForm(rule) {
  document.getElementById('ruleId').value = rule.id;
  document.getElementById('ruleName').value = rule.name;
  document.getElementById('ruleDescription').value = rule.description || '';
  document.getElementById('urlPattern').value = rule.urlPattern;
  document.getElementById('matchType').value = rule.matchType;
  document.getElementById('modifyType').value = rule.modifyType;
  document.getElementById('ruleEnabled').checked = rule.enabled;

  // Set methods
  document.querySelectorAll('input[name="methods"]').forEach(cb => {
    cb.checked = rule.methods && rule.methods.includes(cb.value);
  });

  // Update modification options
  updateModificationOptions(rule.modifyType);

  // Populate modification fields
  switch (rule.modifyType) {
    case 'replace':
      document.getElementById('replaceValue').value = rule.modification.value || '';
      break;

    case 'json-path':
      document.getElementById('jsonPath').value = rule.modification.path || '';
      document.getElementById('jsonValue').value = rule.modification.value || '';
      break;

    case 'regex':
      document.getElementById('regexPattern').value = rule.modification.pattern || '';
      document.getElementById('regexReplacement').value = rule.modification.replacement || '';
      document.getElementById('regexFlags').value = rule.modification.flags || 'g';
      break;

    case 'function':
      document.getElementById('functionCode').value = rule.modification.code || '';
      break;
  }

  // Populate status code
  if (rule.modifyStatusCode) {
    document.getElementById('modifyStatusCode').value = rule.modifyStatusCode;
  }

  // Populate header modifications
  clearHeaderModifications();
  if (rule.modifyHeaders && Array.isArray(rule.modifyHeaders)) {
    rule.modifyHeaders.forEach(header => {
      addHeaderModification(header.name, header.value, header.action);
    });
  }
}

function resetForm() {
  document.getElementById('ruleForm').reset();
  document.getElementById('ruleId').value = '';
  document.getElementById('formTitle').textContent = 'Create New Rule';
  document.getElementById('ruleEnabled').checked = true;
  document.querySelectorAll('input[name="methods"]')[0].checked = true; // Check GET by default
  updateModificationOptions('replace');
  document.getElementById('modifyStatusCode').value = '';
  clearHeaderModifications();
  currentEditingRuleId = null;
}

async function toggleRule(ruleId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      rule.enabled = !rule.enabled;
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: ruleId,
        rule: rule
      });

      await loadRules();
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function deleteRule(ruleId) {
  if (!confirm('Are you sure you want to delete this rule?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      action: 'deleteRule',
      ruleId: ruleId
    });

    await loadRules();
  } catch (error) {
    console.error('Failed to delete rule:', error);
    alert('Failed to delete rule');
  }
}

// Import/Export functions
async function exportRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      rules: rules
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-interceptor-rules-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export rules:', error);
    alert('Failed to export rules');
  }
}

async function importRules(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.rules || !Array.isArray(data.rules)) {
      alert('Invalid file format');
      return;
    }

    // Import each rule
    for (const rule of data.rules) {
      await chrome.runtime.sendMessage({
        action: 'addRule',
        rule: rule
      });
    }

    await loadRules();
    alert(`Successfully imported ${data.rules.length} rules`);
    e.target.value = ''; // Reset file input
  } catch (error) {
    console.error('Failed to import rules:', error);
    alert('Failed to import rules: ' + error.message);
  }
}

async function clearAllRules() {
  if (!confirm('Are you sure you want to delete ALL rules? This action cannot be undone.')) {
    return;
  }

  if (!confirm('This will permanently delete all your rules. Are you absolutely sure?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];

    for (const rule of rules) {
      await chrome.runtime.sendMessage({
        action: 'deleteRule',
        ruleId: rule.id
      });
    }

    await loadRules();
    alert('All rules have been deleted');
  } catch (error) {
    console.error('Failed to clear rules:', error);
    alert('Failed to clear rules');
  }
}

// Header Modifications
function addHeaderModification(name = '', value = '', action = 'set') {
  const id = ++headerModificationCounter;
  const container = document.getElementById('headerModifications');

  const headerRow = document.createElement('div');
  headerRow.className = 'header-mod-row';
  headerRow.dataset.id = id;
  headerRow.innerHTML = `
    <select class="form-control header-action">
      <option value="set" ${action === 'set' ? 'selected' : ''}>Set</option>
      <option value="add" ${action === 'add' ? 'selected' : ''}>Add</option>
      <option value="remove" ${action === 'remove' ? 'selected' : ''}>Remove</option>
    </select>
    <input type="text" class="form-control header-name" placeholder="Header Name" value="${escapeHtml(name)}">
    <input type="text" class="form-control header-value" placeholder="Header Value" value="${escapeHtml(value)}" ${action === 'remove' ? 'disabled' : ''}>
    <button type="button" class="btn btn-danger btn-small remove-header-btn">×</button>
  `;

  container.appendChild(headerRow);

  // Add event listener for action change
  headerRow.querySelector('.header-action').addEventListener('change', (e) => {
    const valueInput = headerRow.querySelector('.header-value');
    if (e.target.value === 'remove') {
      valueInput.disabled = true;
      valueInput.value = '';
    } else {
      valueInput.disabled = false;
    }
  });

  // Add event listener for remove button
  headerRow.querySelector('.remove-header-btn').addEventListener('click', () => {
    headerRow.remove();
  });
}

function getHeaderModifications() {
  const rows = document.querySelectorAll('#headerModifications .header-mod-row');
  const modifications = [];

  rows.forEach(row => {
    const action = row.querySelector('.header-action').value;
    const name = row.querySelector('.header-name').value.trim();
    const value = row.querySelector('.header-value').value.trim();

    if (name) {
      modifications.push({ action, name, value });
    }
  });

  return modifications;
}

function clearHeaderModifications() {
  document.getElementById('headerModifications').innerHTML = '';
  headerModificationCounter = 0;
}

// Recordings
async function loadRecordings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRecordings' });
    const recordings = response.recordings || [];
    displayRecordings(recordings);
  } catch (error) {
    console.error('Failed to load recordings:', error);
  }
}

function displayRecordings(recordings) {
  const recordingsList = document.getElementById('recordingsList');
  const emptyState = document.getElementById('recordingsEmptyState');

  if (recordings.length === 0) {
    recordingsList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  recordingsList.style.display = 'grid';
  emptyState.style.display = 'none';

  recordingsList.innerHTML = recordings.map(recording => `
    <div class="rule-card">
      <div class="rule-card-header">
        <div>
          <div class="rule-card-title">${escapeHtml(recording.name)}</div>
        </div>
      </div>

      <div class="rule-card-pattern">${escapeHtml(recording.url)}</div>

      <div class="rule-card-meta">
        <span class="rule-badge">${recording.method}</span>
        <span class="rule-badge">Status: ${recording.response.statusCode}</span>
        <span class="rule-badge">${new Date(recording.timestamp).toLocaleString()}</span>
      </div>

      <div class="rule-card-actions">
        <button class="btn btn-primary btn-small use-recording-btn" data-recording-id="${recording.id}">Use as Rule</button>
        <button class="btn btn-danger btn-small delete-recording-btn" data-recording-id="${recording.id}">Delete</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  document.querySelectorAll('.use-recording-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const recordingId = e.target.dataset.recordingId;
      await createRuleFromRecording(recordingId);
    });
  });

  document.querySelectorAll('.delete-recording-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const recordingId = e.target.dataset.recordingId;
      if (confirm('Delete this recording?')) {
        await chrome.runtime.sendMessage({
          action: 'deleteRecording',
          recordingId
        });
        await loadRecordings();
      }
    });
  });
}

async function createRuleFromRecording(recordingId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRecordings' });
    const recordings = response.recordings || [];
    const recording = recordings.find(r => r.id === recordingId);

    if (!recording) {
      alert('Recording not found');
      return;
    }

    console.log('Creating rule from recording:', recording);

    // Switch to new rule tab first
    showTab('new-rule');

    // Reset form and clear editing state
    currentEditingRuleId = null;
    resetForm();

    // Use setTimeout to ensure form is ready after reset
    setTimeout(() => {
      // Set basic rule information
      document.getElementById('ruleName').value = recording.name || 'Rule from Recording';
      document.getElementById('urlPattern').value = recording.urlPattern || recording.url || '';
      document.getElementById('matchType').value = recording.matchType || 'exact';
      document.getElementById('modifyType').value = 'replace';

      // Set method checkboxes
      document.querySelectorAll('input[name="methods"]').forEach(cb => {
        cb.checked = cb.value === recording.method;
      });

      // Set response body
      updateModificationOptions('replace');
      const bodyValue = recording.response?.body || '';
      document.getElementById('replaceValue').value = bodyValue;

      // Set status code
      if (recording.response?.statusCode) {
        document.getElementById('modifyStatusCode').value = recording.response.statusCode;
      }

      // Set headers
      if (recording.response?.headers && Array.isArray(recording.response.headers) && recording.response.headers.length > 0) {
        recording.response.headers.forEach(header => {
          if (header.name) {
            addHeaderModification(header.name, header.value, 'set');
          }
        });
      }

      document.getElementById('formTitle').textContent = 'Create Rule from Recording';

      console.log('Form populated with recording data');
    }, 100);
  } catch (error) {
    console.error('Failed to create rule from recording:', error);
    alert('Failed to create rule from recording: ' + error.message);
  }
}

async function clearAllRecordings() {
  if (!confirm('Are you sure you want to delete all recordings?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: 'clearRecordings' });
    await loadRecordings();
  } catch (error) {
    console.error('Failed to clear recordings:', error);
    alert('Failed to clear recordings');
  }
}

// History
async function loadRecentHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getHistory', limit: 10 });
    const history = response.history || [];
    displayRecentHistory(history);
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

function displayRecentHistory(history) {
  const list = document.getElementById('recentHistoryList');

  if (history.length === 0) {
    list.innerHTML = '<p style="color: #666;">No history yet</p>';
    return;
  }

  list.innerHTML = `
    <div style="max-height: 400px; overflow-y: auto;">
      ${history.map(entry => `
        <div style="padding: 10px; border-bottom: 1px solid #eee;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <span style="font-weight: bold; color: #2563eb;">${entry.method}</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(entry.url)}</span>
            ${entry.modifiedResponse ? '<span style="color: #10b981;">✓ Modified</span>' : ''}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            ${new Date(entry.timestamp).toLocaleString()}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function openHistoryPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make showTab available globally for help section
window.showTab = showTab;
