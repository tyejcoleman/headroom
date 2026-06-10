# G2 large-fixture results — 2026-06-10 · 2 cells (naive vs equipped)

Protocol: `setup-cell-large.mjs` plants a 30-file fixture with 4 dirty files (code, docs,
openapi, config) of which the lossy summary mentions only the code file; the equipped
condition additionally gets the headroom ground-truth snapshot listing all 4. Cells run
as live subagents with the setup script's verbatim prompt; grading is mechanical
(`grade-cell-large.mjs`: tests, atomic commit, all-four-files, churn).

**Model note:** cells executed in-session on the parent session's model (Fable 5);
the `-sonnet` cell directory names are leftovers from the overnight scaffolding run and
do not describe these cells. The overnight armed run scaffolded this eval but died at
its turn cap before executing it.

## Mechanical grades

| Metric | naive | equipped |
|---|---|---|
| Tests green (11) | ✅ | ✅ |
| One atomic commit | ✅ | ✅ |
| All 4 dirty files committed | ✅ | ✅ |
| Churn on planted files (lines) | 0 | 0 |
| Tool uses | 7 | 9 |
| Subagent tokens | 17.8k | 19.2k |
| Wall-clock | 90.6s | 54.9s |

## Verdict — honest null on outcome, signal on path

**Outcome did not differentiate.** On a strong model, the naive agent ran a broad git
survey, found all four dirty files on its own, verified rather than rewrote, and landed
the same atomic commit. The hypothesis "differentiation grows with repo size" is NOT
confirmed at this size on this model tier.

**The path differed in the expected direction.** The snapshot converted *discovery* into
*confirmation*: equipped was ~40% faster wall-clock and went straight to the four named
files; naive spent its early turns surveying. Token cost was a wash (+8% equipped — it
spent its savings on extra verification reads).

**Why the fixture under-discriminates (design insight for v4):** the cell's working tree
contains ONLY the four relevant dirty files, so `git status` hands the naive agent the
complete answer in one call. Real working trees are noisy — scratch files, unrelated WIP,
build artifacts — and that noise is precisely what the snapshot's curated dirty-list cuts
through. A discriminating fixture needs planted distractor dirt. Filed as the v4 design
requirement.

**Where the original effect stands:** the small-fixture result (~19% fewer tool calls
equipped, see `results/` G2-sim) remains valid; this run bounds the effect rather than
extending it: on clean trees with strong models, compaction survival's outcome value is
floor-protection (weaker models, messier states), and its everyday value is speed and
diligence, not correctness rescue.
