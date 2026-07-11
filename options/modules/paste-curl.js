// "Paste cURL or URL" on the options page. Parses the command and drops the
// user straight into the full rule form, prefilled.
//
// The popup has a lighter version of this (popup/modules/paste-curl-modal.js)
// that hands off to the compact create-rule modal instead. Both share
// parseCurl + generateRuleFromRequest, so the suggested rule is identical.

import { parseCurl } from '../../shared/curl.js';
import { generateRuleFromRequest } from '../../shared/rule-suggest.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { showTab } from './navigation.js';
import { populateForm } from './rule-form.js';
import { loadGroups } from './groups.js';

export function setupPasteCurl() {
  const modal = document.getElementById('pasteCurlModal');

  document.getElementById('pasteCurlBtn')?.addEventListener('click', openPasteCurlModal);
  document.getElementById('closePasteCurlModal')?.addEventListener('click', closePasteCurlModal);
  document.getElementById('cancelPasteCurlBtn')?.addEventListener('click', closePasteCurlModal);
  document.getElementById('confirmPasteCurlBtn')?.addEventListener('click', confirmPasteCurl);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closePasteCurlModal();
  });

  document.getElementById('pasteCurlInput')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      confirmPasteCurl();
    }
  });
}

function openPasteCurlModal() {
  const input = document.getElementById('pasteCurlInput');
  if (input) input.value = '';
  const modal = document.getElementById('pasteCurlModal');
  if (modal) modal.style.display = 'flex';
  input?.focus();
}

function closePasteCurlModal() {
  const modal = document.getElementById('pasteCurlModal');
  if (modal) modal.style.display = 'none';
}

async function confirmPasteCurl() {
  const text = document.getElementById('pasteCurlInput')?.value || '';

  let entry;
  try {
    entry = parseCurl(text);
  } catch (error) {
    showToast(error.message || 'Could not parse that cURL command', 'error');
    return;
  }

  closePasteCurlModal();

  // The group <select> has to be populated before populateForm sets its value.
  await loadGroups();

  // showTab('new-rule') calls resetForm(), so populate *after* it — same
  // ordering editRule() relies on.
  state.currentEditingRuleId = null;
  showTab('new-rule');
  populateForm(generateRuleFromRequest(entry));

  const formTitle = document.getElementById('formTitle');
  if (formTitle) formTitle.textContent = 'Create New Rule';

  showToast('Rule prefilled from cURL — review and save', 'success');
}
