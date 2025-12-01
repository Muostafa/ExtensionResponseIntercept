// Options page script
let currentEditingRuleId = null;
let headerModificationCounter = 0;
let collapsedGroups = new Set(); // Track collapsed group IDs

// Initialize options page
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await loadGroups();
  await loadRules();
  setupEventListeners();
  setupNavigation();
  setupThemeToggle();
  setupTemplateButtons();
  setupKeyboardShortcuts();
});

// Theme management
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeButton(newTheme);
  showToast(`Switched to ${newTheme} mode`, 'success');
}

function updateThemeButton(theme) {
  const themeToggle = document.getElementById('themeToggle');
  const themeText = document.getElementById('themeText');
  if (themeToggle && themeText) {
    themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    themeToggle.innerHTML = theme === 'dark'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <span id="themeText">Light Mode</span>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <span id="themeText">Dark Mode</span>`;
  }
}

function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}

// Toast notifications
let activeToastTimeout = null;

function showToast(message, type = 'info', action = null) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Clear any existing timeout
  if (activeToastTimeout) {
    clearTimeout(activeToastTimeout);
    activeToastTimeout = null;
  }

  // Build toast content
  if (action && action.label && action.callback) {
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-action" type="button">${escapeHtml(action.label)}</button>
    `;

    // Add click handler for action button
    const actionBtn = toast.querySelector('.toast-action');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeToastTimeout) {
        clearTimeout(activeToastTimeout);
        activeToastTimeout = null;
      }
      toast.classList.remove('show');
      action.callback();
    }, { once: true });
  } else {
    toast.textContent = message;
  }

  toast.className = `toast ${type}`;
  toast.classList.add('show');

  // Auto-hide after duration (longer for actionable toasts)
  const duration = action ? 5000 : 3000;
  activeToastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    activeToastTimeout = null;
    // Call onExpire callback if provided (for permanent deletion)
    if (action && action.onExpire) {
      action.onExpire();
    }
  }, duration);
}

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

    // Store rules globally for group stats
    window.currentRules = rules;

    displayRules(rules);

    // Refresh group display to update rule counts
    if (currentGroups.length > 0) {
      displayGroups(currentGroups);
    }
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function sortAndFilterRules(rules) {
  const sortBy = document.getElementById('ruleSortBy')?.value || 'created';
  const sortOrder = document.getElementById('ruleSortOrder')?.value || 'desc';
  const enabledRulesFirst = document.getElementById('enabledRulesFirst')?.checked ?? false;

  // Sort rules
  const sortedRules = [...rules].sort((a, b) => {
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

function displayRules(rules) {
  const groupedRulesList = document.getElementById('groupedRulesList');
  const emptyState = document.getElementById('emptyState');

  // Apply sorting and filtering
  const processedRules = sortAndFilterRules(rules);

  // Check if there are any rules at all
  if (rules.length === 0 && currentGroups.length === 0) {
    groupedRulesList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  groupedRulesList.style.display = 'block';
  emptyState.style.display = 'none';

  // Organize rules by groups
  const groupedRules = {};
  const ungroupedRules = [];

  processedRules.forEach(rule => {
    if (rule.groupId) {
      if (!groupedRules[rule.groupId]) {
        groupedRules[rule.groupId] = [];
      }
      groupedRules[rule.groupId].push(rule);
    } else {
      ungroupedRules.push(rule);
    }
  });

  // Sort groups by name
  const sortedGroups = [...currentGroups].sort((a, b) => a.name.localeCompare(b.name));

  let html = '';

  // Render groups with their rules
  sortedGroups.forEach(group => {
    const groupRules = groupedRules[group.id] || [];
    const isCollapsed = collapsedGroups.has(group.id);
    const enabledInGroup = groupRules.filter(r => r.enabled).length;

    html += `
      <div class="options-group-container ${group.enabled ? '' : 'group-disabled'}" data-group-id="${group.id}">
        <div class="options-group-header" data-group-id="${group.id}">
          <div class="options-group-header-left">
            <button class="options-group-collapse-btn ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="options-group-color-bar" style="background: ${group.color}"></div>
            <div class="options-group-info">
              <div class="options-group-title">${escapeHtml(group.name)}</div>
              ${group.description ? `<div class="options-group-description">${escapeHtml(group.description)}</div>` : ''}
              <div class="options-group-stats">
                <span>${groupRules.length} rule${groupRules.length !== 1 ? 's' : ''}</span>
                <span>${enabledInGroup} active</span>
              </div>
            </div>
          </div>
          <div class="options-group-header-actions">
            <div class="toggle-switch-small group-toggle">
              <input type="checkbox" id="group-toggle-${group.id}" class="group-toggle-input" data-group-id="${group.id}" ${group.enabled ? 'checked' : ''}>
              <label for="group-toggle-${group.id}"></label>
            </div>
            <button class="btn btn-secondary btn-small edit-group-btn" data-group-id="${group.id}" title="Edit Group">Edit</button>
            <button class="btn btn-danger btn-small delete-group-btn" data-group-id="${group.id}" title="Delete Group">Delete</button>
          </div>
        </div>
        <div class="options-group-rules ${isCollapsed ? 'collapsed' : ''}" data-group-rules="${group.id}">
          ${groupRules.length === 0 ? `
            <div class="options-group-empty">
              <span>No rules in this group</span>
              <button class="btn btn-secondary btn-small add-rule-to-group-btn" data-group-id="${group.id}">+ Add Rule</button>
            </div>
          ` : `
            <div class="options-rules-grid">
              ${groupRules.map(rule => renderRuleCard(rule, group)).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  });

  // Render ungrouped rules
  const isUngroupedCollapsed = collapsedGroups.has('ungrouped');
  html += `
    <div class="options-group-container ungrouped-container" data-group-id="ungrouped">
      <div class="options-group-header ungrouped-header" data-group-id="ungrouped">
        <div class="options-group-header-left">
          <button class="options-group-collapse-btn ${isUngroupedCollapsed ? 'collapsed' : ''}" data-group-id="ungrouped">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="options-group-color-bar ungrouped-bar"></div>
          <div class="options-group-info">
            <div class="options-group-title">Ungrouped Rules</div>
            <div class="options-group-stats">
              <span>${ungroupedRules.length} rule${ungroupedRules.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="options-group-rules ${isUngroupedCollapsed ? 'collapsed' : ''}" data-group-rules="ungrouped">
        ${ungroupedRules.length === 0 ? `
          <div class="options-group-empty">
            <span>No ungrouped rules</span>
          </div>
        ` : `
          <div class="options-rules-grid">
            ${ungroupedRules.map(rule => renderRuleCard(rule, null)).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  groupedRulesList.innerHTML = html;

  // Add event listeners
  attachRuleEventListeners();
  attachGroupEventListeners();
}

function renderRuleCard(rule, group) {
  const isGroupDisabled = group && !group.enabled;
  const methods = rule.methods && rule.methods.length > 0
    ? rule.methods.join(', ')
    : 'All Methods';

  const cardClasses = [
    'rule-card',
    rule.enabled ? '' : 'disabled',
    isGroupDisabled ? 'group-disabled-card' : ''
  ].filter(Boolean).join(' ');

  // Determine action type label and class
  const actionType = rule.actionType || 'mockResponse';
  const actionLabel = getActionTypeLabel(actionType);
  const actionClass = getActionTypeClass(actionType);

  // Build meta badges
  let metaBadges = `
    <span class="rule-badge ${actionClass}">${actionLabel}</span>
    <span class="rule-badge">${rule.matchType}</span>
    <span class="rule-badge method">${methods}</span>
  `;

  // Add modification type badge for mock response
  if (actionType === 'mockResponse' && rule.modifyType) {
    metaBadges += `<span class="rule-badge">${getModifyTypeLabel(rule.modifyType)}</span>`;
  }

  // Add delay badge if specified
  if (rule.delay && rule.delay > 0) {
    metaBadges += `<span class="rule-badge delay-badge">${rule.delay}ms delay</span>`;
  }

  return `
    <div class="${cardClasses}" data-rule-id="${rule.id}">
      ${isGroupDisabled ? '<div class="group-disabled-banner">Inactive - Group is disabled</div>' : ''}
      <div class="rule-card-header">
        <div class="rule-card-title-wrapper">
          <span class="rule-card-title">${escapeHtml(rule.name)}</span>
          ${rule.description ? `<div class="rule-card-description">${escapeHtml(rule.description)}</div>` : ''}
        </div>
        <div class="toggle-switch-small">
          <input type="checkbox" id="toggle-${rule.id}" ${rule.enabled ? 'checked' : ''} ${isGroupDisabled ? 'disabled' : ''} data-rule-id="${rule.id}">
          <label for="toggle-${rule.id}" ${isGroupDisabled ? 'class="toggle-disabled"' : ''}></label>
        </div>
      </div>

      <div class="rule-card-pattern">${escapeHtml(rule.urlPattern)}</div>

      <div class="rule-card-meta">
        ${metaBadges}
      </div>

      <div class="rule-card-actions">
        <button class="btn btn-secondary btn-small edit-btn" data-rule-id="${rule.id}">Edit</button>
        <button class="btn btn-secondary btn-small duplicate-btn" data-rule-id="${rule.id}">Duplicate</button>
        <button class="btn btn-danger btn-small delete-btn" data-rule-id="${rule.id}">Delete</button>
      </div>
    </div>
  `;
}

function attachGroupEventListeners() {
  // Group collapse buttons
  document.querySelectorAll('.options-group-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = e.currentTarget.dataset.groupId;
      toggleGroupCollapse(groupId);
    });
  });

  // Group header click to collapse
  document.querySelectorAll('.options-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't collapse if clicking on actions
      if (e.target.closest('.options-group-header-actions')) return;
      if (e.target.closest('.options-group-collapse-btn')) return;
      const groupId = header.dataset.groupId;
      toggleGroupCollapse(groupId);
    });
  });

  // Group toggles
  document.querySelectorAll('.group-toggle-input').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    toggle.addEventListener('change', async (e) => {
      const groupId = e.target.dataset.groupId;
      await toggleGroup(groupId);
    });
  });

  // Edit group buttons
  document.querySelectorAll('.edit-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = e.target.dataset.groupId;
      editGroup(groupId);
    });
  });

  // Delete group buttons
  document.querySelectorAll('.delete-group-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = e.target.dataset.groupId;
      await deleteGroup(groupId);
    });
  });

  // Add rule to group buttons
  document.querySelectorAll('.add-rule-to-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = e.target.dataset.groupId;
      addRuleToGroup(groupId);
    });
  });
}

function toggleGroupCollapse(groupId) {
  const btn = document.querySelector(`.options-group-collapse-btn[data-group-id="${groupId}"]`);
  const rulesContainer = document.querySelector(`[data-group-rules="${groupId}"]`);

  if (collapsedGroups.has(groupId)) {
    collapsedGroups.delete(groupId);
    btn?.classList.remove('collapsed');
    rulesContainer?.classList.remove('collapsed');
  } else {
    collapsedGroups.add(groupId);
    btn?.classList.add('collapsed');
    rulesContainer?.classList.add('collapsed');
  }
}

function collapseAllGroups() {
  currentGroups.forEach(group => {
    collapsedGroups.add(group.id);
  });
  collapsedGroups.add('ungrouped');
  displayRules(window.currentRules || []);
}

function expandAllGroups() {
  collapsedGroups.clear();
  displayRules(window.currentRules || []);
}

function addRuleToGroup(groupId) {
  currentEditingRuleId = null;
  showTab('new-rule');  // This calls resetForm() internally
  document.getElementById('ruleGroup').value = groupId;  // Set group after form is reset
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

  // Duplicate buttons
  document.querySelectorAll('.duplicate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      duplicateRule(ruleId);
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
    'regex': 'Regex'
  };
  return labels[type] || type;
}

function getActionTypeLabel(actionType) {
  return 'Mock Response';
}

function getActionTypeClass(actionType) {
  return 'action-mock';
}

// Setup event listeners
function setupEventListeners() {
  // Rule sorting and filtering controls
  const ruleSortBy = document.getElementById('ruleSortBy');
  const ruleSortOrder = document.getElementById('ruleSortOrder');
  const enabledRulesFirst = document.getElementById('enabledRulesFirst');

  [ruleSortBy, ruleSortOrder, enabledRulesFirst].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        if (window.currentRules) {
          displayRules(window.currentRules);
        }
      });
    }
  });

  // Add new rule button
  document.getElementById('addNewRuleBtn').addEventListener('click', () => {
    currentEditingRuleId = null;
    resetForm();
    showTab('new-rule');
  });

  // Empty state create rule button
  document.getElementById('emptyStateCreateRuleBtn').addEventListener('click', () => {
    currentEditingRuleId = null;
    resetForm();
    showTab('new-rule');
  });

  // Collapse/Expand all buttons
  document.getElementById('collapseAllBtn')?.addEventListener('click', collapseAllGroups);
  document.getElementById('expandAllBtn')?.addEventListener('click', expandAllGroups);

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

  // Prettify JSON button
  document.getElementById('prettifyJsonBtn').addEventListener('click', prettifyJsonInTextarea);

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

  // Group management buttons
  document.getElementById('addNewGroupBtn')?.addEventListener('click', openGroupModal);
  document.getElementById('groupForm')?.addEventListener('submit', saveGroup);
  document.getElementById('closeGroupModal')?.addEventListener('click', closeGroupModal);
  document.getElementById('cancelGroupBtn')?.addEventListener('click', closeGroupModal);

  // Close modal when clicking outside
  document.getElementById('groupModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'groupModal') {
      closeGroupModal();
    }
  });

  // Delete group modal buttons
  document.getElementById('closeDeleteGroupModal')?.addEventListener('click', closeDeleteGroupModal);
  document.getElementById('cancelDeleteGroupBtn')?.addEventListener('click', closeDeleteGroupModal);
  document.getElementById('confirmDeleteGroupBtn')?.addEventListener('click', confirmDeleteGroup);

  // Close delete group modal when clicking outside
  document.getElementById('deleteGroupModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'deleteGroupModal') {
      closeDeleteGroupModal();
    }
  });
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
    'regex': 'regexOptions'
  };

  const selectedOption = document.getElementById(optionMap[type]);
  if (selectedOption) {
    selectedOption.style.display = 'block';
  }
}

async function saveRule() {
  const ruleData = collectFormData();

  if (!ruleData) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  try {
    let savedRule;
    if (currentEditingRuleId) {
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: currentEditingRuleId,
        rule: ruleData
      });
      // For updates, fetch all rules to verify
      const rulesResult = await chrome.runtime.sendMessage({ action: 'getRules' });
      savedRule = rulesResult?.rules?.find(r => r.id === currentEditingRuleId);
    } else {
      const response = await chrome.runtime.sendMessage({
        action: 'addRule',
        rule: ruleData
      });
      savedRule = response?.rule;
    }

    // Verify the rule was saved correctly, especially for delay=0 case
    if (savedRule) {
      const expectedDelay = ruleData.delay;
      const actualDelay = savedRule.delay;

      // Check if delay was saved correctly (including 0)
      if (expectedDelay !== undefined && actualDelay !== expectedDelay) {
        console.error(`Delay verification failed! Expected: ${expectedDelay}, Got: ${actualDelay}`);
        showToast(`Warning: Delay value was not saved correctly. Expected ${expectedDelay}ms but got ${actualDelay}ms`, 'error');
        return;
      }

      // Log successful save with delay info
      if (expectedDelay !== undefined) {
        console.log(`Rule saved successfully with delay: ${actualDelay}ms`);
      }
    } else {
      console.warn('Could not verify saved rule');
    }

    const message = currentEditingRuleId ? 'Rule updated successfully' : 'Rule created successfully';
    currentEditingRuleId = null;
    resetForm();
    await loadRules();
    showTab('rules');
    showToast(message, 'success');
  } catch (error) {
    console.error('Failed to save rule:', error);
    showToast('Failed to save rule: ' + error.message, 'error');
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
    return { valid: true, warning: `Status code ${code} is not a standard HTTP status code. Continue anyway?` };
  }
  return { valid: true };
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

  // Get delay value
  const delayValue = document.getElementById('ruleDelay').value.trim();
  const delay = delayValue ? parseInt(delayValue, 10) : null;

  // Validate delay
  if (delay !== null && (delay < 0 || delay > 30000)) {
    showToast('Delay must be between 0 and 30000 milliseconds', 'error');
    return null;
  }

  // Base rule data
  const ruleData = {
    name,
    description,
    urlPattern,
    matchType,
    methods,
    enabled
  };

  // Add delay if specified
  if (delay !== null) {
    ruleData.delay = delay;
    console.log(`Setting delay value: ${delay}ms`);
  }

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
  }

  ruleData.modifyType = modifyType;
  ruleData.modification = modification;

  // Get status code modification
  const statusCode = document.getElementById('modifyStatusCode').value.trim();
  if (statusCode) {
    const validation = validateStatusCode(statusCode);
    if (!validation.valid) {
      showToast(validation.message, 'error');
      return null;
    }
    if (validation.warning) {
      if (!confirm(validation.warning)) {
        return null;
      }
    }
    ruleData.modifyStatusCode = parseInt(statusCode, 10);
  }

  // Get header modifications
  const modifyHeaders = getHeaderModifications();
  if (modifyHeaders.length > 0) {
    ruleData.modifyHeaders = modifyHeaders;
  }

  // Get group assignment (use null to explicitly remove group)
  const groupValue = document.getElementById('ruleGroup').value;
  if (groupValue) {
    ruleData.groupId = groupValue;
  }

  return ruleData;
}


async function editRule(ruleId) {
  // Validate ruleId
  if (!ruleId) {
    console.error('editRule: ruleId is required');
    showToast('Invalid rule ID', 'error');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });

    if (!response || !response.rules) {
      console.error('Failed to get rules: Invalid response');
      showToast('Failed to load rules', 'error');
      return;
    }

    const rules = response.rules;
    const rule = rules.find(r => r && r.id === ruleId);

    if (!rule) {
      showToast('Rule not found', 'error');
      return;
    }

    currentEditingRuleId = ruleId;
    populateForm(rule);
    showTab('new-rule');

    const formTitle = document.getElementById('formTitle');
    if (formTitle) {
      formTitle.textContent = 'Edit Rule';
    }
  } catch (error) {
    console.error('Failed to edit rule:', error);
    showToast('Failed to load rule', 'error');
  }
}

function populateForm(rule) {
  // Validate rule object
  if (!rule || typeof rule !== 'object') {
    console.error('populateForm: Invalid rule object');
    return;
  }

  // Safely populate form fields with null checks
  const setElementValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = value !== null && value !== undefined ? value : '';
    }
  };

  const setElementChecked = (id, checked) => {
    const element = document.getElementById(id);
    if (element) {
      element.checked = !!checked;
    }
  };

  setElementValue('ruleId', rule.id);
  setElementValue('ruleName', rule.name);
  setElementValue('ruleDescription', rule.description);
  setElementValue('urlPattern', rule.urlPattern);
  setElementValue('matchType', rule.matchType);
  setElementChecked('ruleEnabled', rule.enabled);

  // Set methods
  document.querySelectorAll('input[name="methods"]').forEach(cb => {
    cb.checked = rule.methods && Array.isArray(rule.methods) && rule.methods.includes(cb.value);
  });

  // Set delay
  setElementValue('ruleDelay', rule.delay !== undefined && rule.delay !== null ? rule.delay : '');

  // Set response modify type
  setElementValue('modifyType', rule.modifyType || 'replace');
  if (rule.modifyType) {
    updateModificationOptions(rule.modifyType);
  }

  // Populate modification fields
  if (rule.modification) {
    switch (rule.modifyType) {
      case 'replace':
        setElementValue('replaceValue', rule.modification.value);
        break;

      case 'json-path':
        setElementValue('jsonPath', rule.modification.path);
        setElementValue('jsonValue', rule.modification.value);
        break;

      case 'regex':
        setElementValue('regexPattern', rule.modification.pattern);
        setElementValue('regexReplacement', rule.modification.replacement);
        setElementValue('regexFlags', rule.modification.flags || 'g');
        break;
    }
  }

  // Populate status code
  setElementValue('modifyStatusCode', rule.modifyStatusCode);

  // Populate header modifications
  clearHeaderModifications();
  if (rule.modifyHeaders && Array.isArray(rule.modifyHeaders)) {
    rule.modifyHeaders.forEach(header => {
      if (header && header.name) {
        addHeaderModification(header.name, header.value, header.action);
      }
    });
  }

  // Populate group selection
  setElementValue('ruleGroup', rule.groupId || '');
}

function resetForm() {
  document.getElementById('ruleForm').reset();
  document.getElementById('ruleId').value = '';
  document.getElementById('formTitle').textContent = 'Create New Rule';
  document.getElementById('ruleEnabled').checked = true;
  document.querySelectorAll('input[name="methods"]')[0].checked = true; // Check GET by default

  // Reset delay
  document.getElementById('ruleDelay').value = '';

  // Reset response modification options
  updateModificationOptions('replace');
  document.getElementById('modifyStatusCode').value = '';
  clearHeaderModifications();
  currentEditingRuleId = null;
}

// ==================== Rule Templates ====================

/**
 * Pre-defined rule templates for common scenarios
 */
const RULE_TEMPLATES = {
  'mock-success': {
    name: 'Mock Success Response',
    description: 'Return a successful JSON response with status 200',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET'],
    modifyType: 'replace',
    modifyStatusCode: 200,
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: true,
        message: 'Request completed successfully',
        data: {}
      }, null, 2)
    }
  },
  'mock-error': {
    name: 'Mock Server Error',
    description: 'Simulate a 500 Internal Server Error response',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET', 'POST'],
    modifyType: 'replace',
    modifyStatusCode: 500,
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }, null, 2)
    }
  },
  'mock-404': {
    name: 'Mock Not Found',
    description: 'Simulate a 404 Not Found response',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET'],
    modifyType: 'replace',
    modifyStatusCode: 404,
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: false,
        error: 'Not Found',
        message: 'The requested resource was not found'
      }, null, 2)
    }
  },
  'mock-delay': {
    name: 'Slow Network Simulation',
    description: 'Add 2 second delay to simulate slow network',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET', 'POST'],
    delay: 2000,
    modifyType: 'replace',
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: true,
        message: 'Response delayed by 2 seconds'
      }, null, 2)
    }
  },
  'cors-headers': {
    name: 'Enable CORS Headers',
    description: 'Add CORS headers to allow cross-origin requests',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    modifyType: 'replace',
    modifyHeaders: [
      { name: 'Access-Control-Allow-Origin', value: '*', action: 'set' },
      { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS', action: 'set' },
      { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization', action: 'set' }
    ],
    modification: {
      type: 'json',
      value: JSON.stringify({ success: true }, null, 2)
    }
  },
  'empty-array': {
    name: 'Empty List Response',
    description: 'Return an empty array for list endpoints',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET'],
    modifyType: 'replace',
    modifyStatusCode: 200,
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: true,
        data: [],
        total: 0,
        page: 1,
        limit: 10
      }, null, 2)
    }
  },
  'auth-error': {
    name: 'Authentication Error',
    description: 'Simulate a 401 Unauthorized response',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET', 'POST'],
    modifyType: 'replace',
    modifyStatusCode: 401,
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required. Please login to continue.'
      }, null, 2)
    }
  },
  'rate-limit': {
    name: 'Rate Limit Error',
    description: 'Simulate a 429 Too Many Requests response',
    urlPattern: '*://*/api/*',
    matchType: 'wildcard',
    methods: ['GET', 'POST'],
    modifyType: 'replace',
    modifyStatusCode: 429,
    modifyHeaders: [
      { name: 'Retry-After', value: '60', action: 'set' },
      { name: 'X-RateLimit-Limit', value: '100', action: 'set' },
      { name: 'X-RateLimit-Remaining', value: '0', action: 'set' }
    ],
    modification: {
      type: 'json',
      value: JSON.stringify({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, null, 2)
    }
  }
};

/**
 * Apply a template to the rule form
 * @param {string} templateId - The template identifier
 */
function applyTemplate(templateId) {
  const template = RULE_TEMPLATES[templateId];
  if (!template) {
    showToast('Template not found', 'error');
    return;
  }

  // Reset form first
  resetForm();

  // Apply template values
  document.getElementById('ruleName').value = template.name || '';
  document.getElementById('ruleDescription').value = template.description || '';
  document.getElementById('urlPattern').value = template.urlPattern || '';
  document.getElementById('matchType').value = template.matchType || 'wildcard';

  // Set methods
  document.querySelectorAll('input[name="methods"]').forEach(cb => {
    cb.checked = template.methods?.includes(cb.value) || false;
  });

  // Set delay if present
  if (template.delay) {
    document.getElementById('ruleDelay').value = template.delay;
  }

  // Set modification type and value
  if (template.modifyType) {
    document.getElementById('modifyType').value = template.modifyType;
    updateModificationOptions(template.modifyType);

    if (template.modifyType === 'replace' && template.modification?.value) {
      document.getElementById('replaceValue').value = template.modification.value;
    }
  }

  // Set status code
  if (template.modifyStatusCode) {
    document.getElementById('modifyStatusCode').value = template.modifyStatusCode;
  }

  // Set header modifications
  if (template.modifyHeaders && template.modifyHeaders.length > 0) {
    clearHeaderModifications();
    template.modifyHeaders.forEach(header => {
      addHeaderModificationRow(header.action, header.name, header.value);
    });
  }

  showToast(`Applied "${template.name}" template`, 'success');
}

/**
 * Setup template button click handlers
 */
function setupTemplateButtons() {
  const templatesGrid = document.getElementById('templatesGrid');
  if (!templatesGrid) return;

  templatesGrid.addEventListener('click', (e) => {
    const templateBtn = e.target.closest('.template-btn');
    if (templateBtn) {
      const templateId = templateBtn.dataset.template;
      applyTemplate(templateId);
    }
  });
}

// ==================== Keyboard Shortcuts ====================

/**
 * Setup keyboard shortcuts for better productivity
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in input fields
    if (e.target.matches('input, textarea, select')) {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    // Ctrl/Cmd + N: New rule
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      currentEditingRuleId = null;
      resetForm();
      switchTab('new-rule');
      document.getElementById('ruleName')?.focus();
      showToast('Creating new rule (Ctrl+N)', 'info');
    }

    // Ctrl/Cmd + S: Save current form (if on new-rule tab)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      const newRuleTab = document.getElementById('new-rule-tab');
      if (newRuleTab && newRuleTab.classList.contains('active')) {
        e.preventDefault();
        document.getElementById('ruleForm')?.requestSubmit();
      }
    }

    // Escape: Go back to rules list
    if (e.key === 'Escape') {
      const newRuleTab = document.getElementById('new-rule-tab');
      if (newRuleTab && newRuleTab.classList.contains('active')) {
        switchTab('rules');
      }
    }

    // Ctrl/Cmd + F: Focus search (if on rules tab)
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const rulesTab = document.getElementById('rules-tab');
      if (rulesTab && rulesTab.classList.contains('active')) {
        // Focus the first focusable element or rules list
        e.preventDefault();
        showToast('Search rules with the filter options', 'info');
      }
    }

    // 1-4: Quick tab navigation
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tabMap = {
        '1': 'rules',
        '2': 'new-rule',
        '3': 'import-export',
        '4': 'help'
      };
      if (tabMap[e.key]) {
        switchTab(tabMap[e.key]);
      }
    }
  });
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

// Store for undo functionality
let pendingDeletedRule = null;

async function deleteRule(ruleId) {
  try {
    // Find the rule before deletion to store it for potential undo
    const ruleToDelete = window.currentRules?.find(r => r.id === ruleId);

    if (!ruleToDelete) {
      showToast('Rule not found', 'error');
      return;
    }

    // Store the rule for potential undo
    pendingDeletedRule = { ...ruleToDelete };

    // Delete the rule
    await chrome.runtime.sendMessage({
      action: 'deleteRule',
      ruleId: ruleId
    });

    // Refresh the UI
    await loadRules();

    // Show toast with undo option
    showToast('Rule deleted', 'success', {
      label: 'Undo',
      callback: async () => {
        await undoDeleteRule();
      },
      onExpire: () => {
        // Clear the stored rule after timeout (deletion is permanent)
        pendingDeletedRule = null;
      }
    });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    showToast('Failed to delete rule', 'error');
    pendingDeletedRule = null;
  }
}

async function undoDeleteRule() {
  if (!pendingDeletedRule) {
    showToast('Nothing to undo', 'error');
    return;
  }

  try {
    // Restore the rule (will get a new ID but retain all other properties)
    const ruleData = { ...pendingDeletedRule };
    delete ruleData.id; // Let the backend generate a new ID
    delete ruleData.createdAt;
    delete ruleData.modifiedAt;

    await chrome.runtime.sendMessage({
      action: 'addRule',
      rule: ruleData
    });

    pendingDeletedRule = null;
    await loadRules();
    showToast('Rule restored', 'success');
  } catch (error) {
    console.error('Failed to restore rule:', error);
    showToast('Failed to restore rule', 'error');
  }
}

async function duplicateRule(ruleId) {
  try {
    // Find the rule to duplicate
    const ruleToDuplicate = window.currentRules.find(r => r.id === ruleId);

    if (!ruleToDuplicate) {
      showToast('Rule not found', 'error');
      return;
    }

    // Create a copy of the rule
    const duplicatedRule = {
      ...ruleToDuplicate,
      name: `${ruleToDuplicate.name} (Copy)`,
      enabled: false // Disable the copy by default
    };

    // Remove fields that should be generated anew
    delete duplicatedRule.id;
    delete duplicatedRule.createdAt;
    delete duplicatedRule.modifiedAt;

    // Add the duplicated rule
    await chrome.runtime.sendMessage({
      action: 'addRule',
      rule: duplicatedRule
    });

    // Reload rules to show the new duplicate
    await loadRules();
    showToast('Rule duplicated successfully', 'success');
  } catch (error) {
    console.error('Failed to duplicate rule:', error);
    showToast('Failed to duplicate rule', 'error');
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
    showToast('Failed to export rules', 'error');
  }
}

async function importRules(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.rules || !Array.isArray(data.rules)) {
      showToast('Invalid file format', 'error');
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
    showToast(`Successfully imported ${data.rules.length} rules`, "success");
    e.target.value = ''; // Reset file input
  } catch (error) {
    console.error('Failed to import rules:', error);
    showToast('Failed to import rules', 'error');
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
    showToast('All rules have been deleted', 'success');
  } catch (error) {
    console.error('Failed to clear rules:', error);
    showToast('Failed to clear rules', 'error');
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

// Groups Management
let currentGroups = [];

async function loadGroups() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getGroups' });
    currentGroups = response.groups || [];
    updateGroupSelectors();
  } catch (error) {
    console.error('Failed to load groups:', error);
  }
}

function getRuleCountForGroup(groupId) {
  // This will be called after rules are loaded
  const rulesList = document.getElementById('rulesList');
  if (!rulesList) return 0;

  // Count from currentRules if available
  if (window.currentRules) {
    return window.currentRules.filter(r => r.groupId === groupId).length;
  }
  return 0;
}

function getEnabledRuleCountForGroup(groupId) {
  if (window.currentRules) {
    return window.currentRules.filter(r => r.groupId === groupId && r.enabled).length;
  }
  return 0;
}

async function toggleGroup(groupId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'toggleGroup',
      groupId: groupId
    });
    await loadGroups();
    await loadRules(); // Reload rules to reflect group state changes
  } catch (error) {
    console.error('Failed to toggle group:', error);
    showToast('Failed to toggle group', 'error');
  }
}

function editGroup(groupId) {
  const group = currentGroups.find(g => g.id === groupId);
  if (!group) return;

  // Populate form
  document.getElementById('editGroupId').value = group.id;
  document.getElementById('groupName').value = group.name;
  document.getElementById('groupDescription').value = group.description || '';
  document.getElementById('groupColor').value = group.color || '#4CAF50';
  document.getElementById('groupEnabled').checked = group.enabled;

  // Update modal title
  document.getElementById('groupModalTitle').textContent = 'Edit Group';

  // Show modal
  document.getElementById('groupModal').style.display = 'flex';
}

function deleteGroup(groupId) {
  const group = currentGroups.find(g => g.id === groupId);
  if (!group) return;

  const message = `Are you sure you want to delete the group "${group.name}"?`;

  // Store the group ID for the confirmation handler
  document.getElementById('deleteGroupId').value = groupId;
  document.getElementById('deleteGroupMessage').textContent = message;

  // Always show the delete options so user can choose what to do with rules
  const deleteOptionsEl = document.getElementById('deleteGroupOptions');
  deleteOptionsEl.style.display = 'block';
  // Reset to default option (keep rules)
  document.querySelector('input[name="deleteGroupAction"][value="keep"]').checked = true;

  // Show the modal
  document.getElementById('deleteGroupModal').style.display = 'flex';
}

async function confirmDeleteGroup() {
  const groupId = document.getElementById('deleteGroupId').value;
  if (!groupId) return;

  const deleteRulesOption = document.querySelector('input[name="deleteGroupAction"]:checked');
  const deleteRules = deleteRulesOption ? deleteRulesOption.value === 'delete' : false;

  try {
    await chrome.runtime.sendMessage({
      action: 'deleteGroup',
      groupId: groupId,
      deleteRules: deleteRules
    });

    // Hide modal
    document.getElementById('deleteGroupModal').style.display = 'none';

    await loadGroups();
    await loadRules(); // Reload rules to update group indicators

    const message = deleteRules ? 'Group and rules deleted successfully' : 'Group deleted successfully';
    showToast(message, 'success');
  } catch (error) {
    console.error('Failed to delete group:', error);
    showToast('Failed to delete group', 'error');
  }
}

function closeDeleteGroupModal() {
  document.getElementById('deleteGroupModal').style.display = 'none';
}

async function saveGroup(e) {
  e.preventDefault();

  const groupId = document.getElementById('editGroupId').value;
  const groupData = {
    name: document.getElementById('groupName').value.trim(),
    description: document.getElementById('groupDescription').value.trim(),
    color: document.getElementById('groupColor').value,
    enabled: document.getElementById('groupEnabled').checked
  };

  if (!groupData.name) {
    showToast('Please enter a group name', 'error');
    return;
  }

  try {
    if (groupId) {
      // Update existing group
      await chrome.runtime.sendMessage({
        action: 'updateGroup',
        groupId: groupId,
        group: groupData
      });
    } else {
      // Add new group
      await chrome.runtime.sendMessage({
        action: 'addGroup',
        group: groupData
      });
    }

    const message = groupId ? 'Group updated successfully' : 'Group created successfully';
    closeGroupModal();
    await loadGroups();
    await loadRules(); // Reload rules to update group indicators
    showToast(message, 'success');
  } catch (error) {
    console.error('Failed to save group:', error);
    showToast('Failed to save group', 'error');
  }
}

function openGroupModal() {
  // Reset form
  document.getElementById('editGroupId').value = '';
  document.getElementById('groupName').value = '';
  document.getElementById('groupDescription').value = '';
  document.getElementById('groupColor').value = '#4CAF50';
  document.getElementById('groupEnabled').checked = true;

  // Update modal title
  document.getElementById('groupModalTitle').textContent = 'Add New Group';

  // Show modal
  document.getElementById('groupModal').style.display = 'flex';
}

function closeGroupModal() {
  document.getElementById('groupModal').style.display = 'none';
}

function updateGroupSelectors() {
  // Update the group selector in the rule form
  const ruleGroupSelect = document.getElementById('ruleGroup');
  if (!ruleGroupSelect) return;

  // Keep the current selection
  const currentValue = ruleGroupSelect.value;

  // Clear and repopulate
  ruleGroupSelect.innerHTML = '<option value="">No Group</option>';

  currentGroups.forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    option.style.borderLeft = `4px solid ${group.color}`;
    ruleGroupSelect.appendChild(option);
  });

  // Restore selection if it still exists
  if (currentValue) {
    ruleGroupSelect.value = currentValue;
  }
}

function prettifyJsonInTextarea() {
  const textarea = document.getElementById('replaceValue');
  const content = textarea.value.trim();

  if (!content) {
    showToast('Please enter some JSON content first', 'error');
    return;
  }

  try {
    // Parse and prettify the JSON
    const jsonData = JSON.parse(content);
    const prettified = JSON.stringify(jsonData, null, 2);
    textarea.value = prettified;
  } catch (error) {
    showToast('Invalid JSON: ' + error.message, 'error');
  }
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make showTab available globally for help section
window.showTab = showTab;
