import { escapeHtml } from '../../shared/dom.js';
import { state } from './state.js';

// Options-page toast. Supports an optional `action` {label, callback, onExpire}
// for undo-style banners. Durations: 5s for actionable, 3s otherwise.
export function showToast(message, type = 'info', action = null) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  if (state.activeToastTimeout) {
    clearTimeout(state.activeToastTimeout);
    state.activeToastTimeout = null;
  }

  if (action && action.label && action.callback) {
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-action" type="button">${escapeHtml(action.label)}</button>
    `;

    const actionBtn = toast.querySelector('.toast-action');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.activeToastTimeout) {
        clearTimeout(state.activeToastTimeout);
        state.activeToastTimeout = null;
      }
      toast.classList.remove('show');
      action.callback();
    }, { once: true });
  } else {
    toast.textContent = message;
  }

  toast.className = `toast ${type}`;
  toast.classList.add('show');

  const duration = action ? 5000 : 3000;
  state.activeToastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    state.activeToastTimeout = null;
    if (action && action.onExpire) action.onExpire();
  }, duration);
}
