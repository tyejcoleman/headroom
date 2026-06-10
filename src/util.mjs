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

export function readConfig() {
  return {
    stamp_enabled: true,
    ceiling_pct: 80,
    mode: 'ondemand',
    compact_guard_min: null, // minutes-to-reset under which AUTO compaction is blocked (ADR-13); null = off
    ...(readJSON(join(headroomDir(), 'config.json')) ?? {}),
  };
}
