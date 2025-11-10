// Response Interceptor - Intercepts and modifies network responses using Chrome Debugger API
export class ResponseInterceptor {
  constructor(ruleEngine) {
    this.ruleEngine = ruleEngine;
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

    // Only process responses (when responseStatusCode exists)
    if (!responseStatusCode) {
      // This is a request, just continue it
      await chrome.debugger.sendCommand(
        { tabId },
        'Fetch.continueRequest',
        { requestId }
      );
      return;
    }

    const url = request.url;
    const method = request.method;

    console.log(`Intercepted response: ${method} ${url} [${responseStatusCode}]`);

    try {
      // Get the original response body
      const responseBody = await chrome.debugger.sendCommand(
        { tabId },
        'Fetch.getResponseBody',
        { requestId }
      );

      let originalBody = responseBody.body;

      // Decode base64 if necessary
      if (responseBody.base64Encoded) {
        originalBody = this.base64Decode(originalBody);
      }

      // Find content type from response headers
      const contentType = this.getContentType(responseHeaders);

      // Check if we need to modify this response
      const modifiedBody = await this.ruleEngine.modifyResponse(
        url,
        method,
        originalBody,
        contentType
      );

      if (modifiedBody !== null && modifiedBody !== originalBody) {
        console.log(`✓ Modified response for ${url}`);

        // Encode the modified body
        const base64Body = this.base64Encode(modifiedBody);

        // Continue with modified response
        await chrome.debugger.sendCommand(
          { tabId },
          'Fetch.fulfillRequest',
          {
            requestId,
            responseCode: responseStatusCode,
            responseHeaders: this.convertHeaders(responseHeaders),
            body: base64Body
          }
        );
      } else {
        // No modification needed, continue with original response
        await chrome.debugger.sendCommand(
          { tabId },
          'Fetch.continueRequest',
          { requestId }
        );
      }
    } catch (error) {
      console.error(`Error processing response for ${url}:`, error);

      // Continue with original response on error
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
