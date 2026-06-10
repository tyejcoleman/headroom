#!/usr/bin/env node
import { tap } from '../src/tap.mjs';
import { hookUserPromptSubmit, hookPreCompact, hookSessionStart } from '../src/hook.mjs';
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
    // unknown hook events exit silently — a hook must never break the harness
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
  headroom tap [--capture]      (statusline command — wired by install)
  headroom hook <user-prompt-submit|pre-compact|session-start>   (hook commands — wired by install)
  headroom mcp                                    (stdio MCP server — wired by install)`);
}
