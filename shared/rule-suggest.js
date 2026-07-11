// Turn a captured request into a suggested mock rule.
//
// The input is "log-entry shaped" — it only needs `url` and `method`, and will
// use `responseBody` / `responseStatus` when they are present. That is
// deliberate: it lets the same function serve both the network inspector
// (real captured entries) and the paste-cURL flow (a parsed command), so one
// prefill modal covers every path into a rule.
//
// Lives in shared/ rather than background/ so the popup can call it directly
// instead of waking the service worker for a round-trip.

const FALLBACK_BODY = '{\n  "message": "Intercepted response"\n}';

/**
 * @param {{ url: string, method?: string, responseBody?: string|null, responseStatus?: number|null }} logEntry
 * @returns {object} a rule draft — no id, ready for ADD_RULE or for populating a form
 */
export function generateRuleFromRequest(logEntry) {
  const method = (logEntry?.method || 'GET').toUpperCase();
  const rawUrl = String(logEntry?.url || '');

  const rule = {
    name: '',
    description: `Auto-generated from ${rawUrl}`,
    urlPattern: '',
    matchType: 'wildcard',
    methods: [method],
    enabled: true,
    contentType: 'application/json',
    modifyType: 'replace',
    modification: {
      // `text` matches what the options form's collectFormData() produces. The
      // interceptor keys the served content type off `contentType`, not this.
      type: 'text',
      value: logEntry?.responseBody || FALLBACK_BODY
    }
  };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    // Not a parseable URL — most likely a pasted fragment. Fall back to a
    // `contains` match on the raw text so the user still gets a usable draft
    // to fix up in the form rather than an error.
    rule.name = `${method} request`;
    rule.urlPattern = rawUrl;
    rule.matchType = 'contains';
    if (logEntry?.responseStatus) rule.modifyStatusCode = logEntry.responseStatus;
    return rule;
  }

  // Numeric path segments are almost always ids — wildcard them so the rule
  // survives the next request (/users/123 -> /users/*).
  const patternPath = url.pathname.replace(/\/\d+/g, '/*');
  rule.urlPattern = `*://${url.host}${patternPath}*`;

  const pathParts = url.pathname.split('/').filter(p => p && !/^\d+$/.test(p));
  rule.name = pathParts.length > 0
    ? `${method} ${pathParts.slice(-2).join('/')}`
    : `${method} ${url.host}`;

  if (logEntry?.responseStatus) rule.modifyStatusCode = logEntry.responseStatus;

  return rule;
}
