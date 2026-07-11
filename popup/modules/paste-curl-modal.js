// "Paste cURL or URL" — the third way into a rule, alongside the full options
// form and the network inspector's "+ Rule".
//
// A parsed cURL command is log-entry shaped, so this hands straight off to the
// same create-rule modal the network inspector uses. No new rule-building code.

import { parseCurl } from '../../shared/curl.js';
import { showToast } from './toast.js';
import { openCreateRuleModal } from './create-rule-modal.js';

export function setupPasteCurlModal() {
  const modal = document.getElementById('pasteCurlModal');
  const overlay = modal?.querySelector('.modal-overlay');

  document.getElementById('pasteCurlBtn')?.addEventListener('click', openPasteCurlModal);
  document.getElementById('closePasteCurlModal')?.addEventListener('click', closePasteCurlModal);
  document.getElementById('cancelPasteCurl')?.addEventListener('click', closePasteCurlModal);
  overlay?.addEventListener('click', closePasteCurlModal);
  document.getElementById('confirmPasteCurl')?.addEventListener('click', confirmPasteCurl);

  // Ctrl/Cmd+Enter to submit — the textarea swallows plain Enter.
  document.getElementById('pasteCurlInput')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      confirmPasteCurl();
    }
  });
}

function openPasteCurlModal() {
  const input = document.getElementById('pasteCurlInput');
  if (input) input.value = '';
  const modal = document.getElementById('pasteCurlModal');
  if (modal) modal.style.display = 'flex';
  input?.focus();
}

function closePasteCurlModal() {
  const modal = document.getElementById('pasteCurlModal');
  if (modal) modal.style.display = 'none';
}

function confirmPasteCurl() {
  const text = document.getElementById('pasteCurlInput')?.value || '';

  let entry;
  try {
    entry = parseCurl(text);
  } catch (error) {
    showToast(error.message || 'Could not parse that cURL command', 'error');
    return;
  }

  closePasteCurlModal();
  openCreateRuleModal(entry);
}
