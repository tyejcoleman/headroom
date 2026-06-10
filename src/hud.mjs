import { fmtClock, fmtTokens, fmtDelta } from './util.mjs';

/**
 * One-line human HUD for the statusline. Convention everywhere in headroom:
 * percentages shown are REMAINING, never used (eval v0 found "X% used" gets misread).
 */
export function renderHUD(state, resume = null, nowSec = Date.now() / 1000) {
  const parts = [];
  const fh = state.windows?.five_hour;
  const sd = state.windows?.seven_day;
  const ctx = state.context;

  if (fh?.used_pct != null) {
    parts.push(`5h ${Math.round(100 - fh.used_pct)}%${fh.resets_at ? `→${fmtClock(fh.resets_at)}` : ''}`);
  }
  if (sd?.used_pct != null) parts.push(`7d ${Math.round(100 - sd.used_pct)}%`);
  if (ctx?.used_pct != null) {
    const left = Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct));
    let s = `ctx ${left}%`;
    if (ctx.tokens_to_ceiling != null) s += `(${fmtTokens(ctx.tokens_to_ceiling)})`;
    if (left < 10) s += ' ⚠compact';
    parts.push(s);
  }
  // Raw %/h confused everyone in the field; surface burn only when it predicts trouble.
  const exh = state.burn?.projected_exhaustion;
  if (exh && fh?.resets_at && exh < fh.resets_at) parts.push(`⚠exh ${fmtClock(exh)}`);
  if (resume?.resume_at) {
    parts.push(nowSec >= resume.resume_at ? '✓ deferred ready' : `⏲ resume ${fmtClock(resume.resume_at)}`);
  }
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
