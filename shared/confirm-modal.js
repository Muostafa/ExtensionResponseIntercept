// Promise-based confirm modal. Replaces native confirm() with a styled,
// accessible dialog. Creates DOM on first call and reuses it thereafter.
//
//   const ok = await confirmModal({ title, message, danger: true });
//   if (!ok) return;

import { escapeHtml } from './dom.js';
import { icon } from './icons.js';

let modalEl = null;
let activeResolver = null;

function buildModal() {
  const root = document.createElement('div');
  root.className = 'confirm-modal';
  root.id = 'sharedConfirmModal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'sharedConfirmTitle');
  root.style.display = 'none';
  root.innerHTML = `
    <div class="confirm-modal-backdrop" data-confirm-action="cancel"></div>
    <div class="confirm-modal-dialog" role="document">
      <div class="confirm-modal-icon" aria-hidden="true">${icon('alert', { size: 24 })}</div>
      <div class="confirm-modal-content">
        <h3 class="confirm-modal-title" id="sharedConfirmTitle"></h3>
        <p class="confirm-modal-message"></p>
      </div>
      <div class="confirm-modal-actions">
        <button type="button" class="btn btn-secondary confirm-modal-cancel" data-confirm-action="cancel"></button>
        <button type="button" class="btn confirm-modal-confirm" data-confirm-action="confirm"></button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  root.addEventListener('click', (e) => {
    const action = e.target?.dataset?.confirmAction;
    if (action === 'cancel') resolveModal(false);
    if (action === 'confirm') resolveModal(true);
  });

  document.addEventListener('keydown', (e) => {
    if (modalEl?.style.display !== 'flex') return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      resolveModal(false);
    }
    if (e.key === 'Enter' && e.target?.classList?.contains('confirm-modal-confirm')) {
      resolveModal(true);
    }
  }, true);

  return root;
}

function resolveModal(value) {
  if (!modalEl) return;
  modalEl.style.display = 'none';
  const r = activeResolver;
  activeResolver = null;
  if (r) r(value);
}

export function confirmModal({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  if (!modalEl) modalEl = buildModal();

  modalEl.querySelector('.confirm-modal-title').textContent = title;
  modalEl.querySelector('.confirm-modal-message').innerHTML = escapeHtml(message);

  const confirmBtn = modalEl.querySelector('.confirm-modal-confirm');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = `btn confirm-modal-confirm ${danger ? 'btn-danger' : 'btn-primary'}`;

  modalEl.querySelector('.confirm-modal-cancel').textContent = cancelLabel;
  modalEl.classList.toggle('confirm-modal-danger', !!danger);

  modalEl.style.display = 'flex';

  return new Promise((resolve) => {
    activeResolver = resolve;
    requestAnimationFrame(() => confirmBtn.focus());
  });
}
