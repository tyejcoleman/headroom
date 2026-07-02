import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard } from '../src/watch.mjs';
import { renderLine } from '../src/hud.mjs';

const state = {
  schema: 'resource-state/v0',
  updated_at: 1781304000 - 5,
  windows: {
    five_hour: { used_pct: 40, resets_at: 1781304000 + 3600 },
    seven_day: { used_pct: 9, resets_at: 1781304000 + 86400 * 2 },
  },
  context: { window_size: 200000, used_pct: 31, compact_ceiling_pct: 80, tokens_to_ceiling: 98000 },
  burn: { pct_per_hour: 4.2, projected_exhaustion: null },
  session: { cost_usd: 12.5 },
};

test('dashboard renders live countdowns, bars, and remaining-first numbers', () => {
  const out = buildDashboard(state, null, 1781304000).join('\n');
  assert.match(out, /data 5s old/);
  assert.match(out, /5h window .*60% left.*in 1h 0m/);
  assert.match(out, /7d window .*91% left.*in 2d 0h/);
  assert.match(out, /49% left.*≈98k tokens before compaction/);
  assert.match(out, /4\.2%\/h/);
  assert.match(out, /\$12\.50/);
  assert.match(out, /█/);
});

test('dashboard shows deferred countdown then READY; flags frozen data', () => {
  const resume = { summary: 'finish auth migration', created_at: 1781304000, resume_at: 1781304000 + 1800 };
  const waiting = buildDashboard(state, resume, 1781304000).join('\n');
  assert.match(waiting, /⏲ resume .*in 30m.*finish auth migration/);
  const ready = buildDashboard(state, resume, 1781304000 + 1801).join('\n');
  assert.match(ready, /✓ READY/);

  const frozen = buildDashboard(state, null, state.updated_at + 31 * 60).join('\n');
  assert.match(frozen, /NO ACTIVE SESSION RENDERING/);
});

test('dashboard degrades with no state', () => {
  assert.match(buildDashboard(null, null, 0).join('\n'), /no state yet/);
});

test('line: live countdowns computed at call time', () => {
  const now = 1781304000;
  const out = renderLine(state, null, now);
  assert.equal(out, '5h 60% ↻1h 0m · 7d 91% · ctx 49% · $12.50');
  // ten minutes later, same state — the countdown moved without a new render
  assert.match(renderLine(state, null, now + 600), /5h 60% ↻50m/);
});

test('line: deferred countdown, ready flag, exhaustion warning, idle state', () => {
  const now = 1781304000;
  const resume = { summary: 'x', created_at: now, resume_at: now + 600 };
  assert.match(renderLine(state, resume, now), /⏲10m/);
  assert.match(renderLine(state, resume, now + 601), /✓ready/);

  const burning = { ...state, burn: { pct_per_hour: 50, projected_exhaustion: now + 1200 } };
  assert.match(renderLine(burning, null, now), /⚠exh 20m/);

  assert.match(renderLine(state, null, state.updated_at + 45 * 60), /idle 45m/);
  assert.equal(renderLine(null), 'tokenroom: no data');
});
