// Main service worker for API Response Interceptor
import { StorageManager } from './storage-manager.js';
import { RuleEngine } from './rule-engine.js';
import { ResponseInterceptor } from './interceptor.js';
import { buildFetchPatterns } from './fetch-patterns.js';
import { MESSAGES } from '../shared/messages.js';
import { isRestrictedUrl, FETCH_PATTERN_REFRESH_DEBOUNCE_MS } from '../shared/constants.js';
import { debounce } from '../shared/debounce.js';
import { debug } from '../shared/debug.js';

const MAX_FETCH_URL_BYTES = 10 * 1024 * 1024; // 10 MB cap for fetchUrlAsBase64
const BADGE_ACTIVE_COLOR = '#16a34a'; // green — tab is being intercepted
const CONTEXT_MENU_TOGGLE_ID = 'toggle-intercept-tab';
// chrome.storage.session key holding the tabs currently being intercepted.
// Session storage survives service-worker termination but is cleared on browser
// restart — the exact lifetime we want for "which tabs were I intercepting".
const SESSION_ACTIVE_TABS_KEY = 'interceptedTabs';

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
    // Per-tab count of mocks served, keyed by tabId. Drives the toolbar badge
    // ("ON" until the first mock, then the running count). In-memory only and
    // reset when a tab loads a new document.
    this.tabMockCounts = new Map();
    this.refreshFetchPatternsDebounced = debounce(
      () => this.refreshFetchPatternsOnAllTabs(),
      FETCH_PATTERN_REFRESH_DEBOUNCE_MS
    );
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

    // Fires on every rule AND group mutation (add/update/delete/toggle) — the
    // single place that has to know the enabled set changed, so it's also where
    // the Fetch patterns get re-pointed.
    this.storageManager.onRulesChanged((rules) => {
      this.ruleEngine.setRules(rules);
      this.refreshFetchPatternsDebounced();
    });

    // Set up rule triggered notifications
    this.interceptor.onRuleTriggered((notification) => {
      this.handleRuleTriggered(notification);
    });

    // Bring back the network capture from the previous service-worker
    // generation. Must happen before restoreAttachedTabs() re-adopts the tabs
    // and new requests start landing in the (still empty) logs Map.
    await this.interceptor.hydrateNetworkLogs();

    // Re-adopt any tabs that were being intercepted before this service-worker
    // generation started. MV3 recycles the worker aggressively; without this a
    // surviving debugger session would keep pausing requests that nothing
    // continues, hanging the page.
    await this.restoreAttachedTabs();
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

    // Surface live activity on the toolbar badge for the tab that fired.
    if (notification.tabId != null && this.activeTabs.has(notification.tabId)) {
      const count = (this.tabMockCounts.get(notification.tabId) || 0) + 1;
      this.tabMockCounts.set(notification.tabId, count);
      this.setTabBadge(notification.tabId, String(count));
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
    // Create / refresh the right-click toggle (idempotent: removeAll first).
    this.setupContextMenu();

    // Handle tab updates (navigation)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete') return;
      if (this.tabsToReattach.has(tabId)) {
        // Re-attach on 'complete' for previously-attached tabs
        this.tabsToReattach.delete(tabId);
        this.attachDebuggerToTab(tabId);
      } else if (this.activeTabs.has(tabId)) {
        // New document on an already-attached tab → reset the per-page mock count.
        this.tabMockCounts.set(tabId, 0);
        this.setTabBadge(tabId, 'ON');
      }
      if (tab?.active) this.syncContextMenuToActiveTab();
    });

    // Keep the context-menu checkbox in sync with whichever tab is active.
    chrome.tabs.onActivated.addListener(() => this.syncContextMenuToActiveTab());

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabsToReattach.delete(tabId);
      this.tabMockCounts.delete(tabId);
      this.interceptor.clearNetworkLogsForTab(tabId);
      this.detachDebuggerFromTab(tabId);
    });

    // Handle messages from popup/options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Keyboard shortcut (Alt+Shift+I) — toggle interception on the active tab.
    chrome.commands?.onCommand.addListener(async (command) => {
      if (command !== 'toggle-interception') return;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await this.toggleInterceptionForTab(tab);
      } catch (error) {
        debug.error('Command toggle-interception failed:', error);
      }
    });

    // Right-click toggle — acts on the tab the menu was invoked from.
    chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId !== CONTEXT_MENU_TOGGLE_ID) return;
      await this.toggleInterceptionForTab(tab);
    });

    // (Re)create the context menu on install/update.
    chrome.runtime.onInstalled.addListener(() => this.setupContextMenu());

    // Flush debounced saves before the service worker is suspended
    chrome.runtime.onSuspend.addListener(() => {
      this.storageManager.flushPendingSaves();
      this.interceptor.flushNetworkLogs();
    });

    // Handle debugger detach — queue re-attach unless user explicitly detached
    chrome.debugger.onDetach.addListener((source, reason) => {
      const tabId = source.tabId;
      if (tabId == null) return;
      debug.log(`Debugger detached from tab ${tabId}: ${reason}`);
      this.activeTabs.delete(tabId);
      this.tabMockCounts.delete(tabId);
      if (reason !== 'canceled_by_user') {
        this.tabsToReattach.add(tabId);
      } else {
        // DevTools/user took over the debugger — reflect OFF on the badge.
        this.setTabBadge(tabId, '');
      }
      this.syncContextMenuToActiveTab();
      this.persistActiveTabs();
    });
  }

  /**
   * Set (or clear, with text='') the per-tab toolbar badge. Never throws into
   * the caller — the tab may already be gone.
   */
  setTabBadge(tabId, text) {
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    if (text) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_ACTIVE_COLOR }).catch(() => {});
    }
  }

  /** Create the single checkbox context-menu item (idempotent). */
  setupContextMenu() {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime.lastError; // ignore "no items" on first run
      chrome.contextMenus.create({
        id: CONTEXT_MENU_TOGGLE_ID,
        title: 'Intercept this tab',
        type: 'checkbox',
        checked: false,
        contexts: ['action', 'page']
      }, () => void chrome.runtime.lastError);
    });
  }

  /** Reflect the active tab's real attachment state in the context-menu checkbox. */
  async syncContextMenuToActiveTab() {
    if (!chrome.contextMenus) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await chrome.contextMenus.update(CONTEXT_MENU_TOGGLE_ID, {
        checked: this.activeTabs.has(tab.id)
      });
    } catch {
      // Menu not created yet or update failed — non-fatal.
    }
  }

  /** Toggle interception for a tab, respecting restricted pages. Per-tab only. */
  async toggleInterceptionForTab(tab) {
    if (!tab?.id) return;
    if (isRestrictedUrl(tab.url)) {
      debug.log('Interception toggle ignored on restricted page:', tab.url);
      this.syncContextMenuToActiveTab(); // revert any optimistic checkbox flip
      return;
    }
    if (this.activeTabs.has(tab.id)) {
      await this.detachDebuggerFromTab(tab.id);
    } else {
      await this.attachDebuggerToTab(tab.id);
    }
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

      case MESSAGES.ADD_RULES:
        await this.safeHandle(sendResponse, async () => {
          const newRules = await this.storageManager.addRules(request.rules);
          sendResponse({ success: true, count: newRules.length, rules: newRules });
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

      case MESSAGES.GET_SETTINGS:
        await this.safeHandle(sendResponse, async () => {
          sendResponse({ success: true, settings: this.storageManager.getSettings() });
        });
        break;

      case MESSAGES.UPDATE_SETTINGS:
        await this.safeHandle(sendResponse, async () => {
          const settings = await this.storageManager.updateSettings(request.settings || {});
          // narrowInterceptPatterns changes what Fetch is pointed at.
          await this.refreshFetchPatternsOnAllTabs();
          sendResponse({ success: true, settings });
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
      if (!tab || isRestrictedUrl(tab.url)) {
        return;
      }

      try {
        await chrome.debugger.attach({ tabId }, '1.3');
      } catch (attachError) {
        // "Already attached" means our debugger session outlived a previous
        // service-worker generation (the SW was recycled but Chrome kept the
        // session live). We can still drive it, so re-adopt instead of bailing.
        if (!/already attached/i.test(attachError?.message || '')) {
          throw attachError;
        }
        debug.log(`Re-adopting existing debugger session for tab ${tabId}`);
      }
      try {
        // Network: passive observation, drives the network log. Nothing here
        // pauses the page.
        await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
          maxResourceBufferSize: 5 * 1024 * 1024,
          maxTotalBufferSize: 20 * 1024 * 1024,
        });

        // Fetch: mocking only, and only at the Request stage. The Response
        // stage used to be enabled so we could read bodies for the log, but
        // that paused every response while awaiting Fetch.getResponseBody —
        // which never resolves for a stream, so SSE/long-poll/video stalled for
        // the full 5s timeout. Network.getResponseBody does that job without
        // holding the response.
        await this.applyFetchPatterns(tabId);
      } catch (enableError) {
        // Enable failed — detach so we don't leave an orphaned debugger session
        try { await chrome.debugger.detach({ tabId }); } catch {}
        throw enableError;
      }

      this.activeTabs.add(tabId);
      this.interceptor.attachToTab(tabId);
      this.tabMockCounts.set(tabId, 0);

      debug.log(`Debugger attached to tab ${tabId}`);

      // Per-tab toolbar feedback: green "ON" until mocks start firing.
      this.setTabBadge(tabId, 'ON');
      this.syncContextMenuToActiveTab();
      this.persistActiveTabs();
    } catch (error) {
      debug.error(`Failed to attach debugger to tab ${tabId}:`, error);
    }
  }

  /**
   * Point Fetch at only the URLs an enabled rule could match, so unrelated
   * requests are never paused. See background/fetch-patterns.js for why the
   * generated globs are always a safe superset of what the rule engine matches.
   *
   * Zero enabled rules -> Fetch.disable, i.e. a true zero-pause record-only
   * mode (the Network domain keeps logging).
   */
  async applyFetchPatterns(tabId) {
    const narrow = this.storageManager.isNarrowInterceptEnabled();
    const enabledRules = this.storageManager.getEnabledRules();

    const { patterns, wide } = narrow
      ? buildFetchPatterns(enabledRules)
      : { patterns: [{ urlPattern: '*', requestStage: 'Request' }], wide: true };

    if (patterns.length === 0) {
      debug.log(`Tab ${tabId}: no enabled rules — Fetch.disable (record-only)`);
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.disable');
      return;
    }

    debug.log(
      `Tab ${tabId}: Fetch.enable on ${patterns.length} pattern(s)` +
      `${wide ? ' (wide — regex rule or kill-switch off)' : ''}:`,
      patterns.map(p => p.urlPattern)
    );
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', { patterns });
  }

  /** Re-point Fetch on every intercepted tab. Debounced — rules change in bursts. */
  async refreshFetchPatternsOnAllTabs() {
    for (const tabId of this.activeTabs) {
      try {
        await this.applyFetchPatterns(tabId);
      } catch (error) {
        debug.error(`Failed to refresh Fetch patterns on tab ${tabId}:`, error);
      }
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
      this.tabMockCounts.delete(tabId);
      this.setTabBadge(tabId, '');
      this.syncContextMenuToActiveTab();
      this.persistActiveTabs();

      debug.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
      debug.error(`Failed to detach debugger from tab ${tabId}:`, error);
    }
  }

  /**
   * Mirror the current intercepted-tab set into session storage so a recycled
   * service worker can re-adopt it. Best-effort and never throws into callers.
   */
  persistActiveTabs() {
    if (!chrome.storage?.session) return;
    chrome.storage.session
      .set({ [SESSION_ACTIVE_TABS_KEY]: Array.from(this.activeTabs) })
      .catch((error) => debug.error('Failed to persist active tabs:', error));
  }

  /**
   * Re-attach to tabs that were being intercepted before this service-worker
   * generation started. Runs once on startup. attachDebuggerToTab re-adopts a
   * surviving session and skips tabs that have since closed or navigated to a
   * restricted page, so stale ids self-heal out of the persisted set.
   */
  async restoreAttachedTabs() {
    if (!chrome.storage?.session) return;
    let tabIds = [];
    try {
      const stored = await chrome.storage.session.get(SESSION_ACTIVE_TABS_KEY);
      tabIds = stored[SESSION_ACTIVE_TABS_KEY] || [];
    } catch (error) {
      debug.error('Failed to read persisted active tabs:', error);
      return;
    }
    if (!tabIds.length) return;

    debug.log(`Restoring interception for ${tabIds.length} tab(s) after restart`);
    for (const tabId of tabIds) {
      await this.attachDebuggerToTab(tabId);
    }
  }
}

// Initialize service worker
const serviceWorker = new ServiceWorker();
