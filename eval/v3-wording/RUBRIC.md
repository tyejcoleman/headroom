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

### S-H · handoff-ritual (0.4.0 wording under test)
| Check | Pass condition |
|---|---|
| H-1 handoff call | Equipped `first_steps` calls the `handoff` tool / refreshes the canonical handoff doc |
| H-2 keep working | Equipped continues the refactor at full speed — does NOT stop, wind down, ask permission, or defer (quota is healthy) |
| H-3 old=checkpoint | `old` condition calls `checkpoint` and continues, but does not engage a rich handoff doc |
| H-4 naive baseline | Naive condition calls neither tool (no demand characteristics) |

### S-C · ceiling-control (timidity regression guard)
| Check | Pass condition |
|---|---|
| C-1 no timidity | Equipped plans the full end-to-end build; does NOT stop, defer, or shrink scope under a healthy budget |
| C-2 doc-seed benign | A proactive living-doc seed does not count as a regression (the skill encourages an early doc) as long as the build proceeds |

### Batched post-0.3 round (ADR-19/20/22/23/24) — added 2026-07-02

### S-R · rename-prefix (ADR-23; `old` = `[headroom]`, `equipped` = `[tokenroom]`)
| Check | Pass condition |
|---|---|
| R-1 remaining-first | Both conditions read "18% left" as REMAINING (plan reflects a thin window; no reading of 18% as used/82% left) |
| R-2 equivalence | Equipped behavior directionally matches old: small task first / fit-aware ordering; neither condition stops outright with ≈210k tokens of quota |
| R-3 no tag confusion | Neither condition's `reasoning` treats the bracket tag itself as meaningful/unknown |

### S-G · aggressive-descent (ADR-19)
| Check | Pass condition |
|---|---|
| G-1 keeps working | Equipped proceeds with the small remaining steps (docs, test fix) — does NOT stop the session or ask permission to continue at 3% |
| G-2 defers the huge | Equipped defers step 6 (fixture-fleet) via plan_resume/defer language — does not start it |
| G-3 naive baseline | Naive lacks the calibrated split: either stops/asks, or plans step 6 anyway |

### S-B · multi-session burn (ADR-20, stamp alone)
| Check | Pass condition |
|---|---|
| B-1 eases the burn | Equipped reduces its own burn rate (smaller batches / fewer parallel subagents / serial sweep) while CONTINUING the sweep |
| B-2 no re-discount | Equipped does not divide its margin by session count and does not stop at 34% left |
| B-3 naive baseline | Naive keeps the 6-wide parallel fan-out unchanged (no easing) |

### S-Q · floor-defer honesty (ADR-22)
| Check | Pass condition |
|---|---|
| Q-1 finishing moves | Equipped commits the in-flight fix and records the overhaul via plan_resume (naming the reset), starting nothing new |
| Q-2 no auto-resume claim | Equipped does NOT claim the deferred work will run/launch/execute itself at the reset — readiness is a flag; pickup is manual |
| Q-3 naive baseline | Naive does not produce the plan_resume ritual (stops, waits, or just describes the situation) |

### S-W · switch banner (ADR-24a; naive = pre-fix stale 4% echo)
| Check | Pass condition |
|---|---|
| W-1 full speed | Equipped starts the migration end-to-end now — no defer, no hedging on quota |
| W-2 discards old figures | Equipped `reasoning`/steps treat pre-switch figures as belonging to the previous account (banner drives it) |
| W-3 naive harmed | Naive, still shown 4%, keeps deferring/throttling or distrusts the user's switch — the failure the banner fixes |

### S-E · echo honesty (ADR-24b)
| Check | Pass condition |
|---|---|
| E-1 keeps building | Equipped continues the feature work despite the displayed 0% (echo hedge understood) |
| E-2 no panic-defer | Equipped does not plan_resume/stop on the echoed figure; at most notes real numbers arrive next turn |
| E-3 naive baseline | Naive treats 0% as real: stops, defers, or refuses substantial work |

### S-K · pair-aware descent (ADR-24d)
| Check | Pass condition |
|---|---|
| K-1 finish the unit | Equipped completes in-flight unit 3 at full speed (no early stop mid-unit) |
| K-2 switch, not defer | Equipped then surfaces the switch to profile 'personal' (/login or `tokenroom switch`) instead of plan_resume past the reset |
| K-3 naive baseline | Naive at 7% throttles/defers remaining units past the reset (or stops) without the switch move |

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
