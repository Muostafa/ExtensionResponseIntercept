// Keyboard shortcut overlay. Press `?` (Shift+/) to toggle. Auto-shown on
// first visit, then quiet.

import { icon } from '../../shared/icons.js';

const SHORTCUTS = [
  { keys: ['Alt', 'N'],  label: 'New rule' },
  { keys: ['Ctrl', 'S'], label: 'Save current rule' },
  { keys: ['Esc'],       label: 'Cancel edit / close modal' },
  { keys: ['1'],         label: 'Switch to Rules & Groups' },
  { keys: ['2'],         label: 'Switch to New Rule' },
  { keys: ['3'],         label: 'Switch to Import / Export' },
  { keys: ['4'],         label: 'Switch to Help' },
  { keys: ['?'],         label: 'Show this help' },
];

let overlayEl = null;

function buildOverlay() {
  const root = document.createElement('div');
  root.className = 'kbd-hints-overlay';
  root.id = 'keyboardHintsOverlay';
  root.style.display = 'none';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'kbdHintsTitle');
  root.innerHTML = `
    <div class="kbd-hints-backdrop" data-kbd-close></div>
    <div class="kbd-hints-dialog">
      <div class="kbd-hints-header">
        <div class="kbd-hints-title-row">
          ${icon('keyboard', { size: 20 })}
          <h3 id="kbdHintsTitle">Keyboard Shortcuts</h3>
        </div>
        <button type="button" class="kbd-hints-close" data-kbd-close aria-label="Close">${icon('x', { size: 16 })}</button>
      </div>
      <ul class="kbd-hints-list">
        ${SHORTCUTS.map(s => `
          <li class="kbd-hints-item">
            <span class="kbd-hints-keys">${s.keys.map(k => `<kbd>${k}</kbd>`).join('<span class="kbd-plus">+</span>')}</span>
            <span class="kbd-hints-label">${s.label}</span>
          </li>
        `).join('')}
      </ul>
      <div class="kbd-hints-footer">Press <kbd>?</kbd> again or <kbd>Esc</kbd> to close.</div>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-kbd-close]')) hide();
  });
  return root;
}

function show() {
  if (!overlayEl) overlayEl = buildOverlay();
  overlayEl.style.display = 'flex';
}

function hide() {
  if (overlayEl) overlayEl.style.display = 'none';
}

function isVisible() {
  return overlayEl && overlayEl.style.display === 'flex';
}

export function setupKeyboardHints() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible()) {
      e.stopPropagation();
      hide();
      return;
    }
    if (e.key !== '?') return;
    if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    if (isVisible()) hide(); else show();
  }, true);

  // First-visit auto-show
  try {
    chrome.storage?.local?.get(['seenKeyboardHints'], (res) => {
      if (!res?.seenKeyboardHints) {
        setTimeout(show, 500);
        chrome.storage.local.set({ seenKeyboardHints: true });
      }
    });
  } catch (_) { /* not in extension context */ }
}
