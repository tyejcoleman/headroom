import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const headroomDir = () => process.env.HEADROOM_DIR || join(homedir(), '.headroom');

export const ensureDir = (dir) => mkdirSync(dir, { recursive: true });

export function atomicWriteJSON(path, obj) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
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
    case 'performance':
      return { fh_bands: [10, 5], ctx_bands: [10], receipt_pct_floor: 5, receipt_cost_floor: 3, throttle_sec: 300 };
    case 'powersave':
      return { fh_bands: [40, 25, 10, 5], ctx_bands: [40, 25, 10], receipt_pct_floor: 1, receipt_cost_floor: 0.5, throttle_sec: 60 };
    default:
      return { fh_bands: [25, 10, 5], ctx_bands: [25, 10], receipt_pct_floor: 2, receipt_cost_floor: 1, throttle_sec: 120 };
  }
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
