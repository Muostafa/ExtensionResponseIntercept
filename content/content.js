// Content script for displaying toast notifications on web pages
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__apiInterceptorContentScriptLoaded) {
    return;
  }
  window.__apiInterceptorContentScriptLoaded = true;

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
    const displayUrl = notification.url.length > 60
      ? notification.url.substring(0, 60) + '...'
      : notification.url;

    toast.innerHTML = `
      <div class="api-interceptor-toast-icon">${actionIcon}</div>
      <div class="api-interceptor-toast-content">
        <div class="api-interceptor-toast-title">
          <span class="api-interceptor-toast-action">${actionLabel}</span>
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

    // Auto-remove after 4 seconds
    setTimeout(() => {
      removeToast(toast);
    }, 4000);
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
    }, 300);
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

  console.log('API Response Interceptor: Content script loaded');
})();
