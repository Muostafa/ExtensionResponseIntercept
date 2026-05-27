import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';
import { groupsState } from './state.js';
import { showToast } from './toast.js';
import { loadRules } from './rules-view.js';

export async function loadGroups() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    groupsState.list = response.groups || [];
    updateGroupSelectors();
  } catch (error) {
    debug.error('Failed to load groups:', error);
  }
}

export function getRuleCountForGroup(groupId) {
  if (!document.getElementById('rulesList')) return 0;
  if (window.currentRules) {
    return window.currentRules.filter(r => r.groupId === groupId).length;
  }
  return 0;
}

export function getEnabledRuleCountForGroup(groupId) {
  if (window.currentRules) {
    return window.currentRules.filter(r => r.groupId === groupId && r.enabled).length;
  }
  return 0;
}

export async function toggleGroup(groupId) {
  try {
    await chrome.runtime.sendMessage({ action: MESSAGES.TOGGLE_GROUP, groupId });
    await loadGroups();
    await loadRules();
  } catch (error) {
    debug.error('Failed to toggle group:', error);
    showToast('Failed to toggle group', 'error');
  }
}

export function editGroup(groupId) {
  const group = groupsState.list.find(g => g.id === groupId);
  if (!group) return;

  document.getElementById('editGroupId').value = group.id;
  document.getElementById('groupName').value = group.name;
  document.getElementById('groupDescription').value = group.description || '';
  document.getElementById('groupColor').value = group.color || '#4CAF50';
  document.getElementById('groupEnabled').checked = group.enabled;

  document.getElementById('groupModalTitle').textContent = 'Edit Group';
  document.getElementById('groupModal').style.display = 'flex';
}

export function deleteGroup(groupId) {
  const group = groupsState.list.find(g => g.id === groupId);
  if (!group) return;

  document.getElementById('deleteGroupId').value = groupId;
  document.getElementById('deleteGroupMessage').textContent = `Are you sure you want to delete the group "${group.name}"?`;

  const deleteOptionsEl = document.getElementById('deleteGroupOptions');
  deleteOptionsEl.style.display = 'block';
  document.querySelector('input[name="deleteGroupAction"][value="keep"]').checked = true;

  document.getElementById('deleteGroupModal').style.display = 'flex';
}

export async function confirmDeleteGroup() {
  const groupId = document.getElementById('deleteGroupId').value;
  if (!groupId) return;

  const deleteRulesOption = document.querySelector('input[name="deleteGroupAction"]:checked');
  const deleteRules = deleteRulesOption ? deleteRulesOption.value === 'delete' : false;

  try {
    await chrome.runtime.sendMessage({
      action: MESSAGES.DELETE_GROUP,
      groupId,
      deleteRules
    });

    document.getElementById('deleteGroupModal').style.display = 'none';

    await loadGroups();
    await loadRules();

    showToast(deleteRules ? 'Group and rules deleted successfully' : 'Group deleted successfully', 'success');
  } catch (error) {
    debug.error('Failed to delete group:', error);
    showToast('Failed to delete group', 'error');
  }
}

export function closeDeleteGroupModal() {
  document.getElementById('deleteGroupModal').style.display = 'none';
}

export async function saveGroup(e) {
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
      await chrome.runtime.sendMessage({
        action: MESSAGES.UPDATE_GROUP,
        groupId,
        group: groupData
      });
    } else {
      await chrome.runtime.sendMessage({
        action: MESSAGES.ADD_GROUP,
        group: groupData
      });
    }

    closeGroupModal();
    await loadGroups();
    await loadRules();
    showToast(groupId ? 'Group updated successfully' : 'Group created successfully', 'success');
  } catch (error) {
    debug.error('Failed to save group:', error);
    showToast('Failed to save group', 'error');
  }
}

export function openGroupModal() {
  document.getElementById('editGroupId').value = '';
  document.getElementById('groupName').value = '';
  document.getElementById('groupDescription').value = '';
  document.getElementById('groupColor').value = '#4CAF50';
  document.getElementById('groupEnabled').checked = true;
  document.getElementById('groupModalTitle').textContent = 'Add New Group';
  document.getElementById('groupModal').style.display = 'flex';
}

export function closeGroupModal() {
  document.getElementById('groupModal').style.display = 'none';
}

export function updateGroupSelectors() {
  const ruleGroupSelect = document.getElementById('ruleGroup');
  if (!ruleGroupSelect) return;

  const currentValue = ruleGroupSelect.value;
  ruleGroupSelect.innerHTML = '<option value="">No Group</option>';

  groupsState.list.forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    option.style.borderLeft = `4px solid ${group.color}`;
    ruleGroupSelect.appendChild(option);
  });

  if (currentValue) ruleGroupSelect.value = currentValue;
}
