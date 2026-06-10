import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headroomDir, ensureDir, readJSON, fmtClock } from './util.mjs';
import { readState } from './state.mjs';

// Compaction survival, part 1: at PreCompact we cannot summarize the conversation
// (hooks have no model), but we CAN capture what compaction most often garbles —
// hard repository facts. The SessionStart(source=compact) hook re-injects them.

const handoffDir = () => join(headroomDir(), 'handoffs');
const pathFor = (sessionId) => join(handoffDir(), `${sessionId}.json`);
const MAX_AGE_SEC = 6 * 3600;

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
};

export function captureHandoff({ session_id, cwd, trigger }, nowMs = Date.now()) {
  if (!session_id) return null;
  const snap = {
    session_id,
    at: Math.round(nowMs / 1000),
    trigger: trigger ?? null,
    cwd: cwd ?? null,
    git: null,
    budgets: null,
  };
  if (cwd) {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== null) {
      snap.git = {
        branch,
        dirty: (git(cwd, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean).slice(0, 20),
        recent_commits: (git(cwd, ['log', '--oneline', '-5']) ?? '').split('\n').filter(Boolean),
      };
    }
  }
  const s = readState();
  if (s?.windows?.five_hour?.used_pct != null) {
    snap.budgets = {
      five_hour_pct_left: Math.round(100 - s.windows.five_hour.used_pct),
      five_hour_resets_at: s.windows.five_hour.resets_at ?? null,
    };
  }
  ensureDir(handoffDir());
  writeFileSync(pathFor(session_id), JSON.stringify(snap, null, 2));
  return snap;
}

export function takeHandoff(session_id, nowSec = Date.now() / 1000) {
  if (!session_id) return null;
  const snap = readJSON(pathFor(session_id));
  if (!snap || nowSec - snap.at > MAX_AGE_SEC) return null;
  return snap;
}

export function renderHandoff(snap) {
  const lines = [`[headroom] post-compaction ground truth (snapshot taken ${fmtClock(snap.at)}, just before compaction):`];
  if (snap.cwd) lines.push(`- cwd: ${snap.cwd}`);
  if (snap.git) {
    lines.push(`- branch: ${snap.git.branch}`);
    lines.push(
      snap.git.dirty.length
        ? `- uncommitted changes (${snap.git.dirty.length}): ${snap.git.dirty.join(', ')}`
        : '- working tree was clean'
    );
    if (snap.git.recent_commits.length) lines.push(`- recent commits: ${snap.git.recent_commits.join(' · ')}`);
  }
  if (snap.budgets?.five_hour_pct_left != null) {
    lines.push(`- budget at snapshot: 5h ${snap.budgets.five_hour_pct_left}% left${snap.budgets.five_hour_resets_at ? `, resets ${fmtClock(snap.budgets.five_hour_resets_at)}` : ''}`);
  }
  lines.push(
    'The compacted summary may have dropped or garbled details. Trust this snapshot for repository state: check the uncommitted files first, then resume the in-flight task.'
  );
  return lines.join('\n');
}
