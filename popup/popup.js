// Popup script
let currentTab = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load status and rules
  await loadStatus();
  await loadRules();

  // Setup event listeners
  setupEventListeners();
});

async function loadStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });

    // Set global toggle
    const globalToggle = document.getElementById('globalToggle');
    globalToggle.checked = response.enabled;

    // Update attach button based on tab status
    updateAttachButton(response.activeTabs.includes(currentTab?.id));
  } catch (error) {
    console.error('Failed to load status:', error);
  }
}

async function loadRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];

    displayRules(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function displayRules(rules) {
  const rulesList = document.getElementById('rulesList');
  const rulesCount = document.getElementById('rulesCount');

  rulesCount.textContent = rules.length;

  if (rules.length === 0) {
    rulesList.innerHTML = `
      <div class="empty-state">
        <p>No rules configured</p>
      </div>
    `;
    return;
  }

  rulesList.innerHTML = rules.map(rule => `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'}">
      <div class="rule-info">
        <div class="rule-name">${escapeHtml(rule.name)}</div>
        <div class="rule-pattern">${escapeHtml(rule.urlPattern)}</div>
      </div>
      <div class="rule-actions">
        <div class="toggle-switch rule-toggle">
          <input type="checkbox" id="rule-${rule.id}" class="toggle-input rule-toggle-input" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <label for="rule-${rule.id}" class="toggle-label"></label>
        </div>
      </div>
    </div>
  `).join('');

  // Add event listeners for rule toggles
  document.querySelectorAll('.rule-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await toggleRule(ruleId);
    });
  });
}

function setupEventListeners() {
  // Global toggle
  document.getElementById('globalToggle').addEventListener('change', async (e) => {
    try {
      await chrome.runtime.sendMessage({ action: 'toggleGlobal' });
      console.log('Global toggle changed:', e.target.checked);
    } catch (error) {
      console.error('Failed to toggle global:', error);
    }
  });

  // Attach debugger button
  document.getElementById('attachTab').addEventListener('click', async () => {
    try {
      const button = document.getElementById('attachTab');
      const isAttached = button.textContent === 'Detach Debugger';

      if (isAttached) {
        await chrome.runtime.sendMessage({
          action: 'detachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(false);
      } else {
        await chrome.runtime.sendMessage({
          action: 'attachDebugger',
          tabId: currentTab.id
        });
        updateAttachButton(true);
      }
    } catch (error) {
      console.error('Failed to attach/detach debugger:', error);
      alert('Failed to attach debugger. Make sure you have the necessary permissions.');
    }
  });

  // Add rule button
  document.getElementById('addRuleBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Open options button
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Open history button
  document.getElementById('openHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });
}

function updateAttachButton(isAttached) {
  const button = document.getElementById('attachTab');
  if (isAttached) {
    button.textContent = 'Detach Debugger';
    button.classList.remove('btn-primary');
    button.classList.add('btn-danger');
  } else {
    button.textContent = 'Attach Debugger';
    button.classList.remove('btn-danger');
    button.classList.add('btn-primary');
  }
}

async function toggleRule(ruleId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      rule.enabled = !rule.enabled;
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: ruleId,
        rule: rule
      });

      // Reload rules to update UI
      await loadRules();
    }
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
