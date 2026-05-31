// Main service worker for API Response Interceptor
import { StorageManager } from './storage-manager.js';
import { RuleEngine } from './rule-engine.js';
import { ResponseInterceptor } from './interceptor.js';
import { MESSAGES } from '../shared/messages.js';
import { debug } from '../shared/debug.js';

const MAX_FETCH_URL_BYTES = 10 * 1024 * 1024; // 10 MB cap for fetchUrlAsBase64

class ServiceWorker {
  constructor() {
    this.storageManager = new StorageManager();
    this.ruleEngine = new RuleEngine();
    this.interceptor = new ResponseInterceptor(this.ruleEngine, this.storageManager);
    this.activeTabs = new Set();
    this.tabsToReattach = new Set(); // Tabs that need re-attach after navigation
    this.recentNotifications = []; // Store recent rule triggered notifications
    this.MAX_NOTIFICATIONS = 50; // Limit notifications to prevent memory issues
    // Per-rule activity stats, keyed by ruleId → { count, lastFired }.
    // Intentionally in-memory only (resets when the service worker unloads) so
    // we never write storage on the hot interception path. Surfaced as the
    // "fired N× · ago" chip in the options rules table.
    this.ruleStats = new Map();
    // Register listeners synchronously so messages aren't dropped while storage loads
    this.setupListeners();
    this.initPromise = this.init();
  }

  async init() {
    debug.log('API Response Interceptor - Service Worker initialized');

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

    // Tally per-rule activity for the options-page activity chip
    if (notification.ruleId) {
      const prev = this.ruleStats.get(notification.ruleId) || { count: 0, lastFired: 0 };
      this.ruleStats.set(notification.ruleId, {
        count: prev.count + 1,
        lastFired: notification.timestamp || Date.now()
      });
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
      action: MESSAGES.RULE_TRIGGERED,
      notification
    }).catch(() => {
      // Ignore errors when no listeners (popup not open)
    });

    // Also try to send to the specific tab's content
    if (notification.tabId) {
      chrome.tabs.sendMessage(notification.tabId, {
        action: MESSAGES.RULE_TRIGGERED,
        notification
      }).catch(() => {
        // Ignore errors when content script not available
      });
    }
  }

  setupListeners() {
    // Handle tab updates (navigation) — re-attach on 'complete' for previously-attached tabs
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.tabsToReattach.has(tabId)) {
        this.tabsToReattach.delete(tabId);
        this.attachDebuggerToTab(tabId);
      }
    });

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabsToReattach.delete(tabId);
      this.detachDebuggerFromTab(tabId);
    });

    // Handle messages from popup/options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Flush debounced saves before the service worker is suspended
    chrome.runtime.onSuspend.addListener(() => {
      this.storageManager.flushPendingSaves();
    });

    // Handle debugger detach — queue re-attach unless user explicitly detached
    chrome.debugger.onDetach.addListener((source, reason) => {
      debug.log(`Debugger detached from tab ${source.tabId}: ${reason}`);
      this.activeTabs.delete(source.tabId);
      if (reason !== 'canceled_by_user') {
        this.tabsToReattach.add(source.tabId);
      }
    });
  }

  async safeHandle(sendResponse, fn) {
    try {
      await fn();
    } catch (error) {
      debug.error('handleMessage error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      await this.initPromise;
    } catch (error) {
      sendResponse({ success: false, error: 'Extension initialization failed' });
      return;
    }
    switch (request.action) {
      case MESSAGES.GET_STATUS:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({
            activeTabs: Array.from(this.activeTabs),
            rules: this.storageManager.getRules()
          });
        });
        break;

      case MESSAGES.ADD_RULE:
        await this.safeHandle(sendResponse, async () => {
          const newRule = await this.storageManager.addRule(request.rule);
          sendResponse({ success: true, ruleId: newRule.id, rule: newRule });
        });
        break;

      case MESSAGES.UPDATE_RULE:
        await this.safeHandle(sendResponse, async () => {
          await this.storageManager.updateRule(request.ruleId, request.rule);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.DELETE_RULE:
        await this.safeHandle(sendResponse, async () => {
          await this.storageManager.deleteRule(request.ruleId);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.GET_RULES:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({ rules: this.storageManager.getRules() });
        });
        break;

      case MESSAGES.ATTACH_DEBUGGER:
        await this.safeHandle(sendResponse, async () => {
          await this.attachDebuggerToTab(request.tabId);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.DETACH_DEBUGGER:
        await this.safeHandle(sendResponse, async () => {
          await this.detachDebuggerFromTab(request.tabId);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.GET_GROUPS:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({ groups: this.storageManager.getGroups() });
        });
        break;

      case MESSAGES.ADD_GROUP:
        await this.safeHandle(sendResponse, async () => {
          const newGroup = await this.storageManager.addGroup(request.group);
          sendResponse({ success: true, group: newGroup });
        });
        break;

      case MESSAGES.UPDATE_GROUP:
        await this.safeHandle(sendResponse, async () => {
          await this.storageManager.updateGroup(request.groupId, request.group);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.DELETE_GROUP:
        await this.safeHandle(sendResponse, async () => {
          await this.storageManager.deleteGroup(request.groupId, request.deleteRules);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.TOGGLE_GROUP:
        await this.safeHandle(sendResponse, async () => {
          const groupEnabled = await this.storageManager.toggleGroupEnabled(request.groupId);
          sendResponse({ success: true, enabled: groupEnabled });
        });
        break;

      case MESSAGES.ASSIGN_RULE_TO_GROUP:
        await this.safeHandle(sendResponse, async () => {
          await this.storageManager.assignRuleToGroup(request.ruleId, request.groupId);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.GET_NETWORK_LOGS:
        await this.safeHandle(sendResponse, async () => {
          const logs = request.tabId
            ? this.interceptor.getNetworkLogs(request.tabId)
            : this.interceptor.getAllNetworkLogs();
          sendResponse({ logs });
        });
        break;

      case MESSAGES.CLEAR_NETWORK_LOGS:
        await this.safeHandle(sendResponse, async () => {
          this.interceptor.clearNetworkLogs(request.tabId);
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.GET_NETWORK_LOGGING_STATUS:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({ enabled: this.interceptor.isNetworkLoggingEnabled() });
        });
        break;

      case MESSAGES.SET_NETWORK_LOGGING:
        await this.safeHandle(sendResponse, async () => {
          this.interceptor.setNetworkLogging(request.enabled);
          sendResponse({ success: true, enabled: request.enabled });
        });
        break;

      case MESSAGES.GENERATE_RULE_FROM_REQUEST:
        await this.safeHandle(sendResponse, async () => {
          const suggestedRule = this.interceptor.generateRuleFromRequest(request.logEntry);
          sendResponse({ rule: suggestedRule });
        });
        break;

      case MESSAGES.CREATE_RULE_FROM_REQUEST:
        await this.safeHandle(sendResponse, async () => {
          const ruleFromRequest = this.interceptor.generateRuleFromRequest(request.logEntry);
          const finalRule = { ...ruleFromRequest, ...request.modifications };
          await this.storageManager.addRule(finalRule);
          sendResponse({ success: true, rule: finalRule });
        });
        break;

      case MESSAGES.FETCH_URL_AS_BASE64:
        await this.safeHandle(sendResponse, async () => {
          const fetchResponse = await fetch(request.url);
          if (!fetchResponse.ok) {
            throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
          }
          const declaredLength = parseInt(fetchResponse.headers.get('content-length') || '', 10);
          if (Number.isFinite(declaredLength) && declaredLength > MAX_FETCH_URL_BYTES) {
            throw new Error(`Response too large: ${declaredLength} bytes exceeds ${MAX_FETCH_URL_BYTES} byte limit`);
          }
          const arrayBuffer = await fetchResponse.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_FETCH_URL_BYTES) {
            throw new Error(`Response too large: ${arrayBuffer.byteLength} bytes exceeds ${MAX_FETCH_URL_BYTES} byte limit`);
          }
          const uint8 = new Uint8Array(arrayBuffer);
          let binaryString = '';
          for (let i = 0; i < uint8.length; i++) {
            binaryString += String.fromCharCode(uint8[i]);
          }
          sendResponse({ success: true, base64: btoa(binaryString) });
        });
        break;

      case MESSAGES.GET_RECENT_NOTIFICATIONS:
        await this.safeHandle(sendResponse, async () => {
          const tabNotifications = request.tabId
            ? this.recentNotifications.filter(n => n.tabId === request.tabId)
            : this.recentNotifications;
          sendResponse({ notifications: tabNotifications });
        });
        break;

      case MESSAGES.GET_RULE_STATS:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({ stats: Object.fromEntries(this.ruleStats) });
        });
        break;

      case MESSAGES.CLEAR_NOTIFICATIONS:
        await this.safeHandle(sendResponse, async () => {
          if (request.tabId) {
            this.recentNotifications = this.recentNotifications.filter(n => n.tabId !== request.tabId);
          } else {
            this.recentNotifications = [];
          }
          sendResponse({ success: true });
        });
        break;

      case MESSAGES.IMPORT_DATA:
        await this.safeHandle(sendResponse, async () => {
          const { importedCount, importedGroupsCount } = await this.storageManager.importRules(request.data);
          sendResponse({
            success: true,
            groupsImported: importedGroupsCount,
            rulesImported: importedCount
          });
        });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  async attachDebuggerToTab(tabId) {
    try {
      if (this.activeTabs.has(tabId)) {
        debug.log(`Debugger already attached to tab ${tabId}`);
        return;
      }

      // Skip protected URLs that reject debugger attachment
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        return;
      }

      await chrome.debugger.attach({ tabId }, '1.3');
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
          patterns: [
            { urlPattern: '*', requestStage: 'Request' },
            { urlPattern: '*', requestStage: 'Response' }
          ]
        });
      } catch (enableError) {
        // Fetch.enable failed — detach so we don't leave an orphaned debugger session
        try { await chrome.debugger.detach({ tabId }); } catch {}
        throw enableError;
      }

      this.activeTabs.add(tabId);
      this.interceptor.attachToTab(tabId);

      debug.log(`Debugger attached to tab ${tabId}`);

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
      debug.error(`Failed to attach debugger to tab ${tabId}:`, error);
    }
  }

  async detachDebuggerFromTab(tabId) {
    try {
      // Explicit detach cancels any queued re-attach so an OFF toggle stays OFF.
      this.tabsToReattach.delete(tabId);

      if (!this.activeTabs.has(tabId)) {
        return;
      }

      await chrome.debugger.detach({ tabId });
      this.activeTabs.delete(tabId);
      this.interceptor.detachFromTab(tabId);

      debug.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
      debug.error(`Failed to detach debugger from tab ${tabId}:`, error);
    }
  }
}

// Initialize service worker
const serviceWorker = new ServiceWorker();
