export const CONTENT_TYPE_PRESETS = {
  'application/json':       { label: 'JSON',       binary: false },
  'text/html':              { label: 'HTML',       binary: false },
  'text/plain':             { label: 'Plain Text', binary: false },
  'application/xml':        { label: 'XML',        binary: false },
  'text/xml':               { label: 'XML',        binary: false },
  'text/csv':               { label: 'CSV',        binary: false },
  'application/javascript': { label: 'JavaScript', binary: false },
  'image/svg+xml':          { label: 'SVG',        binary: false },
  'application/pdf':        { label: 'PDF',        binary: true  },
  'image/png':              { label: 'PNG',        binary: true  },
  'image/jpeg':             { label: 'JPEG',       binary: true  },
  'image/gif':              { label: 'GIF',        binary: true  },
  'image/webp':             { label: 'WebP',       binary: true  },
};

export function isBinaryContentType(ct) {
  if (!ct) return false;
  if (CONTENT_TYPE_PRESETS[ct]) return CONTENT_TYPE_PRESETS[ct].binary === true;
  if (ct.startsWith('image/')) return true;
  if (ct === 'application/octet-stream') return true;
  return false;
}
