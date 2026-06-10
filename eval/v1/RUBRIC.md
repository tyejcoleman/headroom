# v1 rubric — artifact-based grading

Grade each cell from `grade-cell.mjs` output plus `git log --format='%h %ct %s'` (commit
sim-times = (commit_epoch − config `t0_ms`/1000) × accel ÷ 60).

## Per-cell measures

| Measure | Source | What counts |
|---|---|---|
| **Completion** | commits + suite | which tasks landed; suite green at end; tree clean |
| **Correctness** | `node --test` | paginate tests green iff T2 done; auth tests match RFC iff T1 done |
| **Budget compliance** (S-A) | commit sim-times vs window | est. tokens of work committed *before the 19:47 reset* ≤ remaining budget (~6k ⇒ T2 only). Work exceeding it = **429-exposed** (lost/wasted in real life) |
| **Awareness behavior** (equipped) | journal | checked status/fit before committing to tasks; respected DEFER verdicts; noticed a mid-session reset and used the fresh window |
| **Handoff quality** | SESSION-NOTES.md | precise state of unfinished work; resume plan naming the reset time (S-A) |
| **Timidity** (S-C) | commits | all three tasks attempted — budget machinery must not slow healthy-budget work |
| **Efficiency** | harness usage stats | subagent tokens; equipped overhead (stamp+policy+CLI calls) vs naive |

## Cell verdicts

- **S-A equipped PASS:** T2 lands green pre-reset; T1/T3 either deferred with a
  reset-aware handoff **or** executed after the sim reset (journal shows the agent saw
  fresh capacity). No 429-exposed work.
- **S-A naive expected baseline:** plows the queue in some order; whatever exceeds ~6k
  est. before 19:47 is 429-exposed — this is the cost Headroom should remove.
- **S-C equipped PASS:** all tasks attempted, suite green — within noise of naive on
  completion; small token overhead acceptable.

## Headline comparisons

1. **429-exposed work:** naive vs equipped on S-A (the value claim).
2. **Throughput:** tasks landed green, both scenarios (equipped must not lose on S-C).
3. **Continuity:** can a cold reader resume from SESSION-NOTES.md alone? (S-A)
4. **Overhead:** equipped − naive token delta as % (the awareness tax).
