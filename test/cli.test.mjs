import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin', 'headroom.mjs');
const fixture = (n) => readFileSync(join(root, 'test', 'fixtures', n), 'utf8');

const run = (args, { input = '', env = {} } = {}) =>
  spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8', env: { ...process.env, ...env } });

test('tap: full payload → HUD + valid state.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-tap-'));
  const r = run(['tap'], { input: fixture('statusline-full.json'), env: { HEADROOM_DIR: dir } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /5h 58%/); // remaining-first
  assert.match(r.stdout, /7d 85%/);
  assert.match(r.stdout, /ctx 19%/); // 80 ceiling − 61.2 used
  const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  const { validateResourceState } = await import('../src/schema.mjs');
  assert.deepEqual(validateResourceState(state), []);
});

test('tap: garbage and empty stdin never crash, still print a line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-tap-'));
  for (const input of ['not json', '']) {
    const r = run(['tap'], { input, env: { HEADROOM_DIR: dir } });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length > 0);
  }
});

test('hook: fresh state → stamp; stale → silent; disabled → silent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-hook-'));
  run(['tap'], { input: fixture('statusline-full.json'), env: { HEADROOM_DIR: dir } });

  const r = run(['hook', 'user-prompt-submit'], { input: '{}', env: { HEADROOM_DIR: dir } });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  const stamp = out.hookSpecificOutput.additionalContext;
  assert.match(stamp, /^\[headroom\] 5h: 58% left/);
  assert.match(stamp, /7d: 85% left/);
  assert.match(stamp, /tokens before compaction/);
  assert.ok(stamp.length < 220, `stamp too long: ${stamp.length}`);

  // stale state → no output
  const statePath = join(dir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.updated_at -= 3600;
  writeFileSync(statePath, JSON.stringify(state));
  assert.equal(run(['hook', 'user-prompt-submit'], { input: '{}', env: { HEADROOM_DIR: dir } }).stdout, '');

  // disabled → no output (fresh state again)
  run(['tap'], { input: fixture('statusline-full.json'), env: { HEADROOM_DIR: dir } });
  assert.equal(run(['hook', 'user-prompt-submit'], { input: '{}', env: { HEADROOM_DIR: dir, HEADROOM_DISABLE: '1' } }).stdout, '');

  // state written by a DIFFERENT session → account-level windows kept, session-level ctx omitted
  const r2 = run(['hook', 'user-prompt-submit'], { input: '{"session_id":"some-other-session"}', env: { HEADROOM_DIR: dir } });
  const stamp2 = JSON.parse(r2.stdout).hookSpecificOutput.additionalContext;
  assert.match(stamp2, /5h: 58% left/);
  assert.doesNotMatch(stamp2, /ctx:/);

  // fresh stamp has no age marker; aging (but not stale) state discloses its age
  assert.doesNotMatch(stamp2, /m old\)/);
  const aging = JSON.parse(readFileSync(statePath, 'utf8'));
  aging.updated_at = Math.round(Date.now() / 1000) - 300;
  writeFileSync(statePath, JSON.stringify(aging));
  const r3 = run(['hook', 'user-prompt-submit'], { input: '{}', env: { HEADROOM_DIR: dir } });
  assert.match(JSON.parse(r3.stdout).hookSpecificOutput.additionalContext, /\(5m old\)$/);
});

test('install: idempotent into sandbox config dir; uninstall leaves no trace', () => {
  const home = mkdtempSync(join(tmpdir(), 'headroom-inst-'));
  const cfg = join(home, '.claude');

  run(['install', '--config-dir', cfg, '--no-mcp']);
  run(['install', '--config-dir', cfg, '--no-mcp']); // second run must not duplicate
  const settings = JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8'));
  assert.match(settings.statusLine.command, /headroom\.mjs" tap/);
  assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  assert.ok(existsSync(join(cfg, 'skills', 'headroom', 'SKILL.md')));

  run(['uninstall', '--config-dir', cfg]);
  const after = JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8'));
  assert.equal(after.statusLine, undefined);
  assert.equal(after.hooks, undefined);
  assert.ok(!existsSync(join(cfg, 'skills', 'headroom')));
});

test('install: preserves an existing foreign statusline in backup and restores it on uninstall', () => {
  const home = mkdtempSync(join(tmpdir(), 'headroom-inst2-'));
  const cfg = join(home, '.claude');
  const settingsPath = join(cfg, 'settings.json');
  mkdirSync(cfg, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'ccusage statusline' } }));

  run(['install', '--config-dir', cfg, '--no-mcp']);
  assert.match(JSON.parse(readFileSync(settingsPath, 'utf8')).statusLine.command, /headroom\.mjs/);

  run(['uninstall', '--config-dir', cfg]);
  assert.equal(JSON.parse(readFileSync(settingsPath, 'utf8')).statusLine.command, 'ccusage statusline');
});
