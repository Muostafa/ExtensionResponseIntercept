// Dark/light theme persistence. Popup and options pages share this, but they
// render the toggle button differently (popup swaps an inline SVG; options
// updates icon + label text), so callers pass a `renderButton(theme)` callback.

const STORAGE_KEY = 'theme';

export function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'light';
}

export function applyTheme(theme, renderButton) {
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof renderButton === 'function') renderButton(theme);
}

export function loadTheme(renderButton) {
  const theme = getStoredTheme();
  applyTheme(theme, renderButton);
  return theme;
}

export function toggleTheme(renderButton) {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next, renderButton);
  return next;
}
