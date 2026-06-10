import { readState } from './state.mjs';
import { readConfig, fmtClock, fmtTokens } from './util.mjs';

const STALE_SEC = 30 * 60;

/**
 * UserPromptSubmit hook: emit a tiny headroom stamp as additionalContext.
 * Wording rule (validated in eval v0/v1): always REMAINING-first, with absolute
 * tokens where known. Silent when disabled, missing, or stale — never inject a lie.
 */
export async function hookUserPromptSubmit() {
  try {
    process.stdin.setEncoding('utf8');
    for await (const _ of process.stdin) void _; // consume the hook payload
  } catch {
    // payload is unused; ignore read errors
  }

  if (process.env.HEADROOM_DISABLE === '1' || !readConfig().stamp_enabled) return;
  const s = readState();
  if (!s || Date.now() / 1000 - s.updated_at > STALE_SEC) return;

  const parts = [];
  const fh = s.windows?.five_hour;
  const sd = s.windows?.seven_day;
  const ctx = s.context;
  if (fh?.used_pct != null) {
    parts.push(`5h: ${Math.round(100 - fh.used_pct)}% left${fh.resets_at ? `, resets ${fmtClock(fh.resets_at)}` : ''}`);
  }
  if (sd?.used_pct != null) parts.push(`7d: ${Math.round(100 - sd.used_pct)}% left`);
  if (ctx?.tokens_to_ceiling != null) {
    parts.push(`ctx: ~${fmtTokens(ctx.tokens_to_ceiling)} tokens before compaction`);
  } else if (ctx?.used_pct != null) {
    parts.push(`ctx: ${Math.max(0, Math.round((ctx.compact_ceiling_pct ?? 80) - ctx.used_pct))}% left before compaction`);
  }
  if (s.burn?.pct_per_hour) parts.push(`burn ${s.burn.pct_per_hour}%/h`);
  if (!parts.length) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[headroom] ${parts.join(' · ')}`,
      },
    })
  );
}
