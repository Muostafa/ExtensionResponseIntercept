export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Reject if `promise` doesn't settle within `ms` milliseconds. `label` is used
// in the rejection message so callers can tell which operation timed out.
export function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
