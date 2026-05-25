// Options page script

import { CONTENT_TYPE_PRESETS, isBinaryContentType } from '../shared/content-types.js';
import { debounce } from '../shared/debounce.js';
import { safeCompileRegex } from '../shared/regex.js';
import { MESSAGES } from '../shared/messages.js';

const BODY_PLACEHOLDERS = {
  'application/json': '{"message": "Modified response"}',
  'text/html': '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>',
  'text/plain': 'Hello, world!',
  'application/xml': '<?xml version="1.0"?>\n<root>\n  <item>value</item>\n</root>',
  'text/csv': 'id,name,value\n1,foo,bar',
  'application/javascript': 'console.log("intercepted");',
  'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
};

function updateResponseTypeUI(contentType) {
  const isBinary = isBinaryContentType(contentType);
  const isCustom = contentType === '__custom__';

  document.getElementById('customContentTypeRow').style.display = isCustom ? 'block' : 'none';
  document.getElementById('textBodyPanel').style.display = (!isBinary || isCustom) ? 'block' : 'none';
  document.getElementById('binaryBodyPanel').style.display = (isBinary && !isCustom) ? 'block' : 'none';
  document.getElementById('customBinaryToggle').style.display = isCustom ? 'block' : 'none';

  const label = document.getElementById('replaceValueLabel');
  const prettifyBtn = document.getElementById('prettifyJsonBtn');
  const ta = document.getElementById('replaceValue');
  if (label) label.textContent = contentType === 'application/json' ? 'Response Body (JSON)' : 'Response Body';
  if (prettifyBtn) prettifyBtn.style.display = contentType === 'application/json' ? '' : 'none';
  if (ta) ta.placeholder = BODY_PLACEHOLDERS[contentType] || 'Enter response body...';

}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function fetchUrlAsBase64(url) {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.FETCH_URL_AS_BASE64, url });
    if (!response.success) throw new Error(response.error || 'Fetch failed');
    return response.base64;
  } catch (error) {
    throw new Error(error.message || 'Failed to fetch URL');
  }
}

function updateBinaryPreview(base64, contentType) {
  const preview = document.getElementById('binaryPreview');
  const content = document.getElementById('binaryPreviewContent');
  if (!preview || !content) return;
  preview.style.display = 'block';
  if (contentType && contentType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = `data:${contentType};base64,${base64}`;
    img.style.cssText = 'max-width:200px; max-height:150px; border:1px solid var(--border);';
    content.innerHTML = '';
    content.appendChild(img);
  } else {
    const kb = Math.round((base64.length * 3 / 4) / 1024);
    content.innerHTML = `<span style="font-size:12px;">${kb} KB of binary data encoded</span>`;
  }
}

let currentEditingRuleId = null;
let headerModificationCounter = 0;
let collapsedGroups = new Set(); // Track collapsed group IDs
let optionsSearchQuery = '';

// Initialize options page
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await loadGroups();
  await loadRules();
  setupEventListeners();
  setupNavigation();
  setupThemeToggle();
  setupKeyboardShortcuts();
  setupJsonEditorListeners();
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

  // Always reset form when navigating to new-rule tab
  if (tabName === 'new-rule') {
    currentEditingRuleId = null;
    resetForm();
  }
}

// Load and display rules
async function loadRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const rules = response.rules || [];

    // Store rules globally for group stats
    window.currentRules = rules;

    displayRules(rules);
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

  // Update KPI strip even on empty state
  const _kpiTotal = document.getElementById('kpi-total');
  const _kpiActive = document.getElementById('kpi-active');
  const _kpiGroups = document.getElementById('kpi-groups');
  const _kpiDisabled = document.getElementById('kpi-disabled');
  if (_kpiTotal) _kpiTotal.textContent = rules.length;
  if (_kpiActive) _kpiActive.textContent = rules.filter(r => r.enabled).length;
  if (_kpiGroups) _kpiGroups.textContent = currentGroups.length;
  if (_kpiDisabled) _kpiDisabled.textContent = rules.filter(r => !r.enabled).length;

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
              <span class="drop-hint">Drop a rule here to add it</span>
              <button class="btn btn-secondary btn-small add-rule-to-group-btn" data-group-id="${group.id}">+ Add Rule</button>
            </div>
          ` : `
            <div class="options-rules-table">
              <div class="ort-header">
                <div class="ort-th">Name</div>
                <div class="ort-th">URL Pattern</div>
                <div class="ort-th">Methods</div>
                <div class="ort-th">Status Code</div>
                <div class="ort-th ort-th-center">On/Off</div>
                <div class="ort-th">Actions</div>
              </div>
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
            <span class="drop-hint">Drop a rule here to ungroup it</span>
          </div>
        ` : `
          <div class="options-rules-table">
            <div class="ort-header">
              <div class="ort-th">Name</div>
              <div class="ort-th">URL Pattern</div>
              <div class="ort-th">Methods</div>
              <div class="ort-th">Status Code</div>
              <div class="ort-th ort-th-center">On/Off</div>
              <div class="ort-th">Actions</div>
            </div>
            ${ungroupedRules.map(rule => renderRuleCard(rule, null)).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  groupedRulesList.innerHTML = html;

  // Set max-height for non-collapsed groups so animation works
  document.querySelectorAll('.options-group-rules').forEach(container => {
    if (!container.classList.contains('collapsed')) {
      container.style.maxHeight = 'none';
    }
  });

  // Add event listeners
  attachRuleEventListeners();
  attachGroupEventListeners();

  // Re-apply search filter after re-render
  if (optionsSearchQuery) filterOptionsRules(optionsSearchQuery);
}

function renderRuleCard(rule, group) {
  const isGroupDisabled = group && !group.enabled;

  const rowClasses = [
    'rule-card',
    'ort-row',
    rule.enabled ? '' : 'disabled',
    isGroupDisabled ? 'group-disabled-card' : ''
  ].filter(Boolean).join(' ');

  const actionType = rule.actionType || 'mockResponse';
  const actionLabel = getActionTypeLabel(actionType);
  const actionClass = getActionTypeClass(actionType);

  // Method badges
  const methodBadges = (rule.methods && rule.methods.length > 0 ? rule.methods : ['*'])
    .map(m => `<span class="rule-badge method">${m}</span>`)
    .join('');

  return `
    <div class="${rowClasses}" data-rule-id="${rule.id}" draggable="true">
      <div class="ort-td ort-td-name">
        <span class="drag-handle" title="Drag to move between groups">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
        </span>
        <div class="ort-name-info">
          <span class="rule-card-title">${escapeHtml(rule.name)}</span>
          ${rule.description ? `<span class="rule-card-description">${escapeHtml(rule.description)}</span>` : ''}
        </div>
      </div>
      <div class="ort-td ort-td-pattern">
        <span class="rule-card-pattern">${escapeHtml(rule.urlPattern)}</span>
      </div>
      <div class="ort-td ort-td-methods">${methodBadges}</div>
      <div class="ort-td ort-td-code">
        <input type="number" class="ort-status-input" data-rule-id="${rule.id}"
          value="${rule.modifyStatusCode || ''}" placeholder="—"
          min="100" max="599" ${isGroupDisabled ? 'disabled' : ''}>
      </div>
      <div class="ort-td ort-td-toggle">
        <div class="toggle-switch-small">
          <input type="checkbox" id="toggle-${rule.id}" ${rule.enabled ? 'checked' : ''} ${isGroupDisabled ? 'disabled' : ''} data-rule-id="${rule.id}">
          <label for="toggle-${rule.id}" ${isGroupDisabled ? 'class="toggle-disabled"' : ''}></label>
        </div>
      </div>
      <div class="ort-td ort-td-actions">
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

  // Drag & Drop targets on group containers
  document.querySelectorAll('.options-group-container').forEach(container => {
    container.addEventListener('dragover', handleGroupDragOver);
    container.addEventListener('dragenter', handleGroupDragEnter);
    container.addEventListener('dragleave', handleGroupDragLeave);
    container.addEventListener('drop', handleGroupDrop);
  });
}

function toggleGroupCollapse(groupId) {
  const btn = document.querySelector(`.options-group-collapse-btn[data-group-id="${groupId}"]`);
  const rulesContainer = document.querySelector(`[data-group-rules="${groupId}"]`);

  if (collapsedGroups.has(groupId)) {
    collapsedGroups.delete(groupId);
    btn?.classList.remove('collapsed');
    if (rulesContainer) {
      rulesContainer.classList.remove('collapsed');
      // Set max-height for smooth expand
      rulesContainer.style.maxHeight = rulesContainer.scrollHeight + 'px';
      setTimeout(() => {
        rulesContainer.style.maxHeight = 'none';
      }, 310);
    }
  } else {
    collapsedGroups.add(groupId);
    btn?.classList.add('collapsed');
    if (rulesContainer) {
      // Set current height first so transition works
      rulesContainer.style.maxHeight = rulesContainer.scrollHeight + 'px';
      // Force reflow
      rulesContainer.offsetHeight;
      rulesContainer.classList.add('collapsed');
    }
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

  // Inline status code quick-edit
  document.querySelectorAll('.ort-status-input').forEach(input => {
    const save = async (e) => {
      const ruleId = e.target.dataset.ruleId;
      const raw = e.target.value.trim();
      const rule = (window.currentRules || []).find(r => r.id === ruleId);
      if (!rule) return;

      const updated = { ...rule };
      if (!raw) {
        delete updated.modifyStatusCode;
      } else {
        const code = parseInt(raw, 10);
        if (isNaN(code) || code < 100 || code > 599) {
          e.target.value = rule.modifyStatusCode || '';
          showToast('Status code must be 100–599', 'error');
          return;
        }
        updated.modifyStatusCode = code;
      }

      try {
        await chrome.runtime.sendMessage({ action: MESSAGES.UPDATE_RULE, ruleId, rule: updated });
        const idx = (window.currentRules || []).findIndex(r => r.id === ruleId);
        if (idx !== -1) window.currentRules[idx] = updated;
        showToast('Status code saved', 'success');
      } catch (err) {
        showToast('Failed to save status code', 'error');
      }
    };

    input.addEventListener('change', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.target.blur(); }
      if (e.key === 'Escape') {
        const rule = (window.currentRules || []).find(r => r.id === e.target.dataset.ruleId);
        e.target.value = rule?.modifyStatusCode || '';
        e.target.blur();
      }
    });
  });

  // Drag & Drop on rule cards
  document.querySelectorAll('.rule-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });
}

// ======================================
// Drag & Drop
// ======================================

let dragAutoExpandTimeout = null;

function handleDragStart(e) {
  const ruleId = e.currentTarget.dataset.ruleId;
  e.dataTransfer.setData('text/plain', ruleId);
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  // Clean up all drop target highlights
  document.querySelectorAll('.drop-target-hover').forEach(el => {
    el.classList.remove('drop-target-hover');
  });
  if (dragAutoExpandTimeout) {
    clearTimeout(dragAutoExpandTimeout);
    dragAutoExpandTimeout = null;
  }
}

function handleGroupDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleGroupDragEnter(e) {
  e.preventDefault();
  const container = e.currentTarget;
  container.classList.add('drop-target-hover');

  // Auto-expand collapsed groups after 500ms hover
  const groupId = container.dataset.groupId;
  if (groupId && collapsedGroups.has(groupId)) {
    if (dragAutoExpandTimeout) clearTimeout(dragAutoExpandTimeout);
    dragAutoExpandTimeout = setTimeout(() => {
      toggleGroupCollapse(groupId);
    }, 500);
  }
}

function handleGroupDragLeave(e) {
  const container = e.currentTarget;
  // Only remove highlight if we're actually leaving the container
  if (!container.contains(e.relatedTarget)) {
    container.classList.remove('drop-target-hover');
    if (dragAutoExpandTimeout) {
      clearTimeout(dragAutoExpandTimeout);
      dragAutoExpandTimeout = null;
    }
  }
}

async function handleGroupDrop(e) {
  e.preventDefault();
  const container = e.currentTarget;
  container.classList.remove('drop-target-hover');

  const ruleId = e.dataTransfer.getData('text/plain');
  if (!ruleId) return;

  const targetGroupId = container.dataset.groupId;
  // "ungrouped" means null groupId
  const newGroupId = targetGroupId === 'ungrouped' ? null : targetGroupId;

  // Check if rule is already in this group
  const rule = (window.currentRules || []).find(r => r.id === ruleId);
  if (!rule) return;
  const currentGroupId = rule.groupId || null;
  if (currentGroupId === newGroupId) return;

  try {
    await chrome.runtime.sendMessage({
      action: MESSAGES.ASSIGN_RULE_TO_GROUP,
      ruleId: ruleId,
      groupId: newGroupId
    });
    await loadRules();

    // Add pulse animation to the moved card
    setTimeout(() => {
      const movedCard = document.querySelector(`.rule-card[data-rule-id="${ruleId}"]`);
      if (movedCard) {
        movedCard.classList.add('just-moved');
        setTimeout(() => movedCard.classList.remove('just-moved'), 700);
      }
    }, 50);

    const targetName = newGroupId
      ? (currentGroups.find(g => g.id === newGroupId)?.name || 'group')
      : 'Ungrouped';
    showToast(`Rule moved to ${targetName}`, 'success');
  } catch (error) {
    console.error('Failed to move rule:', error);
    showToast('Failed to move rule', 'error');
  }
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

// Algorithm mirrors rule-engine.js wildcardMatch — keep in sync if engine changes
function testUrlPattern(url, pattern, matchType) {
  if (!url || !pattern) return null;
  switch (matchType) {
    case 'exact': return url === pattern;
    case 'contains': return url.includes(pattern);
    case 'regex': {
      const compiled = safeCompileRegex(pattern);
      return compiled ? compiled.test(url) : false;
    }
    case 'wildcard':
    default: {
      const r = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<!DW!>')
        .replace(/\*/g, '[^/]*')
        .replace(/<!DW!>/g, '.*');
      const compiled = safeCompileRegex(`^${r}$`);
      return compiled ? compiled.test(url) : false;
    }
  }
}

function filterOptionsRules(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('.rule-card').forEach(card => {
    const ruleId = card.dataset.ruleId;
    const rule = (window.currentRules || []).find(r => r.id === ruleId);
    if (!rule) return;
    const matches = !q ||
      rule.name.toLowerCase().includes(q) ||
      rule.urlPattern.toLowerCase().includes(q) ||
      (rule.description && rule.description.toLowerCase().includes(q));
    card.style.display = matches ? '' : 'none';
  });

  document.querySelectorAll('.options-group-container').forEach(container => {
    if (!q) {
      container.style.display = '';
      return;
    }
    const visibleCards = container.querySelectorAll('.rule-card:not([style*="display: none"])');
    container.style.display = visibleCards.length === 0 ? 'none' : '';
  });

  const clearBtn = document.getElementById('optionsClearSearch');
  if (clearBtn) clearBtn.style.display = q ? 'inline-flex' : 'none';
}

const MATCH_TYPE_HINTS = {
  wildcard: {
    title: 'Wildcard',
    desc: 'Use <code>*</code> to match any single path segment and <code>**</code> to match any number of segments.',
    example: '<code>*://*/api/**</code> matches any domain and any path under <code>/api/</code>'
  },
  regex: {
    title: 'Regular Expression',
    desc: 'Full JavaScript regex matched against the URL. Do not include leading/trailing slashes.',
    example: '<code>api\\.example\\.com/users/\\d+</code> matches <code>/users/123</code> but not <code>/users/abc</code>'
  },
  exact: {
    title: 'Exact Match',
    desc: 'The URL must match the pattern character-for-character, including protocol and query string.',
    example: '<code>https://api.example.com/users</code> only matches that exact URL'
  },
  contains: {
    title: 'Contains',
    desc: 'Matches any URL that contains the pattern as a substring anywhere.',
    example: '<code>/api/users</code> matches <code>https://dev.example.com/api/users/list</code>'
  }
};

function updateMatchTypeHint() {
  const type = document.getElementById('matchType')?.value;
  const hintEl = document.getElementById('matchTypeHint');
  if (!hintEl || !type) return;
  const h = MATCH_TYPE_HINTS[type];
  if (!h) { hintEl.innerHTML = ''; return; }
  hintEl.innerHTML = `<strong>${h.title}</strong>${h.desc} <span style="display:block;margin-top:4px;color:var(--text-muted);">e.g. ${h.example}</span>`;
}

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

  // Options search bar
  const optionsSearchInput = document.getElementById('optionsSearch');
  const optionsClearSearchBtn = document.getElementById('optionsClearSearch');
  if (optionsSearchInput) {
    const debouncedFilter = debounce((q) => filterOptionsRules(q), 150);
    optionsSearchInput.addEventListener('input', (e) => {
      optionsSearchQuery = e.target.value;
      debouncedFilter(optionsSearchQuery);
    });
    optionsSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        optionsSearchInput.value = '';
        optionsSearchQuery = '';
        filterOptionsRules('');
      }
    });
  }
  if (optionsClearSearchBtn) {
    optionsClearSearchBtn.addEventListener('click', () => {
      const input = document.getElementById('optionsSearch');
      if (input) input.value = '';
      optionsSearchQuery = '';
      filterOptionsRules('');
    });
  }

  // Status code presets — rule form
  const ruleFormStatusPresets = document.getElementById('ruleFormStatusPresets');
  if (ruleFormStatusPresets) {
    ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('modifyStatusCode');
        if (input) {
          input.value = btn.dataset.code;
          ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
    document.getElementById('modifyStatusCode')?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(b => {
        b.classList.toggle('active', b.dataset.code === val);
      });
    });
  }

  // Response content type selector
  document.getElementById('responseContentType')?.addEventListener('change', (e) => {
    updateResponseTypeUI(e.target.value);
  });

  document.getElementById('customIsBinary')?.addEventListener('change', () => {
    const isBin = document.getElementById('customIsBinary')?.checked;
    document.getElementById('textBodyPanel').style.display = isBin ? 'none' : 'block';
    document.getElementById('binaryBodyPanel').style.display = isBin ? 'block' : 'none';
  });

  // Binary input tabs
  document.querySelectorAll('.binary-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.binary-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.binary-input-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      const tabId = `binary${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}Tab`;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.style.display = 'block';
    });
  });

  // File upload → base64
  document.getElementById('binaryFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const info = document.getElementById('binaryFileInfo');
    if (info) info.textContent = `Loading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
    try {
      const base64 = await fileToBase64(file);
      const b64El = document.getElementById('binaryBase64Value');
      if (b64El) b64El.value = base64;
      document.querySelector('.binary-tab-btn[data-tab="paste"]')?.click();
      if (info) info.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      const ct = document.getElementById('responseContentType')?.value || file.type;
      updateBinaryPreview(base64, ct);
    } catch (err) {
      if (info) info.textContent = `Error: ${err.message}`;
    }
  });

  // Fetch URL → base64
  document.getElementById('binaryFetchBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('binaryFetchUrl')?.value.trim();
    const status = document.getElementById('binaryFetchStatus');
    if (!url) return;
    if (status) { status.textContent = 'Fetching...'; status.style.color = 'var(--text-secondary)'; }
    try {
      const base64 = await fetchUrlAsBase64(url);
      const b64El = document.getElementById('binaryBase64Value');
      if (b64El) b64El.value = base64;
      document.querySelector('.binary-tab-btn[data-tab="paste"]')?.click();
      if (status) { status.textContent = 'Fetched and encoded successfully'; status.style.color = 'var(--color-success, green)'; }
      const ct = document.getElementById('responseContentType')?.value;
      updateBinaryPreview(base64, ct);
    } catch (err) {
      if (status) { status.textContent = `Error: ${err.message}`; status.style.color = 'var(--color-error, red)'; }
    }
  });

  // URL pattern tester
  document.getElementById('toggleUrlTester')?.addEventListener('click', () => {
    const panel = document.getElementById('urlTesterPanel');
    const btn = document.getElementById('toggleUrlTester');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('open', isHidden);
    const textEl = btn.querySelector('.rf-trigger-text');
    if (textEl) textEl.textContent = isHidden ? 'Hide Tester' : 'Test Pattern';
  });

  function runUrlTest() {
    const testUrl = document.getElementById('testUrlInput')?.value.trim();
    const pattern = document.getElementById('urlPattern')?.value.trim();
    const matchType = document.getElementById('matchType')?.value || 'wildcard';
    const resultEl = document.getElementById('urlTestResult');
    if (!resultEl) return;

    if (!testUrl || !pattern) {
      resultEl.textContent = 'Enter both a URL pattern and a test URL.';
      resultEl.className = 'url-test-result warn';
      resultEl.style.display = 'block';
      return;
    }
    const matched = testUrlPattern(testUrl, pattern, matchType);
    resultEl.textContent = matched ? '✓ Match' : '✗ No match';
    resultEl.className = `url-test-result ${matched ? 'match' : 'no-match'}`;
    resultEl.style.display = 'block';
  }

  document.getElementById('testUrlBtn')?.addEventListener('click', runUrlTest);
  document.getElementById('testUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runUrlTest(); }
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

  // Empty state import button
  document.getElementById('emptyStateImportBtn')?.addEventListener('click', () => {
    document.getElementById('importFile').click();
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

  document.getElementById('matchType')?.addEventListener('change', updateMatchTypeHint);
  updateMatchTypeHint();

  // Prettify JSON button
  document.getElementById('prettifyJsonBtn').addEventListener('click', prettifyJsonInTextarea);

  // Import/Export buttons
  document.getElementById('exportBtn').addEventListener('click', exportRules);
  document.getElementById('copyExportBtn').addEventListener('click', copyExport);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importRules);
  document.getElementById('pasteImportBtn').addEventListener('click', openPasteImportModal);
  document.getElementById('closePasteImportModal').addEventListener('click', closePasteImportModal);
  document.getElementById('cancelPasteImportBtn').addEventListener('click', closePasteImportModal);
  document.getElementById('confirmPasteImportBtn').addEventListener('click', confirmPasteImport);
  document.getElementById('pasteImportModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('pasteImportModal')) closePasteImportModal();
  });
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

  // Method chips — toggle hidden checkboxes
  document.querySelectorAll('.rf-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const method = chip.dataset.method;
      const checkbox = document.querySelector(`input.rf-chip-input[value="${method}"]`);
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      chip.classList.toggle('rf-chip-active', checkbox.checked);
    });
  });


  // Status stepper +/−
  document.getElementById('statusDecBtn')?.addEventListener('click', () => {
    const input = document.getElementById('modifyStatusCode');
    if (!input) return;
    const val = parseInt(input.value) || 200;
    input.value = Math.max(100, val - 1);
    input.dispatchEvent(new Event('input'));
  });
  document.getElementById('statusIncBtn')?.addEventListener('click', () => {
    const input = document.getElementById('modifyStatusCode');
    if (!input) return;
    const val = parseInt(input.value) || 199;
    input.value = Math.min(599, val + 1);
    input.dispatchEvent(new Event('input'));
  });

  // Delay slider readout
  const delaySlider = document.getElementById('ruleDelay');
  const delayReadout = document.getElementById('delayReadout');
  if (delaySlider && delayReadout) {
    const updateDelayReadout = () => {
      const v = parseInt(delaySlider.value) || 0;
      delayReadout.textContent = v === 0 ? 'off' : `${v} ms`;
    };
    delaySlider.addEventListener('input', updateDelayReadout);
    updateDelayReadout();
  }

  // Collapsible description and headers
  [['toggleDescription', 'descriptionBody'], ['toggleHeadersSection', 'headersBody']].forEach(([triggerId, bodyId]) => {
    document.getElementById(triggerId)?.addEventListener('click', () => {
      const body = document.getElementById(bodyId);
      const trigger = document.getElementById(triggerId);
      if (!body || !trigger) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      trigger.classList.toggle('open', !isOpen);
    });
  });
}

function updateModificationOptions() {
  const replaceOptions = document.getElementById('replaceOptions');
  if (replaceOptions) replaceOptions.style.display = 'block';
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
        action: MESSAGES.UPDATE_RULE,
        ruleId: currentEditingRuleId,
        rule: ruleData
      });
      // For updates, fetch all rules to verify
      const rulesResult = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
      savedRule = rulesResult?.rules?.find(r => r.id === currentEditingRuleId);
    } else {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGES.ADD_RULE,
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
  const modifyType = 'replace';
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

  // Get content type
  const contentTypeEl = document.getElementById('responseContentType');
  const contentType = contentTypeEl?.value || 'application/json';
  ruleData.contentType = contentType;
  if (contentType === '__custom__') {
    ruleData.customContentType = document.getElementById('customContentType')?.value.trim() || 'application/octet-stream';
  }

  // Determine if body is binary
  const isCustomBinary = contentType === '__custom__' && document.getElementById('customIsBinary')?.checked;
  const effectiveBinary = (isBinaryContentType(contentType) && contentType !== '__custom__') || isCustomBinary;

  // Get modification data
  const modification = effectiveBinary
    ? { type: 'binary', isBinary: true, value: document.getElementById('binaryBase64Value')?.value.trim() || '' }
    : { type: 'text', value: document.getElementById('replaceValue').value };

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
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });

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

    // Ensure group selectors are up to date before populating
    await loadGroups();

    // showTab resets form and clears currentEditingRuleId, so set it after
    showTab('new-rule');
    currentEditingRuleId = ruleId;
    populateForm(rule);

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

  // Set content type
  const ruleContentType = rule.contentType || 'application/json';
  setElementValue('responseContentType', ruleContentType);
  if (ruleContentType === '__custom__') {
    setElementValue('customContentType', rule.customContentType || '');
  }
  updateResponseTypeUI(ruleContentType);

  // Populate modification fields
  if (rule.modification) {
    if (rule.modification.isBinary) {
      setElementValue('binaryBase64Value', rule.modification.value || '');
      if (rule.modification.value) {
        updateBinaryPreview(rule.modification.value, ruleContentType === '__custom__' ? rule.customContentType : ruleContentType);
      }
      if (ruleContentType === '__custom__') {
        const cbEl = document.getElementById('customIsBinary');
        if (cbEl) cbEl.checked = true;
      }
    } else {
      setElementValue('replaceValue', rule.modification.value);
    }
  }

  // Populate status code
  setElementValue('modifyStatusCode', rule.modifyStatusCode);
  const scVal = rule.modifyStatusCode != null ? String(rule.modifyStatusCode) : '';
  document.getElementById('ruleFormStatusPresets')?.querySelectorAll('.status-preset').forEach(b => {
    b.classList.toggle('active', b.dataset.code === scVal);
  });

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

  // Sync rf-v2 controls after populating
  document.querySelectorAll('.rf-chip').forEach(chip => {
    const checkbox = document.querySelector(`input.rf-chip-input[value="${chip.dataset.method}"]`);
    chip.classList.toggle('rf-chip-active', !!checkbox?.checked);
  });
  const dSlider = document.getElementById('ruleDelay');
  const dReadout = document.getElementById('delayReadout');
  if (dSlider && dReadout) {
    const v = parseInt(dSlider.value) || 0;
    dReadout.textContent = v === 0 ? 'off' : `${v} ms`;
  }
  // Auto-expand description if it has a value
  const descVal = document.getElementById('ruleDescription')?.value;
  if (descVal) {
    const descBody = document.getElementById('descriptionBody');
    const descTrigger = document.getElementById('toggleDescription');
    if (descBody) descBody.style.display = 'block';
    if (descTrigger) descTrigger.classList.add('open');
  }
  // Auto-expand headers section if headers were loaded
  setTimeout(() => {
    const headerRows = document.querySelectorAll('#headerModifications .header-mod-row').length;
    if (headerRows > 0) {
      const headersBody = document.getElementById('headersBody');
      const headersTrigger = document.getElementById('toggleHeadersSection');
      if (headersBody) headersBody.style.display = 'block';
      if (headersTrigger) headersTrigger.classList.add('open');
      const countEl = document.getElementById('headerCount');
      if (countEl) { countEl.textContent = headerRows; countEl.classList.add('visible'); }
    }
    updateMatchTypeHint?.();
  }, 0);
}

function resetForm() {
  document.getElementById('ruleForm').reset();
  document.getElementById('ruleId').value = '';
  document.getElementById('formTitle').textContent = 'Create New Rule';
  document.getElementById('ruleEnabled').checked = true;
  document.querySelectorAll('input[name="methods"]')[0].checked = true; // Check GET by default

  // Reset delay
  document.getElementById('ruleDelay').value = '';

  // Reset URL tester panel
  const urlTesterPanel = document.getElementById('urlTesterPanel');
  if (urlTesterPanel) urlTesterPanel.style.display = 'none';
  const urlTestResult = document.getElementById('urlTestResult');
  if (urlTestResult) { urlTestResult.style.display = 'none'; urlTestResult.textContent = ''; }
  const testUrlInput = document.getElementById('testUrlInput');
  if (testUrlInput) testUrlInput.value = '';
  const toggleUrlTesterBtn = document.getElementById('toggleUrlTester');
  if (toggleUrlTesterBtn) {
    toggleUrlTesterBtn.classList.remove('open');
    const textEl = toggleUrlTesterBtn.querySelector('.rf-trigger-text');
    if (textEl) textEl.textContent = 'Test Pattern';
  }


  // Reset content type
  const ctEl = document.getElementById('responseContentType');
  if (ctEl) ctEl.value = 'application/json';
  const customRow = document.getElementById('customContentTypeRow');
  if (customRow) customRow.style.display = 'none';
  const customCtEl = document.getElementById('customContentType');
  if (customCtEl) customCtEl.value = '';
  const binaryBase64El = document.getElementById('binaryBase64Value');
  if (binaryBase64El) binaryBase64El.value = '';
  const binaryPreviewEl = document.getElementById('binaryPreview');
  if (binaryPreviewEl) binaryPreviewEl.style.display = 'none';
  const customIsBinaryEl = document.getElementById('customIsBinary');
  if (customIsBinaryEl) customIsBinaryEl.checked = false;
  updateResponseTypeUI('application/json');

  document.getElementById('modifyStatusCode').value = '';
  document.getElementById('ruleFormStatusPresets')?.querySelectorAll('.status-preset').forEach(b => b.classList.remove('active'));
  clearHeaderModifications();
  currentEditingRuleId = null;

  // Sync rf-v2 controls
  document.querySelectorAll('.rf-chip').forEach(chip => {
    chip.classList.toggle('rf-chip-active', chip.dataset.method === 'GET');
  });
  const dReadout = document.getElementById('delayReadout');
  if (dReadout) dReadout.textContent = 'off';
  const dSlider = document.getElementById('ruleDelay');
  if (dSlider) dSlider.value = '0';
  ['descriptionBody', 'headersBody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('toggleDescription')?.classList.remove('open');
  document.getElementById('toggleHeadersSection')?.classList.remove('open');
  const countEl = document.getElementById('headerCount');
  if (countEl) { countEl.textContent = ''; countEl.classList.remove('visible'); }
  updateMatchTypeHint?.();
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
      showTab('new-rule');
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
        showTab('rules');
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
        showTab(tabMap[e.key]);
      }
    }
  });
}

async function toggleRule(ruleId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      rule.enabled = !rule.enabled;
      await chrome.runtime.sendMessage({
        action: MESSAGES.UPDATE_RULE,
        ruleId: ruleId,
        rule: rule
      });

      await loadRules();
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error);
    showToast('Failed to toggle rule', 'error');
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
      action: MESSAGES.DELETE_RULE,
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
      action: MESSAGES.ADD_RULE,
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
    const ruleToDuplicate = (window.currentRules || []).find(r => r.id === ruleId);

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
      action: MESSAGES.ADD_RULE,
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
    const rulesResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const groupsResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    const rules = rulesResponse.rules || [];
    const groups = groupsResponse.groups || [];

    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      groups: groups,
      rules: rules
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-interceptor-rules-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${groups.length} group(s) and ${rules.length} rule(s)`, 'success');
  } catch (error) {
    console.error('Failed to export rules:', error);
    showToast('Failed to export rules', 'error');
  }
}

async function copyExport() {
  try {
    const rulesResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const groupsResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      groups: groupsResponse.groups || [],
      rules: rulesResponse.rules || []
    };
    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    showToast(`Copied ${exportData.groups.length} group(s) and ${exportData.rules.length} rule(s) to clipboard`, 'success');
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    showToast('Failed to copy to clipboard', 'error');
  }
}

function openPasteImportModal() {
  document.getElementById('pasteImportText').value = '';
  document.getElementById('pasteImportModal').style.display = 'flex';
}

function closePasteImportModal() {
  document.getElementById('pasteImportModal').style.display = 'none';
}

async function confirmPasteImport() {
  const text = document.getElementById('pasteImportText').value.trim();
  if (!text) {
    showToast('Please paste JSON content first', 'error');
    return;
  }
  try {
    const data = JSON.parse(text);
    if ((!data.rules || !Array.isArray(data.rules)) && (!data.groups || !Array.isArray(data.groups))) {
      showToast('Invalid format. JSON must contain rules or groups.', 'error');
      return;
    }
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.IMPORT_DATA, data });
    if (response.success) {
      closePasteImportModal();
      await loadGroups();
      await loadRules();
      const groupCount = response.groupsImported || 0;
      const ruleCount = response.rulesImported || 0;
      showToast(`Successfully imported ${groupCount} group(s) and ${ruleCount} rule(s)`, 'success');
    } else {
      showToast(response.error || 'Failed to import data', 'error');
    }
  } catch (error) {
    showToast('Invalid JSON: ' + error.message, 'error');
  }
}

async function importRules(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate file has either rules or groups
    if ((!data.rules || !Array.isArray(data.rules)) && (!data.groups || !Array.isArray(data.groups))) {
      showToast('Invalid file format. File must contain rules or groups.', 'error');
      return;
    }

    // Use importData action to properly handle groups and rules together
    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.IMPORT_DATA,
      data: data
    });

    if (response.success) {
      await loadGroups();
      await loadRules();
      const groupCount = response.groupsImported || 0;
      const ruleCount = response.rulesImported || 0;
      showToast(`Successfully imported ${groupCount} group(s) and ${ruleCount} rule(s)`, 'success');
    } else {
      showToast(response.error || 'Failed to import data', 'error');
    }
    e.target.value = ''; // Reset file input
  } catch (error) {
    console.error('Failed to import rules:', error);
    showToast('Failed to import rules: ' + error.message, 'error');
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
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const rules = response.rules || [];

    for (const rule of rules) {
      await chrome.runtime.sendMessage({
        action: MESSAGES.DELETE_RULE,
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
    updateHeaderCountBadge();
  });

  updateHeaderCountBadge();
}

function updateHeaderCountBadge() {
  const count = document.querySelectorAll('#headerModifications .header-mod-row').length;
  const countEl = document.getElementById('headerCount');
  if (!countEl) return;
  countEl.textContent = count > 0 ? count : '';
  countEl.classList.toggle('visible', count > 0);
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
  updateHeaderCountBadge();
}

// Groups Management
let currentGroups = [];

async function loadGroups() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
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
      action: MESSAGES.TOGGLE_GROUP,
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
      action: MESSAGES.DELETE_GROUP,
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
        action: MESSAGES.UPDATE_GROUP,
        groupId: groupId,
        group: groupData
      });
    } else {
      // Add new group
      await chrome.runtime.sendMessage({
        action: MESSAGES.ADD_GROUP,
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

// ======================================
// Fullscreen JSON Editor Modal
// ======================================

let jsonEditorSourceTextarea = null;

function openJsonEditorModal(sourceTextareaId) {
  const source = document.getElementById(sourceTextareaId);
  if (!source) return;

  jsonEditorSourceTextarea = source;
  const modal = document.getElementById('jsonEditorModal');
  const textarea = document.getElementById('jsonEditorTextarea');

  textarea.value = source.value;
  modal.style.display = 'flex';
  textarea.focus();

  updateJsonEditorLineNumbers();
  updateJsonEditorCursorPosition();
  validateJsonEditorContent();
}

function closeJsonEditorModal(apply) {
  clearTimeout(jsonValidateTimer);
  const modal = document.getElementById('jsonEditorModal');
  const textarea = document.getElementById('jsonEditorTextarea');

  if (apply && jsonEditorSourceTextarea) {
    jsonEditorSourceTextarea.value = textarea.value;
    jsonEditorSourceTextarea.dispatchEvent(new Event('input'));
  }

  modal.style.display = 'none';
  jsonEditorSourceTextarea = null;
}

function updateJsonEditorLineNumbers() {
  const textarea = document.getElementById('jsonEditorTextarea');
  const lineNumbers = document.getElementById('jsonEditorLineNumbers');
  const lines = textarea.value.split('\n').length;

  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) =>
    `<div class="line-number">${i + 1}</div>`
  ).join('');
}

function updateJsonEditorCursorPosition() {
  const textarea = document.getElementById('jsonEditorTextarea');
  const info = document.getElementById('jsonEditorInfo');
  const text = textarea.value.substring(0, textarea.selectionStart);
  const line = text.split('\n').length;
  const col = text.split('\n').pop().length + 1;
  info.textContent = `Line ${line}, Col ${col}`;
}

let jsonValidateTimer = null;
function validateJsonEditorContent() {
  clearTimeout(jsonValidateTimer);
  jsonValidateTimer = setTimeout(() => {
    const textarea = document.getElementById('jsonEditorTextarea');
    const status = document.getElementById('jsonEditorStatus');
    const content = textarea.value.trim();
    const ct = document.getElementById('responseContentType')?.value || 'application/json';

    if (!content) {
      status.textContent = '';
      status.className = 'json-editor-status';
      return;
    }

    if (ct === 'application/json') {
      try {
        JSON.parse(content);
        status.textContent = 'Valid JSON';
        status.className = 'json-editor-status valid';
      } catch (e) {
        status.textContent = 'Invalid JSON';
        status.className = 'json-editor-status invalid';
      }
    } else if (ct === 'application/xml' || ct === 'text/xml') {
      const doc = new DOMParser().parseFromString(content, 'application/xml');
      const hasError = doc.querySelector('parsererror');
      status.textContent = hasError ? 'Invalid XML' : 'Valid XML';
      status.className = `json-editor-status ${hasError ? 'invalid' : 'valid'}`;
    } else {
      status.textContent = `${content.length} chars`;
      status.className = 'json-editor-status';
    }
  }, 300);
}

function setupJsonEditorListeners() {
  // Expand editor button
  document.getElementById('expandJsonEditorBtn')?.addEventListener('click', () => {
    openJsonEditorModal('replaceValue');
  });

  // Modal buttons
  document.getElementById('jsonEditorApply')?.addEventListener('click', () => closeJsonEditorModal(true));
  document.getElementById('jsonEditorCancel')?.addEventListener('click', () => closeJsonEditorModal(false));
  document.getElementById('jsonEditorClose')?.addEventListener('click', () => closeJsonEditorModal(false));

  const jsonEditorTextarea = document.getElementById('jsonEditorTextarea');
  if (jsonEditorTextarea) {
    jsonEditorTextarea.addEventListener('input', () => {
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    });

    // Sync scroll between line numbers and textarea
    jsonEditorTextarea.addEventListener('scroll', () => {
      const lineNumbers = document.getElementById('jsonEditorLineNumbers');
      lineNumbers.scrollTop = jsonEditorTextarea.scrollTop;
    });

    jsonEditorTextarea.addEventListener('click', updateJsonEditorCursorPosition);
    jsonEditorTextarea.addEventListener('keyup', updateJsonEditorCursorPosition);

    // Tab key inserts 2 spaces instead of changing focus
    jsonEditorTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = jsonEditorTextarea.selectionStart;
        const end = jsonEditorTextarea.selectionEnd;
        jsonEditorTextarea.value = jsonEditorTextarea.value.substring(0, start) + '  ' + jsonEditorTextarea.value.substring(end);
        jsonEditorTextarea.selectionStart = jsonEditorTextarea.selectionEnd = start + 2;
        updateJsonEditorLineNumbers();
        validateJsonEditorContent();
      }
      // Escape to close
      if (e.key === 'Escape') {
        closeJsonEditorModal(false);
      }
    });
  }

  // Prettify in modal
  document.getElementById('jsonEditorPrettify')?.addEventListener('click', () => {
    const ta = document.getElementById('jsonEditorTextarea');
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });

  // Minify in modal
  document.getElementById('jsonEditorMinify')?.addEventListener('click', () => {
    const ta = document.getElementById('jsonEditorTextarea');
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value));
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });

  // Close modal on backdrop click
  document.getElementById('jsonEditorModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'jsonEditorModal') {
      closeJsonEditorModal(false);
    }
  });
}

// Make showTab available globally for help section
window.showTab = showTab;
