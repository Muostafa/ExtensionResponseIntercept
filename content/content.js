// Content script for displaying toast notifications on web pages.
//
// Content scripts cannot use ES module imports under MV3, so the small helpers
// below are local copies of their counterparts in shared/. Keep in sync:
//   - debug          → shared/debug.js
//   - escapeHtml     → shared/dom.js
//   - TOAST_DURATION_MS / TOAST_HIDE_ANIMATION_MS / URL_TRUNCATE_LENGTH
//                    → shared/constants.js
//   - 'ruleTriggered' literal → shared/messages.js MESSAGES.RULE_TRIGGERED
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__apiInterceptorContentScriptLoaded) {
    return;
  }
  window.__apiInterceptorContentScriptLoaded = true;

  const DEBUG = false;
  const PREFIX = '[APIInt]';
  const debug = {
    log:   (...a) => { if (DEBUG) console.log(PREFIX, ...a); },
    warn:  (...a) => { if (DEBUG) console.warn(PREFIX, ...a); },
    error: (...a) => { console.error(PREFIX, ...a); },
  };

  const TOAST_DURATION_MS = 4000;
  const TOAST_HIDE_ANIMATION_MS = 300;
  const URL_TRUNCATE_LENGTH = 60;

  // Toast container element
  let toastContainer = null;

  /**
   * Create or get the toast container
   */
  function getToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) {
      return toastContainer;
    }

    // Create container
    toastContainer = document.createElement('div');
    toastContainer.id = 'api-interceptor-toast-container';
    toastContainer.className = 'api-interceptor-toast-container';

    // Append to body
    document.body.appendChild(toastContainer);

    return toastContainer;
  }

  /**
   * Show a toast notification
   */
  function showToast(notification) {
    const container = getToastContainer();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `api-interceptor-toast api-interceptor-toast-${notification.action}`;

    // Get action label and icon
    const actionLabels = {
      'intercepted': 'Intercepted',
      'delayed': 'Delayed'
    };

    const actionIcons = {
      'intercepted': '\u2713', // checkmark
      'delayed': '\u23F1' // stopwatch
    };

    const actionLabel = actionLabels[notification.action] || notification.action;
    const actionIcon = actionIcons[notification.action] || '\u2713';

    // Truncate URL for display
    const displayUrl = notification.url.length > URL_TRUNCATE_LENGTH
      ? notification.url.substring(0, URL_TRUNCATE_LENGTH) + '...'
      : notification.url;

    toast.innerHTML = `
      <div class="api-interceptor-toast-icon">${escapeHtml(actionIcon)}</div>
      <div class="api-interceptor-toast-content">
        <div class="api-interceptor-toast-title">
          <span class="api-interceptor-toast-action">${escapeHtml(actionLabel)}</span>
          <span class="api-interceptor-toast-rule">${escapeHtml(notification.ruleName)}</span>
        </div>
        <div class="api-interceptor-toast-url" title="${escapeHtml(notification.url)}">${escapeHtml(displayUrl)}</div>
      </div>
      <button class="api-interceptor-toast-close" aria-label="Close">\u00D7</button>
    `;

    // Add close button handler
    const closeBtn = toast.querySelector('.api-interceptor-toast-close');
    closeBtn.addEventListener('click', () => {
      removeToast(toast);
    });

    // Add to container
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('api-interceptor-toast-visible');
    });

    setTimeout(() => {
      removeToast(toast);
    }, TOAST_DURATION_MS);
  }

  /**
   * Remove a toast with animation
   */
  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;

    toast.classList.add('api-interceptor-toast-hiding');
    toast.classList.remove('api-interceptor-toast-visible');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, TOAST_HIDE_ANIMATION_MS);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Listen for messages from the background script
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ruleTriggered' && message.notification) {
      showToast(message.notification);
      sendResponse({ received: true });
    }
    return true;
  });

  debug.log('Content script loaded');
})();
