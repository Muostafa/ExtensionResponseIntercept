// Shared mutable state for all popup modules. Modules must mutate `state.X`
// directly — never destructure values into locals, since that captures a
// snapshot and silently breaks features that rely on cross-module updates
// (active edit, undo, network refresh).

export const state = {
  currentTab: null,
  activeEditRuleIds: new Set(),
  searchQuery: '',
  networkSearchQuery: '',
  currentView: 'rules', // 'rules' or 'network'
  selectedLogEntry: null,
  suggestedMatchType: null,    // match type the suggester picked for the open create-rule modal
  bulkDrafts: [],              // [{ rule, hadBody, entry }] backing the bulk-create modal
  networkLogs: [],
  expandedLogIds: new Set(),   // network rows currently expanded (survives the 2s refresh)
  selectedLogIds: new Set(),   // network rows ticked for bulk mocking (survives the 2s refresh)
  networkMethodFilter: '',     // '', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'
  networkStatusFilter: '',     // '', '2xx', '3xx', '4xx', '5xx'
  networkRefreshInterval: null,
  collapsedGroups: new Set(),
  isNetworkLoggingEnabled: true,
  recentlyFiredCollapsed: false,
};
