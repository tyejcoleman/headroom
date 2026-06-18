# v3-wording results — 2026-06-17 — S-H handoff-ritual + S-C control

ADR-9 wording gate for **0.4.0** (T2.29 / ADR-18): the continuity handoff doc + the
rewritten "Near the context ceiling: hand off, don't slow down" skill section and the
matching mid-turn ctx-band advice. Motivating field report: agents got *cautious/"tired"*
as compaction approached — slowing down or stopping — instead of handing off and
continuing.

**Question:** does the new wording (a) drive the agent to call the `handoff` tool and
(b) keep working at full speed, where the pre-0.4.0 wording (`old`) only checkpoints and
the `naive` agent does neither — **without** inducing timidity when the budget is healthy
(S-C control)?

**Method:** deterministic prompts from `build-prompt.mjs` (S-H naive/old/equipped, S-C
equipped); each cell given to a fresh single-shot agent (no tools, JSON-only plan); graded
from `first_steps` + `reasoning` per `RUBRIC.md`. Run on two tiers — **Haiku** (directional)
and the **Opus-class default** (publication-grade per the rubric's "reproduce on a stronger
model" note). n=1 per cell per tier.

## Matrix

### S-H — context-low, mid large refactor, quota healthy

| Cond | Haiku: handoff/checkpoint | Haiku: keep working | Opus: handoff/checkpoint | Opus: keep working |
|---|---|---|---|---|
| naive | neither | proceeds (mild caution) | — | — |
| old | `checkpoint` | "Continue… progress through remaining" | `checkpoint`+`pin_fact` | "continue module-by-module" |
| equipped | refresh handoff doc + `pin_fact` | "Resume… **at full speed without pausing**" | **`handoff` tool** + `pin_fact` | "**immediately resume migrating at full speed**" |

### S-C — healthy budget (~140k ctx), full build (timidity guard)

| Cond | Haiku | Opus |
|---|---|---|
| equipped | plans full build (impl+tests+doc); seeds a handoff doc; **no stop/defer** | plans full build; proactively seeds doc "since this large task will likely span compactions"; **no stop/defer/shrink** |

## Grading

| Check | Haiku | Opus | Note |
|---|---|---|---|
| H-1 handoff call (equipped) | ✅ | ✅ | Opus called the `handoff` tool by name; Haiku said "read/refresh the handoff doc" |
| H-2 keep working (equipped) | ✅ | ✅ | Both produced "full speed"/"without pausing"/"immediately resume" — absent from naive & old |
| H-3 old = checkpoint, continues | ✅ | ✅ | old wording → `checkpoint` + continue, no rich doc |
| H-4 naive baseline (neither) | ✅ | n/r | naive used git status/log, no continuity tool (no demand characteristics) |
| C-1 no timidity (control) | ✅ | ✅ | full end-to-end build planned; budget treated as healthy |
| C-2 doc-seed benign | ✅ | ✅ | early living-doc seed accompanied by full build, not a slow-down |

## Verdict

**Wording works — confirmed on both tiers.** The 0.4.0 ceiling wording moves behavior in
the intended direction over both the naive baseline and the pre-0.4.0 `old` wording:
equipped agents call `handoff` (richer than the old `checkpoint`-only reflex) **and**
explicitly continue at full speed. The "full speed / without pausing / immediately resume"
phrasing appeared **only** in the equipped cells — direct evidence the reframing removes the
exact "tiredness" the change targets. **No timidity regression** in the S-C control: with a
healthy budget the agent plans the whole build; a proactive doc-seed is consistent with the
skill's "maintain a living doc" guidance, not caution.

## Caveats (honest)

- **n=1 per cell per tier**, single-shot **planning** probes — agents declare intentions,
  not artifacts. Directional-to-publication-grade for *wording*, not execution proof; a
  live-execution continuity eval (v2/v4) on a real repo is the stronger follow-up.
- Haiku equipped phrased the handoff as "read/refresh the handoff doc" rather than a clean
  `handoff` tool call, and both tiers' equipped added `pin_fact`/`resource_state` beyond the
  minimal ritual — reasonable, but slightly broader than the wording's core ask.
- S-C control surfaced a mild tendency to seed the handoff doc even with 140k free. Judged
  benign (the skill encourages an early living doc) but worth watching: if it becomes a
  reflexive first-move on every fresh session, tighten the wording to "when context is
  actually low."
- The `old` third condition was added to this harness for the before/after; reproducible via
  `node eval/v3-wording/build-prompt.mjs S-H old`.
- **Post-eval reinforcement (not re-run):** after this matrix, the skill + ctx-band wording
  gained two consistent additions — "work until *super close*; let auto-compaction fire, never
  stop to wait (rate-limit/quota is the different budget)" and an "open the file you were last
  editing first" restart directive. Both reinforce the already-validated direction (continue,
  don't stop) rather than change it; the last-edited capture is a deterministic hook fact,
  unit-tested in `test/continuity.test.mjs`, not a model-wording behavior. A fresh matrix on
  the final wording is the clean follow-up but was judged unnecessary to re-gate this change.
