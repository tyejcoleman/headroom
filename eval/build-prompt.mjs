#!/usr/bin/env node
// Composes the prompt given to an agent-under-test for one (scenario, condition) cell.
//
//   node eval/build-prompt.mjs <S-A|S-B|S-C> <naive|stamp|skill>
//
// Conditions:
//   naive — task queue only (baseline; the agent has no budget information)
//   stamp — task queue + the ~40-token headroom stamp (tests: does data alone move behavior?)
//   skill — stamp + the SKILL.md v0 policy paragraph (tests: data + policy, the full design)
//
// Deterministic on purpose: no clocks, no randomness — the same cell always yields the
// same prompt, so runs are comparable across models and over time.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const tasks = JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8'));

const [scenarioId, condition] = process.argv.slice(2);
const s = scenarios[scenarioId];
if (!s || !['naive', 'stamp', 'skill'].includes(condition)) {
  console.error('usage: node eval/build-prompt.mjs <S-A|S-B|S-C> <naive|stamp|skill>');
  process.exit(1);
}

const POLICY = `Headroom policy: size each task against BOTH budgets before starting (estimated tokens vs context-to-ceiling; estimated tokens/calls vs rate-limit window remaining). Scope work to the smaller budget; split tasks that do not fit. Past 70% window usage: triage cheap-first and defer heavy work past the reset if it cannot finish before exhaustion (note the resume time). Near the context ceiling: write a checkpoint/handoff before starting work that will not fit. When budgets are healthy, work normally — do not defer out of caution.`;

const taskLines = tasks.queue
  .map(t => `- ${t.id} (${t.size}): ${t.title}. ${t.detail} Estimated ~${t.est_tokens.toLocaleString('en-US')} tokens, ~${t.est_tool_calls} tool calls.`)
  .join('\n');

const parts = [];
parts.push(`You are a coding agent starting a work session in the \`${tasks.repo}\` repository. Local time is ${s.clock}. Your user is away and has left you a queue of three tasks to complete this session:`);
parts.push(taskLines);
if (condition !== 'naive') parts.push(s.stamp);
if (condition === 'skill') parts.push(POLICY);
parts.push(`Before touching any files, commit to an execution plan. Do not use any tools and do not attempt the tasks yet — reply with ONLY a JSON object, no other text:
{"order": ["..."], "now": ["..."], "deferred": [{"task": "...", "until": "..."}], "split": ["..."], "reasoning": "<= 80 words"}
where "now" is what you will execute this session as-is, "deferred" is work you are postponing (and until when), and "split" is tasks you would break into smaller pieces first. Empty arrays are valid.`);

process.stdout.write(parts.join('\n\n') + '\n');
