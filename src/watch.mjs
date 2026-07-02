import { watch as fsWatch } from 'node:fs';
import { tokenroomDir, fmtClock, fmtTokens, fmtDelta } from './util.mjs';
import { readState } from './state.mjs';
import { readResume } from './resume.mjs';

// `tokenroom watch` — a LIVE dashboard for a second terminal pane. The statusline's
// render schedule belongs to Claude Code (it re-runs the command on conversation
// activity only), so the statusline shows absolute clock times that never go stale.
// This view is the opposite trade: it ticks every second (live countdowns, live data
// age) and re-reads state the moment the tap writes it (fs.watch).

const BAR_W = 24;
const bar = (pctLeft) => {
  if (pctLeft == null) return '─'.repeat(BAR_W);
  const filled = Math.round((Math.max(0, Math.min(100, pctLeft)) / 100) * BAR_W);
  return '█'.repeat(filled) + '░'.repeat(BAR_W - filled);
};

/** Pure renderer — testable without the loop. Returns lines. */
export function buildDashboard(state, resume, nowSec) {
  const lines = [];
  if (!state) {
    return ['TOKENROOM · live', '', 'no state yet — is the statusline tap installed and a session active?', '', 'watching ~/.tokenroom · Ctrl-C to exit'];
  }
  const age = Math.max(0, Math.round(nowSec - state.updated_at));
  const frozen = age > 30 * 60;
  lines.push(`TOKENROOM · live · ${fmtClock(nowSec)} · data ${age < 90 ? `${age}s` : `${Math.round(age / 60)}m`} old${frozen ? ' — NO ACTIVE SESSION RENDERING (frozen)' : ''}`);
  lines.push('');

  const fh = state.windows?.five_hour;
  if (fh?.used_pct != null) {
    const left = 100 - fh.used_pct;
    const reset = fh.resets_at ? `resets ${fmtClock(fh.resets_at)} (in ${fmtDelta(fh.resets_at - nowSec)})` : '';
    lines.push(`5h window   ${bar(left)}  ${String(Math.round(left)).padStart(3)}% left   ${reset}`);
  }
  const sd = state.windows?.seven_day;
  if (sd?.used_pct != null) {
    const left = 100 - sd.used_pct;
    const reset = sd.resets_at ? `resets in ${fmtDelta(sd.resets_at - nowSec)}` : '';
    lines.push(`7d window   ${bar(left)}  ${String(Math.round(left)).padStart(3)}% left   ${reset}`);
  }
  const ctx = state.context;
  if (ctx?.used_pct != null) {
    const left = Math.max(0, (ctx.compact_ceiling_pct ?? 80) - ctx.used_pct);
    const tok = ctx.tokens_to_ceiling != null ? `≈${fmtTokens(ctx.tokens_to_ceiling)} tokens before compaction` : '';
    lines.push(`context     ${bar((left / (ctx.compact_ceiling_pct ?? 80)) * 100)}  ${String(Math.round(left)).padStart(3)}% left   ${tok}`);
  }

  const burnBits = [];
  if (state.burn?.pct_per_hour != null) burnBits.push(`${state.burn.pct_per_hour}%/h`);
  const exh = state.burn?.projected_exhaustion;
  if (exh && fh?.resets_at) {
    burnBits.push(exh < fh.resets_at ? `⚠ EXHAUSTS ~${fmtClock(exh)}, BEFORE the reset` : 'no exhaustion risk before reset');
  }
  if (burnBits.length) lines.push(`burn        ${burnBits.join(' · ')}`);

  if (resume?.resume_at) {
    const ready = nowSec >= resume.resume_at;
    lines.push(`deferred    ${ready ? '✓ READY' : `⏲ resume ${fmtClock(resume.resume_at)} (in ${fmtDelta(resume.resume_at - nowSec)})`} — "${resume.summary.slice(0, 60)}"`);
  }
  if (state.session?.cost_usd >= 0.01) lines.push(`session     $${state.session.cost_usd.toFixed(2)} (API-price gauge, last-rendering session)`);

  lines.push('');
  lines.push('watching ~/.tokenroom · updates live · Ctrl-C to exit');
  return lines;
}

export function watchDashboard() {
  const render = () => {
    const out = buildDashboard(readState(), readResume(), Date.now() / 1000).join('\n');
    process.stdout.write('\x1b[2J\x1b[H\x1b[?25l' + out + '\n');
  };
  render();
  const timer = setInterval(render, 1000);
  try {
    fsWatch(tokenroomDir(), render);
  } catch {
    // dir may not exist yet; the 1s timer still covers it
  }
  const bye = () => {
    clearInterval(timer);
    process.stdout.write('\x1b[?25h\n');
    process.exit(0);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}
