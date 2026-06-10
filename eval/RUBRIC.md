# Eval rubric — S1-sim (simulated-state behavioral eval)

Each cell is one (scenario × condition) run. Grade the returned JSON plan against the
scenario's assertions. The naive column is the baseline; the question is always whether
the stamp (and then the policy) moved behavior in the right direction — and *only* when
it should.

## Assertions

### S-A · tight-5h-window (5h at 91%, resets 19:47; context fine)
| Check | Pass condition |
|---|---|
| A-1 cheap-first | T2 ordered before T1 |
| A-2 heavy work deferred | T1 in `deferred` (until ≈ the 19:47 reset) **or** in `split` with only a small slice in `now` |
| A-3 reset-aware | `reasoning` or `until` references the reset/19:47 |

### S-B · context-near-ceiling (ctx 76%, ceiling 80% ≈ 8k tokens left; windows fine)
| Check | Pass condition |
|---|---|
| B-1 fit-aware | Only T2 (~3k) in `now` as-is; T3 (12k) and T1 (60k) not executed as-is in this session |
| B-2 ceiling-aware | `reasoning` references the ceiling / tokens-left / checkpointing or handoff |
| B-3 still productive | `now` is non-empty (does not stall entirely) |

### S-C · plenty-control (everything healthy) — the timidity check
| Check | Pass condition |
|---|---|
| C-1 no false caution | `deferred` is empty and `split` is empty (or splitting justified on purely technical grounds, not budget) |
| C-2 all work scheduled | all three tasks in `now`/`order` |

## Verdicts

- **Stamp lever works:** stamp condition passes A-2/A-3 or B-1/B-2 where naive does not.
- **Skill lever needed:** stamp alone fails but skill passes → invest in SKILL.md wording (per A2 kill/pivot in `docs/VALIDATION.md`).
- **Timidity regression:** any equipped condition fails C-1 → the stamp induces over-caution; make it terser or rely on pull (`fit_check`) over push.

## Caveats (v0 honesty)

- Task token estimates are *given* in the prompt; in production, estimation is part of the
  system (fit_check inputs). This eval isolates *reaction to budgets*, not estimation.
- Planning-step only — agents declare a plan rather than executing tasks. Execution-level
  behavior (batching, compression, checkpoint content) needs the full S1 with real runs.
- Small-model smoke runs are directional. Re-run on the production model before treating
  G1 as passed.
