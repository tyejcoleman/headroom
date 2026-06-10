import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { headroomDir, ensureDir } from './util.mjs';
import { parsePayload, updateBurn, writeState, readState } from './state.mjs';
import { renderHUD } from './hud.mjs';
import { readResume } from './resume.mjs';
import { detectContextDrop } from './events.mjs';

/**
 * Statusline command: read the payload Claude Code pipes to stdin, persist
 * ResourceState atomically, print the HUD. Must NEVER crash or print nothing —
 * a broken statusline is worse than no statusline.
 */
export async function tap(argv = []) {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    // fall through with whatever we have
  }

  let hud = '⛶ headroom: no data';
  try {
    if (argv.includes('--capture')) {
      ensureDir(headroomDir());
      appendFileSync(join(headroomDir(), 'raw-sample.jsonl'), raw.trim() + '\n');
    }
    const payload = JSON.parse(raw);
    const prev = readState();
    const state = updateBurn(parsePayload(payload));
    detectContextDrop(prev, state); // silent microcompaction leaves no other trace
    writeState(state);
    hud = renderHUD(state, readResume());
  } catch {
    // malformed/missing payload: keep the line, skip the write
  }
  process.stdout.write(hud);
}
