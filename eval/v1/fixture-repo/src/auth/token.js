import { randomBytes } from 'node:crypto';

// Legacy API-key scheme. Keys are opaque, stateful, and never expire —
// docs/rfc-session-tokens.md replaces this module.
const issued = new Map(); // apiKey -> userId

export function createApiKey(userId) {
  const key = 'ak_' + randomBytes(12).toString('hex');
  issued.set(key, userId);
  return key;
}

export function validateApiKey(key) {
  if (!issued.has(key)) return null;
  return { userId: issued.get(key) };
}

export function revokeApiKey(key) {
  return issued.delete(key);
}
