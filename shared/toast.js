// Shared toast factory. Single implementation that both popup and options pages
// wrap to keep their existing showToast() call signatures unchanged.
//
// Element with id={hostId} must exist in the page. Optional {label, callback, onExpire}
// turns the toast into an undo-style action banner with a longer default duration.

import { escapeHtml } from './dom.js';

const timers = new Map();

export function showToast(hostId, message, { type = 'info', action = null, duration } = {}) {
  const toast = document.getElementById(hostId);
  if (!toast) return;

  const existing = timers.get(hostId);
  if (existing) {
    clearTimeout(existing.timer);
    timers.delete(hostId);
  }

  if (!toast.hasAttribute('role')) toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  if (action && action.label && action.callback) {
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-action" type="button">${escapeHtml(action.label)}</button>
    `;
    const actionBtn = toast.querySelector('.toast-action');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = timers.get(hostId);
      if (t) {
        clearTimeout(t.timer);
        timers.delete(hostId);
      }
      toast.classList.remove('show');
      action.callback();
    }, { once: true });
  } else {
    toast.textContent = message;
  }

  toast.className = `toast ${type}`;
  toast.classList.add('show');

  const ms = duration ?? (action ? 5000 : 3000);
  const timer = setTimeout(() => {
    toast.classList.remove('show');
    timers.delete(hostId);
    if (action && action.onExpire) action.onExpire();
  }, ms);

  timers.set(hostId, { timer, action });
}

export function dismissToast(hostId) {
  const toast = document.getElementById(hostId);
  if (!toast) return;
  const existing = timers.get(hostId);
  if (existing) {
    clearTimeout(existing.timer);
    timers.delete(hostId);
  }
  toast.classList.remove('show');
}
