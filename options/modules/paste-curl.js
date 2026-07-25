// "Paste cURL or URL" on the options page. Parses the command and drops the
// user straight into the full rule form, prefilled.
//
// The popup has a lighter destination for the same dialog
// (popup/modules/paste-curl-modal.js) that hands off to the compact create-rule
// modal instead. The dialog mechanics are shared in shared/curl-paste.js, and
// both go through generateRuleFromRequest, so the suggested rule is identical
// whichever surface you paste into.

import { setupCurlPasteDialog } from '../../shared/curl-paste.js';
import { generateRuleFromRequest } from '../../shared/rule-suggest.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { showTab } from './navigation.js';
import { populateForm } from './rule-form.js';
import { loadGroups } from './groups.js';

export function setupPasteCurl() {
  setupCurlPasteDialog({
    onParsed: prefillFormFrom,
    onError: (message) => showToast(message, 'error'),
    ids: { cancel: 'cancelPasteCurlBtn', confirm: 'confirmPasteCurlBtn' },
    submitOnCtrlEnter: true,
  });
}

async function prefillFormFrom(entry) {
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
