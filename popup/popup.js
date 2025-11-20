// Popup script
let currentTab = null;
let activeEditRuleIds = new Set(); // Track which rules are in edit mode

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load status and rules
  await loadStatus();
  await loadRules();

  // Setup event listeners
  setupEventListeners();
  setupStorageListener();
});

async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });

    // Set global toggle
    const globalToggle = document.getElementById('globalToggle');
    globalToggle.checked = response.enabled;

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
      // If rule has no group, always show it
      if (!rule.groupId) return true;

      // If rule belongs to a group, check if group is enabled
      const group = groups.find(g => g.id === rule.groupId);
      // Show if group doesn't exist or group is enabled
      return !group || group.enabled;
    });
  }

  // Sort rules
  const sortedRules = [...filteredRules].sort((a, b) => {
    // First, sort by enabled status if that option is checked
    if (enabledRulesFirst) {
      const enabledDiff = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      if (enabledDiff !== 0) return enabledDiff;
    }

    // Then sort by the selected criteria
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

  // Get groups for filtering
  const response = await chrome.runtime.sendMessage({ action: 'getGroups' });
  const groups = response.groups || [];
  window.currentGroups = groups;

  // Apply sorting and filtering
  const processedRules = sortAndFilterRules(rules, groups);

  rulesCount.textContent = processedRules.length;

  if (processedRules.length === 0) {
    rulesList.innerHTML = `
      <div class="empty-state">
        <p>No rules configured</p>
      </div>
    `;
    return;
  }

  rulesList.innerHTML = processedRules.map(rule => {
    return `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'}" data-rule-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-info">
          <div class="rule-name" title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}</div>
          <div class="rule-pattern" title="${escapeHtml(rule.urlPattern)}">${escapeHtml(rule.urlPattern)}</div>
        </div>
        <div class="rule-actions">
          <button class="btn btn-edit" data-rule-id="${rule.id}" title="Edit Rule">✏️</button>
          <div class="toggle-switch rule-toggle">
            <input type="checkbox" id="rule-${rule.id}" class="toggle-input rule-toggle-input" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
            <label for="rule-${rule.id}" class="toggle-label"></label>
          </div>
        </div>
      </div>
      <div class="rule-edit-container" id="edit-${rule.id}" style="display: none;">
        <div class="edit-section">
          <div class="edit-header">
            <label>Status Code:</label>
          </div>
          <input type="number" class="status-code-input" id="status-${rule.id}"
                 placeholder="200, 404, 500, etc."
                 min="100" max="599">
          <div class="edit-hint">Leave empty to keep original status code</div>
        </div>
        <div class="edit-section">
          <div class="edit-header">
            <label>JSON Response Body:</label>
            <button class="btn btn-prettify" data-rule-id="${rule.id}" title="Prettify JSON">🎨</button>
          </div>
          <textarea class="json-editor" id="json-${rule.id}" rows="8" placeholder='{"message": "response"}'></textarea>
          <div class="edit-hint">Leave empty to keep original response body</div>
        </div>
        <div class="edit-error" id="error-${rule.id}" style="display: none;"></div>
        <div class="edit-actions">
          <button class="btn btn-save" data-rule-id="${rule.id}">💾 Save</button>
          <button class="btn btn-cancel" data-rule-id="${rule.id}">❌ Cancel</button>
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
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ruleId = e.target.dataset.ruleId;
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
    // Check if this rule still exists
    if (rules.find(r => r.id === ruleId)) {
      await toggleEditMode(ruleId, true);
    } else {
      // Rule was deleted, remove from active set
      activeEditRuleIds.delete(ruleId);
    }
  }
}

function setupEventListeners() {
  // Rule sorting and filtering controls
  const popupSortBy = document.getElementById('popupSortBy');
  const popupSortOrder = document.getElementById('popupSortOrder');
  const popupHideDisabledGroupRules = document.getElementById('popupHideDisabledGroupRules');
  const popupEnabledRulesFirst = document.getElementById('popupEnabledRulesFirst');

  if (popupSortBy) {
    popupSortBy.addEventListener('change', () => {
      if (window.currentRules) {
        displayRules(window.currentRules);
      }
    });
  }

  if (popupSortOrder) {
    popupSortOrder.addEventListener('change', () => {
      if (window.currentRules) {
        displayRules(window.currentRules);
      }
    });
  }

  if (popupHideDisabledGroupRules) {
    popupHideDisabledGroupRules.addEventListener('change', () => {
      if (window.currentRules) {
        displayRules(window.currentRules);
      }
    });
  }

  if (popupEnabledRulesFirst) {
    popupEnabledRulesFirst.addEventListener('change', () => {
      if (window.currentRules) {
        displayRules(window.currentRules);
      }
    });
  }

  // Global toggle
  document.getElementById('globalToggle').addEventListener('change', async (e) => {
    try {
      await chrome.runtime.sendMessage({ action: 'toggleGlobal' });
      console.log('Global toggle changed:', e.target.checked);
    } catch (error) {
      console.error('Failed to toggle global:', error);
    }
  });

  // Attach debugger button
  document.getElementById('attachTab').addEventListener('click', async () => {
    try {
      const button = document.getElementById('attachTab');
      const isAttached = button.textContent === 'Detach Debugger';

      if (isAttached) {
        await chrome.runtime.sendMessage({
          action: 'detachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(false);
      } else {
        await chrome.runtime.sendMessage({
          action: 'attachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(true);
      }
    } catch (error) {
      console.error('Failed to attach/detach debugger:', error);
      alert('Failed to attach debugger. Make sure you have the necessary permissions.');
    }
  });

  // Add rule button
  document.getElementById('addRuleBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Open options button
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

function setupStorageListener() {
  // Listen for storage changes to sync popup with options page
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      // Reload rules if they changed
      if (changes.rules) {
        console.log('Rules changed, reloading...');
        loadRules();
      }

      // Reload groups if they changed
      if (changes.groups) {
        console.log('Groups changed, reloading...');
        loadGroups();
      }

      // Reload settings if they changed
      if (changes.settings) {
        console.log('Settings changed, reloading status...');
        loadStatus();
      }
    }
  });
}

function updateAttachButton(isAttached) {
  const button = document.getElementById('attachTab');
  if (isAttached) {
    button.textContent = 'Detach Debugger';
    button.classList.remove('btn-primary');
    button.classList.add('btn-danger');
  } else {
    button.textContent = 'Attach Debugger';
    button.classList.remove('btn-danger');
    button.classList.add('btn-primary');
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

      // Reload rules to update UI
      await loadRules();
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function toggleEditMode(ruleId, show) {
  // Validate ruleId
  if (!ruleId) {
    console.error('toggleEditMode: ruleId is required');
    return;
  }

  const editContainer = document.getElementById(`edit-${ruleId}`);
  const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);

  // Check if elements exist
  if (!editContainer) {
    console.warn(`toggleEditMode: Edit container not found for rule ${ruleId}`);
    return;
  }

  if (show) {
    // Add to active edit set
    activeEditRuleIds.add(ruleId);

    // Fetch the current rule data
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

      // Populate status code
      const statusInput = document.getElementById(`status-${ruleId}`);
      if (statusInput) {
        statusInput.value = rule.modifyStatusCode || '';
      }

      // Populate JSON body - only for replace-type modifications
      const textarea = document.getElementById(`json-${ruleId}`);
      if (textarea) {
        // Only populate for replace-type modifications
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

    // Clear any previous errors
    const errorDiv = document.getElementById(`error-${ruleId}`);
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  } else {
    // Remove from active edit set
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
      errorDiv.textContent = 'No JSON to prettify. Enter JSON first.';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      errorDiv.style.display = 'none';
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
    }
  }
}

// Valid HTTP status codes
const VALID_STATUS_CODES = [
  // 1xx Informational
  100, 101, 102, 103,
  // 2xx Success
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  // 3xx Redirection
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  // 4xx Client Error
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  // 5xx Server Error
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

  // Validate JSON if textarea has content
  if (textarea && textarea.value.trim()) {
    try {
      JSON.parse(textarea.value);
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
      return;
    }
  }

  // Validate status code if input exists
  if (statusInput && statusInput.value) {
    const validation = validateStatusCode(statusInput.value);
    if (!validation.valid) {
      errorDiv.textContent = validation.message;
      errorDiv.style.display = 'block';
      return;
    }
    if (validation.warning) {
      console.warn(validation.warning);
    }
  }

  // Get the current rule
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      // Update the JSON body
      if (textarea) {
        if (textarea.value.trim()) {
          // If user entered a body, set to replace modification
          rule.modifyType = 'replace';
          rule.modification = {
            type: 'json',
            value: textarea.value
          };
        } else if (rule.modifyType === 'replace') {
          // If body is empty and it was a replace type, clear the modification
          // This handles the case where user clears a previously set body
          rule.modification = { type: 'json', value: '' };
        }
        // For other modification types (json-path, regex, function),
        // don't change them if body is empty - they're not editable in popup
      }

      // Update the status code
      if (statusInput) {
        if (statusInput.value === '') {
          // Remove status code modification if empty
          delete rule.modifyStatusCode;
        } else {
          rule.modifyStatusCode = parseInt(statusInput.value);
        }
      }

      // Save the updated rule
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: ruleId,
        rule: rule
      });

      // Remove from active edit set and hide edit mode
      activeEditRuleIds.delete(ruleId);

      // Hide edit mode
      const editContainer = document.getElementById(`edit-${ruleId}`);
      const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);
      if (editContainer) {
        editContainer.style.display = 'none';
      }
      if (ruleItem) {
        ruleItem.classList.remove('editing');
      }
    }
  } catch (error) {
    console.error('Failed to save rule edit:', error);
    errorDiv.textContent = `Failed to save: ${error.message}`;
    errorDiv.style.display = 'block';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
