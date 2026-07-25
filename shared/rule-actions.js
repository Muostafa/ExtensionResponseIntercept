// Rule mutations both list views perform, as service-worker round-trips.
//
// Separate from rules-model.js because that file is deliberately pure — this one
// talks to the background. Neither page's toasting or re-rendering lives here:
// these return what happened and let the caller decide what to say about it.

import { MESSAGES } from './messages.js';

/** @returns {Promise<Array>} every stored rule. */
export async function fetchRules() {
  const response = await chrome.runtime.sendMessage({ action: MESSAGES.GET_RULES });
  return response?.rules || [];
}

/**
 * Flip a rule's enabled flag.
 *
 * Re-reads from storage rather than trusting the caller's copy, because the list
 * may have been rendered before another surface changed the same rule.
 *
 * @returns {Promise<{enabled: boolean}|null>} null if the rule no longer exists
 */
export async function toggleRuleEnabled(ruleId) {
  const rules = await fetchRules();
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  rule.enabled = !rule.enabled;
  await chrome.runtime.sendMessage({ action: MESSAGES.UPDATE_RULE, ruleId, rule });
  return { enabled: rule.enabled };
}

/**
 * Store a rule.
 *
 * Pass the complete object, not just the changed keys: updateRule() in the
 * service worker spreads what it receives over the stored rule, so an absent
 * key keeps its old value rather than clearing it.
 *
 * @param {string} ruleId
 * @param {object} rule the complete rule object to store
 */
export async function updateRule(ruleId, rule) {
  await chrome.runtime.sendMessage({ action: MESSAGES.UPDATE_RULE, ruleId, rule });
}
