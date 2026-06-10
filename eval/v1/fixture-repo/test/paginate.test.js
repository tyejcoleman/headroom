import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/util/paginate.js';

test('first page starts at the first item', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]);
});

test('second page continues without skipping', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2, 2), [3, 4]);
});

test('last page may be short', () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 3, 2), [5]);
});
