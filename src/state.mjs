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

/** Append this sample to history and derive burn rate / projected exhaustion from it. */
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
  if (last.t - first.t >= 5 * 60 && last.u >= first.u) {
    const pctPerHour = (last.u - first.u) / ((last.t - first.t) / 3600);
    state.burn.pct_per_hour = Math.round(pctPerHour * 10) / 10;
    if (pctPerHour > 0.1) {
      state.burn.projected_exhaustion = Math.round(last.t + ((100 - last.u) / pctPerHour) * 3600);
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
