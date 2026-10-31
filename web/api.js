// Calls a backend endpoint (tgcloud/endpoints/<name>.js) and returns a Promise.
// The Telegram client attaches the user's init data; the platform verifies it.
export function call(name, input = {}) {
  return new Promise((resolve, reject) => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.Serverless) {
      reject(Object.assign(new Error('Not running inside Telegram'), { type: 'NO_TELEGRAM' }));
      return;
    }
    tg.Serverless.call(name, input, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

// A message that is safe to show to the user.
export function errorText(err) {
  if (err?.type === 'ENDPOINT_ERROR') return err.message;
  if (err?.type === 'UNAUTHORIZED' || err?.type === 'NO_TELEGRAM') return 'Open this app from its bot inside Telegram.';
  return 'Something went wrong. Please try again.';
}
