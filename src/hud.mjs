import { fmtClock, fmtTokens, fmtDelta, crossedReset } from './util.mjs';

/**
 * One-line human HUD for the statusline. Conventions (all field-tested):
 * - percentages are REMAINING, never used (eval v0: "X% used" gets misread);
 * - one segment per decision the user might make — healthy budgets stay terse,
 *   warnings appear only when they should change behavior;
 * - times of day are written so they cannot be misread as durations
 *   (field 2026-06-10: "⚠exh 00:34" was read as "34 minutes").
 */
export function renderHUD(state, resume = null, nowSec = Date.now() / 1000, alt = null) {
  const parts = [];
  const fh = state.windows?.five_hour;
  const sd = state.windows?.seven_day;
  const ctx = state.context;

  // primary quota needs no label — leading position + the ↻ reset clock say what it is
  const resetAt = crossedReset(state, nowSec);
  if (resetAt) {
    parts.push(`window reset ${fmtClock(resetAt)} — fresh quota`);
  } else if (fh?.used_pct != null) {
    let seg = `${Math.round(100 - fh.used_pct)}% left`;
    if (state.burn?.est_tokens_left != null) seg += ` (≈${fmtTokens(state.burn.est_tokens_left)})`;
    if (fh.resets_at) seg += ` ↻${fmtClock(fh.resets_at)}`;
    parts.push(seg);
  }
  // weekly window is only news when it's the binding constraint
  const wkHot = state.burn?.weekly?.hot;
  if (sd?.used_pct != null && (100 - sd.used_pct < 30 || wkHot)) {
    parts.push(`week ${Math.round(100 - sd.used_pct)}% left${wkHot ? ' ⚠hot pace' : ''}`);
  }
  if (ctx?.used_pct != null) {
    const left = Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct));
    let s = `ctx ${left}%${ctx.tokens_to_ceiling != null ? ` (${fmtTokens(ctx.tokens_to_ceiling)})` : ''}`;
    if (left < 10) s += ' ⚠compact soon';
    parts.push(s);
  }
  // Raw %/h confused everyone in the field; surface burn only when it predicts trouble.
  // Clock, not countdown: the statusline re-renders on Claude Code's schedule, and a
  // frozen "in 25m" lies — "by ~00:39" stays true. Live countdowns: tokenroom watch/line.
  const band = state.burn?.exhaustion_band;
  const exh = state.burn?.projected_exhaustion;
  if (band && fh?.resets_at && band[0] < fh.resets_at) parts.push(`⚠ empty ~${fmtClock(band[0])}–${fmtClock(band[1])}`);
  else if (exh && fh?.resets_at && exh < fh.resets_at) parts.push(`⚠ empty by ~${fmtClock(exh)}`);
  // The OTHER known profile, terse (ADR-24): a human deciding whether to /login-switch
  // needs one number; `⇄ switch-ready` appears only when switching is actually the move.
  if (alt) {
    const fhLeft = fh?.used_pct != null ? 100 - fh.used_pct : null;
    const switchable = fhLeft != null && fhLeft < 15 && (alt.reset || alt.fh_left >= 40);
    parts.push(`alt '${alt.label}' ${alt.reset ? 'fresh' : `≈${Math.round(alt.fh_left)}%`}${switchable ? ' ⇄ switch-ready' : ''}`);
  }
  // deferred work appears only when actionable — a waiting plan is noise (tokenroom resume shows it)
  if (resume?.resume_at && nowSec >= resume.resume_at) parts.push('✓ deferred work ready');
  if (state.session?.cost_usd >= 0.01) parts.push(`$${state.session.cost_usd.toFixed(2)}`);

  return parts.length ? `⛶ ${parts.join(' · ')}` : '⛶ tokenroom: awaiting data';
}

/**
 * `tokenroom line` — the live-display primitive. Unlike the statusline HUD (rendered on
 * Claude Code's schedule, so it uses absolute clocks), this computes countdowns at
 * call time: poll it every second (tmux status-right, SwiftBar/xbar, waybar/polybar)
 * and the display is genuinely live.
 */
export function renderLine(state, resume = null, nowSec = Date.now() / 1000) {
  if (!state) return 'tokenroom: no data';
  const age = nowSec - state.updated_at;
  if (age > 30 * 60) return `tokenroom: idle ${Math.round(age / 60)}m`;

  const parts = [];
  const fh = state.windows?.five_hour;
  if (crossedReset(state, nowSec)) {
    parts.push('5h reset — fresh');
  } else if (fh?.used_pct != null) {
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
  return parts.length ? parts.join(' · ') : 'tokenroom: no data';
}
