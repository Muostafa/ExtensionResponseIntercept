// Popup entry: wires up DOMContentLoaded, theme, and search/global event listeners.
// All page features live in popup/modules/.
import { debounce } from '../shared/debounce.js';
import { MESSAGES } from '../shared/messages.js';
import { loadTheme as loadThemeShared, toggleTheme as toggleThemeShared } from '../shared/theme.js';
import { SEARCH_DEBOUNCE_MS } from '../shared/constants.js';
import { debug } from '../shared/debug.js';

import { state } from './modules/state.js';
import { showToast } from './modules/toast.js';
import {
  setupNotificationListener,
  setupRecentlyFiredToggle,
  loadRecentlyFired,
  loadGroupToggles,
} from './modules/notifications.js';
import { loadStatus, updateAttachButton, setupStorageListener } from './modules/status.js';
import { loadRules, displayRules } from './modules/rules-view.js';
import {
  setupViewTabs,
  setupNetworkSection,
  startNetworkRefresh,
  stopNetworkRefresh,
} from './modules/network.js';
import { setupCreateRuleModal } from './modules/create-rule-modal.js';

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tabs[0];

  loadTheme();

  await loadStatus();
  await loadRules();
  await loadRecentlyFired();
  await loadGroupToggles();

  setupEventListeners();
  setupStorageListener();
  setupViewTabs();
  setupNetworkSection();
  setupCreateRuleModal();
  setupNotificationListener();

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

  document.getElementById('globalToggle').addEventListener('change', async (e) => {
    try {
      await chrome.runtime.sendMessage({ action: MESSAGES.TOGGLE_GLOBAL });
      const statusIndicator = document.getElementById('globalStatusIndicator');
      if (statusIndicator) statusIndicator.classList.toggle('active', e.target.checked);
      showToast(e.target.checked ? 'Interception enabled' : 'Interception disabled', 'success');
    } catch (error) {
      debug.error('Failed to toggle global:', error);
      showToast('Failed to toggle interception', 'error');
    }
  });

  document.getElementById('attachTab').addEventListener('click', async () => {
    try {
      const btnText = document.getElementById('attachBtnText');
      const isAttached = btnText?.textContent === 'Detach';
      const action = isAttached ? MESSAGES.DETACH_DEBUGGER : MESSAGES.ATTACH_DEBUGGER;

      await chrome.runtime.sendMessage({ action, tabId: state.currentTab?.id });
      updateAttachButton(!isAttached);
      showToast(isAttached ? 'Debugger detached' : 'Debugger attached', 'success');
    } catch (error) {
      debug.error('Failed to attach/detach debugger:', error);
      showToast('Failed to attach debugger', 'error');
    }
  });

  const optionsButtons = [
    document.getElementById('addRuleBtn'),
    document.getElementById('emptyAddRuleBtn'),
    document.getElementById('openOptions'),
    document.getElementById('openSettingsBtn'),
    document.getElementById('viewAllRulesBtn'),
  ];
  optionsButtons.forEach(btn => {
    btn?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  });
}
