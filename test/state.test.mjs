import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TOKENROOM_DIR = mkdtempSync(join(tmpdir(), 'tokenroom-state-'));
const { parsePayload, updateBurn, enrichWeekly, writeState, readState } = await import('../src/state.mjs');
const { accountKey, accountDir, recordSessionAccount, quotaScope, listAccountKeys } = await import('../src/util.mjs');
const { validateResourceState } = await import('../src/schema.mjs');
const { fitCheck } = await import('../src/fit.mjs');

const fix = (n) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', n), 'utf8'));

test('full subscription payload parses and validates', () => {
  const s = parsePayload(fix('statusline-full.json'));
  assert.equal(s.auth, 'subscription');
  assert.equal(s.windows.five_hour.used_pct, 42.5);
  assert.equal(s.windows.five_hour.resets_at, 4102444800);
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
  assert.equal(s.windows.five_hour.resets_at, 4102444800);
  assert.equal(s.windows.seven_day.used_pct, null);
  assert.equal(s.windows.seven_day.resets_at, 4103049600); // ms input → seconds
  assert.deepEqual(validateResourceState(s), []);
});

test('burn model derives rate and exhaustion from history', () => {
  process.env.TOKENROOM_DIR = mkdtempSync(join(tmpdir(), 'tokenroom-burn1-'));
  const t0 = 1781300000;
  let s;
  for (let i = 0; i <= 10; i++) {
    // 12%/h, sampled every 2 min over 20 min
    s = parsePayload(fix('statusline-full.json'), (t0 + i * 120) * 1000);
    s.windows.five_hour.used_pct = 40 + ((i * 120) / 3600) * 12;
    s = updateBurn(s);
  }
  assert.equal(s.burn.pct_per_hour, 12);
  assert.ok(s.burn.projected_exhaustion > t0 + 1200);
  assert.deepEqual(validateResourceState(s), []);
});

test('regression: poisoned first sample + interleaved stale sessions do not hallucinate burn', () => {
  // Field data 2026-06-09: a placeholder 1% landed as the first sample and a concurrent
  // session interleaved stale 36s among fresh 38s; first-vs-last said ~180%/h.
  process.env.TOKENROOM_DIR = mkdtempSync(join(tmpdir(), 'tokenroom-burn2-'));
  const t0 = 1781300000;
  const seq = [[0, 1], [1, 35], [2, 35], [60, 35], [240, 35], [300, 36], [480, 36], [600, 36], [660, 37], [700, 38], [710, 36], [720, 38], [730, 36]];
  let s;
  for (const [dt, u] of seq) {
    s = parsePayload(fix('statusline-full.json'), (t0 + dt) * 1000);
    s.windows.five_hour.used_pct = u;
    s = updateBurn(s);
  }
  assert.ok(s.burn.pct_per_hour === null || s.burn.pct_per_hour < 20, `expected sane burn, got ${s.burn.pct_per_hour}%/h`);
});

test('burn stays null until a 10-minute baseline accumulates', () => {
  process.env.TOKENROOM_DIR = mkdtempSync(join(tmpdir(), 'tokenroom-burn3-'));
  const t0 = 1781300000;
  let s;
  for (const [dt, u] of [[0, 35], [60, 36], [120, 36], [300, 38]]) {
    s = parsePayload(fix('statusline-full.json'), (t0 + dt) * 1000);
    s.windows.five_hour.used_pct = u;
    s = updateBurn(s);
  }
  assert.equal(s.burn.pct_per_hour, null);
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

test('accountKey: stable across resets within an account, distinct between accounts (ADR-21)', () => {
  const FH = 5 * 3600, SD = 7 * 86400;
  const w = (fhReset, sdReset) => ({ five_hour: { resets_at: fhReset }, seven_day: { resets_at: sdReset } });
  const a = w(4102444800, 4103049600);

  const keyA = accountKey(a);
  assert.ok(typeof keyA === 'string' && keyA.startsWith('a'));
  // a reset advances resets_at by exactly one window length → SAME key (phase is invariant)
  assert.equal(accountKey(w(4102444800 + FH, 4103049600)), keyA);
  assert.equal(accountKey(w(4102444800, 4103049600 + SD)), keyA);
  assert.equal(accountKey(w(4102444800 + 3 * FH, 4103049600 + 2 * SD)), keyA);
  // a different account has a different reset phase → DIFFERENT key
  assert.notEqual(accountKey(w(4102444800 + 137 * 60, 4103049600 - 3 * 86400)), keyA);
  // no windows (api-key / absent) → null → caller uses the global dir
  assert.equal(accountKey({}), null);
  assert.equal(accountKey({ five_hour: { resets_at: null }, seven_day: { resets_at: null } }), null);
});

test('per-account isolation: a session reads its OWN account, never a concurrent account (ADR-21)', () => {
  const root = mkdtempSync(join(tmpdir(), 'tokenroom-iso-'));
  process.env.TOKENROOM_DIR = root;

  // Account A (98% weekly left) and Account B (7% weekly left), each routed to its own dir.
  const A = parsePayload(fix('statusline-full.json'));
  A.windows.five_hour.resets_at = 4102444800; A.windows.seven_day.resets_at = 4103049600;
  A.windows.seven_day.used_pct = 2; A.session_id = 'sessA';
  const B = parsePayload(fix('statusline-full.json'));
  B.windows.five_hour.resets_at = 4102444800 + 137 * 60; B.windows.seven_day.resets_at = 4103049600 - 3 * 86400;
  B.windows.seven_day.used_pct = 93; B.session_id = 'sessB';

  const keyA = accountKey(A.windows), keyB = accountKey(B.windows);
  assert.notEqual(keyA, keyB);
  writeState(A, accountDir(keyA)); recordSessionAccount('sessA', keyA);
  writeState(B, accountDir(keyB)); recordSessionAccount('sessB', keyB);
  // last writer's top-level pointer is account B — exactly the contamination the hook avoids
  writeState(B, root);

  assert.equal(listAccountKeys().sort().join(','), [keyA, keyB].sort().join(','));

  // each session resolves to ITS account and sees ITS weekly, regardless of who wrote last
  const scA = quotaScope('sessA'), scB = quotaScope('sessB');
  assert.equal(scA.show, true); assert.equal(scB.show, true);
  assert.equal(readState(scA.dir).windows.seven_day.used_pct, 2, 'sessA sees A (98% weekly left)');
  assert.equal(readState(scB.dir).windows.seven_day.used_pct, 93, 'sessB sees B (7% weekly left)');

  // an UNMAPPED session on this 2-account machine cannot be attributed → quota withheld
  const scUnknown = quotaScope('sessZ');
  assert.equal(scUnknown.show, false);
});

test('quotaScope: single-account and legacy layouts keep showing quota (no regression)', () => {
  const root = mkdtempSync(join(tmpdir(), 'tokenroom-single-'));
  process.env.TOKENROOM_DIR = root;
  // legacy / pre-account: no accounts/ subtree at all → global dir, quota shown
  assert.deepEqual(quotaScope('whoever'), { dir: root, show: true });
  // exactly one account, session unmapped → still resolves to that one account, quota shown
  const k = accountKey({ five_hour: { resets_at: 4102444800 }, seven_day: { resets_at: 4103049600 } });
  writeState(parsePayload(fix('statusline-full.json')), accountDir(k));
  const sc = quotaScope('unmapped-but-only-one');
  assert.equal(sc.show, true);
  assert.equal(sc.dir, accountDir(k));
});

test('enrichWeekly: HOT requires material weekly usage, not just a high post-reset pace', () => {
  const RESET = 2000000000;
  const WEEK = 7 * 86400;
  const start = RESET - WEEK;
  const mk = (used_pct) => ({ windows: { seven_day: { used_pct, resets_at: RESET } }, burn: {} });

  // 4% used ~4h into the week: the extrapolated pace is high, but with 96% left this is
  // a false positive (field 2026-06-20) — must NOT be HOT.
  const early = mk(4);
  enrichWeekly(early, start + 4 * 3600);
  assert.ok(early.burn.weekly.pace_ratio > 1.15, `sanity: pace high, got ${early.burn.weekly.pace_ratio}`);
  assert.equal(early.burn.weekly.hot, false);

  // 25% used ~1 day in: genuinely ahead of pace with a material amount spent — HOT.
  const hot = mk(25);
  enrichWeekly(hot, start + 86400);
  assert.ok(hot.burn.weekly.pace_ratio > 1.15);
  assert.equal(hot.burn.weekly.hot, true);

  // Boundary: just under the 15% floor stays calm even when genuinely ahead of pace.
  const under = mk(14);
  enrichWeekly(under, start + 14 * 3600);
  assert.ok(under.burn.weekly.pace_ratio > 1.15, `sanity: pace high, got ${under.burn.weekly.pace_ratio}`);
  assert.equal(under.burn.weekly.hot, false);
});
