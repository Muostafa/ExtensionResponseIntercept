/**
 * Safely compile a user-supplied regex pattern. Returns a compiled RegExp on
 * success, or null on rejection. Rejects:
 *   - empty or absent patterns
 *   - patterns longer than 1000 characters
 *   - patterns containing nested quantifiers (e.g. (X+)+, (X*)*, ((X+))+) that
 *     are the primary cause of catastrophic backtracking (ReDoS)
 *   - patterns that the JS engine itself rejects as syntactically invalid
 *
 * Callers should treat a null return as a failed compilation and avoid
 * applying the pattern.
 */
import { debug } from './debug.js';

/**
 * True if the pattern contains a repeated group whose body already repeats —
 * the (X+)+ / (X*)* / ((X+))+ shape whose backtracking is exponential.
 *
 * Deliberately a scan rather than a regex. A regex can't do this job: stopping
 * at the first ')' (`\([^)]*[+*][^)]*\)[+*]`) misses ((X+))+, which nests one
 * level deeper, while a greedy `\(.*[+*]\)[+*]` spans unrelated groups and
 * flags safe patterns like (foo)*bar(baz)+. Pairing each ')' with its own '('
 * needs a stack.
 *
 * Only '+' and '*' count as the outer quantifier: `(X+)?` can match at most
 * once, so it is linear, and rejecting it used to block ordinary patterns like
 * /users/(\d+)?/profile.
 */
function hasNestedQuantifier(pattern) {
  // One entry per currently-open group: has a quantifier appeared in its body?
  const bodyRepeats = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    // An escaped character is a literal — `(a\+)+` repeats a literal plus sign.
    if (ch === '\\') {
      i++;
      continue;
    }

    // Inside a character class '+', '*', '(' and ')' are all literals, so skip
    // the class wholesale. `[]` is an empty class in JS, not a literal ']'.
    if (ch === '[') {
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      continue;
    }

    if (ch === '(') {
      bodyRepeats.push(false);
      continue;
    }

    // A quantifier belongs to every group still open around it, however deeply
    // it is nested — that is what makes ((a+))+ catastrophic.
    if (ch === '+' || ch === '*') {
      for (let d = 0; d < bodyRepeats.length; d++) bodyRepeats[d] = true;
      continue;
    }

    if (ch === ')') {
      // pop() is undefined on an unbalanced ')' — falsy, so it just won't match.
      const repeats = bodyRepeats.pop();
      const next = pattern[i + 1];
      if (repeats && (next === '+' || next === '*')) return true;
    }
  }

  return false;
}

/**
 * Run every check without logging.
 * @returns {{regex: RegExp}|{reason: string}}
 */
function tryCompile(pattern, flags) {
  if (!pattern || pattern.length > 1000) {
    return { reason: 'too long or empty' };
  }
  if (hasNestedQuantifier(pattern)) {
    return { reason: 'nested quantifiers (ReDoS risk)' };
  }
  try {
    return { regex: new RegExp(pattern, flags) };
  } catch (e) {
    return { reason: `invalid syntax — ${e.message}` };
  }
}

export function safeCompileRegex(pattern, flags) {
  const result = tryCompile(pattern, flags);
  if (result.reason) {
    debug.error(`Regex pattern rejected (${result.reason}):`, pattern);
    return null;
  }
  return result.regex;
}

/**
 * The same checks with no console output, for callers that only need a yes/no
 * and run often — buildFetchPatterns re-probes every regex rule on every tab
 * whenever the rule set changes, and one bad pattern shouldn't flood the
 * service-worker log. Whoever actually applies the rule still reports it.
 */
export function isSafeRegex(pattern, flags) {
  return !tryCompile(pattern, flags).reason;
}
