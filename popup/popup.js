// Popup entry: wires up DOMContentLoaded, theme, and search/global event listeners.
// All page features live in popup/modules/.
import { debounce } from '../shared/debounce.js';
import { MESSAGES } from '../shared/messages.js';
import { loadTheme as loadThemeShared, toggleTheme as toggleThemeShared } from '../shared/theme.js';
import { SEARCH_DEBOUNCE_MS } from '../shared/constants.js';
import { debug } from '../shared/debug.js';
import { openOptionsPage } from '../shared/open-options.js';

import { state } from './modules/state.js';
import { showToast } from './modules/toast.js';
import {
  setupNotificationListener,
  setupRecentlyFiredToggle,
  loadRecentlyFired,
} from './modules/notifications.js';
import { loadStatus, setupStorageListener, showCurrentTabHost } from './modules/status.js';
import { loadRules, displayRules } from './modules/rules-view.js';
import {
  setupViewTabs,
  switchView,
  setupNetworkSection,
  startNetworkRefresh,
  stopNetworkRefresh,
} from './modules/network.js';
import { setupCreateRuleModal, openBlankCreateRuleModal } from './modules/create-rule-modal.js';
import { setupPasteCurlModal, openPasteCurlModal } from './modules/paste-curl-modal.js';
import { primeLogCount, refreshHintBanner } from './modules/hint-banner.js';
import { setupKeyboardShortcuts } from './modules/keyboard.js';

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tabs[0];

  loadTheme();
  showCurrentTabHost();

  // Independent round-trips — run them together so the popup paints sooner.
  // primeLogCount is here because the hint strip needs the tab's log count to
  // tell "attached but the page hasn't reloaded" apart from "attached and
  // working", and we can't wait for the user to open the Network tab for it.
  await Promise.all([primeLogCount(), loadStatus(), loadRecentlyFired()]);
  // Last: displayRules() renders the hint strip, and by now it can see both the
  // attachment state and the log count.
  await loadRules();

  setupEventListeners();
  setupStorageListener();
  setupViewTabs();
  setupNetworkSection();
  setupCreateRuleModal();
  setupPasteCurlModal();
  setupNotificationListener();
  setupKeyboardShortcuts();

  startNetworkRefresh();
  window.addEventListener('unload', stopNetworkRefresh);
});

function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('themeToggle');
  if (!themeBtn) return;
  themeBtn.innerHTML = theme === 'dark'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>`;
}

function loadTheme() {
  loadThemeShared(updateThemeIcon);
}

function toggleTheme() {
  toggleThemeShared(updateThemeIcon);
}

function setupEventListeners() {
  setupRecentlyFiredToggle();

  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    const debouncedDisplayRules = debounce((rules) => displayRules(rules), SEARCH_DEBOUNCE_MS);
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (window.currentRules) debouncedDisplayRules(window.currentRules);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        state.searchQuery = '';
        if (window.currentRules) displayRules(window.currentRules);
      }
    });
  }

  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const filterOptions = document.getElementById('filterOptions');
  if (filterToggleBtn && filterOptions) {
    filterToggleBtn.addEventListener('click', () => {
      const isExpanded = filterOptions.style.display !== 'none';
      filterOptions.style.display = isExpanded ? 'none' : 'block';
      filterToggleBtn.classList.toggle('expanded', !isExpanded);
    });
  }

  const sortControls = [
    document.getElementById('popupSortBy'),
    document.getElementById('popupSortOrder'),
    document.getElementById('popupEnabledRulesFirst'),
  ];
  sortControls.forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      if (window.currentRules) displayRules(window.currentRules);
    });
  });

  // Single per-tab switch: toggling it attaches/detaches the debugger on the
  // current tab. Interception is per-tab — there is no separate global flag.
  document.getElementById('tabInterceptToggle').addEventListener('change', async (e) => {
    const wantOn = e.target.checked;
    const tabId = state.currentTab?.id;
    if (!tabId) {
      e.target.checked = !wantOn;
      showToast('No active tab', 'error');
      return;
    }
    const action = wantOn ? MESSAGES.ATTACH_DEBUGGER : MESSAGES.DETACH_DEBUGGER;
    try {
      await chrome.runtime.sendMessage({ action, tabId });
      // attachDebuggerToTab resolves success even if attach was refused (e.g.
      // DevTools open / restricted page), so re-sync from authoritative status.
      // Anything already logged predates this attach — don't let it count as
      // proof the page is running through the extension.
      state.interceptLogBaseline = wantOn ? state.networkLogs.length : 0;
      await loadStatus();
      const actuallyOn = document.getElementById('tabInterceptToggle').checked;
      if (wantOn && !actuallyOn) {
        state.interceptLogBaseline = 0;
        await refreshHintBanner();
        showToast('Could not intercept this tab — is DevTools open on it?', 'error');
      } else {
        showToast(
          actuallyOn ? 'Intercepting — reload the page to apply' : 'Stopped intercepting',
          'success'
        );
      }
    } catch (error) {
      debug.error('Failed to toggle interception:', error);
      e.target.checked = !wantOn;
      showToast('Failed to toggle interception', 'error');
    }
  });

  // The empty state points at the two fast paths first; writing one by hand is
  // the fallback link underneath them.
  document.getElementById('emptyRecordBtn')?.addEventListener('click', () => switchView('network'));
  document.getElementById('emptyPasteCurlBtn')?.addEventListener('click', openPasteCurlModal);

  // Creating a rule stays in the popup. The modal's "Full editor" button is the
  // one way from here into the options form, so a click on "Add Rule" never
  // closes the popup out from under the user.
  document.getElementById('addRuleBtn')?.addEventListener('click', openBlankCreateRuleModal);
  document.getElementById('emptyAddRuleBtn')?.addEventListener('click', openBlankCreateRuleModal);

  // One label per destination — see shared/open-options.js.
  document.getElementById('openOptions')?.addEventListener('click', () => openOptionsPage('settings'));
  document.getElementById('viewAllRulesBtn')?.addEventListener('click', () => openOptionsPage('rules'));
  document.getElementById('openHelpBtn')?.addEventListener('click', () => openOptionsPage('help'));
}
