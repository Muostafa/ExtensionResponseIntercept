import { showToast as sharedShowToast } from '../../shared/toast.js';

export function showToast(message, type = 'info') {
  sharedShowToast('toast', message, { type });
}
