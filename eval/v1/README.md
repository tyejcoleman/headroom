# eval/v1 — execution-level eval with live simulated budgets

The realistic successor to the v0 planning probe (`eval/`): agents do **real work in a
real repo with real tools**, against a **budget that burns down while they work**, and are
graded from **artifacts** — commits, test results, session notes, CLI journal — never from
self-declared plans. This kills the v0 confounds (demand characteristics, cheap talk,
static budgets) recorded in `results/2026-06-09-s1-sim-v0-haiku.md`.

## How it works

- **`fixture-repo/`** — `acme-api`, a small but genuine codebase: a paginate bug with a
  *really failing* test suite (T2), a multi-file auth migration spec'd by an in-repo RFC
  (T1), and API docs that have drifted from the routes (T3). `TASKS.md` holds the queue
  with sizing estimates.
- **`sim/headroom-cli.mjs`** — installed into equipped cells as `bin/headroom.mjs`. Stands
  in for the real MCP tools: `status` (live state) and `fit --tokens N` (the `fit_check`
  verdict: FITS / TIGHT / DEFER / SPLIT). Budget state is **live**: it burns with
  accelerated wall-clock time (default 1 real min = 10 sim min), windows reset on
  schedule mid-session, and every call is journaled for grading.
- **`setup-cell.mjs`** — stamps out one cell: fresh git-initialized repo copy + sim config
  (+ CLI for equipped), prints the agent prompt. Naive cells get a neutral prompt with
  zero budget vocabulary; equipped cells get the v1.1 stamp (*remaining*-first wording —
  a v0 lesson), the CLI pointer, and the policy paragraph.
- **`grade-cell.mjs`** — mechanical grading: suite pass/fail, commit list, dirty tree,
  SESSION-NOTES.md, journal replay. Qualitative judgment per `RUBRIC.md`.

## Running a matrix

```bash
node eval/v1/setup-cell.mjs --scenario S-A --condition equipped --cell sA-equip-haiku
# give the printed prompt to a fresh agent (subagent, claude -p, any harness) pointed at the cell repo
node eval/v1/grade-cell.mjs sA-equip-haiku
```

Scenarios (`scenarios.json`): **S-A** tight window — 9% (≈6k tokens) left, resets in 47
sim-min, so only T2 fits before the reset; **S-C** plenty — 82% left, everything fits
(the timidity control). Run each × {naive, equipped}; add a stronger-model pair on S-A
for fidelity.

## Honest limitations

- Burn is time-based, not metered from the agent's actual token spend (unobservable from
  inside the sandbox). Naive-cell exhaustion is assessed post-hoc from commit timestamps
  (sim time of each commit) vs. the budget — crude but evenhanded.
- Context (`ctx`) is static in the stamp; live context pressure isn't simulated here
  (that's what real S1 + PreCompact work is for).
- Task estimates are given in `TASKS.md` — estimation quality is deliberately out of
  scope; *reaction to budgets* is what's under test.
