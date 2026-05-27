import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';
import { confirmModal } from '../../shared/confirm-modal.js';
import { showToast } from './toast.js';
import { loadGroups } from './groups.js';
import { loadRules } from './rules-view.js';

export async function exportRules() {
  try {
    const rulesResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    const groupsResponse = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    const rules = rulesResponse.rules || [];
    const groups = groupsResponse.groups || [];

    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      groups,
      rules
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
    debug.error('Failed to export rules:', error);
    showToast('Failed to export rules', 'error');
  }
}

export async function copyExport() {
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
    debug.error('Failed to copy to clipboard:', error);
    showToast('Failed to copy to clipboard', 'error');
  }
}

export function openPasteImportModal() {
  document.getElementById('pasteImportText').value = '';
  document.getElementById('pasteImportModal').style.display = 'flex';
}

export function closePasteImportModal() {
  document.getElementById('pasteImportModal').style.display = 'none';
}

export async function confirmPasteImport() {
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

export async function importRules(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if ((!data.rules || !Array.isArray(data.rules)) && (!data.groups || !Array.isArray(data.groups))) {
      showToast('Invalid file format. File must contain rules or groups.', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.IMPORT_DATA,
      data
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
    e.target.value = '';
  } catch (error) {
    debug.error('Failed to import rules:', error);
    showToast('Failed to import rules: ' + error.message, 'error');
  }
}

export async function clearAllRules() {
  const ok = await confirmModal({
    title: 'Delete all rules?',
    message: 'This permanently deletes every rule. This cannot be undone.',
    confirmLabel: 'Delete All Rules',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!ok) return;

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
    debug.error('Failed to clear rules:', error);
    showToast('Failed to clear rules', 'error');
  }
}
