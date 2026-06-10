import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/users/store.js';
import { createPayment, getPayment } from '../../src/payments/service.js';

test('createPayment — happy path', () => {
  const db = createStore();
  const r = createPayment({ amount: 100, currency: 'USD', user_id: 'u_1' }, db);
  assert.equal(r.status, 201);
  assert.ok(r.body.id.startsWith('pay_'));
});

test('createPayment — missing fields', () => {
  const db = createStore();
  assert.equal(createPayment({ amount: 100 }, db).status, 400);
});

test('getPayment — not found', () => {
  const db = createStore();
  assert.equal(getPayment('pay_missing', db).status, 404);
});
