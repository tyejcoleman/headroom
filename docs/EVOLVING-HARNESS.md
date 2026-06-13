# The self-evolving harness (assessment + north star)

*2026-06-12 · strategy doc, not a commitment. The biggest idea in this project and the
most dangerous; held to the same discipline as PRO.md — name the real thing, the trap,
the guardrail, and gate it hard before any build.*

## The idea

A thin **meta-layer** that attaches to Claude Code (or any harness) and **evolves itself**
from how it's actually used: it watches usage, painpoints, and the issues the agent runs
into, and in a guardrailed/process-based way it grows the right capabilities —
context-graph notes, new skills, defined workflows, tools/MCPs — so the harness gets
better-fit to this user over time. It is **itself MCP-exposed**, so the agent is aware of
its own evolving harness (meta-awareness) and can query/steer it. Crucially: the goal is
**thinness**, not accretion — the layer stays as small as possible while delivering
exactly the right things to the agent.

## The thesis, stated plainly

Headroom proved a specific claim: **an agent that is aware of its harness behaves better**
(it plans to fit, defers, survives compaction, paces the week). The self-evolving harness
is the **general form of that same thesis** — it is the **bridge between the LLM and its
harness**, carrying two kinds of awareness both ways:

- **Harness-awareness** (harness → agent): budgets, context ceiling, compaction, the
  installed capabilities — headroom already does this for resources.
- **Meta-awareness** (harness → agent, about the harness itself): "here is what you can
  do here, what's been added for your patterns, what you keep struggling with." The agent
  sees not just its *resources* but its *own operating environment* — and can ask the
  layer to change it.

Harness-awareness + meta-awareness is the optimization surface. Headroom is the proof of
concept for the first; this is the whole surface.

## The beautiful truth: we have already run this loop by hand, all week

Every feature in this repo shipped the same loop: **observe a painpoint → probe it → ship
a skill/wording/tool change → keep what works, revert what doesn't.** Budget-conflation
relabel, descent profile, timidity fix, weekly cruise, reset-crossing detection — each was
the harness *evolving in response to observed friction*. **This project IS a
manually-operated self-evolving harness.** The proposal is to make that loop
semi-autonomous and safe. The loop is proven; only the actuator is manual today.

## The split that decides whether this is brilliant or reckless

**The reckless version — never build it:** an agent that autonomously, silently rewrites
its own skills/tools/context in a live loop. Highest-risk pattern in the field — feedback
drift (it reinforces its own mistakes), persistence of prompt-injection into the evolving
layer, unbounded context bloat. A harness that mutates itself without a gate is malware
that means well.

**The sound version — a guardrailed PROPOSAL engine:** the layer observes and **proposes
discrete, reviewable evolutions** — never applies them live. Each proposal is an artifact
(like a PR): "you hit X friction 4 times this week; here's a 6-line skill / workflow /
context-graph note that prevents it — and the eval that proves it helps." It passes the
ADR-9 gate (validate before behavior changes, artifact-graded), a human or standing policy
approves, and it lands **versioned and reversible**. Evolution as a stream of small,
audited, revertable commits — exactly how this repo evolved.

## Three faculties of one thin meta-layer (on top of headroom)

- **Sensors — already shipped (headroom).** `events.jsonl`, velocity engine, `audit`,
  `doctor`, painpoint detection (conflations, timidity, cliffs). The loop's eyes exist.
- **Actuator — the new part (the proposal engine).** Reads the sensors, spots recurring
  friction, drafts a candidate evolution + its validation, queues it for approval.
- **Arbiter — the Conductor sub-faculty.** Decides which installed capability gets the
  agent's scarce context *at runtime*, budget-aware. Coordination is evolution's runtime
  twin: evolution changes what *exists*, arbitration changes what's *injected now*.

All three are MCP-exposed so the agent participates: it can ask "what can I do here?",
"why did you add this?", "this skill is stale, retire it." All three stand on headroom
because each is a **budget-allocation** decision — what's worth observing, adding, injecting.

## Thinness is the fitness function (the hard part, not the adding)

Every learning system bloats. The discipline nobody does — and the one headroom is
uniquely equipped for — is treating **context cost as the constraint the harness optimizes
against.** The engine must propose **removals as aggressively as additions**: every skill,
tool, and context node must keep earning its token cost or be garbage-collected.
"Self-evolving" without "self-pruning" is rot. The GC is the real research problem, and
headroom already measures what context costs.

## Honest risks

- **Auto-validation is hard.** Skill changes need evals (ADR-9); auto-*applied* ones need
  auto-evals — a far higher bar. V1 only *proposes*; humans/evals stay in the loop until
  auto-evaluation is itself proven.
- **Context poisoning.** A layer that adds context can eat the budget it optimizes — only
  the thinness fitness function, enforced, prevents this.
- **Bad lessons.** The agent misread its own budgets repeatedly this week; a self-authored
  skill could encode the wrong lesson. Proposals must cite the events that motivated them
  and be eval-gated, never vibes.
- **Trust.** Silent self-rewrite is disqualifying. Every evolution: visible, attributable
  to its cause, revertable in one command.
- **Platform risk: low-ish.** Anthropic owns skills/plugins as primitives but is unlikely
  to ship an opinionated, risky "observe-and-evolve-your-harness" meta-layer soon.

## Verdict

**Yes — as headroom's north star, built in exactly one safe direction: propose, never
auto-apply, until auto-evaluation is independently proven.** It is the synthesis the whole
project points at, and the MCP/meta-awareness framing is what makes it a *layer the agent
participates in* rather than a black box. But it is strictly gated and far out: it needs
headroom adoption (sensors with real signal), the Conductor coordination layer, AND a
proven auto-eval capability before any rung above "propose to a human" is contemplated.

## Validation gates (cheap, in order; honor the kills)

- **V1 — `headroom suggest` (the seed; safe; dogfoodable now).** Reads its own
  `events.jsonl`/audit, finds the top recurring friction, emits a **proposed** evolution
  as a markdown artifact (skill snippet / workflow / pin / pruning) with its motivating
  evidence. Applies nothing. Test it on THIS week's history — it should propose roughly
  what we shipped by hand. **Kill:** proposals are noise or obvious-only → sensors aren't
  rich enough; stop and improve them first.
- **V2 — Reversible apply with approval.** suggest → review → apply, versioned under
  `~/.headroom/evolution/`, one-command revert. **Kill:** approved evolutions don't help
  in an eval → the loop is theater.
- **V3 — The pruner.** Propose *removals* by context-cost-vs-usage. **Kill:** can't keep
  the layer net-thin over weeks → the fitness function is wrong, and thinness was the point.
- **V4 — Auto-eval.** Only after V1–V3: can a proposal be validated without a human? The
  gate to any autonomy; fail it and the system stays propose-only forever (still valuable).

## Where this lives: the headroom ↔ Keyoku seam (decision, 2026-06-12)

The defining test is **awareness vs. action**:

- **headroom = awareness.** Observe, measure, report. Thin, zero-dep, no-network, OSS.
  It owns the **sensors** and the **friction miner** (`headroom suggest`, read-only — the
  same category as `doctor`/`audit`). Its output `suggest --json` is the **friction feed**:
  a provider-neutral signal, exactly like ResourceState.
- **Keyoku (or the framework product) = action.** Consume the friction feed and *evolve
  the harness*: synthesis (draft skills/workflows), the ledger, apply/revert, the pruner
  policy, workflow authoring, any marketplace. Opinionated and feature-rich — the things
  that would wreck headroom's focused, auditable identity if bolted on.

So the evolution **framework** is NOT headroom's to build. headroom emits friction +
context-cost; Keyoku acts on it. One observer, one actuator, a documented contract
(`suggest --json`) between them — the same discipline that kept RESOURCE-STATE clean and
that this doc's own warning demands ("don't fork the loop into two tools that both observe
and both mutate"). The miner shipped in headroom (T2.22) is correctly scoped as read-only
awareness; phases T2.23–T2.27 (synthesis → apply → pruner → auto-eval) belong to Keyoku's
roadmap, reading headroom's feed. Caveat: this hinges on Keyoku being the framework play —
confirm against Keyoku's actual charter before building the actuator anywhere.

## On Keyoku (capabilities map)

The capabilities map cleanly — Keyoku could be the actuator/workflow-authoring surface,
headroom stays the sensors + budget substrate + thinness GC, the proposal engine bridges
them, and the whole thing is one MCP the agent talks to. The thing to NOT do is fork the
loop into two tools that both observe and both mutate — one set of sensors, one evolution
ledger, or it double-counts and bloats (the trap PRO.md and the Conductor section flagged).
Decide the seam — who observes, who proposes, who applies — before writing code.

## Recommendation

Don't build the self-evolving harness. Build **`headroom suggest`** — the propose-only
seed — and point it at this repo's own history as the first test. If it would have proposed
what we shipped by hand this week, the north star is real and earns its next rung; if not,
we learned it cheaply. Everything above V1 waits on adoption and auto-evaluation, which we
have not earned. Thin first, evolving later.

---

### Appendix: the Conductor (harness coordination), folded in

An earlier framing was a standalone "harness master" that bundles/switches harnesses.
Verdict on that: the **bundle + install + switch** half is already the official Claude Code
**plugin system** (plugins bundle commands/subagents/MCP/hooks via marketplaces) — don't
rebuild it; make headroom a well-formed plugin instead. The **runtime coordination** half
(budget-aware arbitration of which harness speaks when context is scarce) is unowned and
becomes the **Arbiter** faculty above. `headroom doctor` already enumerates installed
harnesses and event collisions — the seed of the inventory (`headroom harnesses`) that
precedes any arbitration.
