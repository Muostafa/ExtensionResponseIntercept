// Main service worker for API Response Interceptor
import { StorageManager } from './storage-manager.js';
import { RuleEngine } from './rule-engine.js';
import { ResponseInterceptor } from './interceptor.js';

class ServiceWorker {
  constructor() {
    this.storageManager = new StorageManager();
    this.ruleEngine = new RuleEngine();
    this.interceptor = new ResponseInterceptor(this.ruleEngine, this.storageManager);
    this.activeTabs = new Set();
    this.recentNotifications = []; // Store recent rule triggered notifications
    this.MAX_NOTIFICATIONS = 50; // Limit notifications to prevent memory issues
    this.init();
  }

  async init() {
    console.log('API Response Interceptor - Service Worker initialized');

    // Load rules and groups from storage
    await this.storageManager.loadRules();
    await this.storageManager.loadGroups();
    this.ruleEngine.setRules(this.storageManager.getEnabledRules());

    // Listen for settings changes
    this.storageManager.onRulesChanged((rules) => {
      this.ruleEngine.setRules(rules);
    });

    // Set up rule triggered notifications
    this.interceptor.onRuleTriggered((notification) => {
      this.handleRuleTriggered(notification);
    });

    // Set up event listeners
    this.setupListeners();
  }

  /**
   * Handle rule triggered notification
   */
  handleRuleTriggered(notification) {
    // Add to recent notifications
    this.recentNotifications.unshift(notification);

    // Limit the number of stored notifications
    if (this.recentNotifications.length > this.MAX_NOTIFICATIONS) {
      this.recentNotifications.pop();
    }

    // Send notification to all extension pages (popup, options)
    this.broadcastNotification(notification);
  }

  /**
   * Broadcast notification to extension pages
   */
  broadcastNotification(notification) {
    // Send to popup and options pages
    chrome.runtime.sendMessage({
      action: 'ruleTriggered',
      notification
    }).catch(() => {
      // Ignore errors when no listeners (popup not open)
    });

    // Also try to send to the specific tab's content
    if (notification.tabId) {
      chrome.tabs.sendMessage(notification.tabId, {
        action: 'ruleTriggered',
        notification
      }).catch(() => {
        // Ignore errors when content script not available
      });
    }
  }

  setupListeners() {
    // Handle extension icon click
    chrome.action.onClicked.addListener((tab) => {
      this.toggleInterception(tab);
    });

    // Handle tab updates (navigation)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' && this.storageManager.isGlobalEnabled()) {
        this.attachDebuggerToTab(tabId);
      }
    });

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detachDebuggerFromTab(tabId);
    });

    // Handle messages from popup/options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Properly handle async message handler to prevent race conditions
      this.handleMessage(request, sender, sendResponse)
        .catch(error => {
          console.error('Error handling message:', error);
          sendResponse({ error: error.message || 'Unknown error occurred' });
        });
      return true; // Keep channel open for async response
    });

    // Handle debugger detach
    chrome.debugger.onDetach.addListener((source, reason) => {
      console.log(`Debugger detached from tab ${source.tabId}: ${reason}`);
      this.activeTabs.delete(source.tabId);
    });
  }

  async handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getStatus':
        sendResponse({
          enabled: this.storageManager.isGlobalEnabled(),
          activeTabs: Array.from(this.activeTabs),
          rules: this.storageManager.getRules()
        });
        break;

      case 'toggleGlobal':
        await this.storageManager.toggleGlobalEnabled();
        sendResponse({ enabled: this.storageManager.isGlobalEnabled() });
        break;

      case 'addRule':
        await this.storageManager.addRule(request.rule);
        sendResponse({ success: true });
        break;

      case 'updateRule':
        await this.storageManager.updateRule(request.ruleId, request.rule);
        sendResponse({ success: true });
        break;

      case 'deleteRule':
        await this.storageManager.deleteRule(request.ruleId);
        sendResponse({ success: true });
        break;

      case 'getRules':
        sendResponse({ rules: this.storageManager.getRules() });
        break;

      case 'attachDebugger':
        await this.attachDebuggerToTab(request.tabId);
        sendResponse({ success: true });
        break;

      case 'detachDebugger':
        await this.detachDebuggerFromTab(request.tabId);
        sendResponse({ success: true });
        break;

      case 'getGroups':
        sendResponse({ groups: this.storageManager.getGroups() });
        break;

      case 'addGroup':
        const newGroup = await this.storageManager.addGroup(request.group);
        sendResponse({ success: true, group: newGroup });
        break;

      case 'updateGroup':
        await this.storageManager.updateGroup(request.groupId, request.group);
        sendResponse({ success: true });
        break;

      case 'deleteGroup':
        await this.storageManager.deleteGroup(request.groupId, request.deleteRules);
        sendResponse({ success: true });
        break;

      case 'toggleGroup':
        const groupEnabled = await this.storageManager.toggleGroupEnabled(request.groupId);
        sendResponse({ success: true, enabled: groupEnabled });
        break;

      case 'assignRuleToGroup':
        await this.storageManager.assignRuleToGroup(request.ruleId, request.groupId);
        sendResponse({ success: true });
        break;

      case 'getNetworkLogs':
        const logs = request.tabId
          ? this.interceptor.getNetworkLogs(request.tabId)
          : this.interceptor.getAllNetworkLogs();
        sendResponse({ logs });
        break;

      case 'clearNetworkLogs':
        this.interceptor.clearNetworkLogs(request.tabId);
        sendResponse({ success: true });
        break;

      case 'getNetworkLoggingStatus':
        sendResponse({ enabled: this.interceptor.isNetworkLoggingEnabled() });
        break;

      case 'setNetworkLogging':
        this.interceptor.setNetworkLogging(request.enabled);
        sendResponse({ success: true, enabled: request.enabled });
        break;

      case 'generateRuleFromRequest':
        const suggestedRule = this.interceptor.generateRuleFromRequest(request.logEntry);
        sendResponse({ rule: suggestedRule });
        break;

      case 'createRuleFromRequest':
        const ruleFromRequest = this.interceptor.generateRuleFromRequest(request.logEntry);
        // Merge with any user modifications
        const finalRule = { ...ruleFromRequest, ...request.modifications };
        await this.storageManager.addRule(finalRule);
        sendResponse({ success: true, rule: finalRule });
        break;

      case 'getRecentNotifications':
        // Get recent rule triggered notifications
        const tabNotifications = request.tabId
          ? this.recentNotifications.filter(n => n.tabId === request.tabId)
          : this.recentNotifications;
        sendResponse({ notifications: tabNotifications });
        break;

      case 'clearNotifications':
        // Clear notifications (optionally for a specific tab)
        if (request.tabId) {
          this.recentNotifications = this.recentNotifications.filter(n => n.tabId !== request.tabId);
        } else {
          this.recentNotifications = [];
        }
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  async attachDebuggerToTab(tabId) {
    try {
      if (this.activeTabs.has(tabId)) {
        console.log(`Debugger already attached to tab ${tabId}`);
        return;
      }

      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: [
          { urlPattern: '*', requestStage: 'Request' },
          { urlPattern: '*', requestStage: 'Response' }
        ]
      });

      this.activeTabs.add(tabId);
      this.interceptor.attachToTab(tabId);

      console.log(`Debugger attached to tab ${tabId}`);

      // Update icon to show active state
      chrome.action.setIcon({
        tabId: tabId,
        path: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png'
        }
      });
    } catch (error) {
      console.error(`Failed to attach debugger to tab ${tabId}:`, error);
    }
  }

  async detachDebuggerFromTab(tabId) {
    try {
      if (!this.activeTabs.has(tabId)) {
        return;
      }

      await chrome.debugger.detach({ tabId });
      this.activeTabs.delete(tabId);
      this.interceptor.detachFromTab(tabId);

      console.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
      console.error(`Failed to detach debugger from tab ${tabId}:`, error);
    }
  }

  async toggleInterception(tab) {
    if (this.activeTabs.has(tab.id)) {
      await this.detachDebuggerFromTab(tab.id);
    } else {
      await this.attachDebuggerToTab(tab.id);
    }
  }
}

// Initialize service worker
const serviceWorker = new ServiceWorker();
