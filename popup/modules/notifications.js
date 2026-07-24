import { MESSAGES } from '../../shared/messages.js';
import { escapeHtml } from '../../shared/dom.js';
import { state } from './state.js';

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export async function loadRecentlyFired() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.GET_RECENT_NOTIFICATIONS,
      tabId: state.currentTab?.id
    });
    const notifications = (response?.notifications || []).slice(0, 3);
    const section = document.getElementById('recentlyFiredSection');
    const list = document.getElementById('recentlyFiredList');
    if (!section || !list) return;

    // Nothing has fired: stay hidden rather than spend ~70px of a 380px popup
    // on an empty box. The hint strip already explains why nothing is firing.
    if (notifications.length === 0) {
      section.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    section.style.display = 'block';

    list.innerHTML = notifications.map(n => {
      const timeAgo = formatTimeAgo(n.timestamp);
      const actionClass = n.action === 'intercepted' ? 'badge-intercepted' : 'badge-delayed';
      const methodHtml = n.method ? `<span class="rf-method">${escapeHtml(n.method)}</span>` : '';
      return `
        <div class="recently-fired-item">
          <div class="rf-name">${escapeHtml(n.ruleName)}</div>
          <div class="rf-meta">
            ${methodHtml}
            <span class="rf-badge ${actionClass}">${escapeHtml(n.action)}</span>
            <span class="rf-time">${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    // Popup may open before service worker is ready
  }
}

export function setupRecentlyFiredToggle() {
  document.getElementById('recentlyFiredToggle')?.addEventListener('click', () => {
    state.recentlyFiredCollapsed = !state.recentlyFiredCollapsed;
    const list = document.getElementById('recentlyFiredList');
    const arrow = document.querySelector('#recentlyFiredToggle .arrow');
    if (list) list.style.display = state.recentlyFiredCollapsed ? 'none' : 'block';
    if (arrow) arrow.style.transform = state.recentlyFiredCollapsed ? 'rotate(-90deg)' : '';
  });
}

export function handleRuleTriggeredNotification(notification) {
  if (notification.tabId !== state.currentTab?.id) return;

  const actionLabels = { 'intercepted': 'Intercepted', 'delayed': 'Delayed' };
  const actionIcons = { 'intercepted': '✓', 'delayed': '⏱' };

  const action = actionLabels[notification.action] || notification.action;
  const icon = actionIcons[notification.action] || '•';

  showRuleToast(icon, notification.ruleName, action, notification.url);
  loadRecentlyFired();
}

function showRuleToast(icon, ruleName, action, url) {
  let toastContainer = document.getElementById('ruleToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'ruleToastContainer';
    toastContainer.className = 'rule-toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `rule-toast rule-toast-${action.toLowerCase()}`;

  let shortUrl = url;
  try {
    const urlObj = new URL(url);
    shortUrl = urlObj.pathname.length > 30
      ? '...' + urlObj.pathname.slice(-30)
      : urlObj.pathname;
  } catch (e) {
    shortUrl = url.slice(-35);
  }

  toast.innerHTML = `
    <span class="rule-toast-icon">${escapeHtml(icon)}</span>
    <div class="rule-toast-content">
      <span class="rule-toast-action">${escapeHtml(action)}</span>
      <span class="rule-toast-rule">${escapeHtml(ruleName)}</span>
      <span class="rule-toast-url" title="${escapeHtml(url)}">${escapeHtml(shortUrl)}</span>
    </div>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
      if (toastContainer.children.length === 0) {
        toastContainer.remove();
      }
    }, 300);
  }, 3000);
}

export function setupNotificationListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === MESSAGES.RULE_TRIGGERED && message.notification) {
      handleRuleTriggeredNotification(message.notification);
    }
    return false;
  });
}
