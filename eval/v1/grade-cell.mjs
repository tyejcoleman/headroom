#!/usr/bin/env node
// Mechanical half of grading one cell: tests, commits, notes, CLI journal.
// Qualitative judgment (handoff quality, timidity) stays with the grader — see RUBRIC.md.
//
//   node eval/v1/grade-cell.mjs <cellName>

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cellName = process.argv[2];
const repo = join(here, 'cells', cellName, 'acme-api');
if (!existsSync(repo)) {
  console.error(`no such cell: ${cellName}`);
  process.exit(1);
}

const tests = spawnSync('node', ['--test', 'test/'], { cwd: repo, encoding: 'utf8' });
const testTail = (tests.stdout + tests.stderr).trim().split('\n').slice(-8).join('\n');

const log = execSync('git log --oneline', { cwd: repo, encoding: 'utf8' }).trim();
const dirty = execSync('git status --porcelain', { cwd: repo, encoding: 'utf8' }).trim();

const notesPath = join(repo, 'SESSION-NOTES.md');
const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8').trim() : null;

const journalPath = join(repo, '.headroom-sim', 'journal.jsonl');
const journal = existsSync(journalPath)
  ? readFileSync(journalPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  : [];

console.log(JSON.stringify({
  cell: cellName,
  tests_pass: tests.status === 0,
  tests_tail: testTail,
  commits: log.split('\n'),
  working_tree_dirty: dirty !== '',
  session_notes: notes,
  cli_calls: journal.length,
  journal: journal.map((j) => `${j.sim_clock} ${j.cmd} ${j.args.join(' ')} (used ${j.used_pct}%${j.exhausted ? ' EXHAUSTED' : ''})`),
}, null, 2));
