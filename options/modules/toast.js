import { showToast as sharedShowToast } from '../../shared/toast.js';

// Options-page toast. The `action` arg keeps the undo-banner contract that
// options modules depend on; the shared module honors it.
export function showToast(message, type = 'info', action = null) {
  sharedShowToast('toast', message, { type, action });
}
