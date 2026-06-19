// Build a copy-pasteable cURL command from a captured network log entry.
// Used by the popup network inspector ("Copy as cURL").

// Wrap a value in single quotes for POSIX shells, escaping embedded single quotes.
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {{ url: string, method?: string, headers?: Object, postData?: string }} log
 * @returns {string} a runnable curl command (one flag per line)
 */
export function toCurl(log) {
  if (!log || !log.url) return '';

  const parts = [`curl ${shellQuote(log.url)}`];

  const method = (log.method || 'GET').toUpperCase();
  if (method !== 'GET') parts.push(`-X ${method}`);

  // Request headers from the Fetch domain arrive as a plain { name: value } map.
  const headers = log.headers || {};
  for (const name of Object.keys(headers)) {
    if (name.startsWith(':')) continue; // skip HTTP/2 pseudo-headers curl rejects
    parts.push(`-H ${shellQuote(`${name}: ${headers[name]}`)}`);
  }

  if (log.postData) parts.push(`--data-raw ${shellQuote(log.postData)}`);

  return parts.join(' \\\n  ');
}
