import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { headroomDir, ensureDir } from './util.mjs';

// Compaction observability: a small append-only event log (~/.headroom/events.jsonl)
// recording the compaction lifecycle (pre/post/blocked, session starts) and context
// anomalies. Everything here is best-effort — observability must never break a hook
// or the tap (ADR-5).

const eventsPath = () => join(headroomDir(), 'events.jsonl');
const MAX_LINES = 400;

export function logEvent(event, nowSec = Date.now() / 1000) {
  try {
    ensureDir(headroomDir());
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
