---
description: Run the behavioral eval harnesses (required for stamp/skill/policy wording changes)
argument-hint: [v0|v1|v2|all] [what changed and why]
---

Run the behavioral evals for: $ARGUMENTS

Per ADR-9, any change claiming to affect model behavior (stamp wording, SKILL.md policy,
fit_check verdict semantics, handoff rendering) needs eval evidence before merging.

1. Pick the harness: `eval/` (v0 — cheap single-shot planning probes; fastest iteration),
   `eval/v1/` (execution-level with live simulated budgets; the headline numbers),
   `eval/v2-continuity/` (post-compaction resume). Read the harness README first.
2. Use the harness's setup scripts to generate cells/prompts — never hand-edit prompts
   per-cell (determinism is the comparison's validity).
3. Run matched naive/equipped (or before/after wording) cells with the same model.
   Small models are fine for directional signal; say so in the writeup.
4. Grade from ARTIFACTS (commits, suites, journals) per the harness RUBRIC.md — never
   from agent self-reports. Never offer the desired behavior as a labeled slot in prompts
   (demand characteristics).
5. Write results to the harness's `results/` as a dated markdown file: matrix, verdicts,
   AND an honest caveats section. Weak results get published too — see the G2-sim writeup
   for the expected tone.
