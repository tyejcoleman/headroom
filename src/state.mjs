import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { headroomDir, ensureDir, atomicWriteJSON, readJSON, clampPct, epochSec, readConfig } from './util.mjs';

/** Build a ResourceState v0 from one statusline stdin payload. Every field is optional. */
export function parsePayload(payload, nowMs = Date.now()) {
  const cfg = readConfig();
  const ceiling = Number(process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) || cfg.ceiling_pct;

  const windows = {};
  for (const key of ['five_hour', 'seven_day']) {
    const w = payload?.rate_limits?.[key];
    if (w && typeof w === 'object') {
      const used = clampPct(w.used_percentage);
      const resets = epochSec(w.resets_at);
      if (used !== null || resets !== null) windows[key] = { used_pct: used, resets_at: resets };
    }
  }

  let context = null;
  const cw = payload?.context_window;
  if (cw && typeof cw === 'object') {
    const size = typeof cw.context_window_size === 'number' && cw.context_window_size > 0 ? cw.context_window_size : null;
    const used = clampPct(cw.used_percentage);
    context = {
      window_size: size,
      used_pct: used,
      compact_ceiling_pct: ceiling,
      tokens_to_ceiling: size !== null && used !== null ? Math.max(0, Math.round((size * (ceiling - used)) / 100)) : null,
    };
  }

  return {
    schema: 'resource-state/v0',
    updated_at: Math.round(nowMs / 1000),
    provider: 'anthropic',
    auth: windows.five_hour || windows.seven_day ? 'subscription' : 'unknown',
    session_id: typeof payload?.session_id === 'string' ? payload.session_id : null,
    windows,
    context,
    burn: { pct_per_hour: null, projected_exhaustion: null },
    session: {
      cost_usd: typeof payload?.cost?.total_cost_usd === 'number' ? payload.cost.total_cost_usd : null,
    },
    mode: cfg.mode,
  };
}

const HISTORY_WINDOW_SEC = 90 * 60;
const HISTORY_MAX_SAMPLES = 400;
const MIN_BASELINE_SEC = 10 * 60;

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Append this sample to history and derive burn rate / projected exhaustion from it.
 * Estimator is median-of-buckets (oldest vs newest quarter of the baseline), not
 * first-vs-last: real histories contain outlier samples (e.g. a placeholder 1% before
 * rate_limits populates) and interleaved stale values from concurrent sessions, and a
 * single bad endpoint must not produce a 180%/h hallucination.
 */
export function updateBurn(state) {
  const fh = state.windows.five_hour;
  if (fh?.used_pct == null) return state;

  const dir = headroomDir();
  ensureDir(dir);
  const histPath = join(dir, 'history.jsonl');

  let samples = [];
  if (existsSync(histPath)) {
    try {
      samples = readFileSync(histPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      samples = [];
    }
  }
  samples.push({ t: state.updated_at, u: fh.used_pct });
  samples = samples.filter((s) => s.t >= state.updated_at - HISTORY_WINDOW_SEC);
  // a sizable usage drop means the window reset — only fit on samples since then
  let start = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i].u < samples[i - 1].u - 5) start = i;
  samples = samples.slice(start).slice(-HISTORY_MAX_SAMPLES);
  try {
    writeFileSync(histPath, samples.map((s) => JSON.stringify(s)).join('\n') + '\n');
  } catch {
    // history is best-effort; never block the tap
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const span = last.t - first.t;
  if (span >= MIN_BASELINE_SEC) {
    const quarter = span / 4;
    const oldest = samples.filter((s) => s.t <= first.t + quarter);
    const newest = samples.filter((s) => s.t >= last.t - quarter);
    if (oldest.length >= 2 && newest.length >= 2) {
      const dt = median(newest.map((s) => s.t)) - median(oldest.map((s) => s.t));
      const du = median(newest.map((s) => s.u)) - median(oldest.map((s) => s.u));
      if (dt > 0 && du >= 0) {
        const pctPerHour = (du / dt) * 3600;
        state.burn.pct_per_hour = Math.round(pctPerHour * 10) / 10;
        if (pctPerHour > 0.1) {
          const currentU = median(newest.map((s) => s.u));
          state.burn.projected_exhaustion = Math.round(last.t + ((100 - currentU) / pctPerHour) * 3600);
        }
      }
    }
  }
  return state;
}

export function writeState(state) {
  const dir = headroomDir();
  ensureDir(dir);
  atomicWriteJSON(join(dir, 'state.json'), state);
}

export function readState() {
  return readJSON(join(headroomDir(), 'state.json'));
}
