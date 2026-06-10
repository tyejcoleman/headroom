// Tests for the NEW GET /v2/users/{id}/profile endpoint — FAILING until T1 is complete.
// The handler `getUserProfile` must be exported from src/api/v2/users.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/users/store.js';

// Dynamic import so a missing export gives a clear test failure, not a module crash.
const mod = await import('../../src/api/v2/users.js');
const getUserProfile = mod.getUserProfile;

test('getUserProfile — exported', () => {
  assert.equal(typeof getUserProfile, 'function', 'getUserProfile must be exported from src/api/v2/users.js');
});

test('getUserProfile — not found', () => {
  if (typeof getUserProfile !== 'function') return;
  const db = createStore();
  const r = getUserProfile('u_missing', db);
  assert.equal(r.status, 404);
});

test('getUserProfile — returns full profile', () => {
  if (typeof getUserProfile !== 'function') return;
  const db = createStore();
  db.users.set('u_1', {
    id: 'u_1',
    email: 'a@b.com',
    name: 'Alice',
    address: { street: '123 Main St', city: 'Portland', country: 'US' },
    preferences: { notifications: true, theme: 'light' },
    created_at: '2026-01-15T10:00:00Z',
  });
  const r = getUserProfile('u_1', db);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.address, { street: '123 Main St', city: 'Portland', country: 'US' });
  assert.deepEqual(r.body.preferences, { notifications: true, theme: 'light' });
});

test('getUserProfile — 403 for cross-user read', () => {
  if (typeof getUserProfile !== 'function') return;
  const db = createStore();
  db.users.set('u_1', { id: 'u_1', email: 'a@b.com', name: 'Alice', address: {}, preferences: {} });
  // requester_id differs from target id
  const r = getUserProfile('u_1', db, { requester_id: 'u_2' });
  assert.equal(r.status, 403);
});
