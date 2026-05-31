/**
 * Registry of every chrome.runtime message `action` used across the extension.
 * Use these constants instead of string literals so the IDE can autocomplete
 * and a typo turns into a `TypeError: undefined` at import time rather than a
 * silent "Unknown action" branch at runtime.
 *
 * If you add a new message handler in background/service-worker.js, add a key
 * here. If you remove one, also remove it here.
 *
 * NOTE: content/content.js is a content script and cannot use ES module
 * imports under MV3, so it duplicates the `ruleTriggered` literal. Keep it in
 * sync with MESSAGES.RULE_TRIGGERED.
 */
export const MESSAGES = Object.freeze({
  // Status (per-tab attachment + rules snapshot)
  GET_STATUS: 'getStatus',

  // Rules CRUD
  GET_RULES: 'getRules',
  ADD_RULE: 'addRule',
  UPDATE_RULE: 'updateRule',
  DELETE_RULE: 'deleteRule',

  // Groups CRUD + membership
  GET_GROUPS: 'getGroups',
  ADD_GROUP: 'addGroup',
  UPDATE_GROUP: 'updateGroup',
  DELETE_GROUP: 'deleteGroup',
  TOGGLE_GROUP: 'toggleGroup',
  ASSIGN_RULE_TO_GROUP: 'assignRuleToGroup',

  // Debugger lifecycle
  ATTACH_DEBUGGER: 'attachDebugger',
  DETACH_DEBUGGER: 'detachDebugger',

  // Network logs
  GET_NETWORK_LOGS: 'getNetworkLogs',
  CLEAR_NETWORK_LOGS: 'clearNetworkLogs',
  GET_NETWORK_LOGGING_STATUS: 'getNetworkLoggingStatus',
  SET_NETWORK_LOGGING: 'setNetworkLogging',

  // Generate rule from captured request
  GENERATE_RULE_FROM_REQUEST: 'generateRuleFromRequest',
  CREATE_RULE_FROM_REQUEST: 'createRuleFromRequest',

  // Recent notifications (rule-trigger toasts)
  GET_RECENT_NOTIFICATIONS: 'getRecentNotifications',
  CLEAR_NOTIFICATIONS: 'clearNotifications',

  // Per-rule activity stats (in-memory: fire count + last-fired time)
  GET_RULE_STATS: 'getRuleStats',

  // Misc
  FETCH_URL_AS_BASE64: 'fetchUrlAsBase64',
  IMPORT_DATA: 'importData',

  // Outgoing (background → popup/content)
  RULE_TRIGGERED: 'ruleTriggered',
});
