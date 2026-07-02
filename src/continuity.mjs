import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir, atomicWrite, atomicWriteJSON, readJSON, fmtClock } from './util.mjs';
import { readState } from './state.mjs';

// Continuity handoff document (T2.29 / ADR-18). `checkpoint` (ADR-15) is the model's
// TERSE last-second survival ping; this is its richer sibling — a model-authored,
// EVOLVING markdown working-doc that a fresh instance reads to resume the work fully:
// mission, current state, progress, exact next steps, key references, decisions + why,
// the USER's own directives/corrections, system/process improvements discovered, and
// open questions. Written throughout a long-running task (not only at the ceiling) so a
// process can survive REPEATED auto-compactions at full velocity — context-pressure
// becomes a write-the-handoff ritual, not a stop sign.
//
// Stored as real markdown under ~/.tokenroom/continuity/<session>.md (+ .meta.json for the
// re-injection digest). Session-scoped with the same tag-and-guard rule as checkpoint
// (MCP carries no session id, so we tag with the latest tap session and the injection
// guard accepts a match or an untagged doc). Latest-wins, capped per section, stale after
// 24h, pruned after 7 days. Re-injected at SessionStart(source=compact) as a POINTER +
// digest (ADR-11: the doc lives on disk; compaction just freed the context — point, don't
// dump).

const contDir = () => join(tokenroomDir(), 'continuity');
const docPathFor = (key) => join(contDir(), `${key}.md`);
const metaPathFor = (key) => join(contDir(), `${key}.meta.json`);
// filesystem-safe key from a session id; anything odd collapses to a single shared doc
const keyFor = (sid) => (typeof sid === 'string' && /^[\w.-]{1,128}$/.test(sid) ? sid : 'session');

const MAX_AGE_SEC = 24 * 3600; // a handoff doc untouched for a day is probably a stale task
const PRUNE_SEC = 7 * 24 * 3600;
const CAP = { mission: 600, state: 800, item: 400, list: 14, refs: 24, cwd: 300 };

const trim = (v, n) => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, n);
  return t || null;
};
const trimList = (v, n) =>
  Array.isArray(v) ? v.map((x) => trim(String(x), CAP.item)).filter(Boolean).slice(0, n) : [];
const mdList = (items, ordered) => items.map((s, i) => `${ordered ? `${i + 1}.` : '-'} ${s}`).join('\n');

function renderDoc(d) {
  const title = d.mission ? d.mission.split('\n')[0].slice(0, 80) : 'session';
  const L = [
    `# Tokenroom handoff — ${title}`,
    '',
    `_Canonical working-doc, updated ${fmtClock(d.at)}${d.session_id ? ` (session ${d.session_id})` : ''}. A fresh instance of you reads this to resume fully — trust it over the compacted summary, and continue without slowing down._`,
  ];
  if (d.cwd) L.push(`_Working dir: ${d.cwd}_`);
  const section = (h, body) => {
    if (body) {
      L.push('', `## ${h}`, body);
    }
  };
  section('Mission', d.mission);
  section('Current state', d.state);
  section('Progress so far', d.progress.length ? mdList(d.progress) : null);
  section('Next steps (do these first)', d.next_steps.length ? mdList(d.next_steps, true) : null);
  section('Key references', d.references.length ? mdList(d.references) : null);
  section('Decisions (and why)', d.decisions.length ? mdList(d.decisions) : null);
  section('Ruled out (do NOT retry)', d.rejected.length ? mdList(d.rejected) : null);
  section('User directives & corrections', d.user_directives.length ? mdList(d.user_directives) : null);
  section('System / process improvements discovered', d.improvements.length ? mdList(d.improvements) : null);
  section('Open questions', d.open_questions.length ? mdList(d.open_questions) : null);
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Write/refresh the canonical handoff doc (latest call wins). Returns {path, key} or
 *  null when there is nothing worth saving. Works without live state (saving judgment must
 *  never depend on the tap being live). */
export function saveContinuity(args, nowSec = Date.now() / 1000) {
  const session_id = readState()?.session_id ?? null;
  const d = {
    session_id,
    at: Math.round(nowSec),
    cwd: trim(args.cwd, CAP.cwd),
    mission: trim(args.mission, CAP.mission),
    state: trim(args.state, CAP.state),
    progress: trimList(args.progress, CAP.list),
    next_steps: trimList(args.next_steps, CAP.list),
    references: trimList(args.references, CAP.refs),
    decisions: trimList(args.decisions, CAP.list),
    rejected: trimList(args.rejected, CAP.list),
    user_directives: trimList(args.user_directives, CAP.list),
    improvements: trimList(args.improvements, CAP.list),
    open_questions: trimList(args.open_questions, CAP.list),
  };
  if (!d.mission && !d.next_steps.length) return null;
  const key = keyFor(session_id);
  ensureDir(contDir());
  const path = docPathFor(key);
  atomicWrite(path, renderDoc(d));
  atomicWriteJSON(metaPathFor(key), {
    session_id,
    at: d.at,
    cwd: d.cwd,
    title: d.mission ? d.mission.split('\n')[0].slice(0, 100) : null,
    digest: { mission: d.mission ? d.mission.slice(0, 220) : null, next: d.next_steps[0] ?? null },
  });
  pruneOld(nowSec);
  return { path, key };
}

/** Fetch the handoff doc for a compacting session: prefer the session-tagged doc, fall
 *  back to an untagged one (MCP could not read the session id). Defensive throughout — a
 *  bad read must never break SessionStart re-injection. */
export function takeContinuity(session_id, nowSec = Date.now() / 1000) {
  try {
    const seen = new Set();
    for (const key of [keyFor(session_id), 'session']) {
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = readJSON(metaPathFor(key));
      if (!meta) continue;
      if (nowSec - (meta.at ?? 0) > MAX_AGE_SEC) continue;
      if (meta.session_id && session_id && meta.session_id !== session_id) continue;
      const path = docPathFor(key);
      if (!existsSync(path)) continue;
      return { ...meta, path };
    }
    return null;
  } catch {
    return null;
  }
}

export function renderContinuityInjection(m) {
  const L = [
    `[tokenroom] your canonical handoff doc (you wrote this; updated ${fmtClock(m.at)}) survived compaction — READ IT FIRST to resume at full speed:`,
    `  ${m.path}`,
  ];
  if (m.digest?.mission) L.push(`- mission: ${m.digest.mission}`);
  if (m.digest?.next) L.push(`- resume at: ${m.digest.next}`);
  L.push(
    "It holds the mission, current state, exact next steps, key references, decisions, the user's directives, and improvements found this session. Trust it over the compacted summary, do not redo work it shows as done, and continue without slowing down."
  );
  return L.join('\n');
}

/** Most recently updated handoff doc across sessions (for `tokenroom handoff`). */
export function latestContinuity() {
  try {
    const metas = readdirSync(contDir())
      .filter((f) => f.endsWith('.meta.json'))
      .map((f) => ({ key: f.replace(/\.meta\.json$/, ''), meta: readJSON(join(contDir(), f)) }))
      .filter((x) => x.meta);
    if (!metas.length) return null;
    metas.sort((a, b) => (b.meta.at ?? 0) - (a.meta.at ?? 0));
    const { key, meta } = metas[0];
    const path = docPathFor(key);
    return { meta, path, markdown: existsSync(path) ? readFileSync(path, 'utf8') : null };
  } catch {
    return null;
  }
}

function pruneOld(nowSec) {
  try {
    for (const f of readdirSync(contDir())) {
      if (!f.endsWith('.meta.json')) continue;
      const m = readJSON(join(contDir(), f));
      if (m && nowSec - (m.at ?? 0) > PRUNE_SEC) {
        const key = f.replace(/\.meta\.json$/, '');
        try {
          rmSync(docPathFor(key));
        } catch {
          // best-effort
        }
        try {
          rmSync(join(contDir(), f));
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // pruning is best-effort
  }
}
