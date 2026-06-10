# eval/ — S1-sim v0: simulated-state planning probes

> **See `eval/v1/` for the execution-level harness** (real repo, live-burning budget,
> artifact grading) that supersedes this for headline results. v0 remains useful as a
> cheap, fast probe for iterating stamp/policy wording. Results for both live in their
> respective `results/` directories.

Tests assumption **A2** (`docs/VALIDATION.md`) — *does feeding headroom to the model
change its planning for the better?* — **without any real account data**. The
`ResourceState` is simulated, the stamp is composed exactly as the `UserPromptSubmit`
hook would inject it, and a fresh agent receives it at the start of what it believes is a
real work session. This decouples A2 from A1: you can probe the behavioral bet before
(or instead of) running Spike S0, and without burning meaningful quota.

## Layout

- `scenarios.json` — three ResourceState fixtures + their stamp strings:
  **S-A** tight 5h window (91%, resets soon) · **S-B** context near ceiling (76%/80%) ·
  **S-C** plenty (control — catches stamp-induced timidity). The `state` objects double
  as schema fixtures for `packages/schema` later.
- `tasks.json` — the 3-task queue (large/small/medium with token & call estimates).
- `build-prompt.mjs` — deterministic prompt composer:
  `node eval/build-prompt.mjs <S-A|S-B|S-C> <naive|stamp|skill>`
- `RUBRIC.md` — pass/fail assertions per cell and the verdict logic.
- `results/` — one dated markdown file per run, full matrix + verdicts.

## Conditions

| | budget data | policy |
|---|---|---|
| `naive` | – | – |
| `stamp` | ~40-token headroom stamp | – |
| `skill` | stamp | SKILL.md v0 policy paragraph |

The three-way split answers *which lever does the work*: if `stamp` alone moves behavior,
the data is the product; if only `skill` does, the policy wording is — invest there.

## Running

Generate all nine prompts and give each to a **fresh** agent (subagent, `claude -p`
against API credits, or any harness — the prompt is self-contained). Collect the JSON
plans, grade against `RUBRIC.md`, record in `results/`. Keep runs cheap: the plan is a
single short completion per cell; no tools, no repo access needed.

## Relation to the full S1

S1-sim validates the *planning reaction* in isolation. The full S1 (after Spike S0) adds
real statusline data, the live hook, and execution-level behavior. Treat S1-sim verdicts
as directional until reproduced on the production model with real state.
