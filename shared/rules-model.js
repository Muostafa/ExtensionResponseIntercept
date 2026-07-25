// Rule list logic shared by the popup and the options page.
//
// The two pages render rules very differently on purpose — the popup is a
// compact row with an inline quick editor, the options page is a seven-column
// table with drag-and-drop, priority, and duplicate/delete. That divergence is
// the product. What must *not* diverge is the logic underneath: which rules a
// search matches, what order they come out in, and which group they belong to.
// A search that behaved differently in the two lists would be a bug, so it
// lives here once.
//
// Everything in this file is pure: no DOM, no chrome.* calls. Each page reads
// its own controls and passes plain values in.

import { STATUS_CODE_MIN, STATUS_CODE_MAX } from './constants.js';

/** Fields a search query is matched against, in the order a user would expect. */
export function ruleMatchesQuery(rule, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (rule.name || '').toLowerCase().includes(q)
    || (rule.urlPattern || '').toLowerCase().includes(q)
    || (rule.description || '').toLowerCase().includes(q);
}

/** @returns {Array} a new array; the input is not mutated. */
export function filterRules(rules, query) {
  if (!(query || '').trim()) return [...rules];
  return rules.filter(rule => ruleMatchesQuery(rule, query));
}

/**
 * @param {Array} rules
 * @param {object} [opts]
 * @param {'modified'|'created'|'name'|'priority'} [opts.sortBy]
 * @param {'asc'|'desc'} [opts.sortOrder]
 * @param {boolean} [opts.enabledFirst] enabled rules ahead of disabled ones,
 *   applied before `sortBy` so it wins ties
 * @returns {Array} a new array; the input is not mutated.
 */
export function sortRules(rules, { sortBy = 'modified', sortOrder = 'desc', enabledFirst = false } = {}) {
  return [...rules].sort((a, b) => {
    if (enabledFirst) {
      const enabledDiff = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      if (enabledDiff !== 0) return enabledDiff;
    }

    let comparison = 0;
    if (sortBy === 'modified') {
      comparison = (a.modifiedAt || a.createdAt || 0) - (b.modifiedAt || b.createdAt || 0);
    } else if (sortBy === 'created') {
      comparison = (a.createdAt || 0) - (b.createdAt || 0);
    } else if (sortBy === 'name') {
      comparison = (a.name || '').localeCompare(b.name || '');
    } else if (sortBy === 'priority') {
      comparison = (a.priority || 0) - (b.priority || 0);
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });
}

/**
 * Split rules into their groups, preserving the order they arrive in.
 * @returns {{byGroup: Map<string, Array>, ungrouped: Array}}
 */
export function partitionRulesByGroup(rules) {
  const byGroup = new Map();
  const ungrouped = [];

  for (const rule of rules) {
    if (rule.groupId) {
      if (!byGroup.has(rule.groupId)) byGroup.set(rule.groupId, []);
      byGroup.get(rule.groupId).push(rule);
    } else {
      ungrouped.push(rule);
    }
  }

  return { byGroup, ungrouped };
}

/** Both lists show groups alphabetically. @returns {Array} a new array. */
export function sortGroupsByName(groups) {
  return [...groups].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Status codes with a registered meaning. A code outside this list still works —
// the interceptor will serve it — so it warns rather than rejects.
const VALID_STATUS_CODES = new Set([
  100, 101, 102, 103,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
]);

/**
 * Validate a status-code field and normalise it for storage.
 *
 * `value` is deliberately `null` — never `undefined` — when the field is blank:
 * updateRule() treats an absent key as "leave this alone", so a rule would keep
 * its old code if the key were dropped. All three status-code editors depend on
 * this: the popup's quick editor, the options list's inline field, and the full
 * rule form.
 *
 * `warning` states the fact only; each surface phrases it for its own context
 * (a toast alongside "Saved", a chip beside a field you can still edit).
 *
 * @param {string|number} raw the field's value; empty means "no override"
 * @returns {{valid: boolean, value?: number|null, message?: string, warning?: string}}
 */
export function validateStatusCode(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { valid: true, value: null };

  const code = parseInt(trimmed, 10);
  if (isNaN(code) || code < STATUS_CODE_MIN || code > STATUS_CODE_MAX) {
    return {
      valid: false,
      message: `Status code must be between ${STATUS_CODE_MIN} and ${STATUS_CODE_MAX}`,
    };
  }

  if (!VALID_STATUS_CODES.has(code)) {
    return { valid: true, value: code, warning: `${code} is not a standard HTTP status code` };
  }
  return { valid: true, value: code };
}

/** Shared bounds for the options page's priority field. */
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 999;

/** @returns {{valid: boolean, value?: number, message?: string}} blank means 0. */
export function validatePriority(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { valid: true, value: 0 };

  const priority = parseInt(trimmed, 10);
  if (isNaN(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
    return { valid: false, message: `Priority must be ${PRIORITY_MIN}–${PRIORITY_MAX}` };
  }
  return { valid: true, value: priority };
}
