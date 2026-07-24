import { MESSAGES } from '../../shared/messages.js';
import { isRestrictedUrl } from '../../shared/constants.js';
import { debug } from '../../shared/debug.js';
import { state } from './state.js';
import { loadRules } from './rules-view.js';
import { refreshHintBanner } from './hint-banner.js';

export async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_STATUS });
    const activeTabs = response?.activeTabs || [];
    const tabId = state.currentTab?.id;
    const restricted = isRestrictedUrl(state.currentTab?.url);
    updateTabToggle(activeTabs.includes(tabId), restricted);
    await refreshHintBanner({ attached: activeTabs.includes(tabId) && !restricted });
  } catch (error) {
    debug.error('Failed to load status:', error);
  }
}

/** Show which tab the per-tab toggle actually acts on. */
export function showCurrentTabHost() {
  const el = document.getElementById('tabInterceptHost');
  if (!el) return;
  try {
    el.textContent = new URL(state.currentTab?.url || '').host;
  } catch {
    el.textContent = ''; // no URL yet, or not a parseable one
  }
  el.title = state.currentTab?.url || '';
}

/**
 * Sync the "Intercept this tab" toggle + indicator with the current tab's
 * attachment state. On restricted pages (chrome://, extension pages, …) the
 * toggle is disabled with an explanatory hint.
 */
export function updateTabToggle(isAttached, restricted = false) {
  const toggle = document.getElementById('tabInterceptToggle');
  const indicator = document.getElementById('tabInterceptIndicator');
  const hint = document.getElementById('tabInterceptHint');

  if (toggle) {
    toggle.checked = isAttached && !restricted;
    toggle.disabled = restricted;
  }
  if (indicator) {
    indicator.classList.toggle('active', isAttached && !restricted);
  }
  if (hint) {
    if (restricted) {
      hint.textContent = 'Not available on this page';
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
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
  });
}
