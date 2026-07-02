import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir, readJSON, fmtClock } from './util.mjs';
import { readState } from './state.mjs';

// Compaction survival, part 1: at PreCompact we cannot summarize the conversation
// (hooks have no model), but we CAN capture what compaction most often garbles —
// hard repository facts. The SessionStart(source=compact) hook re-injects them.
// Part 2 (ADR-11): the transcript JSONL outlives compaction on disk, so the handoff
// anchors to it — path plus deterministic verbatim extracts in a sidecar file. The
// injection carries pointers, never bulk content: compaction just freed the context.

const handoffDir = () => join(tokenroomDir(), 'handoffs');
const pathFor = (sessionId) => join(handoffDir(), `${sessionId}.json`);
const extractsPathFor = (sessionId) => join(handoffDir(), `${sessionId}.extracts.json`);
const MAX_AGE_SEC = 6 * 3600;

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const MAX_USER_MSGS = 80;
const MAX_MSG_CHARS = 2000;
const MAX_ERRORS = 15;
const MAX_ERR_CHARS = 1500;

const isHarnessText = (t) =>
  t.startsWith('<command-') || t.startsWith('<local-command') || t.startsWith('<system-reminder') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted');

/** Deterministic extraction from the transcript JSONL: the user's exact words and
 *  recent failed tool calls — the two things compaction paraphrases worst. */
export function extractTranscript(path) {
  let raw;
  try {
    if (statSync(path).size > MAX_TRANSCRIPT_BYTES) return null;
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const user_messages = [];
  const tool_errors = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o?.type !== 'user' || o.isMeta || o.isCompactSummary) continue;
    const content = o.message?.content;
    const texts = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    for (const b of texts) {
      if (b?.type === 'text' && typeof b.text === 'string') {
        const t = b.text.trim();
        if (t && !isHarnessText(t)) user_messages.push(t.slice(0, MAX_MSG_CHARS));
      } else if (b?.type === 'tool_result' && b.is_error) {
        const t = (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c) => c?.text ?? '').join('\n') : '').trim();
        if (t) tool_errors.push(t.slice(0, MAX_ERR_CHARS));
      }
    }
  }
  if (!user_messages.length && !tool_errors.length) return null;
  return { user_messages: user_messages.slice(-MAX_USER_MSGS), tool_errors: tool_errors.slice(-MAX_ERRORS) };
}

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
};

export function captureHandoff({ session_id, cwd, trigger, transcript_path, custom_instructions }, nowMs = Date.now()) {
  if (!session_id) return null;
  const snap = {
    session_id,
    at: Math.round(nowMs / 1000),
    trigger: trigger ?? null,
    cwd: cwd ?? null,
    transcript_path: typeof transcript_path === 'string' ? transcript_path : null,
    custom_instructions:
      typeof custom_instructions === 'string' && custom_instructions.trim() ? custom_instructions.trim().slice(0, 500) : null,
    extracts_path: null,
    git: null,
    budgets: null,
  };
  if (snap.transcript_path) {
    const extracts = extractTranscript(snap.transcript_path);
    if (extracts) {
      ensureDir(handoffDir());
      writeFileSync(
        extractsPathFor(session_id),
        JSON.stringify({ session_id, at: snap.at, source_transcript: snap.transcript_path, ...extracts }, null, 2),
        { mode: 0o600 }
      );
      snap.extracts_path = extractsPathFor(session_id);
    }
  }
  if (cwd) {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== null) {
      const porcelain = (git(cwd, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean);
      // the file you were most recently editing — the restarted agent opens it first to
      // re-orient (deterministic: newest mtime among changed files; renames take the dest)
      let last_edited = null;
      let newest = 0;
      for (const line of porcelain.slice(0, 50)) {
        // status code(s) + space, then the path; renames are "old -> new". Parse by token,
        // not column: git() trims output, so the first line loses its leading status space.
        const rel = line.trim().replace(/^\S+\s+/, '').split(' -> ').pop();
        if (!rel) continue;
        try {
          const mt = statSync(join(cwd, rel)).mtimeMs;
          if (mt > newest) {
            newest = mt;
            last_edited = rel;
          }
        } catch {
          // deleted/renamed entries that no longer stat — skip
        }
      }
      snap.git = {
        branch,
        dirty: porcelain.slice(0, 20),
        last_edited,
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
  writeFileSync(pathFor(session_id), JSON.stringify(snap, null, 2), { mode: 0o600 });
  return snap;
}

export function takeHandoff(session_id, nowSec = Date.now() / 1000) {
  if (!session_id) return null;
  const snap = readJSON(pathFor(session_id));
  if (!snap || nowSec - snap.at > MAX_AGE_SEC) return null;
  return snap;
}

export function renderHandoff(snap) {
  const lines = [`[tokenroom] post-compaction ground truth (snapshot taken ${fmtClock(snap.at)}, just before compaction):`];
  if (snap.cwd) lines.push(`- cwd: ${snap.cwd}`);
  if (snap.git) {
    lines.push(`- branch: ${snap.git.branch}`);
    lines.push(
      snap.git.dirty.length
        ? `- uncommitted changes (${snap.git.dirty.length}): ${snap.git.dirty.join(', ')}`
        : '- working tree was clean'
    );
    if (snap.git.last_edited)
      lines.push(`- you were most recently editing: ${snap.git.last_edited} — OPEN THIS FILE FIRST to see exactly where you left off, then continue`);
    if (snap.git.recent_commits.length) lines.push(`- recent commits: ${snap.git.recent_commits.join(' · ')}`);
  }
  if (snap.budgets?.five_hour_pct_left != null) {
    lines.push(`- budget at snapshot: 5h ${snap.budgets.five_hour_pct_left}% left${snap.budgets.five_hour_resets_at ? `, resets ${fmtClock(snap.budgets.five_hour_resets_at)}` : ''}`);
  }
  if (snap.custom_instructions) lines.push(`- the user asked this compaction to focus on: "${snap.custom_instructions}"`);
  if (snap.transcript_path) lines.push(`- full pre-compaction transcript (JSONL): ${snap.transcript_path}`);
  if (snap.extracts_path) lines.push(`- verbatim extracts (every user message + recent failed tool calls): ${snap.extracts_path}`);
  lines.push(
    'The compacted summary may have dropped or garbled details. Trust this snapshot for repository state: check the uncommitted files first, then resume the in-flight task.' +
      (snap.transcript_path
        ? " For exact error text, file contents, or the user's exact wording, search the transcript/extracts above instead of reconstructing from memory."
        : '')
  );
  return lines.join('\n');
}
