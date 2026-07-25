// "Paste cURL or URL" — one of the three ways into a rule, alongside Add Rule
// and the network inspector's "+ Rule".
//
// A parsed cURL command is log-entry shaped, so this hands straight off to the
// same create-rule modal the network inspector uses. No new rule-building code.
// The dialog mechanics live in shared/curl-paste.js, shared with the options page.

import { setupCurlPasteDialog } from '../../shared/curl-paste.js';
import { debug } from '../../shared/debug.js';
import { showToast } from './toast.js';
import { openCreateRuleModal } from './create-rule-modal.js';

let dialog = null;

export function setupPasteCurlModal() {
  dialog = setupCurlPasteDialog({
    onParsed: (entry) => openCreateRuleModal(entry),
    onError: (message) => showToast(message, 'error'),
    // Ctrl/Cmd+Enter to submit is handled globally — see modules/keyboard.js.
    submitOnCtrlEnter: false,
  });
}

export function openPasteCurlModal() {
  // popup.js calls setupPasteCurlModal() during init, well before anything can
  // click. If that ever stops being true this is a dead button, so say so.
  if (!dialog) {
    debug.warn('openPasteCurlModal called before setupPasteCurlModal()');
    return;
  }
  dialog.open();
}
