import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/users/store.js';
import { getUser, createUser } from '../../src/api/v2/users.js';

test('getUser — not found', () => {
  const db = createStore();
  const r = getUser('u_missing', db);
  assert.equal(r.status, 404);
});

test('getUser — returns base fields', () => {
  const db = createStore();
  db.users.set('u_1', { id: 'u_1', email: 'a@b.com', name: 'Alice', address: { street: '1 Main' }, preferences: {} });
  const r = getUser('u_1', db);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, 'u_1');
  assert.equal(r.body.email, 'a@b.com');
  // base endpoint does NOT return address/preferences
  assert.ok(!r.body.address, 'base endpoint must not expose address');
});

test('createUser — happy path', () => {
  const db = createStore();
  const r = createUser({ email: 'b@c.com', name: 'Bob' }, db);
  assert.equal(r.status, 201);
  assert.ok(r.body.id.startsWith('u_'));
});

test('createUser — missing fields', () => {
  const db = createStore();
  assert.equal(createUser({ email: 'x@y.com' }, db).status, 400);
  assert.equal(createUser(null, db).status, 400);
});
