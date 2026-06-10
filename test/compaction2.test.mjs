import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin', 'headroom.mjs');

const run = (args, { input = '', env = {} } = {}) =>
  spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8', env: { ...process.env, ...env } });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function makeTranscript(dir) {
  const lines = [
    { type: 'user', message: { content: 'build the auth flow on port 4731' } },
    { type: 'user', isMeta: true, message: { content: '<command-name>/compact</command-name>' } },
    { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: [{ type: 'text', text: 'Error: ECONNREFUSED 127.0.0.1:4731 — exact stack here' }] }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'working on it' }] } },
    'this line is not json',
    { type: 'user', message: { content: [{ type: 'text', text: 'no promo until June 16' }] } },
  ];
  const p = join(dir, 'transcript.jsonl');
  writeFileSync(p, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  return p;
}

test('T2.6: pre-compact extracts user messages + tool errors; injection carries pointers, not payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t26-'));
  const env = { HEADROOM_DIR: dir };
  const tp = makeTranscript(dir);

  run(['hook', 'pre-compact'], {
    input: JSON.stringify({ session_id: 's6', cwd: dir, trigger: 'manual', transcript_path: tp, custom_instructions: 'focus on auth' }),
    env,
  });

  const ex = JSON.parse(readFileSync(join(dir, 'handoffs', 's6.extracts.json'), 'utf8'));
  assert.equal(ex.user_messages.length, 2); // harness/meta messages excluded
  assert.match(ex.user_messages[0], /port 4731/);
  assert.match(ex.user_messages[1], /no promo until June 16/);
  assert.match(ex.tool_errors[0], /ECONNREFUSED/);

  const ctx = JSON.parse(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 's6', source: 'compact' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.match(ctx, new RegExp(esc(tp)));
  assert.match(ctx, /verbatim extracts/);
  assert.match(ctx, /focus on auth/);
  assert.match(ctx, /search the transcript/);
  assert.doesNotMatch(ctx, /ECONNREFUSED/); // ADR-11: pointer, never bulk content
});

test('T2.6: pre-compact survives a missing/garbage transcript path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t26b-'));
  const env = { HEADROOM_DIR: dir };
  const r = run(['hook', 'pre-compact'], {
    input: JSON.stringify({ session_id: 's6b', cwd: dir, transcript_path: join(dir, 'nope.jsonl') }),
    env,
  });
  assert.equal(r.status, 0);
  const snap = JSON.parse(readFileSync(join(dir, 'handoffs', 's6b.json'), 'utf8'));
  assert.equal(snap.extracts_path, null);
});

test('T2.7: pin lifecycle — add/list, verbatim re-injection only at compact, unpin, TTL expiry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t27-'));
  const env = { HEADROOM_DIR: dir };

  const out = run(['pin', 'no promo until June 16'], { env }).stdout;
  const id = out.match(/pinned (\w+)/)[1];
  assert.match(run(['pins'], { env }).stdout, /no promo until June 16/);

  const ctx = JSON.parse(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'p1', source: 'compact' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.match(ctx, /pinned facts/);
  assert.match(ctx, /no promo until June 16/);
  // pins are compaction-survival, not general boot context
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'p1', source: 'startup' }), env }).stdout, '');

  assert.match(run(['unpin', id], { env }).stdout, /removed 1/);
  assert.match(run(['pins'], { env }).stdout, /no pins/);

  writeFileSync(join(dir, 'pins.json'), JSON.stringify([{ id: 'x', text: 'expired pin', created_at: 1, expires_at: 2 }]));
  assert.match(run(['pins'], { env }).stdout, /no pins/);
});

test('T2.9: silent context cliff → logged, disclosed once in next stamp, then quiet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t29-'));
  const env = { HEADROOM_DIR: dir };
  const now = Math.round(Date.now() / 1000);
  const payload = (used) =>
    JSON.stringify({
      session_id: 'd1',
      rate_limits: { five_hour: { used_percentage: 50, resets_at: now + 3600 } },
      context_window: { context_window_size: 200000, used_percentage: used },
    });

  run(['tap'], { input: payload(60), env });
  run(['tap'], { input: payload(20), env }); // 40-point cliff, nothing explains it
  assert.match(readFileSync(join(dir, 'events.jsonl'), 'utf8'), /context_drop/);

  const stamp = JSON.parse(run(['hook', 'user-prompt-submit'], { input: JSON.stringify({ session_id: 'd1' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.match(stamp, /context shrank ~80k tokens/);
  const stamp2 = JSON.parse(run(['hook', 'user-prompt-submit'], { input: JSON.stringify({ session_id: 'd1' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.doesNotMatch(stamp2, /context shrank/); // announce once
});

test('T2.9: a cliff right after a real compaction is explained, not flagged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t29b-'));
  const env = { HEADROOM_DIR: dir };
  const payload = (used) =>
    JSON.stringify({ session_id: 'd2', context_window: { context_window_size: 200000, used_percentage: used } });

  run(['tap'], { input: payload(60), env });
  run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 'd2', cwd: dir }), env });
  run(['tap'], { input: payload(10), env });
  assert.doesNotMatch(readFileSync(join(dir, 'events.jsonl'), 'utf8'), /context_drop/);
  // post-compact hook logs too
  run(['hook', 'post-compact'], { input: JSON.stringify({ session_id: 'd2', trigger: 'auto' }), env });
  assert.match(readFileSync(join(dir, 'events.jsonl'), 'utf8'), /post_compact/);
});

test('T2.10: compact guard blocks auto near reset only — never manual, never far from reset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-t210-'));
  const env = { HEADROOM_DIR: dir };
  const now = Math.round(Date.now() / 1000);
  const state = (resetsIn) =>
    JSON.stringify({
      schema: 'resource-state/v0',
      updated_at: now,
      windows: { five_hour: { used_pct: 80, resets_at: now + resetsIn } },
      context: null,
      burn: {},
      session: {},
    });
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ compact_guard_min: 20 }));

  writeFileSync(join(dir, 'state.json'), state(600)); // reset in 10m
  const blocked = run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 'g1', cwd: dir, trigger: 'auto' }), env });
  assert.match(blocked.stdout, /"decision":"block"/);
  assert.match(blocked.stdout, /compact guard/);
  assert.ok(!existsSync(join(dir, 'handoffs', 'g1.json'))); // blocked → no snapshot

  const manual = run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 'g2', cwd: dir, trigger: 'manual' }), env });
  assert.doesNotMatch(manual.stdout, /block/);
  assert.ok(existsSync(join(dir, 'handoffs', 'g2.json')));

  writeFileSync(join(dir, 'state.json'), state(7200)); // reset in 2h
  const far = run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 'g3', cwd: dir, trigger: 'auto' }), env });
  assert.doesNotMatch(far.stdout, /block/);
  assert.ok(existsSync(join(dir, 'handoffs', 'g3.json')));
});

test('T2.8: install adds removable Compact Instructions + PostCompact hook; uninstall restores', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'hr-t28-'));
  writeFileSync(join(cfg, 'CLAUDE.md'), '# my stuff\n');

  run(['install', '--config-dir', cfg]);
  const md = readFileSync(join(cfg, 'CLAUDE.md'), 'utf8');
  assert.match(md, /# my stuff/);
  assert.match(md, /## Compact Instructions/);
  const settings = JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8'));
  assert.ok(settings.hooks.PostCompact);

  run(['install', '--config-dir', cfg]); // idempotent
  assert.equal((readFileSync(join(cfg, 'CLAUDE.md'), 'utf8').match(/## Compact Instructions/g) || []).length, 1);

  run(['uninstall', '--config-dir', cfg]);
  const md2 = readFileSync(join(cfg, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(md2, /Compact Instructions/);
  assert.match(md2, /# my stuff/);
  assert.ok(!JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8')).hooks);
});

test('pin_fact via the MCP server works without any ResourceState', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-mcp-pin-'));
  const env = { HEADROOM_DIR: dir };
  const req = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  const out = run(['mcp'], {
    input:
      req(1, 'initialize', { protocolVersion: '2025-06-18' }) +
      req(2, 'tools/call', { name: 'pin_fact', arguments: { text: 'never run migrations on prod' } }),
    env,
  }).stdout;
  const resp = out
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .find((m) => m.id === 2);
  const body = JSON.parse(resp.result.content[0].text);
  assert.equal(body.pinned, true);
  assert.match(run(['pins'], { env }).stdout, /never run migrations on prod/);
});
