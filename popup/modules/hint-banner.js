// The one-line "what's actually happening / what to do next" strip under the
// status cards.
//
// Mocking only fires when three things line up: the tab is intercepted, at
// least one rule is enabled, and the page has made a request *since* the
// debugger attached. Any one of those being false looks identical from the
// rules list — enabled-looking rules that silently never fire — so this strip
// names the missing piece and offers the single action that fixes it.

import { MESSAGES } from '../../shared/messages.js';
import { isRestrictedUrl } from '../../shared/constants.js';
import { icon } from '../../shared/icons.js';
import { debug } from '../../shared/debug.js';
import { state } from './state.js';

/**
 * Work out which (if any) hint applies right now.
 * @returns {{tone: string, text: string, action?: {label: string, id: string}}|null}
 */
function resolveHint({ attached, restricted, enabledRules, logCount, logBaseline }) {
  if (restricted) {
    return {
      tone: 'neutral',
      text: 'Interception isn’t available on this page.',
    };
  }

  if (!attached) {
    return enabledRules > 0
      ? {
          tone: 'warn',
          text: `${enabledRules} rule${enabledRules === 1 ? '' : 's'} enabled, but this tab isn’t intercepted — nothing will be mocked.`,
          action: { label: 'Turn on', id: 'hintTurnOn' },
        }
      : {
          tone: 'info',
          text: 'Turn on interception to capture requests from this tab.',
          action: { label: 'Turn on', id: 'hintTurnOn' },
        };
  }

  // Attached but nothing captured since — the page loaded before the debugger
  // did, so the requests you care about already went out unmocked.
  if (logCount <= logBaseline) {
    return {
      tone: 'info',
      text: 'Intercepting. Reload the page so its requests run through the extension.',
      action: { label: 'Reload', id: 'hintReload' },
    };
  }

  if (enabledRules === 0) {
    return {
      tone: 'info',
      text: 'Recording only — no rules are enabled, so nothing is being mocked.',
    };
  }

  return null; // everything lines up; stay out of the way
}

const TONE_ICON = { warn: 'alert', info: 'info', neutral: 'info' };

// Signature of what is currently on screen. The network view re-runs this every
// 2s; rebuilding innerHTML on an unchanged hint would destroy and recreate the
// action button under the user's cursor, and a click whose mousedown and mouseup
// land on either side of the rebuild is dropped.
let renderedSignature = null;

/**
 * Re-render the strip from current state. Safe to call as often as you like.
 * @param {object} [opts]
 * @param {boolean} [opts.attached] attachment state, when the caller already knows it
 */
export async function refreshHintBanner(opts = {}) {
  const banner = document.getElementById('hintBanner');
  if (!banner) return;
  // loadStatus() resolves before the first loadRules(), and "0 rules" would
  // briefly resolve to the wrong hint. Wait for the real rule set — the
  // displayRules() call right after it re-renders us with everything known.
  if (!window.currentRules) return;

  const restricted = isRestrictedUrl(state.currentTab?.url);
  const attached = opts.attached ?? document.getElementById('tabInterceptToggle')?.checked ?? false;
  const rules = window.currentRules;
  const groups = window.currentGroups || [];
  // A rule in a disabled group is off no matter what its own toggle says.
  const disabledGroupIds = new Set(groups.filter(g => !g.enabled).map(g => g.id));
  const enabledRules = rules.filter(
    r => r.enabled && !(r.groupId && disabledGroupIds.has(r.groupId))
  ).length;

  const hint = resolveHint({
    attached,
    restricted,
    enabledRules,
    logCount: state.networkLogs.length,
    logBaseline: state.interceptLogBaseline,
  });

  const signature = hint ? `${hint.tone}|${hint.text}|${hint.action?.id || ''}` : '';
  if (signature === renderedSignature) return;
  renderedSignature = signature;

  if (!hint) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  banner.className = `hint-banner tone-${hint.tone}`;
  banner.style.display = 'flex';
  banner.innerHTML = `
    <span class="hint-banner-icon">${icon(TONE_ICON[hint.tone], { size: 14 })}</span>
    <span class="hint-banner-text">${hint.text}</span>
    ${hint.action ? `<button type="button" class="hint-banner-action" id="${hint.action.id}">${hint.action.label}</button>` : ''}
  `;

  document.getElementById('hintTurnOn')?.addEventListener('click', () => {
    const toggle = document.getElementById('tabInterceptToggle');
    if (!toggle || toggle.disabled) return;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  });

  document.getElementById('hintReload')?.addEventListener('click', async () => {
    const tabId = state.currentTab?.id;
    if (!tabId) return;
    try {
      await chrome.tabs.reload(tabId);
      window.close(); // the popup would only show a stale, empty log
    } catch (error) {
      debug.error('Failed to reload tab:', error);
    }
  });
}

/**
 * Pull the tab's log count so the "reload the page" hint is accurate on first
 * paint — the network view normally owns this fetch, but it only runs once you
 * open that tab.
 */
export async function primeLogCount() {
  if (!state.currentTab?.id) return;
  try {
    const response = await chrome.runtime.sendMessage({
      action: MESSAGES.GET_NETWORK_LOGS,
      tabId: state.currentTab.id,
    });
    state.networkLogs = response?.logs || [];
  } catch (error) {
    // Service worker may still be waking up — the 2s refresh will fill this in.
    debug.error('Failed to prime network log count:', error);
  }
}
