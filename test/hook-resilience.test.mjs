import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tokenroom.mjs');

// Audit finding (2026-07-01): hookSessionStart/hookUserPromptSubmit had no top-level
// catch — a hand-corrupted state file could throw, and Claude Code surfaces hook
// failures as unattributed error banners. The bin `hook` dispatcher now catches at the
// choke point (ADR-5). These tests corrupt state on purpose and demand silence.
function runHook(event, home, stdin) {
  return execFileSync(process.execPath, [bin, 'hook', event], {
    input: stdin,
    env: { ...process.env, TOKENROOM_DIR: home },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('session-start survives a resume.json missing its summary (exit 0, no throw, no injected lie)', () => {
  const home = mkdtempSync(join(tmpdir(), 'tr-resil-'));
  // resume_at in the past forces the "deferred work ready" path that reads plan.summary
  writeFileSync(join(home, 'resume.json'), JSON.stringify({ resume_at: 1 }));
  const out = runHook('session-start', home, JSON.stringify({ session_id: 's1', source: 'startup' }));
  assert.ok(!out.includes('undefined slice'), 'no stack leakage');
  // Before the fix, readResume returned the corrupt plan and session-start injected
  // `deferred work is now ready: "undefined"` — never inject that lie (the plan is rejected
  // at readResume, so nothing is emitted here). `undefined` appears JSON-escaped, so match loosely.
  assert.doesNotMatch(out, /undefined/, 'no injected "deferred work: undefined" lie');
  assert.doesNotMatch(out, /deferred work is now ready/, 'a shapeless plan is not surfaced as ready');
});

test('user-prompt-submit still stamps when resume.json is malformed — a corrupt plan cannot silence EVERY stamp', () => {
  const home = mkdtempSync(join(tmpdir(), 'tr-resil-'));
  const env = { ...process.env, TOKENROOM_DIR: home };
  const nowS = Math.round(Date.now() / 1000);
  // a fresh state via the real tap so a stamp is due
  execFileSync(process.execPath, [bin, 'tap'], {
    input: JSON.stringify({ session_id: 's1', rate_limits: { five_hour: { used_percentage: 20, resets_at: nowS + 8000 }, seven_day: { used_percentage: 10, resets_at: nowS + 5 * 86400 } } }),
    env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  // the poison: resume_at in the past but NO created_at/summary. Before the fix this threw at
  // plan.summary.slice → exit 0 with ZERO output, permanently suppressing EVERY stamp (the
  // corrupt plan never expired because nowSec - undefined is NaN).
  writeFileSync(join(home, 'resume.json'), JSON.stringify({ resume_at: 1 }));
  const out = runHook('user-prompt-submit', home, JSON.stringify({ session_id: 's1' }));
  assert.match(out, /\[tokenroom\]/, 'the stamp still emits — the corrupt resume.json is rejected, not fatal');
  assert.doesNotMatch(out, /undefined/, 'no "undefined" leaks into the stamp');
});

test('hooks survive structurally-wrong state files and non-JSON stdin', () => {
  const home = mkdtempSync(join(tmpdir(), 'tr-resil-'));
  writeFileSync(join(home, 'state.json'), '{"windows": "not-an-object"');
  writeFileSync(join(home, 'resume.json'), '[]');
  mkdirSync(join(home, 'handoffs'), { recursive: true });
  writeFileSync(join(home, 'handoffs', 's2.json'), JSON.stringify({ git: {} })); // snap.git present but arrays absent
  for (const event of ['user-prompt-submit', 'session-start', 'post-tool-use', 'pre-compact']) {
    // must not throw — execFileSync itself asserts exit code 0
    runHook(event, home, event === 'pre-compact' ? 'not json at all' : JSON.stringify({ session_id: 's2', source: 'compact' }));
  }
});
