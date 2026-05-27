// Shared mutable state for all options modules. Modules import `state` and
// `groupsState` and mutate `.X` properties — never destructure (that captures
// a snapshot and silently breaks features like undo, drag autoexpand, JSON
// editor validation, and the in-flight delete confirmation).

export const state = {
  currentEditingRuleId: null,
  headerModificationCounter: 0,
  collapsedGroups: new Set(),
  optionsSearchQuery: '',
  pendingDeletedRule: null,
  jsonEditorSourceTextarea: null,
  jsonValidateTimer: null,
  dragAutoExpandTimeout: null,
  activeToastTimeout: null,
};

// Loaded groups list. Kept on the same object so importers can read
// `groupsState.list` and stay in sync after loadGroups() reassigns.
export const groupsState = {
  list: [],
};

export const BODY_PLACEHOLDERS = {
  'application/json': '{"message": "Modified response"}',
  'text/html': '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>',
  'text/plain': 'Hello, world!',
  'application/xml': '<?xml version="1.0"?>\n<root>\n  <item>value</item>\n</root>',
  'text/csv': 'id,name,value\n1,foo,bar',
  'application/javascript': 'console.log("intercepted");',
  'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
};

export const MATCH_TYPE_HINTS = {
  wildcard: {
    title: 'Wildcard',
    desc: 'Use <code>*</code> to match any single path segment and <code>**</code> to match any number of segments.',
    example: '<code>*://*/api/**</code> matches any domain and any path under <code>/api/</code>'
  },
  regex: {
    title: 'Regular Expression',
    desc: 'Full JavaScript regex matched against the URL. Do not include leading/trailing slashes.',
    example: '<code>api\\.example\\.com/users/\\d+</code> matches <code>/users/123</code> but not <code>/users/abc</code>'
  },
  exact: {
    title: 'Exact Match',
    desc: 'The URL must match the pattern character-for-character, including protocol and query string.',
    example: '<code>https://api.example.com/users</code> only matches that exact URL'
  },
  contains: {
    title: 'Contains',
    desc: 'Matches any URL that contains the pattern as a substring anywhere.',
    example: '<code>/api/users</code> matches <code>https://dev.example.com/api/users/list</code>'
  }
};
