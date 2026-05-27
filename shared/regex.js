/**
 * Safely compile a user-supplied regex pattern. Returns a compiled RegExp on
 * success, or null on rejection. Rejects:
 *   - empty or absent patterns
 *   - patterns longer than 1000 characters
 *   - patterns containing nested quantifiers (e.g. (X+)+, (X*)*, [...]++) that
 *     are the primary cause of catastrophic backtracking (ReDoS)
 *   - patterns that the JS engine itself rejects as syntactically invalid
 *
 * Callers should treat a null return as a failed compilation and avoid
 * applying the pattern.
 */
import { debug } from './debug.js';

export function safeCompileRegex(pattern, flags) {
  if (!pattern || pattern.length > 1000) {
    debug.error('Regex pattern rejected: too long or empty');
    return null;
  }
  if (/(\(.*[+*]\))[+*?]|(\[[^\]]*\])[+*?][+*?]/.test(pattern)) {
    debug.error('Regex pattern rejected: nested quantifiers detected (ReDoS risk):', pattern);
    return null;
  }
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    debug.error('Regex pattern failed to compile:', e);
    return null;
  }
}
