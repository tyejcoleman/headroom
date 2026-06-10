import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.HEADROOM_DIR = mkdtempSync(join(tmpdir(), 'headroom-state-'));
const { parsePayload, updateBurn } = await import('../src/state.mjs');
const { validateResourceState } = await import('../src/schema.mjs');
const { fitCheck } = await import('../src/fit.mjs');

const fix = (n) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', n), 'utf8'));

test('full subscription payload parses and validates', () => {
  const s = parsePayload(fix('statusline-full.json'));
  assert.equal(s.auth, 'subscription');
  assert.equal(s.windows.five_hour.used_pct, 42.5);
  assert.equal(s.windows.five_hour.resets_at, 1781304000);
  assert.equal(s.context.window_size, 200000);
  assert.equal(s.context.tokens_to_ceiling, Math.round(200000 * (80 - 61.2) / 100));
  assert.equal(s.session.cost_usd, 0.47);
  assert.deepEqual(validateResourceState(s), []);
});

test('api-key payload (no rate_limits) degrades gracefully', () => {
  const s = parsePayload(fix('statusline-apikey.json'));
  assert.deepEqual(s.windows, {});
  assert.equal(s.auth, 'unknown');
  assert.equal(s.context.used_pct, 12);
  assert.deepEqual(validateResourceState(s), []);
});

test('epoch-leak and out-of-range percentages become null, resets_at ms tolerated', () => {
  const s = parsePayload(fix('statusline-epoch-leak.json'));
  assert.equal(s.windows.five_hour.used_pct, null);
  assert.equal(s.windows.five_hour.resets_at, 1781304000);
  assert.equal(s.windows.seven_day.used_pct, null);
  assert.equal(s.windows.seven_day.resets_at, 1781800000); // ms input → seconds
  assert.deepEqual(validateResourceState(s), []);
});

test('burn model derives rate and exhaustion from history', () => {
  const t0 = 1781300000;
  let s;
  for (const [dt, used] of [[0, 40], [600, 42], [1200, 44]]) {
    s = parsePayload(fix('statusline-full.json'), (t0 + dt) * 1000);
    s.windows.five_hour.used_pct = used;
    s = updateBurn(s);
  }
  assert.equal(s.burn.pct_per_hour, 12); // 4% over 20 min
  assert.ok(s.burn.projected_exhaustion > t0 + 1200);
  assert.deepEqual(validateResourceState(s), []);
});

test('fit_check verdicts: context exceeds, window defer, healthy fits', () => {
  const healthy = parsePayload(fix('statusline-full.json'));
  assert.equal(fitCheck(healthy, { est_tokens: 5000 }).overall, 'fits');

  const ctxTight = parsePayload(fix('statusline-full.json'));
  ctxTight.context.tokens_to_ceiling = 4000;
  assert.equal(fitCheck(ctxTight, { est_tokens: 25000 }).overall, 'exceeds');

  const exhausted = parsePayload(fix('statusline-full.json'));
  exhausted.windows.five_hour.used_pct = 99;
  assert.equal(fitCheck(exhausted, { est_tokens: 1000 }).overall, 'defer');

  assert.equal(fitCheck(null, { est_tokens: 1000 }).overall, 'unknown');
});
