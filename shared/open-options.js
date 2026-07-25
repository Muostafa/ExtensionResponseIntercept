// The one way to get from the popup to the options page.
//
// Every popup control that leaves for options names *where* it is going, so no
// two labels can land on the same screen. `chrome.runtime.openOptionsPage()`
// takes no URL — it opens the page or merely *focuses* an already-open tab — so
// the destination travels separately, through storage.session. The options page
// reads the intent both on DOMContentLoaded (fresh tab) and from a storage
// listener (already-open tab, where DOMContentLoaded won't fire again).
//
// Same channel and same reasoning as the `ruleDraft` handoff in
// popup/modules/create-rule-modal.js.

import { debug } from './debug.js';

/** Tabs the options page knows how to show; also the keyboard 1-5 order. */
export const OPTIONS_TABS = ['rules', 'new-rule', 'import-export', 'settings', 'help'];

/** Intents older than this are ignored — see applyPendingNavIntent in options.js. */
export const NAV_INTENT_TTL_MS = 30000;

/**
 * Open (or focus) the options page, optionally on a specific tab.
 * @param {string} [tab] one of OPTIONS_TABS; omit to land wherever it was
 * @param {{ruleId?: string}} [opts] ruleId opens that rule in the full editor
 */
export async function openOptionsPage(tab, opts = {}) {
  if (tab || opts.ruleId) {
    try {
      await chrome.storage.session.set({
        optionsNavIntent: { tab, ruleId: opts.ruleId, at: Date.now() },
      });
    } catch (error) {
      // Non-fatal: the page still opens, just on whichever tab it last showed.
      debug.error('Failed to record options nav intent:', error);
    }
  }
  chrome.runtime.openOptionsPage();
}
