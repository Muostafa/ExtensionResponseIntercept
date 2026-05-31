// Options page entry: bootstrap, theme, top-level event wiring, keyboard shortcuts.
// Page features live in options/modules/.
import { debounce } from '../shared/debounce.js';
import { loadTheme as loadThemeShared, toggleTheme as toggleThemeShared } from '../shared/theme.js';
import { testUrlPattern } from '../shared/url-matching.js';
import { SEARCH_DEBOUNCE_MS } from '../shared/constants.js';
import { confirmModal } from '../shared/confirm-modal.js';
import { MESSAGES } from '../shared/messages.js';

import { state } from './modules/state.js';
import { showToast } from './modules/toast.js';
import { setupNavigation, showTab } from './modules/navigation.js';
import { loadGroups, openGroupModal, saveGroup, closeGroupModal, closeDeleteGroupModal, confirmDeleteGroup } from './modules/groups.js';
import {
  loadRules,
  displayRules,
  collapseAllGroups,
  expandAllGroups,
  filterOptionsRules,
  recordRuleFired,
} from './modules/rules-view.js';
import { loadInterceptionStatus, setupInterceptionStatus } from './modules/status.js';
import {
  saveRule,
  resetForm,
  updateResponseTypeUI,
  fileToBase64,
  fetchUrlAsBase64,
  updateBinaryPreview,
  updateMatchTypeHint,
  prettifyJsonInTextarea,
  addHeaderModification,
  clearHeaderModifications,
} from './modules/rule-form.js';
import {
  exportRules,
  copyExport,
  openPasteImportModal,
  closePasteImportModal,
  confirmPasteImport,
  importRules,
  clearAllRules,
} from './modules/import-export.js';
import { setupJsonEditorListeners } from './modules/json-editor.js';
import { setupKeyboardHints } from './modules/keyboard-hints.js';

document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await loadGroups();
  await loadRules();
  setupEventListeners();
  setupNavigation();
  setupThemeToggle();
  setupKeyboardShortcuts();
  setupKeyboardHints();
  setupJsonEditorListeners();
  setupInterceptionStatus();
  setupActivityListener();
  loadInterceptionStatus();
});

// Live-update per-rule activity chips when the background broadcasts a fire.
function setupActivityListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === MESSAGES.RULE_TRIGGERED && message.notification) {
      recordRuleFired(message.notification.ruleId, message.notification.timestamp);
    }
    return false;
  });
}

function updateThemeButton(theme) {
  const themeToggle = document.getElementById('themeToggle');
  const themeText = document.getElementById('themeText');
  if (!themeToggle || !themeText) return;
  themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  themeToggle.innerHTML = theme === 'dark'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
      <span id="themeText">Light Mode</span>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
      <span id="themeText">Dark Mode</span>`;
}

function loadTheme() {
  loadThemeShared(updateThemeButton);
}

function toggleTheme() {
  const next = toggleThemeShared(updateThemeButton);
  showToast(`Switched to ${next} mode`, 'success');
}

function setupThemeToggle() {
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
}

function setupEventListeners() {
  // Rule sorting and filtering controls
  const sortControls = [
    document.getElementById('ruleSortBy'),
    document.getElementById('ruleSortOrder'),
    document.getElementById('enabledRulesFirst'),
  ];
  sortControls.forEach(el => {
    el?.addEventListener('change', () => {
      if (window.currentRules) displayRules(window.currentRules);
    });
  });

  // Options search bar
  const optionsSearchInput = document.getElementById('optionsSearch');
  const optionsClearSearchBtn = document.getElementById('optionsClearSearch');
  if (optionsSearchInput) {
    const debouncedFilter = debounce((q) => filterOptionsRules(q), SEARCH_DEBOUNCE_MS);
    optionsSearchInput.addEventListener('input', (e) => {
      state.optionsSearchQuery = e.target.value;
      debouncedFilter(state.optionsSearchQuery);
    });
    optionsSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        optionsSearchInput.value = '';
        state.optionsSearchQuery = '';
        filterOptionsRules('');
      }
    });
  }
  optionsClearSearchBtn?.addEventListener('click', () => {
    const input = document.getElementById('optionsSearch');
    if (input) input.value = '';
    state.optionsSearchQuery = '';
    filterOptionsRules('');
  });

  // Status code presets — rule form
  const ruleFormStatusPresets = document.getElementById('ruleFormStatusPresets');
  if (ruleFormStatusPresets) {
    ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('modifyStatusCode');
        if (input) {
          input.value = btn.dataset.code;
          ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
    document.getElementById('modifyStatusCode')?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      ruleFormStatusPresets.querySelectorAll('.status-preset').forEach(b => {
        b.classList.toggle('active', b.dataset.code === val);
      });
    });
  }

  // Response content type selector
  document.getElementById('responseContentType')?.addEventListener('change', (e) => {
    updateResponseTypeUI(e.target.value);
  });

  document.getElementById('customIsBinary')?.addEventListener('change', () => {
    const isBin = document.getElementById('customIsBinary')?.checked;
    document.getElementById('textBodyPanel').style.display = isBin ? 'none' : 'block';
    document.getElementById('binaryBodyPanel').style.display = isBin ? 'block' : 'none';
  });

  // Binary input tabs
  document.querySelectorAll('.binary-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.binary-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.binary-input-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      const tabId = `binary${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}Tab`;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.style.display = 'block';
    });
  });

  // File upload → base64
  document.getElementById('binaryFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const info = document.getElementById('binaryFileInfo');
    if (info) info.textContent = `Loading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
    try {
      const base64 = await fileToBase64(file);
      const b64El = document.getElementById('binaryBase64Value');
      if (b64El) b64El.value = base64;
      document.querySelector('.binary-tab-btn[data-tab="paste"]')?.click();
      if (info) info.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      const ct = document.getElementById('responseContentType')?.value || file.type;
      updateBinaryPreview(base64, ct);
    } catch (err) {
      if (info) info.textContent = `Error: ${err.message}`;
    }
  });

  // Fetch URL → base64
  document.getElementById('binaryFetchBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('binaryFetchUrl')?.value.trim();
    const status = document.getElementById('binaryFetchStatus');
    if (!url) return;
    if (status) { status.textContent = 'Fetching...'; status.style.color = 'var(--text-secondary)'; }
    try {
      const base64 = await fetchUrlAsBase64(url);
      const b64El = document.getElementById('binaryBase64Value');
      if (b64El) b64El.value = base64;
      document.querySelector('.binary-tab-btn[data-tab="paste"]')?.click();
      if (status) { status.textContent = 'Fetched and encoded successfully'; status.style.color = 'var(--color-success, green)'; }
      const ct = document.getElementById('responseContentType')?.value;
      updateBinaryPreview(base64, ct);
    } catch (err) {
      if (status) { status.textContent = `Error: ${err.message}`; status.style.color = 'var(--color-error, red)'; }
    }
  });

  // URL pattern tester
  document.getElementById('toggleUrlTester')?.addEventListener('click', () => {
    const panel = document.getElementById('urlTesterPanel');
    const btn = document.getElementById('toggleUrlTester');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('open', isHidden);
    const textEl = btn.querySelector('.rf-trigger-text');
    if (textEl) textEl.textContent = isHidden ? 'Hide Tester' : 'Test Pattern';
  });

  function runUrlTest() {
    const testUrl = document.getElementById('testUrlInput')?.value.trim();
    const pattern = document.getElementById('urlPattern')?.value.trim();
    const matchType = document.getElementById('matchType')?.value || 'wildcard';
    const resultEl = document.getElementById('urlTestResult');
    if (!resultEl) return;

    if (!testUrl || !pattern) {
      resultEl.textContent = 'Enter both a URL pattern and a test URL.';
      resultEl.className = 'url-test-result warn';
      resultEl.style.display = 'block';
      return;
    }
    const matched = testUrlPattern(testUrl, pattern, matchType);
    resultEl.textContent = matched ? '✓ Match' : '✗ No match';
    resultEl.className = `url-test-result ${matched ? 'match' : 'no-match'}`;
    resultEl.style.display = 'block';
  }

  document.getElementById('testUrlBtn')?.addEventListener('click', runUrlTest);
  document.getElementById('testUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runUrlTest(); }
  });

  // Add new rule + empty-state buttons
  document.getElementById('addNewRuleBtn').addEventListener('click', () => {
    state.currentEditingRuleId = null;
    resetForm();
    showTab('new-rule');
  });

  document.getElementById('emptyStateCreateRuleBtn').addEventListener('click', () => {
    state.currentEditingRuleId = null;
    resetForm();
    showTab('new-rule');
  });

  document.getElementById('emptyStateImportBtn')?.addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  // Collapse/Expand all buttons
  document.getElementById('collapseAllBtn')?.addEventListener('click', collapseAllGroups);
  document.getElementById('expandAllBtn')?.addEventListener('click', expandAllGroups);

  // Form submit
  document.getElementById('ruleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveRule();
  });

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    state.currentEditingRuleId = null;
    resetForm();
    showTab('rules');
  });

  document.getElementById('matchType')?.addEventListener('change', updateMatchTypeHint);
  updateMatchTypeHint();

  document.getElementById('prettifyJsonBtn').addEventListener('click', prettifyJsonInTextarea);

  // Import/Export buttons
  document.getElementById('exportBtn').addEventListener('click', exportRules);
  document.getElementById('copyExportBtn').addEventListener('click', copyExport);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importRules);
  document.getElementById('pasteImportBtn').addEventListener('click', openPasteImportModal);
  document.getElementById('closePasteImportModal').addEventListener('click', closePasteImportModal);
  document.getElementById('cancelPasteImportBtn').addEventListener('click', closePasteImportModal);
  document.getElementById('confirmPasteImportBtn').addEventListener('click', confirmPasteImport);
  document.getElementById('pasteImportModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('pasteImportModal')) closePasteImportModal();
  });
  document.getElementById('clearAllBtn').addEventListener('click', clearAllRules);

  // Header modification buttons
  document.getElementById('addHeaderBtn').addEventListener('click', () => addHeaderModification());
  document.getElementById('clearHeadersBtn').addEventListener('click', async () => {
    if (document.querySelectorAll('#headerModifications .header-mod-row').length === 0) return;
    const ok = await confirmModal({
      title: 'Clear all header modifications?',
      message: 'All header rules on this form will be removed.',
      confirmLabel: 'Clear',
      cancelLabel: 'Keep',
      danger: true,
    });
    if (ok) clearHeaderModifications();
  });

  // Group management buttons
  document.getElementById('addNewGroupBtn')?.addEventListener('click', openGroupModal);
  document.getElementById('groupForm')?.addEventListener('submit', saveGroup);
  document.getElementById('closeGroupModal')?.addEventListener('click', closeGroupModal);
  document.getElementById('cancelGroupBtn')?.addEventListener('click', closeGroupModal);
  document.getElementById('groupModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'groupModal') closeGroupModal();
  });

  // Delete group modal buttons
  document.getElementById('closeDeleteGroupModal')?.addEventListener('click', closeDeleteGroupModal);
  document.getElementById('cancelDeleteGroupBtn')?.addEventListener('click', closeDeleteGroupModal);
  document.getElementById('confirmDeleteGroupBtn')?.addEventListener('click', confirmDeleteGroup);
  document.getElementById('deleteGroupModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'deleteGroupModal') closeDeleteGroupModal();
  });

  // Method chips — toggle hidden checkboxes
  document.querySelectorAll('.rf-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const method = chip.dataset.method;
      const checkbox = document.querySelector(`input.rf-chip-input[value="${method}"]`);
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      chip.classList.toggle('rf-chip-active', checkbox.checked);
    });
  });

  // Status stepper +/−
  document.getElementById('statusDecBtn')?.addEventListener('click', () => {
    const input = document.getElementById('modifyStatusCode');
    if (!input) return;
    const val = parseInt(input.value) || 200;
    input.value = Math.max(100, val - 1);
    input.dispatchEvent(new Event('input'));
  });
  document.getElementById('statusIncBtn')?.addEventListener('click', () => {
    const input = document.getElementById('modifyStatusCode');
    if (!input) return;
    const val = parseInt(input.value) || 199;
    input.value = Math.min(599, val + 1);
    input.dispatchEvent(new Event('input'));
  });

  // Delay slider readout
  const delaySlider = document.getElementById('ruleDelay');
  const delayReadout = document.getElementById('delayReadout');
  if (delaySlider && delayReadout) {
    const updateDelayReadout = () => {
      const v = parseInt(delaySlider.value) || 0;
      delayReadout.textContent = v === 0 ? 'off' : `${v} ms`;
    };
    delaySlider.addEventListener('input', updateDelayReadout);
    updateDelayReadout();
  }

  // Collapsible description and headers
  [['toggleDescription', 'descriptionBody'], ['toggleHeadersSection', 'headersBody']].forEach(([triggerId, bodyId]) => {
    document.getElementById(triggerId)?.addEventListener('click', () => {
      const body = document.getElementById(bodyId);
      const trigger = document.getElementById(triggerId);
      if (!body || !trigger) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      trigger.classList.toggle('open', !isOpen);
    });
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    // Alt + N: New rule (Ctrl+N is reserved by Chrome for new window)
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      state.currentEditingRuleId = null;
      resetForm();
      showTab('new-rule');
      document.getElementById('ruleName')?.focus();
      showToast('Creating new rule (Alt+N)', 'info');
    }

    // Ctrl/Cmd + S: Save current form (if on new-rule tab)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 's') {
      const newRuleTab = document.getElementById('new-rule-tab');
      if (newRuleTab && newRuleTab.classList.contains('active')) {
        e.preventDefault();
        document.getElementById('ruleForm')?.requestSubmit();
      }
    }

    // Escape: back to rules list
    if (e.key === 'Escape') {
      const newRuleTab = document.getElementById('new-rule-tab');
      if (newRuleTab && newRuleTab.classList.contains('active')) {
        showTab('rules');
      }
    }

    // Ctrl/Cmd + F: search (rules tab)
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const rulesTab = document.getElementById('rules-tab');
      if (rulesTab && rulesTab.classList.contains('active')) {
        e.preventDefault();
        showToast('Search rules with the filter options', 'info');
      }
    }

    // 1-4: tab navigation
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tabMap = { '1': 'rules', '2': 'new-rule', '3': 'import-export', '4': 'help' };
      if (tabMap[e.key]) showTab(tabMap[e.key]);
    }
  });
}

// Inline help section in options.html calls window.showTab(...) — keep this exposed.
window.showTab = showTab;
