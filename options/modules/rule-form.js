import { isBinaryContentType } from '../../shared/content-types.js';
import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { debug } from '../../shared/debug.js';
import { STATUS_CODE_MIN, STATUS_CODE_MAX } from '../../shared/constants.js';
import { icon } from '../../shared/icons.js';
import { safeCompileRegex } from '../../shared/regex.js';
import { state, BODY_PLACEHOLDERS, MATCH_TYPE_HINTS } from './state.js';
import { showToast } from './toast.js';
import { loadGroups } from './groups.js';
import { loadRules } from './rules-view.js';
import { showTab } from './navigation.js';

// Inline field validation. Marks the field's wrapper (.rf-field) or the field
// itself with .field-error and injects a <span class="field-error-message">.
// Cleared automatically on the field's next input event and on resetForm().
function fieldContainer(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return null;
  return el.closest('.rf-field') || el.parentElement;
}

export function setFieldError(fieldId, message) {
  const wrapper = fieldContainer(fieldId);
  const field = document.getElementById(fieldId);
  if (!wrapper || !field) return;
  wrapper.classList.add('field-error');
  let msg = wrapper.querySelector(':scope > .field-error-message');
  if (!msg) {
    msg = document.createElement('span');
    msg.className = 'field-error-message';
    wrapper.appendChild(msg);
  }
  msg.textContent = message;
  if (!field.dataset.errorClearBound) {
    field.dataset.errorClearBound = '1';
    field.addEventListener('input', () => clearFieldError(fieldId));
    field.addEventListener('change', () => clearFieldError(fieldId));
  }
}

export function clearFieldError(fieldId) {
  const wrapper = fieldContainer(fieldId);
  if (!wrapper) return;
  wrapper.classList.remove('field-error');
  const msg = wrapper.querySelector(':scope > .field-error-message');
  if (msg) msg.remove();
}

export function clearAllFieldErrors() {
  document.querySelectorAll('.field-error').forEach(w => w.classList.remove('field-error'));
  document.querySelectorAll('.field-error-message').forEach(n => n.remove());
  document.getElementById('statusCodeWarning')?.remove();
}

function showStatusCodeWarning(message) {
  const wrapper = fieldContainer('modifyStatusCode');
  if (!wrapper) return;
  let chip = wrapper.querySelector(':scope > #statusCodeWarning');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'statusCodeWarning';
    chip.className = 'field-warning';
    wrapper.appendChild(chip);
  }
  chip.innerHTML = `${icon('alert', { size: 14 })}<span>${escapeHtml(message)}</span>`;
}

function clearStatusCodeWarning() {
  document.getElementById('statusCodeWarning')?.remove();
}

const VALID_STATUS_CODES = [
  100, 101, 102, 103,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
];

export function updateResponseTypeUI(contentType) {
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

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function fetchUrlAsBase64(url) {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.FETCH_URL_AS_BASE64, url });
    if (!response.success) throw new Error(response.error || 'Fetch failed');
    return response.base64;
  } catch (error) {
    throw new Error(error.message || 'Failed to fetch URL');
  }
}

export function updateBinaryPreview(base64, contentType) {
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

export function updateModificationOptions() {
  const replaceOptions = document.getElementById('replaceOptions');
  if (replaceOptions) replaceOptions.style.display = 'block';
}

export function updateMatchTypeHint() {
  const type = document.getElementById('matchType')?.value;
  const hintEl = document.getElementById('matchTypeHint');
  if (!hintEl || !type) return;
  const h = MATCH_TYPE_HINTS[type];
  if (!h) { hintEl.innerHTML = ''; return; }
  hintEl.innerHTML = `<strong>${h.title}</strong>${h.desc} <span style="display:block;margin-top:4px;color:var(--text-muted);">e.g. ${h.example}</span>`;
}

export async function saveRule() {
  clearAllFieldErrors();
  const { data: ruleData, errors } = collectFormData();

  if (errors.length > 0) {
    errors.forEach(({ fieldId, message }) => setFieldError(fieldId, message));
    const firstField = document.getElementById(errors[0].fieldId);
    firstField?.focus();
    showToast('Please fix the highlighted fields', 'error');
    return;
  }

  const saveBtn = document.getElementById('saveRule');
  const originalLabel = saveBtn?.textContent;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add('is-loading');
    saveBtn.innerHTML = `${icon('spinner', { size: 14, className: 'spin' })}<span>Saving...</span>`;
  }

  try {
    let savedRule;
    if (state.currentEditingRuleId) {
      await chrome.runtime.sendMessage({
        action: MESSAGES.UPDATE_RULE,
        ruleId: state.currentEditingRuleId,
        rule: ruleData
      });
      const rulesResult = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
      savedRule = rulesResult?.rules?.find(r => r.id === state.currentEditingRuleId);
    } else {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGES.ADD_RULE,
        rule: ruleData
      });
      savedRule = response?.rule;
    }

    if (savedRule) {
      // "no delay" is null coming out of the form and an absent key once stored,
      // so normalize both sides before comparing — otherwise clearing the field
      // reads as a failed save.
      const expectedDelay = ruleData.delay ?? null;
      const actualDelay = savedRule.delay ?? null;
      if (actualDelay !== expectedDelay) {
        debug.error(`Delay verification failed! Expected: ${expectedDelay}, Got: ${actualDelay}`);
        showToast(`Warning: Delay value was not saved correctly. Expected ${expectedDelay}ms but got ${actualDelay}ms`, 'error');
        return;
      }
      if (expectedDelay !== null) {
        debug.log(`Rule saved successfully with delay: ${actualDelay}ms`);
      }
    } else {
      debug.warn('Could not verify saved rule');
    }

    const message = state.currentEditingRuleId ? 'Rule updated successfully' : 'Rule created successfully';
    state.currentEditingRuleId = null;
    resetForm();
    await loadRules();
    showTab('rules');
    showToast(message, 'success');
  } catch (error) {
    debug.error('Failed to save rule:', error);
    showToast('Failed to save rule: ' + error.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('is-loading');
      saveBtn.textContent = originalLabel || 'Save Rule';
    }
  }
}

export function validateStatusCode(statusCode) {
  const code = parseInt(statusCode);
  if (isNaN(code) || code < STATUS_CODE_MIN || code > STATUS_CODE_MAX) {
    return { valid: false, message: `Status code must be between ${STATUS_CODE_MIN} and ${STATUS_CODE_MAX}` };
  }
  if (!VALID_STATUS_CODES.includes(code)) {
    return { valid: true, warning: `Status code ${code} is not a standard HTTP status code. Continue anyway?` };
  }
  return { valid: true };
}

export function collectFormData() {
  const errors = [];
  const name = document.getElementById('ruleName').value.trim();
  const description = document.getElementById('ruleDescription').value.trim();
  const urlPattern = document.getElementById('urlPattern').value.trim();
  const matchType = document.getElementById('matchType').value;
  const modifyType = 'replace';
  const enabled = document.getElementById('ruleEnabled').checked;

  if (!name) errors.push({ fieldId: 'ruleName', message: 'Rule name is required' });
  if (!urlPattern) errors.push({ fieldId: 'urlPattern', message: 'URL pattern is required' });

  // A regex the engine won't accept produces a rule that can never match, and
  // the rejection previously only reached the service-worker console. Catch it
  // here, while the user is still looking at the field.
  if (urlPattern && matchType === 'regex' && !safeCompileRegex(urlPattern)) {
    errors.push({
      fieldId: 'urlPattern',
      message: 'This regex was rejected — check the syntax, and avoid a repeated group that already repeats, like (\\d+)+',
    });
  }

  const methods = Array.from(document.querySelectorAll('input[name="methods"]:checked')).map(cb => cb.value);

  const delayValue = document.getElementById('ruleDelay').value.trim();
  const delay = delayValue ? parseInt(delayValue, 10) : null;

  if (delay !== null && (Number.isNaN(delay) || delay < 0 || delay > 30000)) {
    errors.push({ fieldId: 'ruleDelay', message: 'Delay must be between 0 and 30000 ms' });
  }

  const priorityValue = document.getElementById('rulePriority').value.trim();
  const priority = priorityValue ? parseInt(priorityValue, 10) : 0;

  if (Number.isNaN(priority) || priority < 0 || priority > 999) {
    errors.push({ fieldId: 'rulePriority', message: 'Priority must be between 0 and 999' });
  }

  const ruleData = { name, description, urlPattern, matchType, methods, enabled, priority };

  // Always send the key. null means "the user emptied this field" — omitting it
  // would leave the previously saved delay in place (see storage-manager's
  // dropNullFields). Same for modifyStatusCode and modifyHeaders below.
  ruleData.delay = delay;
  if (delay !== null) debug.log(`Setting delay value: ${delay}ms`);

  const contentTypeEl = document.getElementById('responseContentType');
  const contentType = contentTypeEl?.value || 'application/json';
  ruleData.contentType = contentType;
  // Clear the custom type when switching back to a standard one, so a stale
  // value can't resurface if the user later switches to Custom again.
  ruleData.customContentType = contentType === '__custom__'
    ? (document.getElementById('customContentType')?.value.trim() || 'application/octet-stream')
    : null;

  const isCustomBinary = contentType === '__custom__' && document.getElementById('customIsBinary')?.checked;
  const effectiveBinary = (isBinaryContentType(contentType) && contentType !== '__custom__') || isCustomBinary;

  const modification = effectiveBinary
    ? { type: 'binary', isBinary: true, value: document.getElementById('binaryBase64Value')?.value.trim() || '' }
    : { type: 'text', value: document.getElementById('replaceValue').value };

  ruleData.modifyType = modifyType;
  ruleData.modification = modification;

  clearStatusCodeWarning();
  const statusCode = document.getElementById('modifyStatusCode').value.trim();
  ruleData.modifyStatusCode = null;
  if (statusCode) {
    const validation = validateStatusCode(statusCode);
    if (!validation.valid) {
      errors.push({ fieldId: 'modifyStatusCode', message: validation.message });
    } else {
      if (validation.warning) showStatusCodeWarning(validation.warning);
      ruleData.modifyStatusCode = parseInt(statusCode, 10);
    }
  }

  const modifyHeaders = getHeaderModifications();
  ruleData.modifyHeaders = modifyHeaders.length > 0 ? modifyHeaders : null;

  const groupValue = document.getElementById('ruleGroup').value;
  if (groupValue) ruleData.groupId = groupValue;

  return { data: ruleData, errors };
}

export async function editRule(ruleId) {
  if (!ruleId) {
    debug.error('editRule: ruleId is required');
    showToast('Invalid rule ID', 'error');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
    if (!response || !response.rules) {
      debug.error('Failed to get rules: Invalid response');
      showToast('Failed to load rules', 'error');
      return;
    }

    const rule = response.rules.find(r => r && r.id === ruleId);
    if (!rule) {
      showToast('Rule not found', 'error');
      return;
    }

    await loadGroups();

    // showTab resets form and clears currentEditingRuleId, so set it after
    showTab('new-rule');
    state.currentEditingRuleId = ruleId;
    populateForm(rule);

    const formTitle = document.getElementById('formTitle');
    if (formTitle) formTitle.textContent = 'Edit Rule';
  } catch (error) {
    debug.error('Failed to edit rule:', error);
    showToast('Failed to load rule', 'error');
  }
}

export function populateForm(rule) {
  if (!rule || typeof rule !== 'object') {
    debug.error('populateForm: Invalid rule object');
    return;
  }

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value !== null && value !== undefined ? value : '';
  };
  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
  };

  setValue('ruleId', rule.id);
  setValue('ruleName', rule.name);
  setValue('ruleDescription', rule.description);
  setValue('urlPattern', rule.urlPattern);
  setValue('matchType', rule.matchType);
  setChecked('ruleEnabled', rule.enabled);

  document.querySelectorAll('input[name="methods"]').forEach(cb => {
    cb.checked = rule.methods && Array.isArray(rule.methods) && rule.methods.includes(cb.value);
  });

  setValue('ruleDelay', rule.delay !== undefined && rule.delay !== null ? rule.delay : '');
  setValue('rulePriority', rule.priority ? rule.priority : '');

  const ruleContentType = rule.contentType || 'application/json';
  setValue('responseContentType', ruleContentType);
  if (ruleContentType === '__custom__') {
    setValue('customContentType', rule.customContentType || '');
  }
  updateResponseTypeUI(ruleContentType);

  if (rule.modification) {
    if (rule.modification.isBinary) {
      setValue('binaryBase64Value', rule.modification.value || '');
      if (rule.modification.value) {
        updateBinaryPreview(rule.modification.value, ruleContentType === '__custom__' ? rule.customContentType : ruleContentType);
      }
      if (ruleContentType === '__custom__') {
        const cbEl = document.getElementById('customIsBinary');
        if (cbEl) cbEl.checked = true;
      }
    } else {
      setValue('replaceValue', rule.modification.value);
    }
  }

  setValue('modifyStatusCode', rule.modifyStatusCode);
  const scVal = rule.modifyStatusCode != null ? String(rule.modifyStatusCode) : '';
  document.getElementById('ruleFormStatusPresets')?.querySelectorAll('.status-preset').forEach(b => {
    b.classList.toggle('active', b.dataset.code === scVal);
  });

  clearHeaderModifications();
  if (rule.modifyHeaders && Array.isArray(rule.modifyHeaders)) {
    rule.modifyHeaders.forEach(header => {
      if (header && header.name) addHeaderModification(header.name, header.value, header.action);
    });
  }

  setValue('ruleGroup', rule.groupId || '');

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
  if (document.getElementById('ruleDescription')?.value) {
    document.getElementById('descriptionBody')?.style.setProperty('display', 'block');
    document.getElementById('toggleDescription')?.classList.add('open');
  }
  setTimeout(() => {
    const headerRows = document.querySelectorAll('#headerModifications .header-mod-row').length;
    if (headerRows > 0) {
      document.getElementById('headersBody')?.style.setProperty('display', 'block');
      document.getElementById('toggleHeadersSection')?.classList.add('open');
      const countEl = document.getElementById('headerCount');
      if (countEl) { countEl.textContent = headerRows; countEl.classList.add('visible'); }
    }
    updateMatchTypeHint();
  }, 0);
}

export function resetForm() {
  clearAllFieldErrors();
  document.getElementById('ruleForm').reset();
  document.getElementById('ruleId').value = '';
  document.getElementById('formTitle').textContent = 'Create New Rule';
  document.getElementById('ruleEnabled').checked = true;
  document.querySelectorAll('input[name="methods"]')[0].checked = true;

  document.getElementById('ruleDelay').value = '';

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
  state.currentEditingRuleId = null;

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
  updateMatchTypeHint();
}

export function prettifyJsonInTextarea() {
  const textarea = document.getElementById('replaceValue');
  const content = textarea.value.trim();

  if (!content) {
    showToast('Please enter some JSON content first', 'error');
    return;
  }

  try {
    textarea.value = JSON.stringify(JSON.parse(content), null, 2);
  } catch (error) {
    showToast('Invalid JSON: ' + error.message, 'error');
  }
}

export function addHeaderModification(name = '', value = '', action = 'set') {
  const id = ++state.headerModificationCounter;
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

  headerRow.querySelector('.header-action').addEventListener('change', (e) => {
    const valueInput = headerRow.querySelector('.header-value');
    if (e.target.value === 'remove') {
      valueInput.disabled = true;
      valueInput.value = '';
    } else {
      valueInput.disabled = false;
    }
  });

  headerRow.querySelector('.remove-header-btn').addEventListener('click', () => {
    headerRow.remove();
    updateHeaderCountBadge();
  });

  updateHeaderCountBadge();
}

export function updateHeaderCountBadge() {
  const count = document.querySelectorAll('#headerModifications .header-mod-row').length;
  const countEl = document.getElementById('headerCount');
  if (!countEl) return;
  countEl.textContent = count > 0 ? count : '';
  countEl.classList.toggle('visible', count > 0);
}

export function getHeaderModifications() {
  const rows = document.querySelectorAll('#headerModifications .header-mod-row');
  const modifications = [];

  rows.forEach(row => {
    const action = row.querySelector('.header-action').value;
    const name = row.querySelector('.header-name').value.trim();
    const value = row.querySelector('.header-value').value.trim();
    if (name) modifications.push({ action, name, value });
  });

  return modifications;
}

export function clearHeaderModifications() {
  document.getElementById('headerModifications').innerHTML = '';
  state.headerModificationCounter = 0;
  updateHeaderCountBadge();
}
