import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { switchView } from './network.js';
import { loadRules } from './rules-view.js';

export function setupCreateRuleModal() {
  const modal = document.getElementById('createRuleModal');
  const closeModalBtn = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelCreateRule');
  const confirmBtn = document.getElementById('confirmCreateRule');
  const overlay = modal?.querySelector('.modal-overlay');

  closeModalBtn?.addEventListener('click', closeCreateRuleModal);
  cancelBtn?.addEventListener('click', closeCreateRuleModal);
  overlay?.addEventListener('click', closeCreateRuleModal);
  confirmBtn?.addEventListener('click', createRuleFromModal);

  document.getElementById('modalContentType')?.addEventListener('change', (e) => {
    const label = document.getElementById('modalBodyLabel');
    const ta = document.getElementById('modalResponseBody');
    const isJson = e.target.value === 'application/json';
    if (label) label.textContent = isJson ? 'Response Body (JSON)' : 'Response Body';
    if (ta) ta.placeholder = isJson ? '{"key": "value"}' : 'Enter response body...';
  });
}

export async function openCreateRuleModal(logEntry) {
  state.selectedLogEntry = logEntry;
  const modal = document.getElementById('createRuleModal');

  try {
    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.GENERATE_RULE_FROM_REQUEST,
      logEntry
    });

    const suggestedRule = response.rule;

    document.getElementById('modalRuleName').value = suggestedRule.name || '';
    document.getElementById('modalUrlPattern').value = suggestedRule.urlPattern || '';
    document.getElementById('modalResponseBody').value = suggestedRule.modification?.value || '{\n  "message": "Intercepted response"\n}';
    document.getElementById('modalStatusCode').value = suggestedRule.modifyStatusCode || '';

    document.querySelectorAll('#modalMethods input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = suggestedRule.methods?.includes(checkbox.value) || false;
    });

    if (modal) modal.style.display = 'flex';
  } catch (error) {
    debug.error('Failed to generate rule suggestion:', error);
    showToast('Failed to generate rule', 'error');
  }
}

function closeCreateRuleModal() {
  const modal = document.getElementById('createRuleModal');
  if (modal) modal.style.display = 'none';
  state.selectedLogEntry = null;
}

async function createRuleFromModal() {
  if (!state.selectedLogEntry) {
    showToast('No request selected', 'error');
    return;
  }

  const name = document.getElementById('modalRuleName').value.trim();
  const urlPattern = document.getElementById('modalUrlPattern').value.trim();
  const responseBody = document.getElementById('modalResponseBody').value.trim();
  const statusCode = document.getElementById('modalStatusCode').value;

  if (!name) { showToast('Rule name is required', 'error'); return; }
  if (!urlPattern) { showToast('URL pattern is required', 'error'); return; }

  const contentType = document.getElementById('modalContentType')?.value || 'application/json';

  if (responseBody && contentType === 'application/json') {
    try {
      JSON.parse(responseBody);
    } catch (e) {
      showToast('Invalid JSON in response body', 'error');
      return;
    }
  }

  const methodCheckboxes = document.querySelectorAll('#modalMethods input[type="checkbox"]:checked');
  const methods = Array.from(methodCheckboxes).map(cb => cb.value);

  if (methods.length === 0) {
    showToast('Select at least one HTTP method', 'error');
    return;
  }

  const rule = {
    name,
    urlPattern,
    matchType: 'wildcard',
    methods,
    enabled: true,
    contentType,
    modifyType: 'replace',
    modification: {
      type: 'text',
      value: responseBody || (contentType === 'application/json' ? '{}' : '')
    }
  };

  if (statusCode) rule.modifyStatusCode = parseInt(statusCode);

  try {
    await chrome.runtime.sendMessage({ action: MESSAGES.ADD_RULE, rule });
    showToast('Rule created successfully', 'success');
    closeCreateRuleModal();
    switchView('rules');
    await loadRules();
  } catch (error) {
    debug.error('Failed to create rule:', error);
    showToast('Failed to create rule', 'error');
  }
}
