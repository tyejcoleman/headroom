import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin', 'headroom.mjs');
const fixture = (n) => readFileSync(join(root, 'test', 'fixtures', n), 'utf8');

const run = (args, { input = '', env = {} } = {}) =>
  spawnSync(process.execPath, [bin, ...args], { input, encoding: 'utf8', env: { ...process.env, ...env } });

const sh = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });

const contMod = JSON.stringify(join(root, 'src', 'continuity.mjs'));
const saveDoc = (args, env) =>
  spawnSync(process.execPath, ['--input-type=module', '-e', `const { saveContinuity } = await import(${contMod}); console.log(JSON.stringify(saveContinuity(${JSON.stringify(args)})));`], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input: '',
  }).stdout.trim();

function makeGitRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'headroom-repo-'));
  sh(repo, 'git', ['init', '-q']);
  writeFileSync(join(repo, 'a.txt'), 'hello\n');
  sh(repo, 'git', ['add', '-A']);
  sh(repo, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first commit']);
  writeFileSync(join(repo, 'a.txt'), 'hello dirty\n'); // uncommitted change
  return repo;
}

test('pre-compact snapshots git ground truth; session-start(compact) re-injects it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-cont-'));
  const repo = makeGitRepo();
  const env = { HEADROOM_DIR: dir };

  const pre = run(['hook', 'pre-compact'], {
    input: JSON.stringify({ session_id: 'sess-1', cwd: repo, trigger: 'auto' }),
    env,
  });
  assert.equal(pre.status, 0);
  const snap = JSON.parse(readFileSync(join(dir, 'handoffs', 'sess-1.json'), 'utf8'));
  assert.match(snap.git.dirty[0], /a\.txt/);
  assert.match(snap.git.recent_commits[0], /first commit/);

  const start = run(['hook', 'session-start'], {
    input: JSON.stringify({ session_id: 'sess-1', source: 'compact' }),
    env,
  });
  const ctx = JSON.parse(start.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /post-compaction ground truth/);
  assert.match(ctx, /a\.txt/);
  assert.match(ctx, /first commit/);
  assert.match(ctx, /Trust this snapshot/);
});

test('session-start: silent for normal startup, wrong session, or stale snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-cont2-'));
  const repo = makeGitRepo();
  const env = { HEADROOM_DIR: dir };
  run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 'sess-1', cwd: repo }), env });

  // normal startup → nothing
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-1', source: 'startup' }), env }).stdout, '');
  // different session compacting → nothing
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'other', source: 'compact' }), env }).stdout, '');
  // stale snapshot → nothing
  const p = join(dir, 'handoffs', 'sess-1.json');
  const snap = JSON.parse(readFileSync(p, 'utf8'));
  snap.at -= 7 * 3600;
  writeFileSync(p, JSON.stringify(snap));
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-1', source: 'compact' }), env }).stdout, '');
});

test('pre-compact never crashes on garbage input or non-git cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-cont3-'));
  const env = { HEADROOM_DIR: dir };
  assert.equal(run(['hook', 'pre-compact'], { input: 'not json', env }).status, 0);
  const plain = mkdtempSync(join(tmpdir(), 'headroom-plain-'));
  assert.equal(run(['hook', 'pre-compact'], { input: JSON.stringify({ session_id: 's', cwd: plain }), env }).status, 0);
  const snap = JSON.parse(readFileSync(join(dir, 'handoffs', 's.json'), 'utf8'));
  assert.equal(snap.git, null);
});

test('handoff doc: saveContinuity writes a canonical markdown doc; missing fields rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-h1-'));
  const env = { HEADROOM_DIR: dir };

  assert.equal(saveDoc({ state: 'no mission, no next steps' }, env), 'null');

  const out = JSON.parse(
    saveDoc(
      {
        mission: 'ship the continuity handoff feature',
        next_steps: ['wire the MCP tool', 'add tests'],
        references: ['src/continuity.mjs'],
        user_directives: ['let it burn to the ground'],
        improvements: ['reframe context-pressure as a handoff signal'],
      },
      env
    )
  );
  assert.ok(out.path);
  const md = readFileSync(out.path, 'utf8');
  assert.match(md, /# Headroom handoff/);
  assert.match(md, /ship the continuity handoff feature/);
  assert.match(md, /wire the MCP tool/);
  assert.match(md, /let it burn to the ground/);
  assert.match(md, /reframe context-pressure/);
});

test('handoff doc: session-start(compact) re-injects pointer+digest; startup is silent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-h2-'));
  const env = { HEADROOM_DIR: dir };
  saveDoc({ mission: 'long-running migration', next_steps: ['resume at step 4'] }, env);

  const ctx = JSON.parse(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-1', source: 'compact' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.match(ctx, /canonical handoff doc/);
  assert.match(ctx, /READ IT FIRST/);
  assert.match(ctx, /resume at: resume at step 4/);

  // a normal (non-compact) startup must stay silent — does not break existing behavior
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-1', source: 'startup' }), env }).stdout, '');
});

test('handoff doc: stale doc and wrong-session doc are not re-injected', () => {
  // stale
  const dir = mkdtempSync(join(tmpdir(), 'headroom-h3-'));
  const env = { HEADROOM_DIR: dir };
  saveDoc({ mission: 'x', next_steps: ['y'] }, env);
  const metaP = join(dir, 'continuity', 'session.meta.json');
  const m = JSON.parse(readFileSync(metaP, 'utf8'));
  m.at -= 25 * 3600;
  writeFileSync(metaP, JSON.stringify(m));
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-1', source: 'compact' }), env }).stdout, '');

  // wrong session: a doc tagged sess-A must not surface for sess-B
  const dir2 = mkdtempSync(join(tmpdir(), 'headroom-h4-'));
  const env2 = { HEADROOM_DIR: dir2 };
  const now = Math.round(Date.now() / 1000);
  mkdirSync(join(dir2, 'continuity'), { recursive: true });
  writeFileSync(join(dir2, 'continuity', 'sess-A.meta.json'), JSON.stringify({ session_id: 'sess-A', at: now, digest: { mission: 'x', next: 'y' } }));
  writeFileSync(join(dir2, 'continuity', 'sess-A.md'), '# doc\n');
  assert.equal(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'sess-B', source: 'compact' }), env: env2 }).stdout, '');
});

test('resume lifecycle: plan via MCP-layer fn → HUD countdown → ready in stamp/session-start → clear', () => {
  const dir = mkdtempSync(join(tmpdir(), 'headroom-res-'));
  const env = { HEADROOM_DIR: dir };
  run(['tap'], { input: fixture('statusline-full.json'), env }); // resets_at = 4102444800 (far future)

  // record a plan through the same code path the MCP tool uses
  const script = `
    const { planResume } = await import(${JSON.stringify(join(root, 'src', 'resume.mjs'))});
    const { readState } = await import(${JSON.stringify(join(root, 'src', 'state.mjs'))});
    console.log(JSON.stringify(planResume({ summary: 'finish auth migration in middleware + tests', est_tokens: 25000 }, readState())));
  `;
  const planOut = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input: '',
  });
  const rec = JSON.parse(planOut.stdout);
  assert.equal(rec.recorded, true);
  assert.equal(rec.resume_at, 4102444800);

  // a waiting plan is deliberately absent from the HUD (not actionable yet)
  const hud = run(['tap'], { input: fixture('statusline-full.json'), env }).stdout;
  assert.doesNotMatch(hud, /⏲|deferred/);

  // flip the plan to "ready" and check stamp + session-start + HUD
  const planPath = join(dir, 'resume.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.resume_at = Math.round(Date.now() / 1000) - 60;
  writeFileSync(planPath, JSON.stringify(plan));

  const stamp = JSON.parse(run(['hook', 'user-prompt-submit'], { input: '{}', env }).stdout).hookSpecificOutput.additionalContext;
  assert.match(stamp, /deferred work now ready: "finish auth migration/);
  const startCtx = JSON.parse(run(['hook', 'session-start'], { input: JSON.stringify({ session_id: 'x', source: 'startup' }), env }).stdout)
    .hookSpecificOutput.additionalContext;
  assert.match(startCtx, /deferred work is now ready/);
  assert.match(run(['tap'], { input: fixture('statusline-full.json'), env }).stdout, /✓ deferred work ready/);

  // clear
  assert.match(run(['resume', '--clear'], { env }).stdout, /cleared/);
  assert.ok(!existsSync(planPath));
  assert.doesNotMatch(
    JSON.parse(run(['hook', 'user-prompt-submit'], { input: '{}', env }).stdout).hookSpecificOutput.additionalContext,
    /deferred/
  );
});
