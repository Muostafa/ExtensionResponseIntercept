// The "Paste cURL or URL" dialog shell, shared by both pages.
//
// Only the destination differs: the popup hands the parsed request to its
// compact create-rule modal, the options page prefills the full form. The shell
// around that — clear the textarea, show, hide, parse, report a parse failure —
// was the same code twice, and a fix to one copy silently missed the other.
//
// The two pages' markup differs slightly (the popup has a .modal-overlay and
// its own footer button ids), so element ids come in as options rather than
// being hardcoded.

import { parseCurl } from './curl.js';

/**
 * @param {object} opts
 * @param {(entry: object) => void|Promise<void>} opts.onParsed receives the
 *   log-entry-shaped request; the dialog is already closed by then
 * @param {(message: string) => void} opts.onError shows a parse failure
 * @param {object} [opts.ids] element id overrides
 * @param {boolean} [opts.submitOnCtrlEnter] wire Ctrl/Cmd+Enter on the textarea.
 *   The popup handles this globally in modules/keyboard.js, so it opts out.
 * @returns {{open: function, close: function}}
 */
export function setupCurlPasteDialog({
  onParsed,
  onError,
  ids = {},
  submitOnCtrlEnter = false,
} = {}) {
  const id = {
    modal: 'pasteCurlModal',
    input: 'pasteCurlInput',
    open: 'pasteCurlBtn',
    close: 'closePasteCurlModal',
    cancel: 'cancelPasteCurl',
    confirm: 'confirmPasteCurl',
    ...ids,
  };

  const modal = () => document.getElementById(id.modal);
  const input = () => document.getElementById(id.input);

  function open() {
    const field = input();
    if (field) field.value = '';
    const el = modal();
    if (el) el.style.display = 'flex';
    field?.focus();
  }

  function close() {
    const el = modal();
    if (el) el.style.display = 'none';
  }

  async function confirm() {
    let entry;
    try {
      entry = parseCurl(input()?.value || '');
    } catch (error) {
      onError?.(error.message || 'Could not parse that cURL command');
      return;
    }
    close();
    await onParsed?.(entry);
  }

  document.getElementById(id.open)?.addEventListener('click', open);
  document.getElementById(id.close)?.addEventListener('click', close);
  document.getElementById(id.cancel)?.addEventListener('click', close);
  document.getElementById(id.confirm)?.addEventListener('click', confirm);

  // The popup dims behind a dedicated overlay element; the options page clicks
  // the modal backdrop itself. Support whichever the page provides.
  const el = modal();
  const overlay = el?.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', close);
  } else {
    el?.addEventListener('click', (e) => { if (e.target === el) close(); });
  }

  if (submitOnCtrlEnter) {
    input()?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
    });
  }

  return { open, close };
}
