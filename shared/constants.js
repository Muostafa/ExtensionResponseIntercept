// Shared constants. Magic numbers used to be scattered through the source —
// when a value shows up in more than one module, it lives here.
//
// Content scripts cannot import ES modules under MV3, so content/content.js
// redeclares the few values it needs locally. Keep those in sync.

export const REQUEST_TIMEOUT_MS = 5000;
export const STORAGE_RESPONSE_MAX_LENGTH = 50000;
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export const TOAST_DURATION_MS = 4000;
export const TOAST_HIDE_ANIMATION_MS = 300;
export const URL_TRUNCATE_LENGTH = 60;

export const NETWORK_REFRESH_INTERVAL_MS = 2000;
export const DEBOUNCE_SAVE_MS = 500;
export const SEARCH_DEBOUNCE_MS = 150;
export const DRAG_AUTOEXPAND_MS = 500;

export const MAX_TABS = 100;
export const MAX_LOGS_PER_TAB = 100;

// Network logs are mirrored into chrome.storage.session so they survive an MV3
// service-worker recycle. Session storage is memory-only and cleared when the
// browser closes, which is what we want for captured bodies and auth headers.
export const NETWORK_LOG_PERSIST_DEBOUNCE_MS = 1000;
// Bodies are capped harder in the persisted copy than in memory — the point of
// the mirror is to survive a restart, not to be a complete archive.
export const SESSION_RESPONSE_MAX_LENGTH = 20000;
// Session quota is 10MB; stay well inside it.
export const SESSION_LOGS_MAX_CHARS = 4 * 1024 * 1024;

// Ceiling on how many requests one "Mock selected" action will turn into rules.
export const MAX_BULK_MOCK = 25;

// Rules can change in bursts (import, bulk create, drag between groups); coalesce
// the Fetch.enable refresh that follows.
export const FETCH_PATTERN_REFRESH_DEBOUNCE_MS = 300;

export const STATUS_CODE_MIN = 100;
export const STATUS_CODE_MAX = 599;

// Pages the Chrome debugger cannot attach to — interception is unavailable here.
// Shared by the popup (to disable the toggle) and the background (attach guard +
// keyboard/context-menu toggle) so both agree on which pages are off-limits.
export const RESTRICTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://', 'view-source:'];

export function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(p => url.startsWith(p));
}
