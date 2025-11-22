// Response Interceptor - Intercepts and modifies network responses using Chrome Debugger API
export class ResponseInterceptor {
  constructor(ruleEngine, storageManager) {
    this.ruleEngine = ruleEngine;
    this.storageManager = storageManager;
    this.attachedTabs = new Map();
    this.pendingRequests = new Map();
    this.networkLogs = new Map(); // Store network logs per tab
    this.ruleTriggeredCallbacks = []; // Callbacks for rule triggered notifications
    this.MAX_TABS = 100; // Limit to prevent memory issues
    this.MAX_LOGS_PER_TAB = 100; // Limit logs per tab
    this.isLoggingEnabled = true; // Network logging enabled by default
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
  notifyRuleTriggered(tabId, rule, url, action) {
    const notification = {
      tabId,
      ruleName: rule.name,
      ruleId: rule.id,
      url,
      action, // 'intercepted', 'delayed'
      timestamp: Date.now()
    };
    this.ruleTriggeredCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in rule triggered callback:', error);
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
      console.log(`Response interceptor attached to tab ${tabId}`);
    }
  }

  detachFromTab(tabId) {
    if (this.attachedTabs.has(tabId)) {
      this.attachedTabs.delete(tabId);
      console.log(`Response interceptor detached from tab ${tabId}`);
    }
  }

  async handleDebuggerEvent(source, method, params) {
    const tabId = source.tabId;

    if (!this.attachedTabs.has(tabId)) {
      return;
    }

    try {
      switch (method) {
        case 'Fetch.requestPaused':
          await this.handleRequestPaused(tabId, params);
          break;

        case 'Fetch.authRequired':
          // Continue with auth if needed
          await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.continueWithAuth',
            { requestId: params.requestId, authChallengeResponse: { response: 'Default' } }
          );
          break;
      }
    } catch (error) {
      console.error('Error handling debugger event:', error);
    }
  }

  async handleRequestPaused(tabId, params) {
    const { requestId, request, responseStatusCode, responseHeaders } = params;
    const url = request.url;
    const method = request.method;

    // REQUEST STAGE - intercepting before the request is sent
    if (!responseStatusCode) {
      console.log(`Intercepted request: ${method} ${url}`);

      const startTime = Date.now();

      // Log the network request for "Create Rule from Network" feature
      const logId = this.logNetworkRequest(tabId, {
        url,
        method,
        headers: request.headers,
        postData: request.postData,
        timestamp: startTime
      });

      // Track this request so we can update the log with response body later
      if (!this.pendingRequests.has(tabId)) {
        this.pendingRequests.set(tabId, new Map());
      }
      this.pendingRequests.get(tabId).set(url + '|' + method, logId);

      try {
        // Check if any rules match this request
        const matchingRules = this.ruleEngine.findMatchingRules(url, method);

        if (matchingRules.length > 0) {
          const rule = matchingRules[0];

          // Handle MOCK RESPONSE
          console.log(`✓ Blocking request and returning mock response for ${url} using rule "${rule.name}"`);

          // Apply delay if specified
          if (rule.delay && rule.delay > 0) {
            console.log(`⏱ Delaying response by ${rule.delay}ms`);
            await this.sleep(rule.delay);
          }

          // Generate mock response based on rule
          const mockBody = await this.generateMockResponse(rule, url, method);
          const mockStatusCode = rule.modifyStatusCode || 200;
          const mockHeaders = rule.modifyHeaders ? this.applyHeaderModifications([], rule.modifyHeaders) : [
            { name: 'Content-Type', value: 'application/json' }
          ];

          // Encode the mock body
          let base64Body;
          try {
            base64Body = this.base64Encode(mockBody);
          } catch (encodeError) {
            console.error('Failed to encode response body:', encodeError);
            // Continue with normal request on encoding failure
            await chrome.debugger.sendCommand(
              { tabId },
              'Fetch.continueRequest',
              { requestId }
            );
            return;
          }

          // Notify about the interception
          this.notifyRuleTriggered(tabId, rule, url, 'intercepted');

          // Fulfill with mock response immediately (no server request made)
          await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.fulfillRequest',
            {
              requestId,
              responseCode: mockStatusCode,
              responseHeaders: this.convertHeaders(mockHeaders),
              body: base64Body
            }
          );
        } else {
          // No rules match, continue with normal request
          await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.continueRequest',
            { requestId }
          );
        }
      } catch (error) {
        console.error(`Error processing request for ${url}:`, error);

        // Continue with normal request on error
        try {
          await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.continueRequest',
            { requestId }
          );
        } catch (continueError) {
          console.error('Failed to continue request:', continueError);
        }
      }
      return;
    }

    // RESPONSE STAGE - intercepting after the response is received
    // Capture the response body for the "Create Rule from Network" feature
    try {
      const contentType = this.getContentType(responseHeaders);
      const isJsonOrText = contentType.includes('json') ||
                           contentType.includes('text') ||
                           contentType.includes('javascript') ||
                           contentType.includes('xml');

      if (isJsonOrText) {
        // Get the response body
        try {
          const bodyResponse = await chrome.debugger.sendCommand(
            { tabId },
            'Fetch.getResponseBody',
            { requestId }
          );

          if (bodyResponse && bodyResponse.body) {
            const responseBody = bodyResponse.base64Encoded
              ? this.base64Decode(bodyResponse.body)
              : bodyResponse.body;

            // Find and update the corresponding log entry
            const requestKey = url + '|' + method;
            const tabPendingRequests = this.pendingRequests.get(tabId);
            if (tabPendingRequests && tabPendingRequests.has(requestKey)) {
              const logId = tabPendingRequests.get(requestKey);
              this.updateLogResponseBody(tabId, logId, responseBody, responseStatusCode);
              tabPendingRequests.delete(requestKey);
            }
          }
        } catch (bodyError) {
          // Some responses may not have a body, that's okay
          console.log(`Could not get response body for ${url}:`, bodyError.message);
        }
      }
    } catch (error) {
      console.error(`Error capturing response for ${url}:`, error);
    }

    // Continue with the response
    await chrome.debugger.sendCommand(
      { tabId },
      'Fetch.continueRequest',
      { requestId }
    );
  }

  async generateMockResponse(rule, url, method) {
    // Generate mock response based on rule modification settings
    try {
      if (!rule.modifyType || !rule.modification) {
        // No modification specified, return empty JSON object
        return '{}';
      }

      switch (rule.modifyType) {
        case 'replace':
          // Return the replacement value directly
          return rule.modification.value || '{}';

        case 'json-path':
          // Create a JSON object with the specified path and value
          const jsonData = {};
          const { path, value } = rule.modification;
          this.ruleEngine.setNestedProperty(jsonData, path, this.parseValue(value));
          return JSON.stringify(jsonData);

        case 'regex':
          // Can't apply regex without original body, return empty object
          console.warn('Regex modification not applicable for blocked requests');
          return '{}';

        default:
          return '{}';
      }
    } catch (error) {
      console.error('Failed to generate mock response:', error);
      return '{}';
    }
  }

  applyHeaderModifications(originalHeaders, modifications) {
    const headersMap = new Map();

    // Convert original headers to map
    if (originalHeaders) {
      originalHeaders.forEach(header => {
        headersMap.set(header.name.toLowerCase(), header.value);
      });
    }

    // Apply modifications
    modifications.forEach(mod => {
      const headerName = mod.name.toLowerCase();

      if (mod.action === 'add' || mod.action === 'set') {
        headersMap.set(headerName, mod.value);
      } else if (mod.action === 'remove') {
        headersMap.delete(headerName);
      }
    });

    // Convert back to array format
    return Array.from(headersMap.entries()).map(([name, value]) => ({
      name,
      value
    }));
  }

  parseValue(value) {
    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Sleep for a specified duration
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  truncateForStorage(text, maxLength = 10000) {
    // Truncate very large responses to avoid storage issues
    if (typeof text === 'string' && text.length > maxLength) {
      return text.substring(0, maxLength) + '... [truncated]';
    }
    return text;
  }

  getContentType(headers) {
    if (!headers) return '';

    for (const header of headers) {
      if (header.name.toLowerCase() === 'content-type') {
        return header.value;
      }
    }

    return '';
  }

  convertHeaders(headers) {
    if (!headers) return [];

    return headers.map(header => ({
      name: header.name,
      value: header.value
    }));
  }

  base64Encode(str) {
    // Convert string to base64 using modern TextEncoder API
    try {
      // Use TextEncoder for proper UTF-8 handling
      const bytes = new TextEncoder().encode(str);
      // Convert Uint8Array to binary string
      let binaryString = '';
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      return btoa(binaryString);
    } catch (error) {
      console.error('Failed to encode base64:', error);
      // Try fallback for ASCII-only strings
      try {
        return btoa(str);
      } catch (fallbackError) {
        console.error('Failed to encode base64 (fallback also failed):', fallbackError);
        // Throw error instead of silently returning empty string
        throw new Error(`Base64 encoding failed: ${fallbackError.message}`);
      }
    }
  }

  base64Decode(str) {
    // Convert base64 to string using modern TextDecoder API
    try {
      const binaryString = atob(str);
      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // Use TextDecoder for proper UTF-8 handling
      return new TextDecoder().decode(bytes);
    } catch (error) {
      console.error('Failed to decode base64:', error);
      // Fallback to simple atob for ASCII strings
      try {
        return atob(str);
      } catch (fallbackError) {
        console.error('Failed to decode base64 (fallback also failed):', fallbackError);
        throw new Error(`Base64 decoding failed: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Start periodic cleanup to prevent memory leaks
   */
  startPeriodicCleanup() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleTabs();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up stale tabs that no longer exist
   */
  async cleanupStaleTabs() {
    try {
      console.log('Running periodic tab cleanup...');
      const tabIds = Array.from(this.attachedTabs.keys());

      for (const tabId of tabIds) {
        try {
          // Check if tab still exists
          await chrome.tabs.get(tabId);
        } catch (error) {
          // Tab doesn't exist, clean it up
          console.log(`Cleaning up stale tab ${tabId}`);
          this.attachedTabs.delete(tabId);
          this.pendingRequests.delete(tabId);
        }
      }

      // Enforce maximum tab limit using LRU eviction
      if (this.attachedTabs.size > this.MAX_TABS) {
        console.warn(`Tab count (${this.attachedTabs.size}) exceeds limit (${this.MAX_TABS}), removing oldest entries`);
        const excess = this.attachedTabs.size - this.MAX_TABS;
        const iterator = this.attachedTabs.keys();

        for (let i = 0; i < excess; i++) {
          const oldestTabId = iterator.next().value;
          console.log(`Removing oldest tab ${oldestTabId} due to limit`);
          this.attachedTabs.delete(oldestTabId);
          this.pendingRequests.delete(oldestTabId);
        }
      }

      console.log(`Cleanup complete. Active tabs: ${this.attachedTabs.size}`);
    } catch (error) {
      console.error('Error during tab cleanup:', error);
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
      timestamp: requestData.timestamp || Date.now(),
      intercepted: false, // Will be updated if rule matches
      ruleName: null,
      responseBody: null, // Will be populated when response is received
      responseStatus: null
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
    if (logs.length > this.MAX_LOGS_PER_TAB) {
      logs.pop();
    }

    return logEntry.id;
  }

  /**
   * Update a log entry with the response body
   */
  updateLogResponseBody(tabId, logId, responseBody, statusCode) {
    const logs = this.networkLogs.get(tabId);
    if (!logs) return;

    const logEntry = logs.find(log => log.id === logId);
    if (logEntry) {
      // Truncate large responses to avoid memory issues
      logEntry.responseBody = this.truncateForStorage(responseBody, 50000);
      logEntry.responseStatus = statusCode;

      // Try to prettify JSON responses
      if (logEntry.responseBody) {
        try {
          const parsed = JSON.parse(logEntry.responseBody);
          logEntry.responseBody = JSON.stringify(parsed, null, 2);
        } catch {
          // Not JSON, keep as-is
        }
      }
    }
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
   * Clear network logs for a specific tab
   */
  clearNetworkLogs(tabId) {
    if (tabId) {
      this.networkLogs.delete(tabId);
    } else {
      this.networkLogs.clear();
    }
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
    console.log(`Network logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Generate a suggested rule from a network request
   */
  generateRuleFromRequest(logEntry) {
    // Parse URL to create a smart pattern
    const url = new URL(logEntry.url);
    const pathname = url.pathname;

    // Create a wildcard pattern from the URL
    // Replace numeric segments with wildcards (e.g., /users/123 -> /users/*)
    const patternPath = pathname.replace(/\/\d+/g, '/*');
    const pattern = `*://${url.host}${patternPath}*`;

    // Generate a name based on the URL
    const pathParts = pathname.split('/').filter(p => p && !/^\d+$/.test(p));
    const suggestedName = pathParts.length > 0
      ? `${logEntry.method} ${pathParts.slice(-2).join('/')}`
      : `${logEntry.method} ${url.host}`;

    // Use the captured response body as default, or a placeholder
    let defaultResponseBody = '{\n  "message": "Intercepted response"\n}';
    if (logEntry.responseBody) {
      defaultResponseBody = logEntry.responseBody;
    }

    const rule = {
      name: suggestedName,
      description: `Auto-generated from ${logEntry.url}`,
      urlPattern: pattern,
      matchType: 'wildcard',
      methods: [logEntry.method],
      enabled: true,
      modifyType: 'replace',
      modification: {
        type: 'json',
        value: defaultResponseBody
      }
    };

    // Add status code if we captured one
    if (logEntry.responseStatus) {
      rule.modifyStatusCode = logEntry.responseStatus;
    }

    return rule;
  }
}
