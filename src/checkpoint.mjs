import { join } from 'node:path';
import { tokenroomDir, ensureDir, atomicWriteJSON, readJSON, fmtClock } from './util.mjs';
import { readState } from './state.mjs';

// Model-authored checkpoint (T2.12 / ADR-15): hooks snapshot FACTS (ADR-8); only the
// model can snapshot JUDGMENT — what it's doing, why, what it already ruled out, and
// exactly where to pick up. The `checkpoint` MCP tool lets the agent save that before
// the context ceiling hits; SessionStart(source=compact) re-injects facts first, then
// this note. Latest-wins, capped, stale after 6h.
//
// Session scoping caveat: MCP servers don't receive the caller's session id, so we tag
// the checkpoint with the most recent tap session and the re-injection guard accepts a
// match or an untagged note. Single-session use (the normal case) is exact; concurrent
// sessions can mislabel — documented in ADR-15.

const ckPath = () => join(tokenroomDir(), 'checkpoint.json');
const MAX_AGE_SEC = 6 * 3600;
const CAP = { task: 300, state: 600, item: 250, list: 8, values: 12 };

const trim = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : null);
const trimList = (v, n) =>
  Array.isArray(v) ? v.map((x) => trim(String(x), CAP.item)).filter(Boolean).slice(0, n) : [];

export function saveCheckpoint(args, nowSec = Date.now() / 1000) {
  const note = {
    at: Math.round(nowSec),
    session_id: readState()?.session_id ?? null,
    task: trim(args.task, CAP.task),
    state: trim(args.state, CAP.state),
    decisions: trimList(args.decisions, CAP.list),
    rejected: trimList(args.rejected, CAP.list),
    next_steps: trimList(args.next_steps, CAP.list),
    key_values: {},
  };
  if (args.key_values && typeof args.key_values === 'object') {
    for (const [k, v] of Object.entries(args.key_values).slice(0, CAP.values)) {
      note.key_values[trim(k, 60) ?? k] = trim(String(v), CAP.item);
    }
  }
  if (!note.task && !note.state && !note.next_steps.length) return null;
  ensureDir(tokenroomDir());
  atomicWriteJSON(ckPath(), note);
  return note;
}

export function takeCheckpoint(session_id, nowSec = Date.now() / 1000) {
  const note = readJSON(ckPath());
  if (!note || nowSec - note.at > MAX_AGE_SEC) return null;
  if (note.session_id && session_id && note.session_id !== session_id) return null;
  return note;
}

export function renderCheckpoint(note) {
  const lines = [`[tokenroom] your own pre-compaction checkpoint (saved ${fmtClock(note.at)} — you wrote this; trust it):`];
  if (note.task) lines.push(`- task: ${note.task}`);
  if (note.state) lines.push(`- state: ${note.state}`);
  if (note.decisions.length) lines.push(`- decisions made: ${note.decisions.join(' · ')}`);
  if (note.rejected.length) lines.push(`- already ruled out (do NOT retry): ${note.rejected.join(' · ')}`);
  if (note.next_steps.length) lines.push(`- exact next steps: ${note.next_steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`);
  const kv = Object.entries(note.key_values ?? {});
  if (kv.length) lines.push(`- key values: ${kv.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  return lines.join('\n');
}
