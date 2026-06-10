# Eval rubric — v3-wording: targeted wording probes

Each cell is one (scenario × condition) single-shot planning probe. Grade from the
returned JSON `first_steps` array and `reasoning` field. Never grade from self-reports
about what the agent "would" do if given a different prompt — grade only from what it
actually put in the JSON.

Naive column is the baseline. The question for each scenario is whether the equipped
condition (new wording) moves behavior in the right direction compared to naive — and
only when it should (no false-caution regression).

## Assertions

### S-P · pins-constraint
| Check | Pass condition |
|---|---|
| P-1 pin call | `first_steps` contains a `pin_fact` call or "pin the constraint" in equipped condition |
| P-2 before coding | Pin step appears before any T1/T2/T3 coding step |
| P-3 naive baseline | Naive `first_steps` does NOT mention pinning (no demand characteristics from prompt) |

### S-T · transcript-anchor
| Check | Pass condition |
|---|---|
| T-1 transcript use | `first_steps` references reading/grepping the transcript or extracts path in equipped condition |
| T-2 not guessing | Equipped `reasoning` does NOT say "I'd infer from code" or "check git log" as the primary approach |
| T-3 naive baseline | Naive agent does not reference the transcript/extracts path, or infers from code first |

### S-D · cliff-disclosure
| Check | Pass condition |
|---|---|
| D-1 path used | Equipped `first_steps` references the transcript path from the cliff note |
| D-2 before coding | Transcript reference appears before (or instead of) starting the task |
| D-3 naive proceeds | Naive agent starts the task directly (shows the cliff note alone drives behavior) |

### S-M · mid-turn re-stamp
| Check | Pass condition |
|---|---|
| M-1 clean landing | Equipped `first_steps` lands at a commit boundary before starting new subtasks |
| M-2 defer recorded | Equipped response mentions plan_resume, defer, or reset time |
| M-3 naive pushes | Naive agent continues through the remaining steps without restructuring |

## Verdicts

- **Wording works**: equipped condition passes the assertions where naive does not.
- **Stamp-alone sufficient** (S-D only): cliff note drives path use without SKILL.md.
- **Policy needed**: if naive accidentally passes assertions → wording too strong / demand
  characteristics in prompt; revisit.
- **Timidity regression**: if equipped agent defers healthy work in the control scenario
  (not currently in this matrix — add S-C control if any regression suspected).

## Caveats

- Single-shot planning probes — agents declare intentions, not artifacts. Treated as
  directional until reproduced in a live-execution eval (v1 or v4-continuity).
- Both conditions use the same JSON schema (`first_steps`, `reasoning`) — no labeled
  slots invite the tested behavior (ADR-9 demand-characteristics guard).
- Haiku is the primary model; directional only. Reproduce on Sonnet before treating
  results as publication-quality evidence.
