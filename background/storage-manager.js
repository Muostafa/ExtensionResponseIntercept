// Storage Manager - Handles all storage operations
export class StorageManager {
  constructor() {
    this.rules = [];
    this.groups = [];
    this.settings = {
      globalEnabled: true,
      logging: true,
      maxHistoryItems: 100
    };
    this.history = [];
    this.recordings = [];
    this.listeners = [];
    this.groupListeners = [];
    this.historyListeners = [];
  }

  async loadRules() {
    try {
      const data = await chrome.storage.local.get(['rules', 'settings']);

      if (data.rules) {
        this.rules = data.rules;
      } else {
        // Initialize with a sample rule
        this.rules = [
          {
            id: this.generateId(),
            name: 'Example Rule - Modify JSON response',
            enabled: false,
            urlPattern: '*://*/api/*',
            matchType: 'wildcard',
            methods: ['GET', 'POST'],
            modifyType: 'replace',
            modification: {
              type: 'json',
              value: JSON.stringify({ message: 'Modified by API Interceptor', success: true }, null, 2)
            },
            description: 'Example rule showing how to replace API responses'
          }
        ];
        await this.saveRules();
      }

      if (data.settings) {
        this.settings = data.settings;
      } else {
        await this.saveSettings();
      }

      console.log('Rules loaded:', this.rules);
    } catch (error) {
      console.error('Failed to load rules:', error);
    }
  }

  async saveRules() {
    try {
      await chrome.storage.local.set({ rules: this.rules });
      this.notifyListeners();
      console.log('Rules saved');
    } catch (error) {
      console.error('Failed to save rules:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ settings: this.settings });
      console.log('Settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  getRules() {
    return this.rules;
  }

  getEnabledRules() {
    return this.rules.filter(rule => {
      // Rule must be enabled
      if (!rule.enabled) return false;

      // If rule belongs to a group, the group must also be enabled
      if (rule.groupId) {
        const group = this.groups.find(g => g.id === rule.groupId);
        return group ? group.enabled : true; // If group not found, allow rule
      }

      return true;
    });
  }

  async addRule(rule) {
    const newRule = {
      ...rule,
      id: this.generateId(),
      enabled: rule.enabled !== undefined ? rule.enabled : true
    };
    this.rules.push(newRule);
    await this.saveRules();
    return newRule;
  }

  async updateRule(ruleId, updates) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules[index] = { ...this.rules[index], ...updates };
      await this.saveRules();
      return this.rules[index];
    }
    return null;
  }

  async deleteRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      await this.saveRules();
      return true;
    }
    return false;
  }

  async toggleRuleEnabled(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules[index].enabled = !this.rules[index].enabled;
      await this.saveRules();
      return this.rules[index].enabled;
    }
    return null;
  }

  isGlobalEnabled() {
    return this.settings.globalEnabled;
  }

  async toggleGlobalEnabled() {
    this.settings.globalEnabled = !this.settings.globalEnabled;
    await this.saveSettings();
    return this.settings.globalEnabled;
  }

  async setGlobalEnabled(enabled) {
    this.settings.globalEnabled = enabled;
    await this.saveSettings();
  }

  isLoggingEnabled() {
    return this.settings.logging;
  }

  async toggleLogging() {
    this.settings.logging = !this.settings.logging;
    await this.saveSettings();
    return this.settings.logging;
  }

  onRulesChanged(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach(callback => callback(this.rules));
  }

  generateId() {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async exportRules() {
    return {
      version: '2.0',
      exportDate: new Date().toISOString(),
      rules: this.rules,
      groups: this.groups
    };
  }

  async importRules(data) {
    let importedCount = 0;

    // Import groups first (if present)
    if (data.groups && Array.isArray(data.groups)) {
      const groupIdMap = {}; // Map old IDs to new IDs

      const importedGroups = data.groups.map(group => {
        const oldId = group.id;
        const newGroup = {
          ...group,
          id: this.generateGroupId()
        };
        groupIdMap[oldId] = newGroup.id;
        return newGroup;
      });

      this.groups = [...this.groups, ...importedGroups];
      await this.saveGroups();

      // Import rules and update group references
      if (data.rules && Array.isArray(data.rules)) {
        const importedRules = data.rules.map(rule => {
          const newRule = {
            ...rule,
            id: this.generateId()
          };
          // Update groupId if rule was in a group
          if (newRule.groupId && groupIdMap[newRule.groupId]) {
            newRule.groupId = groupIdMap[newRule.groupId];
          }
          return newRule;
        });
        this.rules = [...this.rules, ...importedRules];
        await this.saveRules();
        importedCount = importedRules.length;
      }
    } else if (data.rules && Array.isArray(data.rules)) {
      // Legacy import (v1.0) - only rules, no groups
      const importedRules = data.rules.map(rule => ({
        ...rule,
        id: this.generateId(),
        groupId: undefined // Clear any group references from old import
      }));
      this.rules = [...this.rules, ...importedRules];
      await this.saveRules();
      importedCount = importedRules.length;
    }

    return importedCount;
  }

  async clearAllRules() {
    this.rules = [];
    await this.saveRules();
  }

  // Group Management
  async loadGroups() {
    try {
      const data = await chrome.storage.local.get(['groups']);
      if (data.groups) {
        this.groups = data.groups;
      } else {
        // Initialize with default groups
        this.groups = [
          {
            id: this.generateGroupId(),
            name: 'Development',
            enabled: true,
            description: 'Rules for development environment',
            color: '#4CAF50'
          },
          {
            id: this.generateGroupId(),
            name: 'Testing',
            enabled: true,
            description: 'Rules for testing purposes',
            color: '#2196F3'
          }
        ];
        await this.saveGroups();
      }
      console.log('Groups loaded:', this.groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }

  async saveGroups() {
    try {
      await chrome.storage.local.set({ groups: this.groups });
      this.notifyGroupListeners();
      console.log('Groups saved');
    } catch (error) {
      console.error('Failed to save groups:', error);
    }
  }

  getGroups() {
    return this.groups;
  }

  getGroupById(groupId) {
    return this.groups.find(g => g.id === groupId);
  }

  async addGroup(group) {
    const newGroup = {
      ...group,
      id: this.generateGroupId(),
      enabled: group.enabled !== undefined ? group.enabled : true
    };
    this.groups.push(newGroup);
    await this.saveGroups();
    return newGroup;
  }

  async updateGroup(groupId, updates) {
    const index = this.groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      this.groups[index] = { ...this.groups[index], ...updates };
      await this.saveGroups();
      // Also notify rule listeners since group changes affect enabled rules
      this.notifyListeners();
      return this.groups[index];
    }
    return null;
  }

  async deleteGroup(groupId) {
    const index = this.groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      // Remove group reference from all rules
      this.rules.forEach(rule => {
        if (rule.groupId === groupId) {
          delete rule.groupId;
        }
      });
      this.groups.splice(index, 1);
      await this.saveGroups();
      await this.saveRules(); // Save rules to persist removed groupId references
      return true;
    }
    return false;
  }

  async toggleGroupEnabled(groupId) {
    const index = this.groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      this.groups[index].enabled = !this.groups[index].enabled;
      await this.saveGroups();
      // Also notify rule listeners since group changes affect enabled rules
      this.notifyListeners();
      return this.groups[index].enabled;
    }
    return null;
  }

  async assignRuleToGroup(ruleId, groupId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      if (groupId === null) {
        delete rule.groupId;
      } else {
        rule.groupId = groupId;
      }
      await this.saveRules();
      return true;
    }
    return false;
  }

  getRulesByGroup(groupId) {
    return this.rules.filter(rule => rule.groupId === groupId);
  }

  getUngroupedRules() {
    return this.rules.filter(rule => !rule.groupId);
  }

  onGroupsChanged(callback) {
    this.groupListeners.push(callback);
  }

  notifyGroupListeners() {
    this.groupListeners.forEach(callback => callback(this.groups));
  }

  generateGroupId() {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // History Management
  async addHistoryEntry(entry) {
    const historyEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...entry
    };

    this.history.unshift(historyEntry); // Add to beginning

    // Limit history size
    if (this.history.length > this.settings.maxHistoryItems) {
      this.history = this.history.slice(0, this.settings.maxHistoryItems);
    }

    await this.saveHistory();
    this.notifyHistoryListeners();
    return historyEntry;
  }

  async loadHistory() {
    try {
      const data = await chrome.storage.local.get(['history']);
      if (data.history) {
        this.history = data.history;
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  async saveHistory() {
    try {
      await chrome.storage.local.set({ history: this.history });
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  getHistory(limit = null) {
    if (limit) {
      return this.history.slice(0, limit);
    }
    return this.history;
  }

  async clearHistory() {
    this.history = [];
    await this.saveHistory();
    this.notifyHistoryListeners();
  }

  onHistoryChanged(callback) {
    this.historyListeners.push(callback);
  }

  notifyHistoryListeners() {
    this.historyListeners.forEach(callback => callback(this.history));
  }

  // Recording Management
  async addRecording(recording) {
    const newRecording = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...recording
    };

    this.recordings.push(newRecording);
    await this.saveRecordings();
    return newRecording;
  }

  async loadRecordings() {
    try {
      const data = await chrome.storage.local.get(['recordings']);
      if (data.recordings) {
        this.recordings = data.recordings;
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  }

  async saveRecordings() {
    try {
      await chrome.storage.local.set({ recordings: this.recordings });
    } catch (error) {
      console.error('Failed to save recordings:', error);
    }
  }

  getRecordings() {
    return this.recordings;
  }

  getRecordingById(id) {
    return this.recordings.find(r => r.id === id);
  }

  async deleteRecording(recordingId) {
    const index = this.recordings.findIndex(r => r.id === recordingId);
    if (index !== -1) {
      this.recordings.splice(index, 1);
      await this.saveRecordings();
      return true;
    }
    return false;
  }

  async clearAllRecordings() {
    this.recordings = [];
    await this.saveRecordings();
  }
}
