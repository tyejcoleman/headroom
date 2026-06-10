import { validateApiKey } from './token.js';

/** Throws a 401 error unless the request carries a valid credential. */
export function requireAuth(req) {
  const key = req.headers['x-api-key'];
  const session = key ? validateApiKey(key) : null;
  if (!session) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  return session;
}
