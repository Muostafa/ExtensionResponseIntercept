// HTML escaping for safe string interpolation into innerHTML.
// Use this anywhere user-supplied text is rendered as HTML.
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
