// Popup script
let currentTab = null;
let activeEditRuleIds = new Set();
let searchQuery = '';

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load theme preference
  loadTheme();

  // Load status and rules
  await loadStatus();
  await loadRules();

  // Setup event listeners
  setupEventListeners();
  setupStorageListener();
});

// Theme management
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.innerHTML = theme === 'dark'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>`;
  }
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });

    // Set global toggle
    const globalToggle = document.getElementById('globalToggle');
    globalToggle.checked = response.enabled;

    // Update status indicator
    const statusIndicator = document.getElementById('globalStatusIndicator');
    if (statusIndicator) {
      statusIndicator.classList.toggle('active', response.enabled);
    }

    // Update attach button based on tab status
    updateAttachButton(response.activeTabs.includes(currentTab?.id));
  } catch (error) {
    console.error('Failed to load status:', error);
  }
}

async function loadRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];

    // Store rules globally for sorting
    window.currentRules = rules;

    await displayRules(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function sortAndFilterRules(rules, groups) {
  const sortBy = document.getElementById('popupSortBy')?.value || 'modified';
  const sortOrder = document.getElementById('popupSortOrder')?.value || 'desc';
  const hideDisabledGroupRules = document.getElementById('popupHideDisabledGroupRules')?.checked ?? true;
  const enabledRulesFirst = document.getElementById('popupEnabledRulesFirst')?.checked ?? true;

  // Filter rules from disabled groups
  let filteredRules = rules;
  if (hideDisabledGroupRules) {
    filteredRules = rules.filter(rule => {
      if (!rule.groupId) return true;
      const group = groups.find(g => g.id === rule.groupId);
      return !group || group.enabled;
    });
  }

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredRules = filteredRules.filter(rule =>
      rule.name.toLowerCase().includes(query) ||
      rule.urlPattern.toLowerCase().includes(query) ||
      (rule.description && rule.description.toLowerCase().includes(query))
    );
  }

  // Sort rules
  const sortedRules = [...filteredRules].sort((a, b) => {
    if (enabledRulesFirst) {
      const enabledDiff = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      if (enabledDiff !== 0) return enabledDiff;
    }

    let comparison = 0;

    if (sortBy === 'modified') {
      comparison = (a.modifiedAt || a.createdAt || 0) - (b.modifiedAt || b.createdAt || 0);
    } else if (sortBy === 'created') {
      comparison = (a.createdAt || 0) - (b.createdAt || 0);
    } else if (sortBy === 'name') {
      comparison = (a.name || '').localeCompare(b.name || '');
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  return sortedRules;
}

async function displayRules(rules) {
  const rulesList = document.getElementById('rulesList');
  const rulesCount = document.getElementById('rulesCount');
  const enabledRulesText = document.getElementById('enabledRulesText');
  const emptyState = document.getElementById('emptyState');
  const noSearchResults = document.getElementById('noSearchResults');

  // Get groups for filtering
  const response = await chrome.runtime.sendMessage({ action: 'getGroups' });
  const groups = response.groups || [];
  window.currentGroups = groups;

  // Apply sorting and filtering
  const processedRules = sortAndFilterRules(rules, groups);

  // Update counts
  rulesCount.textContent = rules.length;
  const enabledCount = rules.filter(r => r.enabled).length;
  if (enabledRulesText) {
    enabledRulesText.textContent = `${enabledCount} enabled`;
  }

  // Handle empty states
  if (rules.length === 0) {
    rulesList.innerHTML = '';
    emptyState.style.display = 'block';
    noSearchResults.style.display = 'none';
    return;
  }

  if (processedRules.length === 0 && searchQuery.trim()) {
    rulesList.innerHTML = '';
    emptyState.style.display = 'none';
    noSearchResults.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  noSearchResults.style.display = 'none';

  rulesList.innerHTML = processedRules.map(rule => {
    const group = groups.find(g => g.id === rule.groupId);
    const groupDot = group ? `<span class="group-dot" style="background: ${group.color}"></span>` : '';

    return `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'} animate-slide-up" data-rule-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-info">
          <div class="rule-name" title="${escapeHtml(rule.name)}">
            ${groupDot}
            ${escapeHtml(rule.name)}
          </div>
          <div class="rule-pattern" title="${escapeHtml(rule.urlPattern)}">${escapeHtml(rule.urlPattern)}</div>
          <div class="rule-meta">
            <span class="rule-tag type">${rule.matchType || 'wildcard'}</span>
            ${(rule.methods || ['GET']).map(m => `<span class="rule-tag method">${m}</span>`).join('')}
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn-icon" data-rule-id="${rule.id}" title="Edit Rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <div class="toggle-switch rule-toggle">
            <input type="checkbox" id="rule-${rule.id}" class="toggle-input rule-toggle-input" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
            <label for="rule-${rule.id}" class="toggle-label"></label>
          </div>
        </div>
      </div>
      <div class="rule-edit-container" id="edit-${rule.id}" style="display: none;">
        <div class="edit-section">
          <div class="edit-header">
            <label>Status Code</label>
          </div>
          <input type="number" class="status-code-input" id="status-${rule.id}"
                 placeholder="e.g., 200, 404, 500"
                 min="100" max="599">
          <div class="edit-hint">Leave empty to keep original status code</div>
        </div>
        <div class="edit-section">
          <div class="edit-header">
            <label>Response Body (JSON)</label>
            <button class="btn-prettify" data-rule-id="${rule.id}" title="Prettify JSON">Format</button>
          </div>
          <textarea class="json-editor" id="json-${rule.id}" rows="6" placeholder='{"key": "value"}'></textarea>
          <div class="edit-hint">Leave empty to keep original response body</div>
        </div>
        <div class="edit-error" id="error-${rule.id}" style="display: none;"></div>
        <div class="edit-actions">
          <button class="btn-save" data-rule-id="${rule.id}">Save Changes</button>
          <button class="btn-cancel" data-rule-id="${rule.id}">Cancel</button>
        </div>
      </div>
    </div>
  `}).join('');

  // Add event listeners for rule toggles
  document.querySelectorAll('.rule-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await toggleRule(ruleId);
    });
  });

  // Add event listeners for edit buttons
  document.querySelectorAll('.btn-icon[data-rule-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ruleId = e.currentTarget.dataset.ruleId;
      await toggleEditMode(ruleId, true);
    });
  });

  // Add event listeners for prettify buttons
  document.querySelectorAll('.btn-prettify').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      prettifyJson(ruleId);
    });
  });

  // Add event listeners for save buttons
  document.querySelectorAll('.btn-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await saveJsonEdit(ruleId);
    });
  });

  // Add event listeners for cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      toggleEditMode(ruleId, false);
    });
  });

  // Restore edit mode for rules that were previously in edit mode
  for (const ruleId of activeEditRuleIds) {
    if (rules.find(r => r.id === ruleId)) {
      await toggleEditMode(ruleId, true);
    } else {
      activeEditRuleIds.delete(ruleId);
    }
  }
}

function setupEventListeners() {
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (window.currentRules) {
        displayRules(window.currentRules);
      }
    });

    // Clear search on Escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchQuery = '';
        if (window.currentRules) {
          displayRules(window.currentRules);
        }
      }
    });
  }

  // Filter toggle
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const filterOptions = document.getElementById('filterOptions');
  if (filterToggleBtn && filterOptions) {
    filterToggleBtn.addEventListener('click', () => {
      const isExpanded = filterOptions.style.display !== 'none';
      filterOptions.style.display = isExpanded ? 'none' : 'block';
      filterToggleBtn.classList.toggle('expanded', !isExpanded);
    });
  }

  // Rule sorting and filtering controls
  const popupSortBy = document.getElementById('popupSortBy');
  const popupSortOrder = document.getElementById('popupSortOrder');
  const popupHideDisabledGroupRules = document.getElementById('popupHideDisabledGroupRules');
  const popupEnabledRulesFirst = document.getElementById('popupEnabledRulesFirst');

  [popupSortBy, popupSortOrder, popupHideDisabledGroupRules, popupEnabledRulesFirst].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        if (window.currentRules) {
          displayRules(window.currentRules);
        }
      });
    }
  });

  // Global toggle
  document.getElementById('globalToggle').addEventListener('change', async (e) => {
    try {
      await chrome.runtime.sendMessage({ action: 'toggleGlobal' });

      // Update status indicator
      const statusIndicator = document.getElementById('globalStatusIndicator');
      if (statusIndicator) {
        statusIndicator.classList.toggle('active', e.target.checked);
      }

      showToast(e.target.checked ? 'Interception enabled' : 'Interception disabled', 'success');
    } catch (error) {
      console.error('Failed to toggle global:', error);
      showToast('Failed to toggle interception', 'error');
    }
  });

  // Attach debugger button
  document.getElementById('attachTab').addEventListener('click', async () => {
    try {
      const button = document.getElementById('attachTab');
      const btnText = document.getElementById('attachBtnText');
      const isAttached = btnText?.textContent === 'Detach';

      if (isAttached) {
        await chrome.runtime.sendMessage({
          action: 'detachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(false);
        showToast('Debugger detached', 'success');
      } else {
        await chrome.runtime.sendMessage({
          action: 'attachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(true);
        showToast('Debugger attached', 'success');
      }
    } catch (error) {
      console.error('Failed to attach/detach debugger:', error);
      showToast('Failed to attach debugger', 'error');
    }
  });

  // Add rule button
  const addRuleBtn = document.getElementById('addRuleBtn');
  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Empty state add rule button
  const emptyAddRuleBtn = document.getElementById('emptyAddRuleBtn');
  if (emptyAddRuleBtn) {
    emptyAddRuleBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Open options buttons
  const openOptionsBtn = document.getElementById('openOptions');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const viewAllRulesBtn = document.getElementById('viewAllRulesBtn');

  [openOptionsBtn, openSettingsBtn, viewAllRulesBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
  });
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.rules) {
        loadRules();
      }

      if (changes.groups) {
        loadRules();
      }

      if (changes.settings) {
        loadStatus();
      }
    }
  });
}

function updateAttachButton(isAttached) {
  const button = document.getElementById('attachTab');
  const btnText = document.getElementById('attachBtnText');

  if (isAttached) {
    if (btnText) btnText.textContent = 'Detach';
    button.classList.remove('btn-primary');
    button.classList.add('btn-primary', 'attached');
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      <span id="attachBtnText">Detach</span>
    `;
  } else {
    if (btnText) btnText.textContent = 'Attach Debugger';
    button.classList.remove('attached');
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      <span id="attachBtnText">Attach Debugger</span>
    `;
  }
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

      showToast(rule.enabled ? 'Rule enabled' : 'Rule disabled', 'success');
      await loadRules();
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error);
    showToast('Failed to toggle rule', 'error');
  }
}

async function toggleEditMode(ruleId, show) {
  if (!ruleId) {
    console.error('toggleEditMode: ruleId is required');
    return;
  }

  const editContainer = document.getElementById(`edit-${ruleId}`);
  const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);

  if (!editContainer) {
    console.warn(`toggleEditMode: Edit container not found for rule ${ruleId}`);
    return;
  }

  if (show) {
    activeEditRuleIds.add(ruleId);

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getRules' });

      if (!response || !response.rules) {
        console.error('Failed to get rules: Invalid response');
        return;
      }

      const rules = response.rules;
      const rule = rules.find(r => r && r.id === ruleId);

      if (!rule) {
        console.warn(`Rule not found: ${ruleId}`);
        return;
      }

      const statusInput = document.getElementById(`status-${ruleId}`);
      if (statusInput) {
        statusInput.value = rule.modifyStatusCode || '';
      }

      const textarea = document.getElementById(`json-${ruleId}`);
      if (textarea) {
        if (rule.modifyType === 'replace' && rule.modification && rule.modification.value) {
          textarea.value = rule.modification.value;
        } else {
          textarea.value = '';
        }
      }
    } catch (error) {
      console.error('Failed to load rule data:', error);
      return;
    }

    editContainer.style.display = 'block';
    if (ruleItem) {
      ruleItem.classList.add('editing');
    }

    const errorDiv = document.getElementById(`error-${ruleId}`);
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  } else {
    activeEditRuleIds.delete(ruleId);

    editContainer.style.display = 'none';
    if (ruleItem) {
      ruleItem.classList.remove('editing');
    }
  }
}

function prettifyJson(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  if (textarea) {
    if (!textarea.value.trim()) {
      errorDiv.textContent = 'No JSON to format. Enter JSON first.';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      errorDiv.style.display = 'none';
      showToast('JSON formatted', 'success');
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
    }
  }
}

// Valid HTTP status codes
const VALID_STATUS_CODES = [
  100, 101, 102, 103,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
];

function validateStatusCode(statusCode) {
  const code = parseInt(statusCode);
  if (isNaN(code) || code < 100 || code > 599) {
    return { valid: false, message: 'Status code must be between 100 and 599' };
  }
  if (!VALID_STATUS_CODES.includes(code)) {
    return { valid: true, warning: `Status code ${code} is not a standard HTTP status code` };
  }
  return { valid: true };
}

async function saveJsonEdit(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const statusInput = document.getElementById(`status-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  if (textarea && textarea.value.trim()) {
    try {
      JSON.parse(textarea.value);
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
      return;
    }
  }

  if (statusInput && statusInput.value) {
    const validation = validateStatusCode(statusInput.value);
    if (!validation.valid) {
      errorDiv.textContent = validation.message;
      errorDiv.style.display = 'block';
      return;
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      if (textarea) {
        if (textarea.value.trim()) {
          rule.modifyType = 'replace';
          rule.modification = {
            type: 'json',
            value: textarea.value
          };
        } else if (rule.modifyType === 'replace') {
          rule.modification = { type: 'json', value: '' };
        }
      }

      if (statusInput) {
        if (statusInput.value === '') {
          delete rule.modifyStatusCode;
        } else {
          rule.modifyStatusCode = parseInt(statusInput.value);
        }
      }

      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: ruleId,
        rule: rule
      });

      activeEditRuleIds.delete(ruleId);

      const editContainer = document.getElementById(`edit-${ruleId}`);
      const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);
      if (editContainer) {
        editContainer.style.display = 'none';
      }
      if (ruleItem) {
        ruleItem.classList.remove('editing');
      }

      showToast('Rule saved successfully', 'success');
    }
  } catch (error) {
    console.error('Failed to save rule edit:', error);
    errorDiv.textContent = `Failed to save: ${error.message}`;
    errorDiv.style.display = 'block';
    showToast('Failed to save rule', 'error');
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  if (typeof text !== 'string') text = String(text);
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
