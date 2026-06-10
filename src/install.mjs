import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binPath = join(pkgRoot, 'bin', 'headroom.mjs');
const MARK = 'headroom.mjs'; // identifies commands we own in settings.json

/** npx runs from an evictable cache — absolute paths written from there break later. */
export const isEphemeralInstall = (p) => p.includes('/_npx/') || p.includes('\\_npx\\');

const cmd = (sub) => `"${process.execPath}" "${binPath}" ${sub}`;

const COMPACT_MARK_START = '<!-- headroom:compact-instructions:start -->';
const COMPACT_MARK_END = '<!-- headroom:compact-instructions:end -->';
const COMPACT_BLOCK = `${COMPACT_MARK_START}
## Compact Instructions

When compacting this conversation, preserve verbatim: exact file paths and symbol names;
commands that failed, with their exact error text; the user's constraints and corrections
word-for-word; and any \`[headroom]\` budget or pinned-fact lines. State budgets as
remaining ("X% left"), never as used.
${COMPACT_MARK_END}`;

function configDir(argv) {
  const i = argv.indexOf('--config-dir');
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]);
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

const readSettings = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
};

export function install(argv = []) {
  if (isEphemeralInstall(pkgRoot)) {
    console.error(
      'headroom install: refusing to install from the npx cache.\n' +
        'npx runs from an evictable cache directory; the absolute paths written into\n' +
        'settings.json would silently break when npm prunes it. Install persistently:\n' +
        '  npm install -g headroom-cc && headroom install\n' +
        'or clone the repo and run: node bin/headroom.mjs install'
    );
    process.exitCode = 1;
    return;
  }
  const dry = argv.includes('--dry-run');
  const dir = configDir(argv);
  const settingsPath = join(dir, 'settings.json');
  const changes = [];
  if (process.platform === 'win32') {
    changes.push('note: Windows is currently UNTESTED — verify the quoted command paths in settings.json work, and please report results in an issue');
  }

  mkdirSync(dir, { recursive: true });
  const settings = readSettings(settingsPath);
  if (!dry && existsSync(settingsPath)) copyFileSync(settingsPath, settingsPath + '.headroom-bak');

  // statusline
  const tapCmd = `${cmd('tap')}`;
  if (settings.statusLine?.command?.includes(MARK)) {
    changes.push('statusline: already installed');
  } else {
    if (settings.statusLine) changes.push('statusline: REPLACED existing statusLine (original saved in settings.json.headroom-bak)');
    else changes.push('statusline: installed headroom tap');
    settings.statusLine = { type: 'command', command: tapCmd };
  }

  // hooks: stamp, compaction-survival snapshot, post-compaction/ready re-injection
  settings.hooks ??= {};
  const HOOK_EVENTS = [
    ['UserPromptSubmit', 'hook user-prompt-submit', 'budget stamp'],
    ['PreCompact', 'hook pre-compact', 'compaction-survival snapshot + transcript anchor'],
    ['SessionStart', 'hook session-start', 'post-compaction re-injection + pins + deferred-work readiness'],
    ['PostCompact', 'hook post-compact', 'compaction event log (observability)'],
    ['PostToolUse', 'hook post-tool-use', 'mid-turn band-crossing re-stamps'],
  ];
  for (const [event, sub, label] of HOOK_EVENTS) {
    settings.hooks[event] ??= [];
    const present = settings.hooks[event].some((m) => (m.hooks ?? []).some((h) => h.command?.includes(MARK)));
    if (present) {
      changes.push(`hook ${event}: already installed`);
    } else {
      settings.hooks[event].push({ hooks: [{ type: 'command', command: cmd(sub), timeout: 10 }] });
      changes.push(`hook ${event}: installed (${label})`);
    }
  }

  // skill — content-compared so upgrades propagate, not just first installs
  const skillDest = join(dir, 'skills', 'headroom');
  const skillSrc = readFileSync(join(pkgRoot, 'skill', 'SKILL.md'), 'utf8');
  const skillFile = join(skillDest, 'SKILL.md');
  const skillCur = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : null;
  if (skillCur === skillSrc) {
    changes.push('skill: already installed (current)');
  } else if (!dry) {
    mkdirSync(skillDest, { recursive: true });
    writeFileSync(skillFile, skillSrc);
    changes.push(skillCur === null ? `skill: installed to ${skillDest}` : 'skill: updated to this version');
  } else {
    changes.push(skillCur === null ? `skill: would install to ${skillDest}` : 'skill: would update to this version');
  }

  if (!dry) writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  // Compact Instructions in the user's CLAUDE.md — the one official surface that shapes
  // WHAT the compactor preserves. Marked block, idempotent, removed by uninstall.
  const claudeMdPath = join(dir, 'CLAUDE.md');
  const md = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
  if (md.includes(COMPACT_MARK_START)) {
    changes.push('CLAUDE.md compact instructions: already installed');
  } else if (dry) {
    changes.push('CLAUDE.md: would append Compact Instructions block (shapes what compaction preserves)');
  } else {
    writeFileSync(claudeMdPath, (md ? md.replace(/\n*$/, '\n\n') : '') + COMPACT_BLOCK + '\n');
    changes.push('CLAUDE.md: appended Compact Instructions block (shapes what compaction preserves)');
  }

  // MCP server — via the claude CLI so registration lands in the right scope.
  // Skipped in test/sandbox mode (--config-dir) and with --no-mcp.
  if (!argv.includes('--no-mcp') && argv.indexOf('--config-dir') === -1) {
    if (dry) {
      changes.push('mcp: would run `claude mcp add --scope user headroom ...`');
    } else {
      try {
        execFileSync('claude', ['mcp', 'add', '--scope', 'user', 'headroom', process.execPath, binPath, 'mcp'], { stdio: 'pipe' });
        changes.push('mcp: registered server "headroom" (user scope)');
      } catch {
        changes.push(`mcp: could not run the claude CLI — register manually:\n       claude mcp add --scope user headroom ${process.execPath} ${binPath} mcp`);
      }
    }
  }

  console.log(`${dry ? '[dry-run] ' : ''}headroom install → ${dir}`);
  for (const c of changes) console.log('  - ' + c);
  if (!dry) console.log('\nDone. Open a new Claude Code session; the HUD appears after the first response, the stamp on your next prompt.');
}

export function uninstall(argv = []) {
  const dir = configDir(argv);
  const settingsPath = join(dir, 'settings.json');
  const changes = [];

  if (existsSync(settingsPath)) {
    const settings = readSettings(settingsPath);

    if (settings.statusLine?.command?.includes(MARK)) {
      const bak = readSettings(settingsPath + '.headroom-bak');
      if (bak.statusLine && !bak.statusLine.command?.includes(MARK)) {
        settings.statusLine = bak.statusLine;
        changes.push('statusline: restored pre-headroom statusLine from backup');
      } else {
        delete settings.statusLine;
        changes.push('statusline: removed');
      }
    }

    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(
          (m) => !(m.hooks ?? []).some((h) => h.command?.includes(MARK))
        );
        if (settings.hooks[event].length !== before) changes.push(`hook ${event}: removed`);
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  const skillDest = join(dir, 'skills', 'headroom');
  if (existsSync(skillDest)) {
    rmSync(skillDest, { recursive: true });
    changes.push('skill: removed');
  }

  const claudeMdPath = join(dir, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const md = readFileSync(claudeMdPath, 'utf8');
    const i = md.indexOf(COMPACT_MARK_START);
    const j = md.indexOf(COMPACT_MARK_END);
    if (i >= 0 && j > i) {
      writeFileSync(claudeMdPath, (md.slice(0, i) + md.slice(j + COMPACT_MARK_END.length)).replace(/\n{3,}/g, '\n\n'));
      changes.push('CLAUDE.md: removed Compact Instructions block');
    }
  }

  if (argv.indexOf('--config-dir') === -1) {
    try {
      execFileSync('claude', ['mcp', 'remove', '--scope', 'user', 'headroom'], { stdio: 'pipe' });
      changes.push('mcp: unregistered');
    } catch {
      changes.push('mcp: not registered or claude CLI unavailable (run `claude mcp remove headroom` if needed)');
    }
  }

  console.log(`headroom uninstall ← ${dir}`);
  for (const c of changes.length ? changes : ['nothing to remove']) console.log('  - ' + c);
  console.log('\nLocal data in ~/.headroom was kept; delete it manually if you want a clean slate.');
}
