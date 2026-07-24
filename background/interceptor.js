import { isBinaryContentType } from '../shared/content-types.js';
import { base64Encode, base64Decode } from '../shared/base64.js';
import { sleep, withTimeout } from '../shared/async-utils.js';
import { getContentType, convertHeaders, headersToArray, applyHeaderModifications } from '../shared/headers.js';
import { debug } from '../shared/debug.js';
import { debounce } from '../shared/debounce.js';
import {
  REQUEST_TIMEOUT_MS,
  CLEANUP_INTERVAL_MS,
  STORAGE_RESPONSE_MAX_LENGTH,
  MAX_TABS,
  MAX_LOGS_PER_TAB,
  NETWORK_LOG_PERSIST_DEBOUNCE_MS,
  SESSION_RESPONSE_MAX_LENGTH,
  SESSION_LOGS_MAX_CHARS,
} from '../shared/constants.js';

const SESSION_LOGS_KEY = 'networkLogs';

// Response Interceptor - Intercepts and modifies network responses using Chrome Debugger API
export class ResponseInterceptor {
  constructor(ruleEngine, storageManager) {
    this.ruleEngine = ruleEngine;
    this.storageManager = storageManager;
    this.attachedTabs = new Map();
    // tabId -> Map<cdpRequestId, { logId, startedAt, status, headers, mimeType }>
    // Keyed by the CDP request id, not url+method — two concurrent identical
    // requests (StrictMode double-fetch, polling) used to collide and lose a body.
    this.pendingRequests = new Map();
    // tabId -> Map<cdpRequestId, ruleName>, for mocks whose Network event hasn't
    // arrived yet. See markLogIntercepted().
    this.interceptMarks = new Map();
    this.networkLogs = new Map();
    this.ruleTriggeredCallbacks = [];
    this.isLoggingEnabled = true;
    this.persistLogsDebounced = debounce(
      () => this.persistNetworkLogs(),
      NETWORK_LOG_PERSIST_DEBOUNCE_MS
    );
    this.setupDebuggerListener();
    this.startPeriodicCleanup();
  }

  /**
   * Register a callback for when a rule is triggered
   */
  onRuleTriggered(callback) {
    this.ruleTriggeredCallbacks.push(callback);
  }

  /**
   * Notify all callbacks that a rule was triggered
   */
  notifyRuleTriggered(tabId, rule, url, action, method) {
    const notification = {
      tabId,
      ruleName: rule.name,
      ruleId: rule.id,
      url,
      action, // 'intercepted', 'delayed'
      method: method || null,
      timestamp: Date.now()
    };
    this.ruleTriggeredCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        debug.error('Error in rule triggered callback:', error);
      }
    });
  }

  setupDebuggerListener() {
    // Listen to all debugger events
    chrome.debugger.onEvent.addListener((source, method, params) => {
      this.handleDebuggerEvent(source, method, params);
    });
  }

  attachToTab(tabId) {
    if (!this.attachedTabs.has(tabId)) {
      this.attachedTabs.set(tabId, {
        requests: new Map()
      });
      debug.log(`Response interceptor attached to tab ${tabId}`);
    }
  }

  detachFromTab(tabId) {
    if (this.attachedTabs.has(tabId)) {
      this.attachedTabs.delete(tabId);
      this.forgetInFlight(tabId);
      debug.log(`Response interceptor detached from tab ${tabId}`);
    }
  }

  /**
   * Drop the in-flight request bookkeeping for a tab (but keep its logs — the
   * user may still want to mock from them). Anything keyed by CDP requestId is
   * meaningless once the debugger session for the tab is gone.
   */
  forgetInFlight(tabId) {
    this.pendingRequests.delete(tabId);
    this.interceptMarks.delete(tabId);
  }

  async handleDebuggerEvent(source, method, params) {
    const tabId = source.tabId;

    if (!this.attachedTabs.has(tabId)) {
      // Event for a tab we aren't tracking. After a service-worker restart our
      // in-memory state is empty while Chrome may still deliver paused requests
      // from a debugger session that outlived the worker — ignoring them would
      // hang the page indefinitely. Let any paused request through best-effort;
      // startup rehydration re-adopts the tab for real interception a moment
      // later.
      if (method === 'Fetch.requestPaused' && params?.requestId != null) {
        try {
          await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.continueRequest',
            { requestId: params.requestId }
          );
        } catch (error) {
          debug.log(`Fallback continueRequest failed for tab ${tabId}:`, error?.message);
        }
      }
      return;
    }

    try {
      switch (method) {
        // Fetch domain: mocking only. Requests are paused here, so the work in
        // this branch is on the page's critical path — keep it minimal.
        case 'Fetch.requestPaused':
          await this.handleRequestPaused(tabId, params);
          break;

        // Network domain: observation only. Nothing here blocks the page, so
        // this is where all the logging lives.
        case 'Network.requestWillBeSent':
          this.handleNetworkRequestWillBeSent(tabId, params);
          break;
        case 'Network.responseReceived':
          this.handleNetworkResponseReceived(tabId, params);
          break;
        case 'Network.loadingFinished':
          await this.handleNetworkLoadingFinished(tabId, params);
          break;
        case 'Network.loadingFailed':
          this.handleNetworkLoadingFailed(tabId, params);
          break;
      }
    } catch (error) {
      debug.error('Error handling debugger event:', error);
    }
  }

  // ── Fetch domain: mock or get out of the way ───────────────────────────
  //
  // Only the Request stage is enabled (see service-worker attachDebuggerToTab).
  // The Response stage used to be enabled purely so we could read bodies for the
  // network log — but that held *every* response while awaiting
  // Fetch.getResponseBody behind a 5s timeout, which never resolves for a
  // stream, so SSE / long-poll / video stalled for the full timeout. Logging now
  // happens on the Network domain instead, and nothing is paused to read a body.

  async handleRequestPaused(tabId, params) {
    const { requestId, request, networkId } = params;
    const url = request.url;
    const method = request.method;

    try {
      const matchingRules = this.ruleEngine.findMatchingRules(url, method);

      if (matchingRules.length === 0) {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
        return;
      }

      const rule = matchingRules[0];
      debug.log(`✓ Mocking ${method} ${url} with rule "${rule.name}"`);

      // Requests that a page's own service worker originates arrive with no
      // networkId, so the Network domain never saw them — log them from here.
      this.markLogIntercepted(tabId, networkId, rule.name, {
        url, method, headers: request.headers, postData: request.postData
      });

      if (rule.delay && rule.delay > 0) {
        debug.log(`⏱ Delaying response by ${rule.delay}ms`);
        await sleep(rule.delay);
      }

      const { body: mockBody, alreadyBase64 } = await this.generateMockResponse(rule, url, method);
      const mockStatusCode = rule.modifyStatusCode || 200;
      const mockHeaders = this.buildResponseHeaders(rule);

      // Binary bodies arrive as raw base64 and must not be re-encoded.
      let base64Body;
      try {
        base64Body = alreadyBase64 ? mockBody : base64Encode(mockBody);
      } catch (encodeError) {
        debug.error('Failed to encode response body:', encodeError);
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
        return;
      }

      this.notifyRuleTriggered(tabId, rule, url, 'intercepted', method);

      await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: mockStatusCode,
        responseHeaders: convertHeaders(mockHeaders),
        body: base64Body
      });
    } catch (error) {
      debug.error(`Error processing request for ${url}:`, error);
      // Never leave a request hanging — the page would stall forever.
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
      } catch (continueError) {
        debug.error('Failed to continue request:', continueError);
      }
    }
  }

  // ── Network domain: passive logging ────────────────────────────────────

  /** Index of CDP requestId -> in-flight log state, per tab. */
  getRequestIndex(tabId) {
    if (!this.pendingRequests.has(tabId)) this.pendingRequests.set(tabId, new Map());
    return this.pendingRequests.get(tabId);
  }

  handleNetworkRequestWillBeSent(tabId, params) {
    // A redirect leg re-uses the same requestId and carries no body of its own.
    if (params.redirectResponse) return;

    const { request } = params;
    if (!request?.url) return;

    const logId = this.logNetworkRequest(tabId, {
      url: request.url,
      method: request.method,
      headers: request.headers,
      postData: request.postData || null,
      // wallTime is seconds since epoch; timestamp is a monotonic clock we keep
      // for computing duration against loadingFinished.
      timestamp: params.wallTime ? Math.round(params.wallTime * 1000) : Date.now(),
    });
    if (!logId) return; // logging disabled

    this.getRequestIndex(tabId).set(params.requestId, {
      logId,
      startedAt: params.timestamp,
    });

    // A large request body isn't inlined on the event — it has to be asked for.
    // Best-effort: it only feeds the detail view and "Copy as cURL".
    if (request.hasPostData && !request.postData) {
      this.fetchRequestPostData(tabId, params.requestId, logId);
    }

    // Fetch.requestPaused may have already decided to mock this one — CDP
    // doesn't order the two events. Pick up the flag it left us.
    const marks = this.getInterceptMarks(tabId);
    const ruleName = marks.get(params.requestId);
    if (ruleName !== undefined) {
      marks.delete(params.requestId);
      this.applyToLog(tabId, logId, (entry) => {
        entry.intercepted = true;
        entry.ruleName = ruleName;
      });
    }
  }

  async fetchRequestPostData(tabId, requestId, logId) {
    try {
      const res = await chrome.debugger.sendCommand(
        { tabId }, 'Network.getRequestPostData', { requestId }
      );
      if (res?.postData) {
        this.applyToLog(tabId, logId, (entry) => {
          entry.postData = this.truncateForStorage(res.postData, STORAGE_RESPONSE_MAX_LENGTH);
        });
      }
    } catch (error) {
      debug.log(`No request post data for ${requestId}:`, error?.message);
    }
  }

  handleNetworkResponseReceived(tabId, params) {
    const pending = this.getRequestIndex(tabId).get(params.requestId);
    if (!pending) return;

    const response = params.response || {};
    pending.status = response.status;
    // Network gives headers as an object map; the popup expects [{name, value}].
    pending.headers = headersToArray(response.headers);
    pending.mimeType = response.mimeType || '';
  }

  async handleNetworkLoadingFinished(tabId, params) {
    const index = this.getRequestIndex(tabId);
    const pending = index.get(params.requestId);
    if (!pending) return;
    index.delete(params.requestId);

    const duration = pending.startedAt != null && params.timestamp != null
      ? Math.max(0, Math.round((params.timestamp - pending.startedAt) * 1000))
      : null;

    // Only text-ish bodies are worth capturing — they're what you'd mock.
    const contentType = pending.mimeType || getContentType(pending.headers || []);
    const isTextual = /json|text|javascript|xml/i.test(contentType);

    if (!isTextual) {
      this.updateLogResponseBody(tabId, pending.logId, null, pending.status, pending.headers, duration);
      return;
    }

    try {
      // Must be called on loadingFinished — on responseReceived the body isn't
      // in the buffer yet, and after a navigation it's already been evicted.
      const body = await withTimeout(
        chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', { requestId: params.requestId }),
        REQUEST_TIMEOUT_MS,
        'Network.getResponseBody'
      );

      const responseBody = body?.base64Encoded ? base64Decode(body.body) : body?.body;
      this.updateLogResponseBody(tabId, pending.logId, responseBody || null, pending.status, pending.headers, duration);
    } catch (error) {
      // Evicted, streamed, or otherwise unavailable. Record what we do have —
      // unlike the old Fetch path, failing here costs the page nothing.
      debug.log(`No response body for request ${params.requestId}:`, error?.message);
      this.updateLogResponseBody(tabId, pending.logId, null, pending.status, pending.headers, duration);
    }
  }

  handleNetworkLoadingFailed(tabId, params) {
    const index = this.getRequestIndex(tabId);
    const pending = index.get(params.requestId);
    if (!pending) return;
    index.delete(params.requestId);
    this.updateLogResponseBody(tabId, pending.logId, null, pending.status ?? null, pending.headers ?? null, null);
  }

  /**
   * Flag the log entry for a mocked request.
   *
   * `networkId` on Fetch.requestPaused is the same id as Network's requestId —
   * that's the join between the two domains. Two wrinkles:
   *
   *  - CDP does NOT guarantee that Network.requestWillBeSent arrives before
   *    Fetch.requestPaused (Puppeteer keeps maps for both orderings for exactly
   *    this reason). If we get here first, leave a mark for the Network handler
   *    to pick up rather than logging a second, duplicate entry.
   *  - Requests a page's own service worker originates have no networkId at
   *    all, so the Network domain never sees them. Those we log from here.
   */
  markLogIntercepted(tabId, networkId, ruleName, requestData) {
    if (networkId == null) {
      const logId = this.logNetworkRequest(tabId, { ...requestData, timestamp: Date.now() });
      if (logId) {
        this.applyToLog(tabId, logId, (entry) => {
          entry.intercepted = true;
          entry.ruleName = ruleName;
        });
      }
      return;
    }

    const pending = this.getRequestIndex(tabId).get(networkId);
    if (pending) {
      this.applyToLog(tabId, pending.logId, (entry) => {
        entry.intercepted = true;
        entry.ruleName = ruleName;
      });
      return;
    }

    // We beat the Network event — hand the flag off to it.
    this.getInterceptMarks(tabId).set(networkId, ruleName);
  }

  /** networkId -> ruleName, for mocks whose Network.requestWillBeSent hasn't landed yet. */
  getInterceptMarks(tabId) {
    if (!this.interceptMarks.has(tabId)) this.interceptMarks.set(tabId, new Map());
    return this.interceptMarks.get(tabId);
  }

  /** Mutate a log entry in place by id, then persist. */
  applyToLog(tabId, logId, mutate) {
    const logs = this.networkLogs.get(tabId);
    const entry = logs?.find(l => l.id === logId);
    if (!entry) return;
    mutate(entry);
    this.persistLogsDebounced();
  }

  async generateMockResponse(rule, url, method) {
    // Generate mock response based on rule modification settings.
    // Returns { body: string, alreadyBase64: boolean }.
    // For binary content types the body is already a raw base64 string and must not be re-encoded.
    try {
      const contentType = rule.contentType === '__custom__'
        ? (rule.customContentType || 'application/octet-stream')
        : (rule.contentType || 'application/json');
      const isBinary = isBinaryContentType(contentType) ||
        (rule.contentType === '__custom__' && rule.modification?.isBinary === true);

      // Only full-body replace is supported. Rules with no modification (or any
      // legacy/unknown modifyType) fall back to an empty mock body.
      if (rule.modifyType === 'replace' && rule.modification) {
        return {
          body: rule.modification.value || (isBinary ? '' : '{}'),
          alreadyBase64: isBinary
        };
      }

      return { body: isBinary ? '' : '{}', alreadyBase64: isBinary };
    } catch (error) {
      debug.error('Failed to generate mock response:', error);
      return { body: '{}', alreadyBase64: false };
    }
  }

  buildResponseHeaders(rule) {
    const rawContentType = rule.contentType === '__custom__'
      ? (rule.customContentType || 'application/octet-stream')
      : (rule.contentType || 'application/json');

    let headers = [{ name: 'content-type', value: rawContentType }];

    if (rule.modifyHeaders && rule.modifyHeaders.length > 0) {
      headers = applyHeaderModifications(headers, rule.modifyHeaders);
    }

    return headers;
  }

  truncateForStorage(text, maxLength = STORAGE_RESPONSE_MAX_LENGTH) {
    if (typeof text === 'string' && text.length > maxLength) {
      return text.substring(0, maxLength) + '... [truncated]';
    }
    return text;
  }

  startPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleTabs();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up stale tabs that no longer exist
   */
  async cleanupStaleTabs() {
    try {
      debug.log('Running periodic tab cleanup...');
      const tabIds = Array.from(this.attachedTabs.keys());

      for (const tabId of tabIds) {
        try {
          // Check if tab still exists
          await chrome.tabs.get(tabId);
        } catch (error) {
          // Tab doesn't exist, clean it up
          debug.log(`Cleaning up stale tab ${tabId}`);
          this.attachedTabs.delete(tabId);
          this.forgetInFlight(tabId);
          // networkLogs used to be left behind here — a slow memory leak, and a
          // storage-budget leak now that the logs are mirrored to session storage.
          this.networkLogs.delete(tabId);
        }
      }

      // Enforce the maximum tab limit, evicting in insertion order (oldest
      // attach first — not true LRU, since attachment isn't re-touched on use).
      // Note this only drops our bookkeeping; the debugger stays attached to the
      // tab, so events from it fall through to the untracked-tab path.
      if (this.attachedTabs.size > MAX_TABS) {
        debug.warn(`Tab count (${this.attachedTabs.size}) exceeds limit (${MAX_TABS}), removing oldest entries`);
        const excess = this.attachedTabs.size - MAX_TABS;
        const iterator = this.attachedTabs.keys();

        for (let i = 0; i < excess; i++) {
          const oldestTabId = iterator.next().value;
          debug.log(`Removing oldest tab ${oldestTabId} due to limit`);
          this.attachedTabs.delete(oldestTabId);
          this.forgetInFlight(oldestTabId);
          this.networkLogs.delete(oldestTabId);
        }
      }

      this.persistLogsDebounced();

      debug.log(`Cleanup complete. Active tabs: ${this.attachedTabs.size}`);
    } catch (error) {
      debug.error('Error during tab cleanup:', error);
    }
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Log a network request for the "Create Rule from Network" feature
   * @returns {string|null} The log entry ID, or null if logging is disabled
   */
  logNetworkRequest(tabId, requestData) {
    // Skip logging if disabled
    if (!this.isLoggingEnabled) {
      return null;
    }

    if (!this.networkLogs.has(tabId)) {
      this.networkLogs.set(tabId, []);
    }

    const logs = this.networkLogs.get(tabId);

    // Create log entry with unique ID
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: requestData.url,
      method: requestData.method,
      headers: requestData.headers || {},
      postData: requestData.postData || null, // request body, for the detail view + cURL
      timestamp: requestData.timestamp || Date.now(),
      intercepted: false, // Will be updated if rule matches
      ruleName: null,
      responseBody: null, // Will be populated when response is received
      responseStatus: null,
      responseHeaders: null, // Will be populated when response is received
      duration: null // ms, from Network.loadingFinished
    };

    // Check if a rule will intercept this request
    const matchingRules = this.ruleEngine.findMatchingRules(requestData.url, requestData.method);
    if (matchingRules.length > 0) {
      logEntry.intercepted = true;
      logEntry.ruleName = matchingRules[0].name;
    }

    // Add to beginning of array (newest first)
    logs.unshift(logEntry);

    // Limit the number of logs per tab
    if (logs.length > MAX_LOGS_PER_TAB) {
      logs.pop();
    }

    this.persistLogsDebounced();
    return logEntry.id;
  }

  /**
   * Update a log entry with the response body, status, headers and duration.
   * `responseBody` may be null — a request with no capturable body (binary,
   * streamed, evicted) should still record its status and timing.
   */
  updateLogResponseBody(tabId, logId, responseBody, statusCode, responseHeaders, duration = null) {
    const logs = this.networkLogs.get(tabId);
    if (!logs) return;

    const logEntry = logs.find(log => log.id === logId);
    if (logEntry) {
      // Truncate large responses to avoid memory issues
      logEntry.responseBody = responseBody
        ? this.truncateForStorage(responseBody, STORAGE_RESPONSE_MAX_LENGTH)
        : null;
      logEntry.responseStatus = statusCode ?? null;
      if (duration != null) logEntry.duration = duration;
      // Headers are normalized to [{ name, value }] before they get here.
      if (Array.isArray(responseHeaders)) {
        logEntry.responseHeaders = responseHeaders.slice(0, 50);
      }

      // Try to prettify JSON responses
      if (logEntry.responseBody) {
        try {
          const parsed = JSON.parse(logEntry.responseBody);
          logEntry.responseBody = JSON.stringify(parsed, null, 2);
        } catch {
          // Not JSON, keep as-is
        }
      }

      this.persistLogsDebounced();
    }
  }

  // ── Session persistence ────────────────────────────────────────────────
  // The logs Map is the source of truth; chrome.storage.session is a mirror so
  // a service-worker recycle doesn't wipe the user's capture out from under
  // them (the popup polls these every 2s).

  /**
   * Flatten to a { [tabId]: logEntry[] } object, trimmed to the session budget.
   *
   * Budgeting walks the entries in global timestamp order, not per-tab order:
   * dropping the globally-oldest first means a chatty background tab can't
   * starve the tab the user is actually looking at.
   */
  serializeNetworkLogs() {
    const flat = [];
    for (const [tabId, logs] of this.networkLogs) {
      for (const log of logs) flat.push({ tabId, log });
    }
    flat.sort((a, b) => b.log.timestamp - a.log.timestamp);

    const out = {};
    let budget = SESSION_LOGS_MAX_CHARS;

    for (const { tabId, log } of flat) {
      const trimmed = log.responseBody
        ? { ...log, responseBody: this.truncateForStorage(log.responseBody, SESSION_RESPONSE_MAX_LENGTH) }
        : log;

      // Skip rather than stop: one oversized entry shouldn't discard every
      // older entry behind it that would still have fit.
      const cost = JSON.stringify(trimmed).length;
      if (cost > budget) continue;
      budget -= cost;

      // Object keys stringify to strings; hydrate() turns them back into numbers.
      const key = String(tabId);
      if (!out[key]) out[key] = [];
      out[key].push(trimmed);
    }

    return out;
  }

  persistNetworkLogs() {
    if (!chrome.storage?.session) return;
    chrome.storage.session
      .set({ [SESSION_LOGS_KEY]: this.serializeNetworkLogs() })
      .catch(error => debug.error('Failed to persist network logs:', error));
  }

  /**
   * Restore logs saved by a previous service-worker generation.
   *
   * Merges rather than replaces: debugger events are not gated on initPromise,
   * so a live request can land in the fresh Map while this is still awaiting.
   */
  async hydrateNetworkLogs() {
    if (!chrome.storage?.session) return;

    try {
      const stored = await chrome.storage.session.get(SESSION_LOGS_KEY);
      const saved = stored?.[SESSION_LOGS_KEY];
      if (!saved || typeof saved !== 'object') return;

      for (const [tabIdKey, logs] of Object.entries(saved)) {
        if (!Array.isArray(logs)) continue;
        // JSON object keys are strings, but networkLogs is keyed by number —
        // skip the Number() and every lookup silently misses.
        const tabId = Number(tabIdKey);
        if (!Number.isInteger(tabId)) continue;

        const live = this.networkLogs.get(tabId) || [];
        const byId = new Map();
        for (const log of [...live, ...logs]) {
          if (log?.id && !byId.has(log.id)) byId.set(log.id, log);
        }

        const merged = Array.from(byId.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_LOGS_PER_TAB);

        this.networkLogs.set(tabId, merged);
      }

      debug.log(`Restored network logs for ${this.networkLogs.size} tab(s)`);
    } catch (error) {
      debug.error('Failed to restore network logs:', error);
    }
  }

  /** Write out immediately — for onSuspend, where a debounced write would be lost. */
  flushNetworkLogs() {
    this.persistLogsDebounced.flush();
  }

  /** Drop everything we hold for a tab. Called when the tab goes away. */
  clearNetworkLogsForTab(tabId) {
    this.networkLogs.delete(tabId);
    this.forgetInFlight(tabId);
    this.persistLogsDebounced();
  }

  /**
   * Get network logs for a specific tab
   */
  getNetworkLogs(tabId) {
    return this.networkLogs.get(tabId) || [];
  }

  /**
   * Get all network logs across all tabs
   */
  getAllNetworkLogs() {
    const allLogs = [];
    for (const [tabId, logs] of this.networkLogs) {
      logs.forEach(log => {
        allLogs.push({ ...log, tabId });
      });
    }
    // Sort by timestamp (newest first)
    return allLogs.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear network logs for one tab, or for every tab when `all` is set.
   *
   * Wiping everything is deliberately opt-in: this used to treat a missing
   * tabId as "clear all", so a popup that couldn't resolve its own tab id
   * silently destroyed every other tab's capture.
   *
   * @returns {boolean} false if the request was ignored for lack of a target
   */
  clearNetworkLogs(tabId, { all = false } = {}) {
    if (all) {
      this.networkLogs.clear();
    } else if (tabId != null) {
      this.networkLogs.delete(tabId);
    } else {
      debug.warn('clearNetworkLogs called with no tabId and no { all } — ignoring');
      return false;
    }
    this.persistLogsDebounced();
    return true;
  }

  /**
   * Check if network logging is enabled
   */
  isNetworkLoggingEnabled() {
    return this.isLoggingEnabled;
  }

  /**
   * Enable or disable network logging
   */
  setNetworkLogging(enabled) {
    this.isLoggingEnabled = enabled;
    debug.log(`Network logging ${enabled ? 'enabled' : 'disabled'}`);
  }
}
