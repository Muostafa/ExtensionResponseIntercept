// Interception status strip + first-run onboarding callout for the options page.
//
// Interception is per-tab: rules fire only on tabs where the user turned on
// "Intercept this tab" in the popup. The options page is its own tab and cannot
// attach a web page, so this strip is purely informational — it reports how many
// tabs are currently being intercepted and nudges the user when none are.

import { MESSAGES } from '../../shared/messages.js';
import { debug } from '../../shared/debug.js';

const ONBOARDING_FLAG = 'onboardingDismissed';

/**
 * Resolve attached tab IDs to hostnames for a friendlier strip message.
 * Best-effort: missing/closed tabs are skipped.
 */
async function resolveHostnames(tabIds) {
  const hosts = [];
  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url) hosts.push(new URL(tab.url).hostname);
    } catch {
      // tab gone — ignore
    }
  }
  return hosts;
}

function renderStrip(activeTabs, hostnames) {
  const strip = document.getElementById('interceptionStatus');
  const dot = document.getElementById('interceptStatusDot');
  const title = document.getElementById('interceptStatusTitle');
  const hint = document.getElementById('interceptStatusHint');
  if (!strip || !dot || !title || !hint) return;

  strip.style.display = 'flex';
  strip.classList.remove('intercept-ok', 'intercept-warn');
  dot.className = 'intercept-dot';

  const tabCount = Array.isArray(activeTabs) ? activeTabs.length : 0;

  if (tabCount === 0) {
    strip.classList.add('intercept-warn');
    dot.classList.add('warn');
    title.textContent = 'No tab is being intercepted';
    hint.textContent = 'Your rules won’t fire yet. Open the popup on the page you want to mock and turn on “Intercept this tab”.';
  } else {
    strip.classList.add('intercept-ok');
    dot.classList.add('ok');
    title.textContent = `Intercepting ${tabCount} tab${tabCount === 1 ? '' : 's'}`;
    const shown = hostnames.slice(0, 3).join(', ');
    const extra = hostnames.length > 3 ? ` +${hostnames.length - 3} more` : '';
    hint.textContent = shown ? `${shown}${extra}` : 'Matching requests are being mocked.';
  }
}

export async function loadInterceptionStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ action: MESSAGES.GET_STATUS });
    const activeTabs = status?.activeTabs || [];
    const hostnames = activeTabs.length ? await resolveHostnames(activeTabs) : [];
    renderStrip(activeTabs, hostnames);
  } catch (error) {
    debug.error('Failed to load interception status:', error);
  }
}

async function maybeShowOnboarding() {
  const callout = document.getElementById('onboardingCallout');
  if (!callout) return;
  try {
    const { [ONBOARDING_FLAG]: dismissed } = await chrome.storage.local.get(ONBOARDING_FLAG);
    callout.style.display = dismissed ? 'none' : 'block';
  } catch {
    // If storage is unavailable, default to showing it once.
    callout.style.display = 'block';
  }
}

async function dismissOnboarding() {
  const callout = document.getElementById('onboardingCallout');
  if (callout) callout.style.display = 'none';
  try {
    await chrome.storage.local.set({ [ONBOARDING_FLAG]: true });
  } catch (error) {
    debug.error('Failed to persist onboarding dismissal:', error);
  }
}

export function setupInterceptionStatus() {
  document.getElementById('onboardingGotIt')?.addEventListener('click', dismissOnboarding);
  document.getElementById('onboardingDismiss')?.addEventListener('click', dismissOnboarding);

  // Attachment state isn't in storage, so refresh the strip when the user has
  // likely changed it: returning to this tab after toggling in the popup, or
  // when a rule fires (which proves a tab is attached).
  window.addEventListener('focus', loadInterceptionStatus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadInterceptionStatus();
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === MESSAGES.RULE_TRIGGERED) loadInterceptionStatus();
    return false;
  });

  maybeShowOnboarding();
}
