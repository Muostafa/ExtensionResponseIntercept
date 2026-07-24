// Popup-wide keyboard handling.
//
// Everything here drives the *existing* buttons rather than importing each
// modal's internals — the buttons already own the open/close/submit logic, so
// a shortcut can never drift out of sync with what a click does.

import { state } from './state.js';

// Modals in stacking order; the last open one is the one Escape/Enter act on.
const MODALS = [
  { id: 'createRuleModal', cancel: 'cancelCreateRule', confirm: 'confirmCreateRule' },
  { id: 'bulkCreateRuleModal', cancel: 'cancelBulkCreate', confirm: 'confirmBulkCreate' },
  { id: 'pasteCurlModal', cancel: 'cancelPasteCurl', confirm: 'confirmPasteCurl' },
];

function openModal() {
  for (let i = MODALS.length - 1; i >= 0; i--) {
    const el = document.getElementById(MODALS[i].id);
    if (el && el.style.display !== 'none') return MODALS[i];
  }
  return null;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** The search box for whichever view is showing. */
function activeSearchInput() {
  return document.getElementById(
    state.currentView === 'network' ? 'networkSearchInput' : 'searchInput'
  );
}

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const modal = openModal();

    if (e.key === 'Escape') {
      if (modal) {
        e.preventDefault();
        document.getElementById(modal.cancel)?.click();
        return;
      }
      // The search inputs clear themselves on Escape while focused; this covers
      // Escape pressed anywhere else in the popup.
      const search = activeSearchInput();
      if (search?.value && document.activeElement !== search) {
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    if (modal) {
      // Ctrl/Cmd+Enter submits from anywhere, including the body textarea where a
      // bare Enter has to keep inserting newlines.
      const bareEnterSubmits = e.key === 'Enter'
        && document.activeElement?.tagName === 'INPUT'
        && !e.shiftKey;
      if (e.key === 'Enter' && ((e.ctrlKey || e.metaKey) || bareEnterSubmits)) {
        e.preventDefault();
        document.getElementById(modal.confirm)?.click();
      }
      return;
    }

    // "/" jumps to search — but only when it isn't just a character being typed.
    if (e.key === '/' && !isTypingTarget(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const search = activeSearchInput();
      search?.focus();
      search?.select();
    }
  });
}
