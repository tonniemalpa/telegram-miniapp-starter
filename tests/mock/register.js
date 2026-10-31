// Maps the platform-only imports `sdk` and `sdk/db` to the in-memory mocks.
// Used by `npm test` (Node 20.6+).
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  const map = {
    'sdk': ${JSON.stringify(new URL('./sdk.js', import.meta.url).href)},
    'sdk/db': ${JSON.stringify(new URL('./sdk-db.js', import.meta.url).href)},
  };
  export async function resolve(specifier, context, next) {
    if (specifier in map) return { url: map[specifier], shortCircuit: true };
    return next(specifier, context);
  }
`));
