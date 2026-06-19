import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const headroomDir = () => process.env.HEADROOM_DIR || join(homedir(), '.headroom');

export const ensureDir = (dir) => mkdirSync(dir, { recursive: true });

export function atomicWrite(path, text) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function atomicWriteJSON(path, obj) {
  atomicWrite(path, JSON.stringify(obj, null, 2));
}

export function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Percentages must be 0–100; anything else (including epoch-leak values) becomes null. */
export function clampPct(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}

/** Epoch timestamps, tolerant of milliseconds sneaking in. */
export function epochSec(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v > 1e12 ? Math.round(v / 1000) : Math.round(v);
}

export function fmtClock(sec) {
  if (!sec) return '?';
  const d = new Date(sec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtTokens(n) {
  if (n == null) return '?';
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function fmtDelta(sec) {
  if (sec <= 0) return 'now';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Governor profiles (T2.4): the mode shifts WHEN headroom speaks up, never what it says.
 * powersave = early and often (thrift); performance = only when nearly too late
 * (minimal interruptions); ondemand = the shipped defaults. Read per-event from config,
 * so a mode change applies without restarting anything.
 */
export function modeProfile(mode) {
  switch (mode) {
    // ctx_bands fire the context handoff-nudge as context fills. Context is a BURN-THROUGH
    // resource, NOT a conserved one: held LATE on purpose so the agent uses it to the core.
    // The handoff is one cheap tool call that only needs to land before compaction, so the
    // default/performance modes nudge ONCE near the ceiling (~4% left) — never early; the
    // token-floored "super close" message is the final safety net. (Quota is the opposite —
    // a wary, paced resource; that's fh_bands, which stay multi-step.) Only powersave (thrift)
    // keeps an earlier 10% context heads-up.
    case 'performance':
      return { fh_bands: [10, 5], ctx_bands: [4], receipt_pct_floor: 5, receipt_cost_floor: 3, throttle_sec: 300 };
    case 'powersave':
      return { fh_bands: [40, 25, 10, 5], ctx_bands: [10, 4], receipt_pct_floor: 1, receipt_cost_floor: 0.5, throttle_sec: 60 };
    default:
      return { fh_bands: [25, 10, 5], ctx_bands: [4], receipt_pct_floor: 2, receipt_cost_floor: 1, throttle_sec: 120 };
  }
}

/** True (returning the reset clock) when window data was written BEFORE a reset that
 *  has since passed — the figures are not stale, they are WRONG-SIGNED (a "7% left"
 *  written at 21:05 is a lie at 21:15 if the window reset at 21:10). Field 2026-06-10:
 *  an agent planned an entire turn around "nearly dry" minutes after a reset to 96%. */
export function crossedReset(state, nowSec = Date.now() / 1000) {
  const r = state?.windows?.five_hour?.resets_at;
  // ANY resets_at in the past = dead-window data: real post-reset payloads always carry
  // the NEXT reset clock. Covers both shapes: state.json written before the reset, AND
  // state.json freshly overwritten by an idle session re-rendering stale payload data
  // (field 2026-06-10: a "≈85% receipt / 6% left, resets 21:10" fired at 21:4x while the
  // true window was 95% — shape 2, caught live minutes after shape 1 was fixed).
  if (r && nowSec >= r) return r;
  return null;
}

export function readConfig() {
  return {
    stamp_enabled: true,
    ceiling_pct: 80,
    mode: 'ondemand',
    compact_guard_min: null, // minutes-to-reset under which AUTO compaction is blocked (ADR-13); null = off
    auto_arm: false, // standing consent: every plan_resume also schedules the work at reset (ADR-16); default OFF
    launch_gate: false, // deny expensive Task/Agent/Workflow launches when the window verdict is defer (T2.14); default OFF
    ...(readJSON(join(headroomDir(), 'config.json')) ?? {}),
  };
}
