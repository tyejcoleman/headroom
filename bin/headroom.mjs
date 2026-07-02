#!/usr/bin/env node
import { tap } from '../src/tap.mjs';
import { hookUserPromptSubmit, hookPreCompact, hookSessionStart, hookPostCompact, hookPostToolUse, hookPreToolUse } from '../src/hook.mjs';
import { addPin, listPins, removePins } from '../src/pins.mjs';
import { renderAudit } from '../src/events.mjs';
import { mcpServe } from '../src/mcp.mjs';
import { install, uninstall } from '../src/install.mjs';
import { readState } from '../src/state.mjs';
import { readResume, clearResume } from '../src/resume.mjs';
import { watchDashboard } from '../src/watch.mjs';
import { renderLine } from '../src/hud.mjs';

const [cmd, ...argv] = process.argv.slice(2);

switch (cmd) {
  case 'tap':
    await tap(argv);
    break;
  case 'watch':
    watchDashboard();
    break;
  case 'line':
    console.log(renderLine(readState(), readResume()));
    break;
  case 'hook': {
    if (argv[0] === 'user-prompt-submit') await hookUserPromptSubmit();
    else if (argv[0] === 'pre-compact') await hookPreCompact();
    else if (argv[0] === 'session-start') await hookSessionStart();
    else if (argv[0] === 'post-compact') await hookPostCompact();
    else if (argv[0] === 'post-tool-use') await hookPostToolUse();
    else if (argv[0] === 'pre-tool-use') await hookPreToolUse();
    // unknown hook events exit silently — a hook must never break the harness
    break;
  }
  case 'pin': {
    let ttl;
    const words = [...argv];
    const ti = words.indexOf('--ttl-hours');
    if (ti >= 0) {
      ttl = Number(words[ti + 1]);
      words.splice(ti, 2);
    }
    const pin = addPin(words.join(' '), { ttl_hours: ttl });
    console.log(pin ? `pinned ${pin.id}: ${pin.text}` : 'usage: headroom pin "fact that must survive compaction" [--ttl-hours N]');
    break;
  }
  case 'pins': {
    const pins = listPins();
    console.log(pins.length ? pins.map((p) => `${p.id}  ${p.text}`).join('\n') : 'no pins');
    break;
  }
  case 'handoff': {
    const { latestContinuity } = await import('../src/continuity.mjs');
    const h = latestContinuity();
    if (!h) console.log('no handoff doc yet — the agent writes one via the headroom `handoff` MCP tool');
    else if (argv[0] === '--path') console.log(h.path);
    else console.log(h.markdown ?? `handoff doc at ${h.path} (unreadable)`);
    break;
  }
  case 'unpin': {
    const n = removePins(argv[0] === '--all' ? '--all' : argv[0]);
    console.log(n ? `removed ${n} pin${n > 1 ? 's' : ''}` : 'no matching pin (`headroom pins` to list)');
    break;
  }
  case 'resume': {
    if (argv.includes('--clear')) {
      console.log(clearResume() ? 'resume plan cleared' : 'no resume plan to clear');
    } else {
      const plan = readResume();
      console.log(plan ? JSON.stringify(plan, null, 2) : 'no resume plan recorded');
    }
    break;
  }
  case 'doctor': {
    (await import('../src/doctor.mjs')).doctor(argv);
    break;
  }
  case 'audit': {
    const i = argv.indexOf('--since');
    const hours = i >= 0 ? Number(argv[i + 1]) || 6 : 6;
    console.log(renderAudit(hours * 3600));
    break;
  }
  case 'mcp':
    mcpServe();
    break;
  case 'install':
    install(argv);
    break;
  case 'uninstall':
    uninstall(argv);
    break;
  case 'status': {
    const s = readState();
    console.log(s ? JSON.stringify(s, null, 2) : 'no state yet — install the tap and use Claude Code once (headroom install)');
    break;
  }
  default:
    console.log(`headroom — resource-aware layer for Claude Code

usage:
  headroom install [--dry-run] [--no-mcp] [--config-dir <dir>]   wire up statusline + hooks + skill + MCP
  headroom uninstall [--config-dir <dir>]                        remove everything install added
  headroom status                                                print the current ResourceState
  headroom watch                                                 LIVE dashboard (1s ticks) for a second pane
  headroom line                                                  one live line (countdowns at call time) for tmux/xbar/waybar
  headroom resume [--clear]                                      show or clear the deferred-work plan
  headroom pin "<fact>" [--ttl-hours N]                          pin a fact to survive compaction verbatim
  headroom pins | unpin <id|--all>                               list / remove pins
  headroom handoff [--path]                                      print the canonical handoff doc (the agent writes it via the MCP tool)
  headroom audit [--since <hours>]                               timeline of the awareness loop (default 6h)
  headroom doctor                                                diagnose the install (wiring, freshness, conflicts)
  headroom tap [--capture]      (statusline command — wired by install)
  headroom hook <user-prompt-submit|pre-compact|session-start|post-compact>   (hook commands — wired by install)
  headroom mcp                                    (stdio MCP server — wired by install)`);
}
