import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { debug } from '../../shared/debug.js';
import { icon } from '../../shared/icons.js';
import { openOptionsPage } from '../../shared/open-options.js';
import {
  filterRules,
  sortRules,
  partitionRulesByGroup,
  sortGroupsByName,
  validateStatusCode,
} from '../../shared/rules-model.js';
import { fetchRules, toggleRuleEnabled, updateRule } from '../../shared/rule-actions.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { refreshHintBanner } from './hint-banner.js';

function renderRulesSkeleton(n = 3) {
  const container = document.getElementById('rulesList');
  if (!container || container.dataset.loaded === '1') return;
  container.innerHTML = Array.from({ length: n }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton skeleton-line long"></div>
      <div class="skeleton skeleton-line short"></div>
    </div>
  `).join('');
}

export async function loadRules() {
  renderRulesSkeleton();
  try {
    const rules = await fetchRules();
    window.currentRules = rules;
    const container = document.getElementById('rulesList');
    if (container) container.dataset.loaded = '1';
    await displayRules(rules);
  } catch (error) {
    debug.error('Failed to load rules:', error);
  }
}

// The popup filters before rendering (the list is short and re-rendered wholesale);
// the options page renders everything and hides non-matches. Same predicate either
// way — see shared/rules-model.js.
function sortAndFilterRules(rules) {
  return sortRules(filterRules(rules, state.searchQuery), {
    sortBy: document.getElementById('popupSortBy')?.value || 'modified',
    sortOrder: document.getElementById('popupSortOrder')?.value || 'desc',
    enabledFirst: document.getElementById('popupEnabledRulesFirst')?.checked ?? true,
  });
}

export async function displayRules(rules) {
  const rulesList = document.getElementById('rulesList');
  const rulesCount = document.getElementById('rulesCount');
  const enabledRulesText = document.getElementById('enabledRulesText');
  const emptyState = document.getElementById('emptyState');
  const noSearchResults = document.getElementById('noSearchResults');

  let groups = [];
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    groups = response?.groups || [];
  } catch (e) { /* render without group context */ }
  window.currentGroups = groups;

  const processedRules = sortAndFilterRules(rules);

  rulesCount.textContent = rules.length;
  const enabledCount = rules.filter(r => r.enabled).length;
  if (enabledRulesText) {
    enabledRulesText.textContent = `${enabledCount} enabled`;
  }

  // Enabling/disabling a rule or group can flip the "nothing will be mocked"
  // hint, so re-resolve it whenever the list re-renders.
  await refreshHintBanner();

  if (rules.length === 0) {
    rulesList.innerHTML = '';
    emptyState.style.display = 'block';
    noSearchResults.style.display = 'none';
    return;
  }

  if (processedRules.length === 0 && state.searchQuery.trim()) {
    rulesList.innerHTML = '';
    emptyState.style.display = 'none';
    noSearchResults.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  noSearchResults.style.display = 'none';

  const { byGroup, ungrouped: ungroupedRules } = partitionRulesByGroup(processedRules);
  const sortedGroups = sortGroupsByName(groups);

  let html = '';
  sortedGroups.forEach(group => {
    const groupRules = byGroup.get(group.id) || [];
    if (groupRules.length === 0 && state.searchQuery.trim()) return;

    const isCollapsed = state.collapsedGroups.has(group.id);
    const enabledInGroup = groupRules.filter(r => r.enabled).length;

    html += `
      <div class="group-container ${group.enabled ? '' : 'group-disabled'}" data-group-id="${group.id}">
        <div class="group-header" data-group-id="${group.id}">
          <div class="group-header-left">
            <button class="group-collapse-btn ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
              ${icon('chevronDown', { size: 12 })}
            </button>
            <div class="group-color-bar" style="background: ${group.color}"></div>
            <div class="group-title-info">
              <span class="group-title">${escapeHtml(group.name)}</span>
              <span class="group-rule-count">${groupRules.length} rule${groupRules.length !== 1 ? 's' : ''}${groupRules.length > 0 ? ` (${enabledInGroup} active)` : ''}</span>
            </div>
          </div>
          <div class="group-header-actions">
            <div class="toggle-switch group-toggle">
              <input type="checkbox" id="group-toggle-${group.id}" class="toggle-input group-toggle-input" data-group-id="${group.id}" ${group.enabled ? 'checked' : ''}>
              <label for="group-toggle-${group.id}" class="toggle-label"></label>
            </div>
          </div>
        </div>
        <div class="group-rules ${isCollapsed ? 'collapsed' : ''}" data-group-rules="${group.id}">
          ${groupRules.length === 0 ? `
            <div class="group-empty-state">
              <span>No rules in this group</span>
            </div>
          ` : `
            <div class="rules-table">
              <div class="rules-table-header">
                <div class="th th-name">Name</div>
                <div class="th th-method">Method</div>
                <div class="th th-status">Status</div>
              </div>
              ${groupRules.map(rule => renderRuleItem(rule, group)).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  });

  if (ungroupedRules.length > 0 || !state.searchQuery.trim()) {
    const isCollapsed = state.collapsedGroups.has('ungrouped');
    html += `
      <div class="group-container ungrouped-container" data-group-id="ungrouped">
        <div class="group-header ungrouped-header" data-group-id="ungrouped">
          <div class="group-header-left">
            <button class="group-collapse-btn ${isCollapsed ? 'collapsed' : ''}" data-group-id="ungrouped">
              ${icon('chevronDown', { size: 12 })}
            </button>
            <div class="group-color-bar ungrouped-bar"></div>
            <div class="group-title-info">
              <span class="group-title">Ungrouped</span>
              <span class="group-rule-count">${ungroupedRules.length} rule${ungroupedRules.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <div class="group-rules ${isCollapsed ? 'collapsed' : ''}" data-group-rules="ungrouped">
          ${ungroupedRules.length === 0 ? `
            <div class="group-empty-state">
              <span>No ungrouped rules</span>
            </div>
          ` : `
            <div class="rules-table">
              <div class="rules-table-header">
                <div class="th th-name">Name</div>
                <div class="th th-method">Method</div>
                <div class="th th-status">Status</div>
              </div>
              ${ungroupedRules.map(rule => renderRuleItem(rule, null)).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }

  rulesList.innerHTML = html;

  setupRuleEventListeners();
  setupGroupEventListeners();

  for (const ruleId of state.activeEditRuleIds) {
    if (rules.find(r => r.id === ruleId)) {
      await toggleEditMode(ruleId, true);
    } else {
      state.activeEditRuleIds.delete(ruleId);
    }
  }
}

function renderRuleItem(rule, group) {
  const isGroupDisabled = group && !group.enabled;

  let actionBadges = `<span class="rule-tag action-mock">Mock</span>`;
  if (rule.delay && rule.delay > 0) {
    actionBadges += `<span class="rule-tag delay">${rule.delay}ms</span>`;
  }

  const methods = (rule.methods || ['GET'])
    .map(m => `<span class="rule-tag method" data-method="${escapeHtml(m)}">${escapeHtml(m)}</span>`)
    .join('');

  const offChip = rule.enabled ? '' : '<span class="rule-off-chip">Off</span>';

  return `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'} ${isGroupDisabled ? 'group-disabled-rule' : ''}" data-rule-id="${rule.id}">
      <div class="rule-row">
        <div class="rule-cell rule-cell-name">
          <div class="rule-name" title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}${offChip}</div>
          <div class="rule-pattern" title="${escapeHtml(rule.urlPattern)}">${escapeHtml(rule.urlPattern)}</div>
          <div class="rule-meta-inline">${actionBadges}</div>
        </div>
        <div class="rule-cell rule-cell-method">${methods}</div>
        <div class="rule-cell rule-cell-actions">
          <button class="btn-icon edit-rule-btn" data-rule-id="${rule.id}" title="Quick edit — status code and response body">
            ${icon('edit', { size: 14 })}
          </button>
          <div class="toggle-switch rule-toggle">
            <input type="checkbox" id="rule-${rule.id}" class="toggle-input rule-toggle-input" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''} ${isGroupDisabled ? 'disabled' : ''}>
            <label for="rule-${rule.id}" class="toggle-label ${isGroupDisabled ? 'toggle-disabled' : ''}"></label>
          </div>
        </div>
      </div>
      <div class="rule-edit-container" id="edit-${rule.id}" style="display: none;">
        <div class="edit-scope-note">
          Quick edit — status code and body only.
          <button class="edit-full-link full-editor-btn" data-rule-id="${rule.id}">Full editor</button>
          for pattern, methods, headers, delay, group.
        </div>
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
  `;
}

function setupRuleEventListeners() {
  document.querySelectorAll('.rule-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      await toggleRule(e.target.dataset.ruleId);
    });
  });

  document.querySelectorAll('.edit-rule-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleEditMode(e.currentTarget.dataset.ruleId, true);
    });
  });

  document.querySelectorAll('.btn-prettify').forEach(btn => {
    btn.addEventListener('click', (e) => {
      prettifyJson(e.target.dataset.ruleId);
    });
  });

  document.querySelectorAll('.btn-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      await saveJsonEdit(e.target.dataset.ruleId);
    });
  });

  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      toggleEditMode(e.target.dataset.ruleId, false);
    });
  });

  // Escalate the same rule to the options form. Unsaved quick-edit text is
  // deliberately not carried over — the form loads the rule from storage, and
  // silently importing half-typed JSON into a different editor is worse than
  // starting from what is actually saved.
  document.querySelectorAll('.full-editor-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openOptionsPage('new-rule', { ruleId: e.currentTarget.dataset.ruleId });
    });
  });
}

function setupGroupEventListeners() {
  document.querySelectorAll('.group-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGroupCollapse(e.currentTarget.dataset.groupId);
    });
  });

  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.group-toggle')) return;
      toggleGroupCollapse(header.dataset.groupId);
    });
  });

  document.querySelectorAll('.group-toggle-input').forEach(toggle => {
    toggle.addEventListener('click', (e) => e.stopPropagation());
    toggle.addEventListener('change', async (e) => {
      await toggleGroup(e.target.dataset.groupId);
    });
  });
}

function toggleGroupCollapse(groupId) {
  const btn = document.querySelector(`.group-collapse-btn[data-group-id="${groupId}"]`);
  const rulesContainer = document.querySelector(`[data-group-rules="${groupId}"]`);

  if (state.collapsedGroups.has(groupId)) {
    state.collapsedGroups.delete(groupId);
    btn?.classList.remove('collapsed');
    rulesContainer?.classList.remove('collapsed');
  } else {
    state.collapsedGroups.add(groupId);
    btn?.classList.add('collapsed');
    rulesContainer?.classList.add('collapsed');
  }
}

async function toggleGroup(groupId) {
  try {
    await chrome.runtime.sendMessage({ action: MESSAGES.TOGGLE_GROUP, groupId });
    showToast('Group toggled', 'success');
    await loadRules();
  } catch (error) {
    debug.error('Failed to toggle group:', error);
    showToast('Failed to toggle group', 'error');
  }
}

async function toggleRule(ruleId) {
  try {
    const result = await toggleRuleEnabled(ruleId);
    if (!result) return;
    showToast(result.enabled ? 'Rule enabled' : 'Rule disabled', 'success');
    await loadRules();
  } catch (error) {
    debug.error('Failed to toggle rule:', error);
    showToast('Failed to toggle rule', 'error');
  }
}

async function toggleEditMode(ruleId, show) {
  if (!ruleId) {
    debug.error('toggleEditMode: ruleId is required');
    return;
  }

  const editContainer = document.getElementById(`edit-${ruleId}`);
  const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);

  if (!editContainer) {
    debug.warn(`toggleEditMode: Edit container not found for rule ${ruleId}`);
    return;
  }

  if (show) {
    state.activeEditRuleIds.add(ruleId);

    try {
      const rule = (await fetchRules()).find(r => r && r.id === ruleId);
      if (!rule) {
        debug.warn(`Rule not found: ${ruleId}`);
        return;
      }

      const statusInput = document.getElementById(`status-${ruleId}`);
      if (statusInput) statusInput.value = rule.modifyStatusCode || '';

      const textarea = document.getElementById(`json-${ruleId}`);
      if (textarea) {
        if (rule.modifyType === 'replace' && rule.modification && rule.modification.value) {
          textarea.value = rule.modification.value;
        } else {
          textarea.value = '';
        }
      }
    } catch (error) {
      debug.error('Failed to load rule data:', error);
      return;
    }

    editContainer.style.display = 'block';
    if (ruleItem) ruleItem.classList.add('editing');

    const errorDiv = document.getElementById(`error-${ruleId}`);
    if (errorDiv) errorDiv.style.display = 'none';
  } else {
    state.activeEditRuleIds.delete(ruleId);
    editContainer.style.display = 'none';
    if (ruleItem) ruleItem.classList.remove('editing');
  }
}

function prettifyJson(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  if (!textarea) return;

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

async function saveJsonEdit(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const statusInput = document.getElementById(`status-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  const rules = await fetchRules();
  const rule = rules.find(r => r.id === ruleId);
  const ruleContentType = rule?.contentType || 'application/json';

  if (textarea && textarea.value.trim() && ruleContentType === 'application/json') {
    try {
      JSON.parse(textarea.value);
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
      return;
    }
  }

  const status = validateStatusCode(statusInput?.value);
  if (!status.valid) {
    errorDiv.textContent = status.message;
    errorDiv.style.display = 'block';
    return;
  }

  try {
    if (!rule) return;

    if (textarea) {
      if (textarea.value.trim()) {
        rule.modifyType = 'replace';
        rule.modification = { type: 'text', value: textarea.value };
      } else if (rule.modifyType === 'replace') {
        rule.modification = { type: 'json', value: '' };
      }
    }

    // status.value is null for a blank field — see validateStatusCode on why
    // that matters. Only touch the key if the field is actually on screen.
    if (statusInput) rule.modifyStatusCode = status.value;

    await updateRule(ruleId, rule);

    state.activeEditRuleIds.delete(ruleId);

    const editContainer = document.getElementById(`edit-${ruleId}`);
    const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);
    if (editContainer) editContainer.style.display = 'none';
    if (ruleItem) ruleItem.classList.remove('editing');

    // A non-standard code is allowed — the interceptor serves whatever you set —
    // so this reports rather than blocks, and rides along with the confirmation
    // instead of replacing it. Before the validator was shared, this warning was
    // computed here and silently thrown away.
    showToast(
      status.warning ? `Saved — ${status.warning}` : 'Rule saved successfully',
      status.warning ? 'warning' : 'success'
    );
  } catch (error) {
    debug.error('Failed to save rule edit:', error);
    errorDiv.textContent = `Failed to save: ${error.message}`;
    errorDiv.style.display = 'block';
    showToast('Failed to save rule', 'error');
  }
}
