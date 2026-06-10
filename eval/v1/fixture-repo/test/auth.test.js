import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiKey, validateApiKey, revokeApiKey } from '../src/auth/token.js';
import { requireAuth } from '../src/auth/middleware.js';

test('issued keys validate to their user', () => {
  const key = createApiKey('u1');
  assert.deepEqual(validateApiKey(key), { userId: 'u1' });
});

test('unknown and revoked keys are rejected', () => {
  assert.equal(validateApiKey('ak_nope'), null);
  const key = createApiKey('u2');
  revokeApiKey(key);
  assert.equal(validateApiKey(key), null);
});

test('requireAuth throws 401 without a credential', () => {
  assert.throws(() => requireAuth({ headers: {}, query: {} }), /unauthorized/);
});
