import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';
import { icon } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { generateRuleFromRequest } from '../../shared/rule-suggest.js';
import { MAX_BULK_MOCK } from '../../shared/constants.js';
import { openOptionsPage } from '../../shared/open-options.js';
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
  document.getElementById('openInFullEditor')?.addEventListener('click', openInFullEditor);

  document.getElementById('modalContentType')?.addEventListener('change', (e) => {
    const label = document.getElementById('modalBodyLabel');
    const ta = document.getElementById('modalResponseBody');
    const isJson = e.target.value === 'application/json';
    if (label) label.textContent = isJson ? 'Response Body (JSON)' : 'Response Body';
    if (ta) ta.placeholder = isJson ? '{"key": "value"}' : 'Enter response body...';
  });

  const bulkModal = document.getElementById('bulkCreateRuleModal');
  document.getElementById('closeBulkModal')?.addEventListener('click', closeBulkModal);
  document.getElementById('cancelBulkCreate')?.addEventListener('click', closeBulkModal);
  bulkModal?.querySelector('.modal-overlay')?.addEventListener('click', closeBulkModal);
  document.getElementById('confirmBulkCreate')?.addEventListener('click', createRulesFromBulkModal);
}

function setModalTitle(text) {
  const title = document.getElementById('createRuleModalTitle');
  if (title) title.textContent = text;
}

/**
 * The <select> keeps its value for as long as the popup is open, so a rule
 * started after an XML one would inherit that. Both open paths produce a JSON
 * draft — reset to match, and fire `change` so the body label/placeholder follow.
 */
function resetContentTypeToJson() {
  const contentType = document.getElementById('modalContentType');
  if (!contentType || contentType.value === 'application/json') return;
  contentType.value = 'application/json';
  contentType.dispatchEvent(new Event('change'));
}

/**
 * Open the modal with nothing prefilled — the "Add Rule" path.
 *
 * Rule creation deliberately lives here rather than jumping straight to the
 * options form: the popup is where the user already is, and "Full editor" in the
 * footer carries whatever they typed onward if they need the extra fields.
 */
export function openBlankCreateRuleModal() {
  state.selectedLogEntry = null;
  state.suggestedMatchType = 'wildcard';

  setModalTitle('Create Rule');
  document.getElementById('modalRuleName').value = '';
  document.getElementById('modalUrlPattern').value = '';
  document.getElementById('modalResponseBody').value = '';
  document.getElementById('modalStatusCode').value = '';

  resetContentTypeToJson();

  // GET on by default: without a method checked the rule can't be saved, and
  // GET is what the overwhelming majority of mocks target.
  document.querySelectorAll('#modalMethods input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = checkbox.value === 'GET';
  });

  const modal = document.getElementById('createRuleModal');
  if (modal) modal.style.display = 'flex';
  document.getElementById('modalRuleName')?.focus();
}

/**
 * Prefill and open the modal from a captured request. `logEntry` only needs to
 * be log-entry shaped ({ url, method, ... }), so a parsed cURL command works
 * here just as well as a real entry from the network inspector.
 */
export function openCreateRuleModal(logEntry) {
  state.selectedLogEntry = logEntry;
  const modal = document.getElementById('createRuleModal');

  setModalTitle('Create Rule from Request');
  resetContentTypeToJson();

  const suggestedRule = generateRuleFromRequest(logEntry);
  // The suggester picks the match type (`contains` when the URL wouldn't
  // parse), and the modal has no match-type control — so carry it through.
  state.suggestedMatchType = suggestedRule.matchType;

  document.getElementById('modalRuleName').value = suggestedRule.name || '';
  document.getElementById('modalUrlPattern').value = suggestedRule.urlPattern || '';
  document.getElementById('modalResponseBody').value = suggestedRule.modification?.value || '';
  document.getElementById('modalStatusCode').value = suggestedRule.modifyStatusCode || '';

  document.querySelectorAll('#modalMethods input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = suggestedRule.methods?.includes(checkbox.value) || false;
  });

  if (modal) modal.style.display = 'flex';
}

function closeCreateRuleModal() {
  const modal = document.getElementById('createRuleModal');
  if (modal) modal.style.display = 'none';
  state.selectedLogEntry = null;
  state.suggestedMatchType = null;
}

/**
 * Read the modal's fields into a rule object.
 *
 * @param {{strict?: boolean}} [opts] `strict` (the default) rejects an
 *   incomplete rule with a toast — that's the "Create Rule" path, which writes
 *   straight to storage. Non-strict fills defaults and never blocks: it's for
 *   handing a half-finished draft to the full editor, which validates on save.
 * @returns {object|null} the rule, or null if strict validation failed
 */
function collectModalRule({ strict = true } = {}) {
  const name = document.getElementById('modalRuleName').value.trim();
  const urlPattern = document.getElementById('modalUrlPattern').value.trim();
  const responseBody = document.getElementById('modalResponseBody').value.trim();
  const statusCode = document.getElementById('modalStatusCode').value;

  if (strict && !name) { showToast('Rule name is required', 'error'); return null; }
  if (strict && !urlPattern) { showToast('URL pattern is required', 'error'); return null; }

  const contentType = document.getElementById('modalContentType')?.value || 'application/json';

  if (strict && responseBody && contentType === 'application/json') {
    try {
      JSON.parse(responseBody);
    } catch (e) {
      showToast('Invalid JSON in response body', 'error');
      return null;
    }
  }

  const methodCheckboxes = document.querySelectorAll('#modalMethods input[type="checkbox"]:checked');
  let methods = Array.from(methodCheckboxes).map(cb => cb.value);

  if (methods.length === 0) {
    if (strict) {
      showToast('Select at least one HTTP method', 'error');
      return null;
    }
    methods = ['GET'];
  }

  const rule = {
    name,
    urlPattern,
    matchType: state.suggestedMatchType || 'wildcard',
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
  return rule;
}

/**
 * Hand the draft off to the options page's full rule form, which has the fields
 * this compact modal doesn't (group, priority, delay, response headers).
 *
 * Goes through storage.session rather than a message because the popup is a
 * trusted context and can write it directly — and because openOptionsPage()
 * closes the popup, so there is nobody left to answer a response.
 *
 * Collected non-strictly: this is an escape hatch, not a submit. Being told
 * "rule name is required" by the button whose whole job is to give you more
 * fields would be absurd.
 */
async function openInFullEditor() {
  const rule = collectModalRule({ strict: false });
  if (!rule) return;

  try {
    await chrome.storage.session.set({ ruleDraft: rule });
  } catch (error) {
    debug.error('Failed to stash rule draft:', error);
    showToast('Could not open the full editor', 'error');
    return;
  }

  closeCreateRuleModal();
  // The draft handler on the other side switches to the form itself, so there is
  // no destination to pass here.
  await openOptionsPage();
}

async function createRuleFromModal() {
  const rule = collectModalRule();
  if (!rule) return;

  const confirmBtn = document.getElementById('confirmCreateRule');
  const originalLabel = confirmBtn?.textContent;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.classList.add('is-loading');
    confirmBtn.innerHTML = `${icon('spinner', { size: 14, className: 'spin' })}<span>Saving...</span>`;
  }

  try {
    await chrome.runtime.sendMessage({ action: MESSAGES.ADD_RULE, rule });
    showToast('Rule created successfully', 'success');
    closeCreateRuleModal();
    switchView('rules');
    await loadRules();
  } catch (error) {
    debug.error('Failed to create rule:', error);
    showToast('Failed to create rule', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-loading');
      confirmBtn.textContent = originalLabel || 'Create Rule';
    }
  }
}

// ── Bulk create (2+ requests selected in the network list) ──────────────────
//
// Deliberately not a 25-row version of the full form — in a 380px popup that
// would be unusable. Each row exposes only the two fields you actually want to
// tweak per-request (name and URL pattern); everything else comes from the
// suggester and can be refined later in the options editor.

export async function openBulkCreateRuleModal(logEntries) {
  const drafts = dedupeDrafts(logEntries);

  if (drafts.length > MAX_BULK_MOCK) {
    showToast(`Too many requests — mocking the first ${MAX_BULK_MOCK}`, 'error');
    drafts.length = MAX_BULK_MOCK;
  }

  state.bulkDrafts = drafts;
  await populateBulkGroupSelect();
  renderBulkRows();

  const title = document.getElementById('bulkModalTitle');
  if (title) title.textContent = `Create ${drafts.length} Rules from Requests`;

  const modal = document.getElementById('bulkCreateRuleModal');
  if (modal) modal.style.display = 'flex';
}

/**
 * Two requests to the same endpoint collapse to the same rule, so build the
 * suggestions first and dedupe on what actually distinguishes a rule
 * (urlPattern + methods). Keep whichever one captured a response body.
 */
function dedupeDrafts(logEntries) {
  const byKey = new Map();

  for (const entry of logEntries) {
    const rule = generateRuleFromRequest(entry);
    const key = `${rule.urlPattern}|${(rule.methods || []).join(',')}`;
    const existing = byKey.get(key);

    if (!existing || (!existing.hadBody && !!entry.responseBody)) {
      byKey.set(key, { rule, hadBody: !!entry.responseBody, entry });
    }
  }

  return Array.from(byKey.values());
}

async function populateBulkGroupSelect() {
  const select = document.getElementById('bulkGroupSelect');
  if (!select) return;

  select.innerHTML = '<option value="">No group</option>';
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_GROUPS });
    for (const group of response?.groups || []) {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.appendChild(option);
    }
  } catch (error) {
    debug.error('Failed to load groups:', error);
  }
}

function renderBulkRows() {
  const container = document.getElementById('bulkRuleRows');
  if (!container) return;

  container.innerHTML = state.bulkDrafts.map((draft, i) => {
    const { rule, hadBody } = draft;
    const status = rule.modifyStatusCode ? `${rule.modifyStatusCode}` : '—';
    return `
      <div class="crm-row" data-index="${i}">
        <div class="crm-row-fields">
          <input type="text" class="form-control crm-name" value="${escapeHtml(rule.name || '')}" placeholder="Rule name">
          <input type="text" class="form-control crm-pattern" value="${escapeHtml(rule.urlPattern || '')}" placeholder="URL pattern">
        </div>
        <div class="crm-row-meta">
          <span class="crm-method">${escapeHtml((rule.methods || []).join(', '))}</span>
          <span class="crm-status">${escapeHtml(status)}</span>
          <span class="crm-body ${hadBody ? 'has' : ''}">${hadBody ? 'response captured' : 'placeholder body'}</span>
        </div>
        <button type="button" class="crm-remove" data-index="${i}" title="Remove from this batch" aria-label="Remove">&times;</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.crm-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Read the live inputs first, or edits to other rows are lost on re-render.
      syncBulkDraftsFromInputs();
      const index = parseInt(e.currentTarget.dataset.index, 10);
      state.bulkDrafts.splice(index, 1);

      if (state.bulkDrafts.length === 0) { closeBulkModal(); return; }
      if (state.bulkDrafts.length === 1) {
        // Down to one — the single-rule modal is the better editor.
        const only = state.bulkDrafts[0].entry;
        closeBulkModal();
        openCreateRuleModal(only);
        return;
      }

      renderBulkRows();
      const title = document.getElementById('bulkModalTitle');
      if (title) title.textContent = `Create ${state.bulkDrafts.length} Rules from Requests`;
      const confirm = document.getElementById('confirmBulkCreate');
      if (confirm) confirm.textContent = `Create ${state.bulkDrafts.length} Rules`;
    });
  });

  const confirm = document.getElementById('confirmBulkCreate');
  if (confirm) confirm.textContent = `Create ${state.bulkDrafts.length} Rules`;
}

/** Copy the user's edits out of the DOM and back into state.bulkDrafts. */
function syncBulkDraftsFromInputs() {
  document.querySelectorAll('#bulkRuleRows .crm-row').forEach(row => {
    const index = parseInt(row.dataset.index, 10);
    const draft = state.bulkDrafts[index];
    if (!draft) return;
    draft.rule.name = row.querySelector('.crm-name')?.value.trim() || draft.rule.name;
    draft.rule.urlPattern = row.querySelector('.crm-pattern')?.value.trim() || draft.rule.urlPattern;
  });
}

function closeBulkModal() {
  const modal = document.getElementById('bulkCreateRuleModal');
  if (modal) modal.style.display = 'none';
  state.bulkDrafts = [];
}

async function createRulesFromBulkModal() {
  syncBulkDraftsFromInputs();

  const groupId = document.getElementById('bulkGroupSelect')?.value || '';
  const rules = state.bulkDrafts
    .map(d => d.rule)
    .filter(r => r.name && r.urlPattern)
    .map(r => (groupId ? { ...r, groupId } : r));

  if (rules.length === 0) {
    showToast('Every rule needs a name and a URL pattern', 'error');
    return;
  }

  const confirmBtn = document.getElementById('confirmBulkCreate');
  const originalLabel = confirmBtn?.textContent;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.classList.add('is-loading');
    confirmBtn.innerHTML = `${icon('spinner', { size: 14, className: 'spin' })}<span>Saving...</span>`;
  }

  try {
    // One message, one storage write — see storageManager.addRules().
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.ADD_RULES, rules });
    if (!response?.success) throw new Error(response?.error || 'Bulk create failed');

    showToast(`Created ${response.count} rule${response.count === 1 ? '' : 's'}`, 'success');
    state.selectedLogIds.clear();
    closeBulkModal();
    switchView('rules');
    await loadRules();
  } catch (error) {
    debug.error('Failed to create rules:', error);
    showToast('Failed to create rules', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-loading');
      confirmBtn.textContent = originalLabel || 'Create Rules';
    }
  }
}
