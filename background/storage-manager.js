import { debounce } from '../shared/debounce.js';

// Storage Manager - Handles all storage operations
export class StorageManager {
  constructor() {
    this.rules = [];
    this.groups = [];
    this.settings = {
      globalEnabled: true,
      logging: true
    };
    this.listeners = [];
    this.groupListeners = [];
    this.QUOTA_WARNING_THRESHOLD = 0.8; // 80% of quota
    this.QUOTA_BYTES_LIMIT = 10485760; // 10MB in bytes (chrome.storage.local limit)
    this._warnedOrphanRuleIds = new Set();

    // Create debounced save methods (500ms delay)
    this.saveRulesDebounced = debounce(this.saveRules.bind(this), 500);
    this.saveGroupsDebounced = debounce(this.saveGroups.bind(this), 500);
  }

  async loadRules() {
    this._warnedOrphanRuleIds.clear();
    try {
      const data = await chrome.storage.local.get(['rules', 'settings']);

      if (data.rules) {
        this.rules = data.rules;
        // Migrate old rules without timestamps
        let needsUpdate = false;
        this.rules.forEach(rule => {
          if (!rule.createdAt) {
            rule.createdAt = Date.now();
            rule.modifiedAt = Date.now();
            needsUpdate = true;
          }
          if (!rule.contentType) {
            rule.contentType = 'application/json';
            needsUpdate = true;
          }
        });
        if (needsUpdate) {
          await this.saveRules();
        }
      } else {
        // Initialize with a sample rule
        const now = Date.now();
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
            description: 'Example rule showing how to replace API responses',
            createdAt: now,
            modifiedAt: now
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

  /**
   * Calculate approximate size of data in bytes
   */
  getDataSize(data) {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch (error) {
      console.error('Failed to calculate data size:', error);
      return 0;
    }
  }

  /**
   * Get current storage usage
   */
  async getStorageUsage() {
    try {
      const data = await chrome.storage.local.get(null);
      const totalSize = this.getDataSize(data);
      const percentUsed = (totalSize / this.QUOTA_BYTES_LIMIT) * 100;
      return {
        bytesUsed: totalSize,
        bytesAvailable: this.QUOTA_BYTES_LIMIT - totalSize,
        percentUsed: percentUsed,
        quotaExceeded: totalSize >= this.QUOTA_BYTES_LIMIT,
        nearQuota: percentUsed >= (this.QUOTA_WARNING_THRESHOLD * 100)
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return null;
    }
  }

  /**
   * Check if saving data would exceed quota
   */
  async checkStorageQuota(newData) {
    try {
      const currentData = await chrome.storage.local.get(null);
      const dataSize = this.getDataSize({ ...currentData, ...newData });
      return {
        canSave: dataSize < this.QUOTA_BYTES_LIMIT,
        estimatedSize: dataSize,
        availableSpace: this.QUOTA_BYTES_LIMIT - dataSize
      };
    } catch (error) {
      console.error('Failed to check storage quota:', error);
      return { canSave: true, estimatedSize: 0, availableSpace: this.QUOTA_BYTES_LIMIT };
    }
  }

  async saveRules() {
    try {
      // Check quota before saving
      const quotaCheck = await this.checkStorageQuota({ rules: this.rules });

      if (!quotaCheck.canSave) {
        const errorMsg = `Storage quota exceeded! Cannot save rules. Used: ${(quotaCheck.estimatedSize / 1024 / 1024).toFixed(2)}MB / 10MB`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Warn if approaching quota
      const usage = await this.getStorageUsage();
      if (usage && usage.nearQuota) {
        console.warn(`Storage usage is at ${usage.percentUsed.toFixed(1)}% (${(usage.bytesUsed / 1024 / 1024).toFixed(2)}MB / 10MB)`);
      }

      await chrome.storage.local.set({ rules: this.rules });
      this.notifyListeners();
      console.log('Rules saved successfully');
    } catch (error) {
      console.error('Failed to save rules:', error);
      throw error; // Re-throw to let caller handle
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
        if (!group) {
          // Orphaned rule: group was deleted. Disable it, but warn once per session
          // so a developer can see why the rule stopped firing.
          if (!this._warnedOrphanRuleIds.has(rule.id)) {
            this._warnedOrphanRuleIds.add(rule.id);
            console.warn(
              `Orphaned rule disabled: rule "${rule.name || '(unnamed)'}" (id=${rule.id}) references missing groupId=${rule.groupId}`
            );
          }
          return false;
        }
        return group.enabled;
      }

      return true;
    });
  }

  async addRule(rule) {
    const now = Date.now();
    const newRule = {
      ...rule,
      id: this.generateId(),
      enabled: rule.enabled !== undefined ? rule.enabled : true,
      createdAt: now,
      modifiedAt: now
    };
    this.rules.push(newRule);
    await this.saveRules();
    return newRule;
  }

  async updateRule(ruleId, updates) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules[index] = { ...this.rules[index], ...updates, modifiedAt: Date.now() };

      // If the original rule had a groupId but updates doesn't include it, remove it
      // This allows removing a rule from a group by not including groupId in updates
      if (this.rules[index].groupId && !('groupId' in updates)) {
        delete this.rules[index].groupId;
      }

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
      this.rules[index].modifiedAt = Date.now();
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
    // Pass only enabled rules (respecting both rule and group enabled status)
    this.listeners.forEach(callback => callback(this.getEnabledRules()));
  }

  flushPendingSaves() {
    this.saveRulesDebounced.flush();
    this.saveGroupsDebounced.flush();
  }

  generateId() {
    // Use crypto.randomUUID() for better uniqueness
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `rule_${crypto.randomUUID()}`;
      }
    } catch (error) {
      console.warn('crypto.randomUUID not available, using fallback');
    }

    // Fallback for older browsers - use crypto.getRandomValues for better randomness
    try {
      const array = new Uint32Array(2);
      crypto.getRandomValues(array);
      return `rule_${Date.now()}_${array[0].toString(36)}_${array[1].toString(36)}`;
    } catch (error) {
      // Last resort fallback
      return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  async exportRules() {
    return {
      version: '2.0',
      exportDate: new Date().toISOString(),
      rules: this.rules,
      groups: this.groups
    };
  }

  /**
   * Validate a rule has required fields and proper structure
   */
  validateRule(rule) {
    if (!rule || typeof rule !== 'object') {
      return { valid: false, reason: 'Rule must be an object' };
    }
    if (!rule.name || typeof rule.name !== 'string') {
      return { valid: false, reason: 'Rule must have a name' };
    }
    if (!rule.urlPattern || typeof rule.urlPattern !== 'string') {
      return { valid: false, reason: 'Rule must have a URL pattern' };
    }
    if (!rule.matchType || !['exact', 'wildcard', 'regex', 'contains'].includes(rule.matchType)) {
      return { valid: false, reason: 'Rule must have a valid match type' };
    }
    return { valid: true };
  }

  /**
   * Validate a group has required fields and proper structure
   */
  validateGroup(group) {
    if (!group || typeof group !== 'object') {
      return { valid: false, reason: 'Group must be an object' };
    }
    if (!group.name || typeof group.name !== 'string') {
      return { valid: false, reason: 'Group must have a name' };
    }
    return { valid: true };
  }

  async importRules(data) {
    let importedCount = 0;
    let importedGroupsCount = 0;
    let skippedCount = 0;

    // Import groups first (if present)
    if (data.groups && Array.isArray(data.groups)) {
      const groupIdMap = {}; // Map old IDs to new IDs

      const importedGroups = data.groups
        .filter(group => {
          const validation = this.validateGroup(group);
          if (!validation.valid) {
            console.warn('Skipping invalid group during import:', validation.reason, group);
            return false;
          }
          return true;
        })
        .map(group => {
          const oldId = group.id;
          const newGroup = {
            ...group,
            id: this.generateGroupId(),
            enabled: group.enabled !== false // Default to enabled
          };
          groupIdMap[oldId] = newGroup.id;
          return newGroup;
        });

      this.groups = [...this.groups, ...importedGroups];
      importedGroupsCount = importedGroups.length;
      await this.saveGroups();

      // Import rules and update group references
      if (data.rules && Array.isArray(data.rules)) {
        const now = Date.now();
        const validRules = [];

        for (const rule of data.rules) {
          const validation = this.validateRule(rule);
          if (!validation.valid) {
            console.warn('Skipping invalid rule during import:', validation.reason, rule);
            skippedCount++;
            continue;
          }

          const newRule = {
            ...rule,
            id: this.generateId(),
            enabled: rule.enabled !== false, // Default to enabled
            createdAt: rule.createdAt || now,
            modifiedAt: rule.modifiedAt || now
          };
          // Update groupId if rule was in a group
          if (newRule.groupId && groupIdMap[newRule.groupId]) {
            newRule.groupId = groupIdMap[newRule.groupId];
          } else if (newRule.groupId && !groupIdMap[newRule.groupId]) {
            // Group doesn't exist in import, remove reference
            delete newRule.groupId;
          }
          validRules.push(newRule);
        }

        this.rules = [...this.rules, ...validRules];
        await this.saveRules();
        importedCount = validRules.length;
      }
    } else if (data.rules && Array.isArray(data.rules)) {
      // Legacy import (v1.0) - only rules, no groups
      const now = Date.now();
      const validRules = [];

      for (const rule of data.rules) {
        const validation = this.validateRule(rule);
        if (!validation.valid) {
          console.warn('Skipping invalid rule during import:', validation.reason, rule);
          skippedCount++;
          continue;
        }

        validRules.push({
          ...rule,
          id: this.generateId(),
          enabled: rule.enabled !== false, // Default to enabled
          groupId: undefined, // Clear any group references from old import
          createdAt: rule.createdAt || now,
          modifiedAt: rule.modifiedAt || now
        });
      }

      this.rules = [...this.rules, ...validRules];
      await this.saveRules();
      importedCount = validRules.length;
    }

    if (skippedCount > 0) {
      console.warn(`Import completed: ${importedCount} rules imported, ${skippedCount} rules skipped due to validation errors`);
    }

    return { importedCount, importedGroupsCount };
  }

  async clearAllRules() {
    this.rules = [];
    await this.saveRules();
  }

  // Group Management
  async loadGroups() {
    this._warnedOrphanRuleIds.clear();
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
      // Check quota before saving
      const quotaCheck = await this.checkStorageQuota({ groups: this.groups });

      if (!quotaCheck.canSave) {
        const errorMsg = `Storage quota exceeded! Cannot save groups. Used: ${(quotaCheck.estimatedSize / 1024 / 1024).toFixed(2)}MB / 10MB`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      await chrome.storage.local.set({ groups: this.groups });
      this.notifyGroupListeners();
      console.log('Groups saved successfully');
    } catch (error) {
      console.error('Failed to save groups:', error);
      throw error; // Re-throw to let caller handle
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

  async deleteGroup(groupId, deleteRules = false) {
    const index = this.groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      if (deleteRules) {
        // Delete all rules in this group
        this.rules = this.rules.filter(rule => rule.groupId !== groupId);
      } else {
        // Remove group reference from all rules (rules become ungrouped)
        this.rules.forEach(rule => {
          if (rule.groupId === groupId) {
            delete rule.groupId;
          }
        });
      }
      this.groups.splice(index, 1);
      await this.saveGroups();
      await this.saveRules(); // Save rules to persist changes
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
      rule.modifiedAt = Date.now();
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
    // Use crypto.randomUUID() for better uniqueness
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `group_${crypto.randomUUID()}`;
      }
    } catch (error) {
      console.warn('crypto.randomUUID not available, using fallback');
    }

    // Fallback for older browsers - use crypto.getRandomValues for better randomness
    try {
      const array = new Uint32Array(2);
      crypto.getRandomValues(array);
      return `group_${Date.now()}_${array[0].toString(36)}_${array[1].toString(36)}`;
    } catch (error) {
      // Last resort fallback
      return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
}
