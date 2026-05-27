import { state } from './state.js';
import { showToast } from './toast.js';

export function openJsonEditorModal(sourceTextareaId) {
  const source = document.getElementById(sourceTextareaId);
  if (!source) return;

  state.jsonEditorSourceTextarea = source;
  const modal = document.getElementById('jsonEditorModal');
  const textarea = document.getElementById('jsonEditorTextarea');

  textarea.value = source.value;
  modal.style.display = 'flex';
  textarea.focus();

  updateJsonEditorLineNumbers();
  updateJsonEditorCursorPosition();
  validateJsonEditorContent();
}

export function closeJsonEditorModal(apply) {
  clearTimeout(state.jsonValidateTimer);
  const modal = document.getElementById('jsonEditorModal');
  const textarea = document.getElementById('jsonEditorTextarea');

  if (apply && state.jsonEditorSourceTextarea) {
    state.jsonEditorSourceTextarea.value = textarea.value;
    state.jsonEditorSourceTextarea.dispatchEvent(new Event('input'));
  }

  modal.style.display = 'none';
  state.jsonEditorSourceTextarea = null;
}

function updateJsonEditorLineNumbers() {
  const textarea = document.getElementById('jsonEditorTextarea');
  const lineNumbers = document.getElementById('jsonEditorLineNumbers');
  const lines = textarea.value.split('\n').length;

  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) =>
    `<div class="line-number">${i + 1}</div>`
  ).join('');
}

function updateJsonEditorCursorPosition() {
  const textarea = document.getElementById('jsonEditorTextarea');
  const info = document.getElementById('jsonEditorInfo');
  const text = textarea.value.substring(0, textarea.selectionStart);
  const line = text.split('\n').length;
  const col = text.split('\n').pop().length + 1;
  info.textContent = `Line ${line}, Col ${col}`;
}

function validateJsonEditorContent() {
  clearTimeout(state.jsonValidateTimer);
  state.jsonValidateTimer = setTimeout(() => {
    const textarea = document.getElementById('jsonEditorTextarea');
    const status = document.getElementById('jsonEditorStatus');
    const content = textarea.value.trim();
    const ct = document.getElementById('responseContentType')?.value || 'application/json';

    if (!content) {
      status.textContent = '';
      status.className = 'json-editor-status';
      return;
    }

    if (ct === 'application/json') {
      try {
        JSON.parse(content);
        status.textContent = 'Valid JSON';
        status.className = 'json-editor-status valid';
      } catch (e) {
        status.textContent = 'Invalid JSON';
        status.className = 'json-editor-status invalid';
      }
    } else if (ct === 'application/xml' || ct === 'text/xml') {
      const doc = new DOMParser().parseFromString(content, 'application/xml');
      const hasError = doc.querySelector('parsererror');
      status.textContent = hasError ? 'Invalid XML' : 'Valid XML';
      status.className = `json-editor-status ${hasError ? 'invalid' : 'valid'}`;
    } else {
      status.textContent = `${content.length} chars`;
      status.className = 'json-editor-status';
    }
  }, 300);
}

export function setupJsonEditorListeners() {
  document.getElementById('expandJsonEditorBtn')?.addEventListener('click', () => {
    openJsonEditorModal('replaceValue');
  });

  document.getElementById('jsonEditorApply')?.addEventListener('click', () => closeJsonEditorModal(true));
  document.getElementById('jsonEditorCancel')?.addEventListener('click', () => closeJsonEditorModal(false));
  document.getElementById('jsonEditorClose')?.addEventListener('click', () => closeJsonEditorModal(false));

  const jsonEditorTextarea = document.getElementById('jsonEditorTextarea');
  if (jsonEditorTextarea) {
    jsonEditorTextarea.addEventListener('input', () => {
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    });

    jsonEditorTextarea.addEventListener('scroll', () => {
      const lineNumbers = document.getElementById('jsonEditorLineNumbers');
      lineNumbers.scrollTop = jsonEditorTextarea.scrollTop;
    });

    jsonEditorTextarea.addEventListener('click', updateJsonEditorCursorPosition);
    jsonEditorTextarea.addEventListener('keyup', updateJsonEditorCursorPosition);

    jsonEditorTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = jsonEditorTextarea.selectionStart;
        const end = jsonEditorTextarea.selectionEnd;
        jsonEditorTextarea.value = jsonEditorTextarea.value.substring(0, start) + '  ' + jsonEditorTextarea.value.substring(end);
        jsonEditorTextarea.selectionStart = jsonEditorTextarea.selectionEnd = start + 2;
        updateJsonEditorLineNumbers();
        validateJsonEditorContent();
      }
      if (e.key === 'Escape') closeJsonEditorModal(false);
    });
  }

  document.getElementById('jsonEditorPrettify')?.addEventListener('click', () => {
    const ta = document.getElementById('jsonEditorTextarea');
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });

  document.getElementById('jsonEditorMinify')?.addEventListener('click', () => {
    const ta = document.getElementById('jsonEditorTextarea');
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value));
      updateJsonEditorLineNumbers();
      validateJsonEditorContent();
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  });

  document.getElementById('jsonEditorModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'jsonEditorModal') closeJsonEditorModal(false);
  });
}
