import { fmtClock, fmtTokens, fmtDelta } from './util.mjs';

/**
 * One-line human HUD for the statusline. Conventions (all field-tested):
 * - percentages are REMAINING, never used (eval v0: "X% used" gets misread);
 * - one segment per decision the user might make — healthy budgets stay terse,
 *   warnings appear only when they should change behavior;
 * - times of day are written so they cannot be misread as durations
 *   (field 2026-06-10: "⚠exh 00:34" was read as "34 minutes").
 */
export function renderHUD(state, resume = null, nowSec = Date.now() / 1000) {
  const parts = [];
  const fh = state.windows?.five_hour;
  const sd = state.windows?.seven_day;
  const ctx = state.context;

  // primary quota needs no label — leading position + the ↻ reset clock say what it is
  if (fh?.used_pct != null) {
    let seg = `${Math.round(100 - fh.used_pct)}% left`;
    if (state.burn?.est_tokens_left != null) seg += ` (≈${fmtTokens(state.burn.est_tokens_left)})`;
    if (fh.resets_at) seg += ` ↻${fmtClock(fh.resets_at)}`;
    parts.push(seg);
  }
  // weekly window is only news when it's the binding constraint
  if (sd?.used_pct != null && 100 - sd.used_pct < 30) parts.push(`week ${Math.round(100 - sd.used_pct)}% left`);
  if (ctx?.used_pct != null) {
    const left = Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct));
    let s = `ctx ${left}%${ctx.tokens_to_ceiling != null ? ` (${fmtTokens(ctx.tokens_to_ceiling)})` : ''}`;
    if (left < 10) s += ' ⚠compact soon';
    parts.push(s);
  }
  // Raw %/h confused everyone in the field; surface burn only when it predicts trouble.
  // Clock, not countdown: the statusline re-renders on Claude Code's schedule, and a
  // frozen "in 25m" lies — "by ~00:39" stays true. Live countdowns: headroom watch/line.
  const band = state.burn?.exhaustion_band;
  const exh = state.burn?.projected_exhaustion;
  if (band && fh?.resets_at && band[0] < fh.resets_at) parts.push(`⚠ empty ~${fmtClock(band[0])}–${fmtClock(band[1])}`);
  else if (exh && fh?.resets_at && exh < fh.resets_at) parts.push(`⚠ empty by ~${fmtClock(exh)}`);
  // deferred work appears only when actionable — a waiting plan is noise (headroom resume shows it)
  if (resume?.resume_at && nowSec >= resume.resume_at) parts.push('✓ deferred work ready');
  if (state.session?.cost_usd >= 0.01) parts.push(`$${state.session.cost_usd.toFixed(2)}`);

  return parts.length ? `⛶ ${parts.join(' · ')}` : '⛶ headroom: awaiting data';
}

/**
 * `headroom line` — the live-display primitive. Unlike the statusline HUD (rendered on
 * Claude Code's schedule, so it uses absolute clocks), this computes countdowns at
 * call time: poll it every second (tmux status-right, SwiftBar/xbar, waybar/polybar)
 * and the display is genuinely live.
 */
export function renderLine(state, resume = null, nowSec = Date.now() / 1000) {
  if (!state) return 'headroom: no data';
  const age = nowSec - state.updated_at;
  if (age > 30 * 60) return `headroom: idle ${Math.round(age / 60)}m`;

  const parts = [];
  const fh = state.windows?.five_hour;
  if (fh?.used_pct != null) {
    parts.push(`5h ${Math.round(100 - fh.used_pct)}%${fh.resets_at ? ` ↻${fmtDelta(fh.resets_at - nowSec)}` : ''}`);
  }
  const sd = state.windows?.seven_day;
  if (sd?.used_pct != null) parts.push(`7d ${Math.round(100 - sd.used_pct)}%`);
  const ctx = state.context;
  if (ctx?.used_pct != null) {
    parts.push(`ctx ${Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct))}%`);
  }
  const exh = state.burn?.projected_exhaustion;
  if (exh && fh?.resets_at && exh < fh.resets_at) parts.push(`⚠exh ${fmtDelta(exh - nowSec)}`);
  if (resume?.resume_at) parts.push(nowSec >= resume.resume_at ? '✓ready' : `⏲${fmtDelta(resume.resume_at - nowSec)}`);
  if (state.session?.cost_usd >= 0.01) parts.push(`$${state.session.cost_usd.toFixed(2)}`);
  return parts.length ? parts.join(' · ') : 'headroom: no data';
}
