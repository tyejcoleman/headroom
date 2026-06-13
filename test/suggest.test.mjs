import test from 'node:test';
import assert from 'node:assert/strict';
import { mineFriction, renderSuggestions } from '../src/suggest.mjs';

const now = 1800000000;
const ago = (days) => now - days * 86400;

test('miner: clusters by class+signature, enforces the support floor', () => {
  const events = [
    // context-cliff ×4 → above floor
    { type: 'context_drop', at: ago(1), dropped_tokens: 80000 },
    { type: 'context_drop', at: ago(2), dropped_tokens: 60000 },
    { type: 'context_drop', at: ago(3), dropped_tokens: 50000 },
    { type: 'context_drop', at: ago(5), dropped_tokens: 40000 },
    // install-health ×2 → below MIN_SUPPORT (3), excluded
    { type: 'stamp_skipped', at: ago(1), reason: 'stale_state' },
    { type: 'stamp_skipped', at: ago(2), reason: 'stale_state' },
  ];
  const ranked = mineFriction(events, now);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].class, 'context-cliff');
  assert.equal(ranked[0].support, 4);
  assert.equal(ranked[0].cost_estimate, 230000);
  assert.equal(ranked[0].evidence.length, 3); // last 3 timestamps
});

test('miner: separate signatures bucket separately; ranks by recency×cost', () => {
  const events = [
    // expensive Bash ×3, recent, high cost
    ...[1, 1, 2].map((d) => ({ type: 'receipt', at: ago(d), tool: 'Bash', dpct: 30 })),
    // expensive Task ×3, OLD → lower recency weight
    ...[20, 22, 25].map((d) => ({ type: 'receipt', at: ago(d), tool: 'Task', dpct: 30 })),
  ];
  const ranked = mineFriction(events, now);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].signature, 'Bash'); // recent outranks old at equal cost
  assert.equal(ranked[1].signature, 'Task');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('miner: tolerates malformed events without crashing', () => {
  const ranked = mineFriction([null, {}, { type: 'context_drop' /* no at */ }, 'garbage', { at: 5 }], now);
  assert.deepEqual(ranked, []);
});

test('render: report carries evidence + synthesis protocol; empty case is graceful', () => {
  const ranked = mineFriction(
    Array.from({ length: 4 }, (_, i) => ({ type: 'launch_blocked', at: ago(i + 1), tool: 'Workflow' })),
    now
  );
  const md = renderSuggestions(ranked, { windowDays: 14 });
  assert.match(md, /launch-pressure — `Workflow`/);
  assert.match(md, /seen \*\*4×\*\*/);
  assert.match(md, /candidate evolution:/);
  assert.match(md, /Synthesis protocol/);
  assert.match(md, /propose-only/);
  assert.match(renderSuggestions([], { windowDays: 14 }), /no recurring friction/);
});
