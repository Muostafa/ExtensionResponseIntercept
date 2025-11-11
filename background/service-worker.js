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
    this.init();
  }

  async init() {
    console.log('API Response Interceptor - Service Worker initialized');

    // Load rules, history, and recordings from storage
    await this.storageManager.loadRules();
    await this.storageManager.loadHistory();
    await this.storageManager.loadRecordings();
    this.ruleEngine.setRules(this.storageManager.getRules());

    // Listen for settings changes
    this.storageManager.onRulesChanged((rules) => {
      this.ruleEngine.setRules(rules);
    });

    // Set up event listeners
    this.setupListeners();
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
      this.handleMessage(request, sender, sendResponse);
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

      case 'getHistory':
        sendResponse({ history: this.storageManager.getHistory(request.limit) });
        break;

      case 'clearHistory':
        await this.storageManager.clearHistory();
        sendResponse({ success: true });
        break;

      case 'getRecordings':
        sendResponse({ recordings: this.storageManager.getRecordings() });
        break;

      case 'addRecording':
        const recording = await this.storageManager.addRecording(request.recording);
        sendResponse({ success: true, recording });
        break;

      case 'deleteRecording':
        await this.storageManager.deleteRecording(request.recordingId);
        sendResponse({ success: true });
        break;

      case 'clearRecordings':
        await this.storageManager.clearAllRecordings();
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
        patterns: [{ urlPattern: '*', requestStage: 'Response' }]
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
