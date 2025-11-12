// Popup script
let currentTab = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load status, groups, and rules
  await loadStatus();
  await loadGroups();
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

async function loadGroups() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getGroups' });
    const groups = response.groups || [];

    displayGroups(groups);
  } catch (error) {
    console.error('Failed to load groups:', error);
  }
}

function displayGroups(groups) {
  const groupsList = document.getElementById('groupsList');
  const groupsCount = document.getElementById('groupsCount');

  groupsCount.textContent = groups.length;

  if (groups.length === 0) {
    groupsList.innerHTML = `
      <div class="empty-state">
        <p>No groups configured</p>
      </div>
    `;
    return;
  }

  groupsList.innerHTML = groups.map(group => `
    <div class="group-item ${group.enabled ? '' : 'disabled'}">
      <div class="group-color-indicator" style="background-color: ${group.color}"></div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(group.name)}</div>
        ${group.description ? `<div class="group-description">${escapeHtml(group.description)}</div>` : ''}
      </div>
      <div class="group-actions">
        <div class="toggle-switch group-toggle">
          <input type="checkbox" id="group-${group.id}" class="toggle-input group-toggle-input" data-group-id="${group.id}" ${group.enabled ? 'checked' : ''}>
          <label for="group-${group.id}" class="toggle-label"></label>
        </div>
      </div>
    </div>
  `).join('');

  // Add event listeners for group toggles
  document.querySelectorAll('.group-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const groupId = e.target.dataset.groupId;
      await toggleGroup(groupId);
    });
  });
}

async function toggleGroup(groupId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'toggleGroup',
      groupId: groupId
    });

    // Reload both groups and rules to reflect the changes
    await loadGroups();
    await loadRules();
  } catch (error) {
    console.error('Failed to toggle group:', error);
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

  rulesList.innerHTML = rules.map(rule => {
    const hasJsonBody = rule.modifyType === 'replace' &&
                        rule.modification &&
                        rule.modification.type === 'json';

    return `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'}" data-rule-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-info">
          <div class="rule-name">${escapeHtml(rule.name)}</div>
          <div class="rule-pattern">${escapeHtml(rule.urlPattern)}</div>
        </div>
        <div class="rule-actions">
          ${hasJsonBody ? `<button class="btn btn-edit" data-rule-id="${rule.id}" title="Edit JSON Body">✏️</button>` : ''}
          <div class="toggle-switch rule-toggle">
            <input type="checkbox" id="rule-${rule.id}" class="toggle-input rule-toggle-input" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
            <label for="rule-${rule.id}" class="toggle-label"></label>
          </div>
        </div>
      </div>
      ${hasJsonBody ? `
      <div class="rule-edit-container" id="edit-${rule.id}" style="display: none;">
        <div class="edit-header">
          <label>JSON Response Body:</label>
          <button class="btn btn-prettify" data-rule-id="${rule.id}" title="Prettify JSON">🎨</button>
        </div>
        <textarea class="json-editor" id="json-${rule.id}" rows="8">${escapeHtml(rule.modification.value)}</textarea>
        <div class="edit-error" id="error-${rule.id}" style="display: none;"></div>
        <div class="edit-actions">
          <button class="btn btn-save" data-rule-id="${rule.id}">💾 Save</button>
          <button class="btn btn-cancel" data-rule-id="${rule.id}">❌ Cancel</button>
        </div>
      </div>
      ` : ''}
    </div>
  `}).join('');

  // Add event listeners for rule toggles
  document.querySelectorAll('.rule-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await toggleRule(ruleId);
    });
  });

  // Add event listeners for edit buttons
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      toggleEditMode(ruleId, true);
    });
  });

  // Add event listeners for prettify buttons
  document.querySelectorAll('.btn-prettify').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      prettifyJson(ruleId);
    });
  });

  // Add event listeners for save buttons
  document.querySelectorAll('.btn-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ruleId = e.target.dataset.ruleId;
      await saveJsonEdit(ruleId);
    });
  });

  // Add event listeners for cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ruleId = e.target.dataset.ruleId;
      toggleEditMode(ruleId, false);
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

function toggleEditMode(ruleId, show) {
  const editContainer = document.getElementById(`edit-${ruleId}`);
  const ruleItem = document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`);

  if (editContainer) {
    if (show) {
      editContainer.style.display = 'block';
      ruleItem.classList.add('editing');
      // Clear any previous errors
      const errorDiv = document.getElementById(`error-${ruleId}`);
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    } else {
      editContainer.style.display = 'none';
      ruleItem.classList.remove('editing');
      // Reload rules to reset the textarea content
      loadRules();
    }
  }
}

function prettifyJson(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  if (textarea) {
    try {
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      errorDiv.style.display = 'none';
    } catch (error) {
      errorDiv.textContent = `Invalid JSON: ${error.message}`;
      errorDiv.style.display = 'block';
    }
  }
}

async function saveJsonEdit(ruleId) {
  const textarea = document.getElementById(`json-${ruleId}`);
  const errorDiv = document.getElementById(`error-${ruleId}`);

  if (!textarea) return;

  // Validate JSON
  try {
    JSON.parse(textarea.value);
  } catch (error) {
    errorDiv.textContent = `Invalid JSON: ${error.message}`;
    errorDiv.style.display = 'block';
    return;
  }

  // Get the current rule
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = response.rules || [];
    const rule = rules.find(r => r.id === ruleId);

    if (rule) {
      // Update the modification value
      rule.modification.value = textarea.value;

      // Save the updated rule
      await chrome.runtime.sendMessage({
        action: 'updateRule',
        ruleId: ruleId,
        rule: rule
      });

      // Hide edit mode and reload rules
      toggleEditMode(ruleId, false);
    }
  } catch (error) {
    console.error('Failed to save JSON edit:', error);
    errorDiv.textContent = `Failed to save: ${error.message}`;
    errorDiv.style.display = 'block';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
