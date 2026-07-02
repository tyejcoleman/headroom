import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tokenroomDir, ensureDir } from './util.mjs';

// Compaction observability: a small append-only event log (~/.tokenroom/events.jsonl)
// recording the compaction lifecycle (pre/post/blocked, session starts) and context
// anomalies. Everything here is best-effort — observability must never break a hook
// or the tap (ADR-5).

const eventsPath = () => join(tokenroomDir(), 'events.jsonl');
const MAX_LINES = 400;

export function logEvent(event, nowSec = Date.now() / 1000) {
  try {
    ensureDir(tokenroomDir());
    appendFileSync(eventsPath(), JSON.stringify({ at: Math.round(nowSec), ...event }) + '\n');
    const lines = readFileSync(eventsPath(), 'utf8').trim().split('\n');
    if (lines.length > MAX_LINES) writeFileSync(eventsPath(), lines.slice(-MAX_LINES / 2).join('\n') + '\n');
  } catch {
    // best-effort
  }
}

export function recentEvents(windowSec, nowSec = Date.now() / 1000) {
  try {
    if (!existsSync(eventsPath())) return [];
    return readFileSync(eventsPath(), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e && typeof e.at === 'number' && nowSec - e.at <= windowSec);
  } catch {
    return [];
  }
}

/**
 * `tokenroom audit` — render the awareness loop as a timeline: what tokenroom knew, what
 * it injected (or why it stayed silent), and what the agent consulted. The audit shows
 * steering SIGNALS (consults, defers, pins); whether prose behavior changed is the
 * eval harness's job, and this output never pretends otherwise.
 */
export function renderAudit(sinceSec = 6 * 3600, nowSec = Date.now() / 1000) {
  const evs = recentEvents(sinceSec, nowSec);
  if (!evs.length) return 'no audit events in this window — use Claude Code with tokenroom installed, then re-run';

  const clock = (t) => {
    const d = new Date(t * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const describe = (e) => {
    switch (e.type) {
      case 'stamp':
        return `stamp    injected: 5h ${e.fh_left}% left${e.ctx_tokens != null ? ` · ctx ~${Math.round(e.ctx_tokens / 1000)}k` : ''}`;
      case 'stamp_skipped':
        return `stamp    skipped (${e.reason})`;
      case 'band_change':
        if (e.held) return `band     worsened mid-turn → held by throttle (retries next tool call)`;
        return e.emitted
          ? `band     crossed mid-turn → update injected (5h ${e.fh_left != null ? `${e.fh_left}% left` : '?'}${e.exh ? ', exhaustion projected' : ''})`
          : `band     changed (improvement — silent by design)`;
      case 'mcp_call':
        return `consult  ${e.tool}${e.verdict != null ? ` → ${e.verdict}` : ''}`;
      case 'pre_compact':
        return `compact  pre-compact snapshot (${e.trigger ?? '?'})`;
      case 'post_compact':
        return `compact  completed (${e.trigger ?? '?'})`;
      case 'compact_blocked':
        return `compact  AUTO compaction blocked (${e.minutes_to_reset}m to reset)`;
      case 'session_start':
        return `session  start (${e.source ?? '?'})`;
      case 'context_drop':
        return `context  silent cliff: -${e.dropped_tokens != null ? `${Math.round(e.dropped_tokens / 1000)}k tokens` : `${e.dropped_pct}%`} (no compaction event)`;
      case 'drop_announced':
        return `context  cliff disclosed in next stamp`;
      case 'account_switch':
        return `account  switched mid-session: ${e.from} → ${e.to} (payload wins; remapped instantly)`;
      case 'account_rollover':
        return `account  same-account 5h rollover: ${e.from} → ${e.to} (new phase, not a /login switch)`;
      case 'switch_announced':
        return `account  switch disclosed in next stamp`;
      default:
        return `${e.type}`;
    }
  };

  const lines = evs.map((e) => `${clock(e.at)}  ${describe(e)}`);
  const n = (t, f = () => true) => evs.filter((e) => e.type === t && f(e)).length;
  const fc = (v) => n('mcp_call', (e) => e.tool === 'fit_check' && e.verdict === v);
  lines.push(
    '—',
    `steering signals: ${n('stamp')} stamps · ${n('band_change', (e) => e.emitted)} mid-task updates · ` +
      `${n('mcp_call')} consults (fit_check defer/tight/fits: ${fc('defer')}/${fc('tight')}/${fc('fits')}) · ` +
      `${n('mcp_call', (e) => e.tool === 'plan_resume')} defers recorded · ${n('mcp_call', (e) => e.tool === 'pin_fact')} pins`
  );
  return lines.join('\n');
}

/**
 * Detect a silent context cliff: usage dropped sharply for the SAME session with no
 * compaction/clear event to explain it. Claude Code's microcompaction layers clear old
 * tool results without firing any hook — this is the only way to notice from outside.
 */
export function detectContextDrop(prev, next, nowSec = Date.now() / 1000) {
  try {
    if (!prev || !next) return;
    if (!prev.session_id || prev.session_id !== next.session_id) return;
    const before = prev.context?.used_pct;
    const after = next.context?.used_pct;
    if (before == null || after == null) return;
    const dropPct = before - after;
    const size = next.context?.window_size ?? prev.context?.window_size;
    const dropTokens = size ? Math.round((size * dropPct) / 100) : null;
    // 10 points on any window, or 30k tokens on big windows where points are coarse
    if (dropPct < 10 && !(dropTokens && dropTokens >= 30000)) return;
    const explained = recentEvents(10 * 60, nowSec).some((e) =>
      ['pre_compact', 'post_compact', 'session_start'].includes(e.type)
    );
    if (explained) return;
    logEvent(
      { type: 'context_drop', session_id: next.session_id, dropped_pct: Math.round(dropPct), dropped_tokens: dropTokens },
      nowSec
    );
  } catch {
    // observability never breaks the tap
  }
}
