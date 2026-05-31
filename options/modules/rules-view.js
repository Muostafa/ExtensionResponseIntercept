import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { debug } from '../../shared/debug.js';
import { DRAG_AUTOEXPAND_MS, STATUS_CODE_MIN, STATUS_CODE_MAX } from '../../shared/constants.js';
import { icon } from '../../shared/icons.js';
import { state, groupsState } from './state.js';
import { showToast } from './toast.js';
import { toggleGroup, editGroup, deleteGroup, loadGroups } from './groups.js';
import { editRule } from './rule-form.js';
import { showTab } from './navigation.js';

// Per-rule activity stats fetched from the service worker (in-memory there,
// reset when it unloads). Keyed by ruleId → { count, lastFired }.
let ruleStats = {};

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activityChipHtml(stat) {
  if (!stat || !stat.count) return '';
  const plural = stat.count === 1 ? '' : 's';
  const tip = `Fired ${stat.count} time${plural} since the extension started · last ${formatTimeAgo(stat.lastFired)}`;
  return `<span class="rule-activity-chip" title="${escapeHtml(tip)}">
    ${icon('clock', { size: 11 })}
    <span class="rule-activity-count">${stat.count}</span>
    <span class="rule-activity-time">· ${escapeHtml(formatTimeAgo(stat.lastFired))}</span>
  </span>`;
}

/**
 * Record a live rule fire (from a RULE_TRIGGERED broadcast) and update just the
 * affected card's chip in place — no full re-render, so scroll/drag are intact.
 */
export function recordRuleFired(ruleId, timestamp) {
  if (!ruleId) return;
  const prev = ruleStats[ruleId] || { count: 0, lastFired: 0 };
  ruleStats[ruleId] = { count: prev.count + 1, lastFired: timestamp || Date.now() };
  const slot = document.querySelector(`.rule-activity-slot[data-activity-for="${CSS.escape(ruleId)}"]`);
  if (slot) slot.innerHTML = activityChipHtml(ruleStats[ruleId]);
}

function renderSkeletonRows(n = 3) {
  const container = document.getElementById('groupedRulesList');
  if (!container || container.dataset.loaded === '1') return;
  container.innerHTML = `
    <div class="options-rules-table">
      ${Array.from({ length: n }).map(() => `
        <div class="skeleton-row">
          <div class="skeleton skeleton-line med"></div>
          <div class="skeleton skeleton-line long"></div>
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      `).join('')}
    </div>
  `;
}

export async function loadRules() {
  renderSkeletonRows();
  try {
    const [response, statsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES }),
      chrome.runtime.sendMessage({ action: MESSAGES.GET_RULE_STATS }).catch(() => null),
    ]);
    ruleStats = statsResponse?.stats || {};
    const rules = response.rules || [];
    window.currentRules = rules;
    const container = document.getElementById('groupedRulesList');
    if (container) container.dataset.loaded = '1';
    displayRules(rules);
  } catch (error) {
    debug.error('Failed to load rules:', error);
  }
}

function sortAndFilterRules(rules) {
  const sortBy = document.getElementById('ruleSortBy')?.value || 'created';
  const sortOrder = document.getElementById('ruleSortOrder')?.value || 'desc';
  const enabledRulesFirst = document.getElementById('enabledRulesFirst')?.checked ?? false;

  return [...rules].sort((a, b) => {
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
}

export function displayRules(rules) {
  const groupedRulesList = document.getElementById('groupedRulesList');
  const emptyState = document.getElementById('emptyState');

  const processedRules = sortAndFilterRules(rules);

  const _kpiTotal = document.getElementById('kpi-total');
  const _kpiActive = document.getElementById('kpi-active');
  const _kpiGroups = document.getElementById('kpi-groups');
  const _kpiDisabled = document.getElementById('kpi-disabled');
  if (_kpiTotal) _kpiTotal.textContent = rules.length;
  if (_kpiActive) _kpiActive.textContent = rules.filter(r => r.enabled).length;
  if (_kpiGroups) _kpiGroups.textContent = groupsState.list.length;
  if (_kpiDisabled) _kpiDisabled.textContent = rules.filter(r => !r.enabled).length;

  if (rules.length === 0 && groupsState.list.length === 0) {
    groupedRulesList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  groupedRulesList.style.display = 'block';
  emptyState.style.display = 'none';

  const groupedRules = {};
  const ungroupedRules = [];

  processedRules.forEach(rule => {
    if (rule.groupId) {
      if (!groupedRules[rule.groupId]) groupedRules[rule.groupId] = [];
      groupedRules[rule.groupId].push(rule);
    } else {
      ungroupedRules.push(rule);
    }
  });

  const sortedGroups = [...groupsState.list].sort((a, b) => a.name.localeCompare(b.name));

  let html = '';
  sortedGroups.forEach(group => {
    const groupRules = groupedRules[group.id] || [];
    const isCollapsed = state.collapsedGroups.has(group.id);
    const enabledInGroup = groupRules.filter(r => r.enabled).length;

    html += `
      <div class="options-group-container ${group.enabled ? '' : 'group-disabled'}" data-group-id="${group.id}">
        <div class="options-group-header" data-group-id="${group.id}">
          <div class="options-group-header-left">
            <button class="options-group-collapse-btn ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
              ${icon('chevronDown')}
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

  const isUngroupedCollapsed = state.collapsedGroups.has('ungrouped');
  html += `
    <div class="options-group-container ungrouped-container" data-group-id="ungrouped">
      <div class="options-group-header ungrouped-header" data-group-id="ungrouped">
        <div class="options-group-header-left">
          <button class="options-group-collapse-btn ${isUngroupedCollapsed ? 'collapsed' : ''}" data-group-id="ungrouped">
            ${icon('chevronDown')}
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

  document.querySelectorAll('.options-group-rules').forEach(container => {
    if (!container.classList.contains('collapsed')) {
      container.style.maxHeight = 'none';
    }
  });

  attachRuleEventListeners();
  attachGroupEventListeners();

  if (state.optionsSearchQuery) filterOptionsRules(state.optionsSearchQuery);
}

function renderRuleCard(rule, group) {
  const isGroupDisabled = group && !group.enabled;

  const rowClasses = [
    'rule-card',
    'ort-row',
    rule.enabled ? '' : 'disabled',
    isGroupDisabled ? 'group-disabled-card' : ''
  ].filter(Boolean).join(' ');

  const methodBadges = (rule.methods && rule.methods.length > 0 ? rule.methods : ['*'])
    .map(m => `<span class="rule-badge method" data-method="${escapeHtml(m)}">${escapeHtml(m)}</span>`)
    .join('');

  const offChip = rule.enabled ? '' : '<span class="rule-off-chip">Off</span>';

  return `
    <div class="${rowClasses}" data-rule-id="${rule.id}" draggable="true">
      <div class="ort-td ort-td-name">
        <span class="drag-handle" title="Drag to move between groups">
          ${icon('drag', { size: 14 })}
        </span>
        <div class="ort-name-info">
          <span class="rule-card-title">${escapeHtml(rule.name)}${offChip}</span>
          ${rule.description ? `<span class="rule-card-description">${escapeHtml(rule.description)}</span>` : ''}
          <span class="rule-activity-slot" data-activity-for="${escapeHtml(rule.id)}">${activityChipHtml(ruleStats[rule.id])}</span>
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
  document.querySelectorAll('.options-group-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGroupCollapse(e.currentTarget.dataset.groupId);
    });
  });

  document.querySelectorAll('.options-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.options-group-header-actions')) return;
      if (e.target.closest('.options-group-collapse-btn')) return;
      toggleGroupCollapse(header.dataset.groupId);
    });
  });

  document.querySelectorAll('.group-toggle-input').forEach(toggle => {
    toggle.addEventListener('click', (e) => e.stopPropagation());
    toggle.addEventListener('change', async (e) => {
      await toggleGroup(e.target.dataset.groupId);
    });
  });

  document.querySelectorAll('.edit-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editGroup(e.target.dataset.groupId);
    });
  });

  document.querySelectorAll('.delete-group-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteGroup(e.target.dataset.groupId);
    });
  });

  document.querySelectorAll('.add-rule-to-group-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addRuleToGroup(e.target.dataset.groupId);
    });
  });

  document.querySelectorAll('.options-group-container').forEach(container => {
    container.addEventListener('dragover', handleGroupDragOver);
    container.addEventListener('dragenter', handleGroupDragEnter);
    container.addEventListener('dragleave', handleGroupDragLeave);
    container.addEventListener('drop', handleGroupDrop);
  });
}

export function toggleGroupCollapse(groupId) {
  const btn = document.querySelector(`.options-group-collapse-btn[data-group-id="${groupId}"]`);
  const rulesContainer = document.querySelector(`[data-group-rules="${groupId}"]`);

  if (state.collapsedGroups.has(groupId)) {
    state.collapsedGroups.delete(groupId);
    btn?.classList.remove('collapsed');
    if (rulesContainer) {
      rulesContainer.classList.remove('collapsed');
      rulesContainer.style.maxHeight = rulesContainer.scrollHeight + 'px';
      setTimeout(() => { rulesContainer.style.maxHeight = 'none'; }, 310);
    }
  } else {
    state.collapsedGroups.add(groupId);
    btn?.classList.add('collapsed');
    if (rulesContainer) {
      rulesContainer.style.maxHeight = rulesContainer.scrollHeight + 'px';
      rulesContainer.offsetHeight; // force reflow
      rulesContainer.classList.add('collapsed');
    }
  }
}

export function collapseAllGroups() {
  groupsState.list.forEach(group => state.collapsedGroups.add(group.id));
  state.collapsedGroups.add('ungrouped');
  displayRules(window.currentRules || []);
}

export function expandAllGroups() {
  state.collapsedGroups.clear();
  displayRules(window.currentRules || []);
}

function addRuleToGroup(groupId) {
  state.currentEditingRuleId = null;
  showTab('new-rule');
  document.getElementById('ruleGroup').value = groupId;
}

function attachRuleEventListeners() {
  document.querySelectorAll('.toggle-switch-small input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      await toggleRule(e.target.dataset.ruleId);
    });
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => editRule(e.target.dataset.ruleId));
  });

  document.querySelectorAll('.duplicate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => duplicateRule(e.target.dataset.ruleId));
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteRule(e.target.dataset.ruleId));
  });

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
        if (isNaN(code) || code < STATUS_CODE_MIN || code > STATUS_CODE_MAX) {
          e.target.value = rule.modifyStatusCode || '';
          showToast(`Status code must be ${STATUS_CODE_MIN}–${STATUS_CODE_MAX}`, 'error');
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
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') {
        const rule = (window.currentRules || []).find(r => r.id === e.target.dataset.ruleId);
        e.target.value = rule?.modifyStatusCode || '';
        e.target.blur();
      }
    });
  });

  document.querySelectorAll('.rule-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.ruleId);
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-target-hover').forEach(el => el.classList.remove('drop-target-hover'));
  if (state.dragAutoExpandTimeout) {
    clearTimeout(state.dragAutoExpandTimeout);
    state.dragAutoExpandTimeout = null;
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

  const groupId = container.dataset.groupId;
  if (groupId && state.collapsedGroups.has(groupId)) {
    if (state.dragAutoExpandTimeout) clearTimeout(state.dragAutoExpandTimeout);
    state.dragAutoExpandTimeout = setTimeout(() => {
      toggleGroupCollapse(groupId);
    }, DRAG_AUTOEXPAND_MS);
  }
}

function handleGroupDragLeave(e) {
  const container = e.currentTarget;
  if (!container.contains(e.relatedTarget)) {
    container.classList.remove('drop-target-hover');
    if (state.dragAutoExpandTimeout) {
      clearTimeout(state.dragAutoExpandTimeout);
      state.dragAutoExpandTimeout = null;
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
  const newGroupId = targetGroupId === 'ungrouped' ? null : targetGroupId;

  const rule = (window.currentRules || []).find(r => r.id === ruleId);
  if (!rule) return;
  if ((rule.groupId || null) === newGroupId) return;

  try {
    await chrome.runtime.sendMessage({
      action: MESSAGES.ASSIGN_RULE_TO_GROUP,
      ruleId,
      groupId: newGroupId
    });
    await loadRules();

    setTimeout(() => {
      const movedCard = document.querySelector(`.rule-card[data-rule-id="${ruleId}"]`);
      if (movedCard) {
        movedCard.classList.add('just-moved');
        setTimeout(() => movedCard.classList.remove('just-moved'), 700);
      }
    }, 50);

    const targetName = newGroupId
      ? (groupsState.list.find(g => g.id === newGroupId)?.name || 'group')
      : 'Ungrouped';
    showToast(`Rule moved to ${targetName}`, 'success');
  } catch (error) {
    debug.error('Failed to move rule:', error);
    showToast('Failed to move rule', 'error');
  }
}

export function filterOptionsRules(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('.rule-card').forEach(card => {
    const rule = (window.currentRules || []).find(r => r.id === card.dataset.ruleId);
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

async function toggleRule(ruleId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const rule = (response.rules || []).find(r => r.id === ruleId);

    if (rule) {
      rule.enabled = !rule.enabled;
      await chrome.runtime.sendMessage({
        action: MESSAGES.UPDATE_RULE,
        ruleId,
        rule
      });
      await loadRules();
    }
  } catch (error) {
    debug.error('Failed to toggle rule:', error);
    showToast('Failed to toggle rule', 'error');
  }
}

export async function deleteRule(ruleId) {
  try {
    const ruleToDelete = window.currentRules?.find(r => r.id === ruleId);
    if (!ruleToDelete) {
      showToast('Rule not found', 'error');
      return;
    }

    state.pendingDeletedRule = { ...ruleToDelete };

    await chrome.runtime.sendMessage({
      action: MESSAGES.DELETE_RULE,
      ruleId
    });

    await loadRules();

    showToast('Rule deleted', 'success', {
      label: 'Undo',
      callback: async () => { await undoDeleteRule(); },
      onExpire: () => { state.pendingDeletedRule = null; }
    });
  } catch (error) {
    debug.error('Failed to delete rule:', error);
    showToast('Failed to delete rule', 'error');
    state.pendingDeletedRule = null;
  }
}

async function undoDeleteRule() {
  if (!state.pendingDeletedRule) {
    showToast('Nothing to undo', 'error');
    return;
  }

  try {
    const ruleData = { ...state.pendingDeletedRule };
    delete ruleData.id;
    delete ruleData.createdAt;
    delete ruleData.modifiedAt;

    await chrome.runtime.sendMessage({
      action: MESSAGES.ADD_RULE,
      rule: ruleData
    });

    state.pendingDeletedRule = null;
    await loadRules();
    showToast('Rule restored', 'success');
  } catch (error) {
    debug.error('Failed to restore rule:', error);
    showToast('Failed to restore rule', 'error');
  }
}

async function duplicateRule(ruleId) {
  try {
    const ruleToDuplicate = (window.currentRules || []).find(r => r.id === ruleId);
    if (!ruleToDuplicate) {
      showToast('Rule not found', 'error');
      return;
    }

    const duplicatedRule = {
      ...ruleToDuplicate,
      name: `${ruleToDuplicate.name} (Copy)`,
      enabled: false
    };

    delete duplicatedRule.id;
    delete duplicatedRule.createdAt;
    delete duplicatedRule.modifiedAt;

    await chrome.runtime.sendMessage({
      action: MESSAGES.ADD_RULE,
      rule: duplicatedRule
    });

    await loadRules();
    showToast('Rule duplicated successfully', 'success');
  } catch (error) {
    debug.error('Failed to duplicate rule:', error);
    showToast('Failed to duplicate rule', 'error');
  }
}
