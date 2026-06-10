#!/usr/bin/env node
import { tap } from '../src/tap.mjs';
import { hookUserPromptSubmit } from '../src/hook.mjs';
import { mcpServe } from '../src/mcp.mjs';
import { install, uninstall } from '../src/install.mjs';
import { readState } from '../src/state.mjs';

const [cmd, ...argv] = process.argv.slice(2);

switch (cmd) {
  case 'tap':
    await tap(argv);
    break;
  case 'hook': {
    if (argv[0] === 'user-prompt-submit') await hookUserPromptSubmit();
    // unknown hook events exit silently — a hook must never break the harness
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
  headroom install [--dry-run] [--no-mcp] [--config-dir <dir>]   wire up statusline + hook + skill + MCP
  headroom uninstall [--config-dir <dir>]                        remove everything install added
  headroom status                                                print the current ResourceState
  headroom tap [--capture]      (statusline command — wired by install)
  headroom hook user-prompt-submit                (hook command — wired by install)
  headroom mcp                                    (stdio MCP server — wired by install)`);
}
