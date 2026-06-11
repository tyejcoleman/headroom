import { crossedReset } from './util.mjs';

const RANK = { fits: 0, tight: 1, exceeds: 2, defer: 2 };

/**
 * fit_check: size estimated work against both budgets.
 * Context verdicts use real token counts (0.7/1.0 thresholds, validated in eval v1).
 * Window verdicts are %-threshold + burn-projection heuristics — labeled as such,
 * since subscription windows expose no absolute token capacity.
 */
export function fitCheck(state, { est_tokens, est_calls } = {}, nowSec = Date.now() / 1000) {
  const out = { overall: 'unknown', context: null, window: null, advice: [] };

  const ctx = state?.context;
  if (ctx?.tokens_to_ceiling != null && typeof est_tokens === 'number') {
    const room = ctx.tokens_to_ceiling;
    const verdict = est_tokens <= room * 0.7 ? 'fits' : est_tokens <= room ? 'tight' : 'exceeds';
    out.context = { verdict, tokens_to_ceiling: room, est_tokens };
    if (verdict === 'exceeds') {
      out.advice.push('Will not fit before the compaction ceiling: write a checkpoint/handoff first, or split the task.');
    }
  }

  const fh = state?.windows?.five_hour;
  if (fh?.used_pct != null && crossedReset(state, nowSec)) {
    out.window = { verdict: 'fits', pct_left: null, resets_at: fh.resets_at ?? null, minutes_to_reset: 0, basis: 'window-reset' };
    out.advice.push('The 5h window has RESET since this data was written — quota is fresh; disregard earlier "nearly dry" figures.');
  } else if (fh?.used_pct != null) {
    const pctLeft = 100 - fh.used_pct;
    const minutesToReset = fh.resets_at ? Math.max(0, Math.round((fh.resets_at - nowSec) / 60)) : null;
    let verdict = pctLeft <= 2 ? 'defer' : pctLeft <= 10 ? 'tight' : 'fits';
    const projected = state?.burn?.projected_exhaustion;
    if (verdict === 'fits' && projected && fh.resets_at && projected < fh.resets_at) verdict = 'tight';
    out.window = {
      verdict,
      pct_left: Math.round(pctLeft * 10) / 10,
      resets_at: fh.resets_at ?? null,
      minutes_to_reset: minutesToReset,
      basis: state?.burn?.pct_per_hour ? 'burn-projection' : 'percent-threshold',
    };
    if (verdict === 'defer') {
      out.advice.push(`5h window nearly exhausted — defer heavy work past the reset${minutesToReset != null ? ` in ~${minutesToReset} min` : ''}; finish at a clean boundary and note a resume plan.`);
    } else if (verdict === 'tight') {
      out.advice.push('Window is tight: go cheap-first, batch tool calls, no scope growth.');
    }
  }

  const verdicts = [out.context?.verdict, out.window?.verdict].filter(Boolean);
  if (verdicts.length) {
    out.overall = verdicts.sort((a, b) => RANK[b] - RANK[a])[0];
    if (!out.advice.length) out.advice.push(out.overall === 'fits' ? 'Proceed normally.' : 'Proceed carefully; finish at a clean boundary.');
  } else {
    out.advice.push('No budget data collected yet — is the headroom statusline tap installed?');
  }
  if (typeof est_calls === 'number') out.est_calls = est_calls;
  return out;
}

export function estimateRemaining(state, nowSec = Date.now() / 1000) {
  const fh = state?.windows?.five_hour;
  const sd = state?.windows?.seven_day;
  return {
    five_hour: fh
      ? {
          pct_left: fh.used_pct != null ? Math.round((100 - fh.used_pct) * 10) / 10 : null,
          resets_at: fh.resets_at ?? null,
          minutes_to_reset: fh.resets_at ? Math.max(0, Math.round((fh.resets_at - nowSec) / 60)) : null,
          burn_pct_per_hour: state?.burn?.pct_per_hour ?? null,
          projected_exhaustion: state?.burn?.projected_exhaustion ?? null,
        }
      : null,
    seven_day: sd ? { pct_left: sd.used_pct != null ? Math.round((100 - sd.used_pct) * 10) / 10 : null, resets_at: sd.resets_at ?? null } : null,
    context: state?.context
      ? { tokens_to_ceiling: state.context.tokens_to_ceiling, pct_left_before_ceiling: state.context.used_pct != null ? Math.max(0, Math.round(((state.context.compact_ceiling_pct ?? 80) - state.context.used_pct) * 10) / 10) : null }
      : null,
  };
}
