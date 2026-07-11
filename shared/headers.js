// HTTP header helpers shared between the interceptor and the rule engine.

export function getContentType(headers) {
  if (!headers) return '';
  for (const header of headers) {
    if (header.name.toLowerCase() === 'content-type') {
      return header.value;
    }
  }
  return '';
}

export function convertHeaders(headers) {
  if (!headers) return [];
  return headers.map(header => ({ name: header.name, value: header.value }));
}

// CDP's Network domain reports headers as a plain { name: value } map, while
// the Fetch domain (and everything downstream — getContentType, the popup's
// detail view) uses [{ name, value }]. Normalize on the way in.
export function headersToArray(headers) {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers).map(([name, value]) => ({ name, value: String(value) }));
}

// Apply add/set/remove modifications to a header list. Header names are
// case-insensitive, so we normalize to lowercase via a Map.
export function applyHeaderModifications(originalHeaders, modifications) {
  const headersMap = new Map();

  if (originalHeaders) {
    originalHeaders.forEach(header => {
      headersMap.set(header.name.toLowerCase(), header.value);
    });
  }

  modifications.forEach(mod => {
    const headerName = mod.name.toLowerCase();
    if (mod.action === 'add' || mod.action === 'set') {
      headersMap.set(headerName, mod.value);
    } else if (mod.action === 'remove') {
      headersMap.delete(headerName);
    }
  });

  return Array.from(headersMap.entries()).map(([name, value]) => ({ name, value }));
}
