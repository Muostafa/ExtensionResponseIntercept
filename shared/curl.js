// Convert between a captured network log entry and a cURL command.
//
// `toCurl` powers the network inspector's "Copy as cURL".
// `parseCurl` is the inverse: it turns a command pasted from Chrome DevTools
// (right-click a request -> Copy -> Copy as cURL) into the same log-entry shape,
// so the paste flow and the network-inspector flow feed the identical
// create-rule modal.

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

// ── parseCurl ────────────────────────────────────────────────────────────────
//
// This is deliberately forgiving rather than correct. The result lands in a
// prefill modal that the user reviews before saving, so only the URL, method
// and headers really have to be right — a body mangled by exotic shell escaping
// is something they can fix in the textarea. Do not grow this into a real shell
// parser.

// Flags that swallow the next token as their value.
const VALUE_FLAGS = new Set([
  '-X', '--request',
  '-H', '--header',
  '-d', '--data', '--data-raw', '--data-ascii', '--data-binary', '--data-urlencode',
  '-b', '--cookie',
  '-A', '--user-agent',
  '-e', '--referer',
  '-F', '--form',
  '--url',
]);

// Flags that take no value. Anything else starting with `-` is skipped without
// consuming a token — combined with "the URL is the first http(s) token", that
// keeps an unknown flag from eating the URL.
const BOOL_FLAGS = new Set([
  '--compressed', '-k', '--insecure', '-L', '--location', '-s', '--silent',
  '-i', '--include', '-v', '--verbose', '-G', '--get',
  '--http1.1', '--http2', '--http2-prior-knowledge', '-#', '--progress-bar',
]);

const DATA_FLAGS = new Set([
  '-d', '--data', '--data-raw', '--data-ascii', '--data-binary', '--data-urlencode',
]);

/**
 * Chrome offers three "Copy as cURL" flavors and each escapes differently.
 * We only need enough of a signal to pick the right line-continuation and
 * quoting rules.
 */
function detectFlavor(text) {
  if (/`\r?\n/.test(text) || /`"/.test(text)) return 'powershell';
  if (/\^\r?\n/.test(text) || /\^"/.test(text)) return 'cmd';
  return 'posix';
}

/**
 * Fold the command onto one logical line by removing line continuations.
 * Done as a pre-pass rather than inside the tokenizer: a trailing backslash
 * *inside* a quoted body that happens to sit at a line break would be misread,
 * but that is vanishingly rare and the modal is the safety net.
 */
function stripContinuations(text, flavor) {
  const marker = flavor === 'powershell' ? '`' : flavor === 'cmd' ? '^' : '\\\\';
  return text.replace(new RegExp(`${marker}\\r?\\n\\s*`, 'g'), ' ');
}

/**
 * Split into tokens, honouring quotes. One lenient scanner for all flavors:
 * inside a double-quoted run we accept \" (posix/cmd), "" (cmd) and `" (powershell)
 * as an escaped quote.
 */
function tokenize(text, flavor) {
  const tokens = [];
  let token = '';
  let hasToken = false;
  let quote = null; // null | "'" | '"'

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else { token += ch; hasToken = true; }
      continue;
    }

    if (quote === '"') {
      const isEscapedQuote =
        (ch === '\\' && next === '"') ||
        (flavor === 'cmd' && ch === '"' && next === '"') ||
        (flavor === 'powershell' && ch === '`' && next === '"');
      if (isEscapedQuote) { token += '"'; i++; hasToken = true; continue; }
      if (ch === '\\' && next === '\\') { token += '\\'; i++; hasToken = true; continue; }
      // cmd keeps escaping metacharacters ({ } & ! ^ ...) with ^ even inside quotes.
      if (flavor === 'cmd' && ch === '^' && next) { token += next; i++; hasToken = true; continue; }
      if (ch === '"') { quote = null; continue; }
      token += ch;
      hasToken = true;
      continue;
    }

    // Unquoted.
    if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue; }
    if (ch === '\\' && next) { token += next; i++; hasToken = true; continue; }
    // cmd escapes metacharacters with a bare ^ outside quotes.
    if (flavor === 'cmd' && ch === '^' && next) { token += next; i++; hasToken = true; continue; }
    if (/\s/.test(ch)) {
      if (hasToken) { tokens.push(token); token = ''; hasToken = false; }
      continue;
    }
    token += ch;
    hasToken = true;
  }

  if (hasToken) tokens.push(token);
  return tokens;
}

// Bare `example.com/api` (no scheme) is a reasonable thing to paste or to write
// in a curl command. Requiring a dotted host keeps stray words like "hello"
// from being mistaken for a URL.
function looksLikeHost(s) {
  return /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/i.test(s);
}

// The rule suggester runs the URL through `new URL()`, which rejects a bare
// host — normalize so `example.com/api` still produces a proper pattern.
function withScheme(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Split `-XPOST` / `--header=a: b` into [flag, value]; otherwise [token]. */
function splitAttached(token) {
  const eq = token.indexOf('=');
  if (token.startsWith('--') && eq > 2) {
    return [token.slice(0, eq), token.slice(eq + 1)];
  }
  // Short flag with the value glued on, e.g. -XPOST or -H'Accept: x'.
  if (/^-[A-Za-z]/.test(token) && !token.startsWith('--') && token.length > 2) {
    const flag = token.slice(0, 2);
    if (VALUE_FLAGS.has(flag)) return [flag, token.slice(2)];
  }
  return [token];
}

/**
 * Parse a cURL command — or a bare URL — into a log-entry-shaped object that
 * `generateRuleFromRequest` can consume directly.
 *
 * @param {string} text
 * @returns {{ url: string, method: string, headers: Object<string,string>, postData: string|null }}
 * @throws {Error} when no URL can be found
 */
export function parseCurl(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Paste a cURL command or a URL first');

  // A bare URL with no curl wrapper is a perfectly good thing to paste.
  if (!/^curl\b/i.test(raw)) {
    if (/^\S+$/.test(raw) && (/^https?:\/\//i.test(raw) || looksLikeHost(raw))) {
      return { url: withScheme(raw), method: 'GET', headers: {}, postData: null };
    }
    throw new Error("That doesn't look like a cURL command or a URL");
  }

  const flavor = detectFlavor(raw);
  const tokens = tokenize(stripContinuations(raw, flavor), flavor);

  const headers = {};
  const dataParts = [];
  let url = '';
  let explicitMethod = '';
  let forceGet = false;

  for (let i = 0; i < tokens.length; i++) {
    const [flag, attached] = splitAttached(tokens[i]);

    if (flag.toLowerCase() === 'curl') continue;

    if (VALUE_FLAGS.has(flag)) {
      const value = attached !== undefined ? attached : tokens[++i];
      if (value === undefined) continue;

      switch (flag) {
        case '-X': case '--request':
          explicitMethod = value.toUpperCase();
          break;
        case '-H': case '--header': {
          const sep = value.indexOf(':');
          if (sep > 0) {
            const name = value.slice(0, sep).trim();
            // HTTP/2 pseudo-headers (:authority, :method) aren't real headers —
            // toCurl skips them on the way out, so skip them coming back in.
            if (!name.startsWith(':')) headers[name] = value.slice(sep + 1).trim();
          }
          break;
        }
        case '-b': case '--cookie':
          headers['cookie'] = value;
          break;
        case '-A': case '--user-agent':
          headers['user-agent'] = value;
          break;
        case '-e': case '--referer':
          headers['referer'] = value;
          break;
        case '--url':
          url = value;
          break;
        default:
          // -d and friends. curl joins repeated data flags with '&'.
          if (DATA_FLAGS.has(flag) || flag === '-F' || flag === '--form') dataParts.push(value);
          break;
      }
      continue;
    }

    if (flag === '-G' || flag === '--get') { forceGet = true; continue; }
    if (BOOL_FLAGS.has(flag)) continue;
    // Unknown flag: skip it, but do NOT eat the following token.
    if (flag.startsWith('-')) continue;

    // A positional token. Prefer a real http(s) URL, but accept a bare dotted
    // host as a fallback so `curl example.com/api` still works.
    if (/^https?:\/\//i.test(flag)) {
      if (!url || !/^https?:\/\//i.test(url)) url = flag;
    } else if (!url && looksLikeHost(flag)) {
      url = flag;
    }
  }

  if (!url) throw new Error("Couldn't find a URL in that cURL command");
  url = withScheme(url);

  const postData = dataParts.length > 0 ? dataParts.join('&') : null;

  let method = 'GET';
  if (explicitMethod) method = explicitMethod;
  else if (postData && !forceGet) method = 'POST';

  return { url, method, headers, postData };
}
