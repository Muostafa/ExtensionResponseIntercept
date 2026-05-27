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
