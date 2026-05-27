import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';
import { state } from './state.js';
import { loadRules } from './rules-view.js';

export async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_STATUS });

    const globalToggle = document.getElementById('globalToggle');
    globalToggle.checked = response.enabled;

    const statusIndicator = document.getElementById('globalStatusIndicator');
    if (statusIndicator) {
      statusIndicator.classList.toggle('active', response.enabled);
    }

    updateAttachButton(response.activeTabs.includes(state.currentTab?.id));
  } catch (error) {
    debug.error('Failed to load status:', error);
  }
}

export function updateAttachButton(isAttached) {
  const button = document.getElementById('attachTab');
  const btnText = document.getElementById('attachBtnText');

  if (isAttached) {
    if (btnText) btnText.textContent = 'Detach';
    button.classList.remove('btn-primary');
    button.classList.add('btn-primary', 'attached');
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      <span id="attachBtnText">Detach</span>
    `;
  } else {
    if (btnText) btnText.textContent = 'Attach Debugger';
    button.classList.remove('attached');
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      <span id="attachBtnText">Attach Debugger</span>
    `;
  }
}

export function setupStorageListener() {
  let reloadPending = false;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.rules || changes.groups) {
      if (!reloadPending) {
        reloadPending = true;
        Promise.resolve().then(() => {
          reloadPending = false;
          loadRules();
        });
      }
    }

    if (changes.settings) {
      loadStatus();
    }
  });
}
