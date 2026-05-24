/**
 * Debounce: delays calling `func` until `wait` ms have elapsed since the last
 * invocation. The returned function exposes `.flush()` which invokes `func`
 * immediately with the most recent arguments (if any are pending) and cancels
 * the timer.
 */
export function debounce(func, wait) {
  let timeout;
  let lastArgs;
  function executedFunction(...args) {
    lastArgs = args;
    const later = () => { clearTimeout(timeout); timeout = null; func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }
  executedFunction.flush = function() {
    if (timeout) { clearTimeout(timeout); timeout = null; func(...(lastArgs || [])); }
  };
  return executedFunction;
}
