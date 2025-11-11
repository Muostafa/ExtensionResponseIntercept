// Storage Manager - Handles all storage operations
export class StorageManager {
  constructor() {
    this.rules = [];
    this.settings = {
      globalEnabled: true,
      logging: true,
      maxHistoryItems: 100
    };
    this.history = [];
    this.recordings = [];
    this.listeners = [];
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
    return this.rules.filter(rule => rule.enabled);
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
      version: '1.0',
      exportDate: new Date().toISOString(),
      rules: this.rules
    };
  }

  async importRules(data) {
    if (data.rules && Array.isArray(data.rules)) {
      // Regenerate IDs to avoid conflicts
      const importedRules = data.rules.map(rule => ({
        ...rule,
        id: this.generateId()
      }));
      this.rules = [...this.rules, ...importedRules];
      await this.saveRules();
      return importedRules.length;
    }
    return 0;
  }

  async clearAllRules() {
    this.rules = [];
    await this.saveRules();
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
