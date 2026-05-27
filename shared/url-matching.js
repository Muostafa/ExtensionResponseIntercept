// URL pattern matching used by both the runtime rule engine and the options
// page's "test pattern" helper. Keeping a single implementation prevents the
// two from drifting apart.

import { safeCompileRegex } from './regex.js';

// Convert a wildcard pattern to a regex source string.
//   *  matches any character except '/'
//   ** matches any character including '/'
export function wildcardToRegexSource(pattern) {
  return pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<!DW!>')
    .replace(/\*/g, '[^/]*')
    .replace(/<!DW!>/g, '.*');
}

export function compileWildcard(pattern) {
  return safeCompileRegex(`^${wildcardToRegexSource(pattern)}$`);
}

export function testUrlPattern(url, pattern, matchType) {
  if (!url || !pattern) return null;
  switch (matchType) {
    case 'exact':
      return url === pattern;
    case 'contains':
      return url.includes(pattern);
    case 'regex': {
      const compiled = safeCompileRegex(pattern);
      return compiled ? compiled.test(url) : false;
    }
    case 'wildcard':
    default: {
      const compiled = compileWildcard(pattern);
      return compiled ? compiled.test(url) : false;
    }
  }
}
