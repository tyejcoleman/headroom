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

test('session-start survives a resume.json missing its summary (exit 0, no throw)', () => {
  const home = mkdtempSync(join(tmpdir(), 'tr-resil-'));
  // resume_at in the past forces the "deferred work ready" path that reads plan.summary
  writeFileSync(join(home, 'resume.json'), JSON.stringify({ resume_at: 1 }));
  const out = runHook('session-start', home, JSON.stringify({ session_id: 's1', source: 'startup' }));
  assert.ok(!out.includes('undefined slice'), 'no stack leakage');
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
