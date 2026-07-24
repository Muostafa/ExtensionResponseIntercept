// Translate the enabled rules into CDP Fetch.enable url patterns, so only
// requests that could actually be mocked get paused. With no enabled rules the
// caller disables Fetch entirely — a genuine zero-pause record-only mode.
//
// WHY THIS IS SAFE
// ----------------
// The two glob languages are not the same, and the difference runs in our
// favour:
//
//   this extension (shared/url-matching.js)   Chrome's Fetch domain
//   ----------------------------------------  ---------------------------
//   *   -> [^/]*  (won't cross a '/')          *  -> any run of any chars
//   **  -> .*                                  ?  -> exactly one char
//   ?   -> a literal '?'                       \  -> escape
//
// So handing a rule's wildcard straight to Fetch matches a SUPERSET of what the
// rule engine will match: we may pause a few requests we then don't mock, but
// we can never fail to pause one we would have mocked. handleRequestPaused
// re-checks precisely via ruleEngine.findMatchingRules(), so the extra pauses
// are simply continued.
//
// `regex` rules cannot be expressed as a glob at all — one of them forces the
// whole tab back to the wide '*' pattern (i.e. today's behaviour).

import { isSafeRegex } from '../shared/regex.js';

/** Escape the characters Chrome's Fetch glob treats as special. */
function escapeGlob(literal, { keepStar = false } = {}) {
  let out = '';
  for (const ch of String(literal)) {
    if (ch === '\\') { out += '\\\\'; continue; }
    if (ch === '?') { out += '\\?'; continue; }
    if (ch === '*') { out += keepStar ? '*' : '\\*'; continue; }
    out += ch;
  }
  return out;
}

/**
 * @returns {string|null|undefined} a Fetch glob; null if the rule can't be
 *   expressed as one (caller must widen); undefined if the rule can never match
 *   anything and should simply be skipped.
 */
function ruleToGlob(rule) {
  const pattern = rule?.urlPattern;
  if (!pattern) return undefined;

  switch (rule.matchType) {
    case 'wildcard':
      // Pass the '*'s through — see the superset argument above.
      return escapeGlob(pattern, { keepStar: true });

    case 'exact':
      return escapeGlob(pattern);

    case 'contains':
      return `*${escapeGlob(pattern)}*`;

    case 'regex':
      // A regex the engine rejected will never match a request, so widening the
      // whole tab on its behalf would pause every request for nothing. The
      // rule engine logs the rejection when it compiles; this is only a probe.
      return isSafeRegex(pattern) ? null : undefined;

    default:
      return undefined;
  }
}

/**
 * @param {object[]} enabledRules
 * @returns {{ patterns: Array<{urlPattern: string, requestStage: 'Request'}>, wide: boolean }}
 *   wide === true          a regex rule forced the '*' fallback
 *   patterns.length === 0  no enabled rules — the caller should call Fetch.disable
 */
export function buildFetchPatterns(enabledRules) {
  const rules = Array.isArray(enabledRules) ? enabledRules : [];
  if (rules.length === 0) return { patterns: [], wide: false };

  const globs = new Set();

  for (const rule of rules) {
    const glob = ruleToGlob(rule);
    if (glob === undefined) continue; // rule can never match — contributes nothing
    if (glob === null) {
      // Can't narrow safely — pause everything, exactly as before.
      return { patterns: [{ urlPattern: '*', requestStage: 'Request' }], wide: true };
    }
    globs.add(glob);
  }

  return {
    patterns: Array.from(globs, urlPattern => ({ urlPattern, requestStage: 'Request' })),
    wide: false,
  };
}
