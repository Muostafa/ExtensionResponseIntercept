// Response Interceptor - Intercepts and modifies network responses using Chrome Debugger API
export class ResponseInterceptor {
  constructor(ruleEngine, storageManager) {
    this.ruleEngine = ruleEngine;
    this.storageManager = storageManager;
    this.attachedTabs = new Map();
    this.pendingRequests = new Map();
    this.setupDebuggerListener();
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

    // This is now a request (intercepting at Request stage)
    if (!responseStatusCode) {
      console.log(`Intercepted request: ${method} ${url}`);

      const startTime = Date.now();

      try {
        // Check if any rules match this request
        const matchingRules = this.ruleEngine.findMatchingRules(url, method);

        if (matchingRules.length > 0) {
          // Block the request and return mock response immediately
          const rule = matchingRules[0];
          console.log(`✓ Blocking request and returning mock response for ${url} using rule "${rule.name}"`);

          // Generate mock response based on rule
          const mockBody = await this.generateMockResponse(rule, url, method);
          const mockStatusCode = rule.modifyStatusCode || 200;
          const mockHeaders = rule.modifyHeaders ? this.applyHeaderModifications([], rule.modifyHeaders) : [
            { name: 'Content-Type', value: 'application/json' }
          ];

          // Log to history
          if (this.storageManager && this.storageManager.settings.logging) {
            await this.storageManager.addHistoryEntry({
              url,
              method,
              tabId,
              request: {
                headers: request.headers,
                postData: request.postData
              },
              originalResponse: null, // Request was blocked
              modifiedResponse: {
                statusCode: mockStatusCode,
                headers: mockHeaders,
                body: this.truncateForStorage(mockBody),
                contentType: this.getContentType(mockHeaders)
              },
              ruleApplied: rule.name,
              ruleId: rule.id,
              processingTime: Date.now() - startTime,
              blocked: true // Indicate this request was blocked
            });
          }

          // Encode the mock body
          const base64Body = this.base64Encode(mockBody);

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

    // This should not happen anymore since we're intercepting at Request stage
    // But keeping this as fallback in case of mixed-stage interception
    console.warn(`Received response-stage event (unexpected): ${method} ${url} [${responseStatusCode}]`);
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

        case 'function':
          // Execute the function with empty body
          try {
            const func = new Function('body', rule.modification.code);
            return func('{}');
          } catch (error) {
            console.error('Failed to execute custom function:', error);
            return '{}';
          }

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
    // Convert string to base64
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (error) {
      console.error('Failed to encode base64:', error);
      return btoa(str);
    }
  }

  base64Decode(str) {
    // Convert base64 to string
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (error) {
      console.error('Failed to decode base64:', error);
      return atob(str);
    }
  }
}
