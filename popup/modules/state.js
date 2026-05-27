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
  networkLogs: [],
  networkRefreshInterval: null,
  collapsedGroups: new Set(),
  isNetworkLoggingEnabled: true,
  recentlyFiredCollapsed: false,
};
