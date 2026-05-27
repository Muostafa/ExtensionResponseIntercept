// Gated logging. Flip DEBUG to true to surface log/warn/info during development.
// error always passes through so production issues remain visible.
//
// Content scripts cannot import ES modules under MV3; content/content.js has a
// local copy of this object. Keep them in sync.

const DEBUG = false;
const PREFIX = '[APIInt]';

export const debug = {
  log:   (...args) => { if (DEBUG) console.log(PREFIX, ...args); },
  warn:  (...args) => { if (DEBUG) console.warn(PREFIX, ...args); },
  info:  (...args) => { if (DEBUG) console.info(PREFIX, ...args); },
  error: (...args) => { console.error(PREFIX, ...args); },
};
