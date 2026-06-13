# Conductor — the harness coordination idea (assessment)

*2026-06-12 · strategy doc, not a commitment. Same discipline as PRO.md: name the real
pain, name the part the platform already owns, isolate the part that's genuinely ours,
gate it before building.*

## The idea (as proposed)

One MCP server / install layer that becomes the adaptor + framework for all the
hook/MCP/skill "harnesses" we keep building (headroom, sentai, project-specific agents…)
— bundling, switching, and supercharging them under a single entry point.

## The honest split: half of this is already Anthropic's, half is unowned

**The "bundle + install + switch" half — DO NOT build it.** Claude Code already ships a
**plugin system**: a plugin bundles slash commands, subagents, MCP servers, and hooks,
installed from marketplaces. That is precisely "one clean install layer, many modules."
Building a third-party bundler competes directly with the platform's own primitive — the
exact losing position PRO.md warns about. If anything, headroom should *become a
well-formed plugin* so it installs through the official path.

**The "runtime coordination" half — genuinely unowned, and it's ours.** Plugins install
side-by-side but they **do not cooperate**. Six installed harnesses each inject a skill,
each register hooks, each push context — and nothing decides *who gets to speak when the
agent's context and budget are scarce*. There is no conductor. That gap is real (we hit
it ourselves), it's not on Anthropic's roadmap (they own *packaging*, not *attention
arbitration*), and it sits exactly on top of the one signal headroom already owns: the
budget.

## Why this is headroom's evolution, not a new product

The coordinator's core question is *"given scarce context/attention right now, which
harness's injection is worth it?"* — that is a **budget-allocation** question, and
headroom is already the budget layer. Concretely, we've **already shipped the first 10%
by accident**: `headroom doctor` enumerates every hook on the machine and flags which
harnesses share events. That's the seed of an ecosystem-aware view. The progression:

1. **See** (shipped): `doctor` lists the installed harnesses and their event collisions.
2. **Report**: a harness inventory — what's installed, what each costs in context
   (skills/MCP instructions eat the window), what's redundant or conflicting.
3. **Arbitrate** (the actual product): budget-aware injection — when context is tight,
   suppress low-relevance harness chatter; when a window is HOT, quiet the noisy ones.
   headroom already gates its *own* output on bands; extending that to *peer* harnesses
   is the novel step. This needs a cooperation contract (a tiny shared protocol other
   harnesses opt into), which is the real design work.
4. **Switch** (the "loadout" idea): per-project profiles — "this repo activates headroom
   + test-runner + spec-drift, mutes the rest." Useful, but mostly a config/UX layer
   over the official plugin enable/disable; lowest novelty, do last.

## Does it make sense? Verdict.

**As a standalone "harness framework/marketplace": no** — that's the plugin system; you'd
fight the platform and lose. **As headroom growing into the budget-aware conductor of an
agent's harness ecosystem: yes, but later, and gated.** Two hard preconditions:

- **Adoption first.** A conductor with nothing to conduct is worthless; it needs headroom
  to have real users AND a few other harnesses worth coordinating. Premature: we've built
  ~3 harnesses — far too few to know the right abstraction. Building the framework now
  bakes in wrong assumptions.
- **A cooperation protocol others adopt.** Arbitration only works if peer harnesses
  expose "here's what I want to inject and why" so headroom can rank it. That's a spec
  (like RESOURCE-STATE), and specs only matter once people want to implement them.

## Validation gates (cheap, in order; honor the kills)

- **V1 — Felt pain, externally.** Do headroom's own users run multiple harnesses and feel
  the collision? Instrument: `doctor`'s "N other hooks share this event" line already
  surfaces it; ask in issues. **Kill:** if users run headroom alone, the conductor has no
  market — ship `doctor`'s inventory view and stop.
- **V2 — Inventory value (small).** Grow `doctor` into `headroom harnesses`: list each
  installed harness with its context cost. If *that alone* gets "oh, useful" → the
  arbitration thesis has legs. **Kill:** indifference → it's a nice diagnostic, not a
  product.
- **V3 — Cooperation protocol (spec, no framework).** Draft the opt-in "injection intent"
  contract; get ONE other harness (even a toy) to implement it and let headroom arbitrate
  between them in an eval. **Kill:** no measurable improvement in agent focus/behavior →
  arbitration is theory, not value.
- **V4 — Only then**: the loadout/profile UX, marketplace presence as a plugin.

## Names

The framing changes the name. For the *coordinator* (recommended direction):
- **Conductor** — leads the orchestra of harnesses; strongest fit for the arbitration role.
- **Maestro** — same metaphor, more branded.
- **Switchboard** — routes events/attention to the right module.

For the *per-project profile* angle (the "switcher" the proposal emphasized):
- **Loadout** — your activated set of harnesses per repo; developer-native term.
- **Rig** — extends the harness metaphor.

Recommendation: don't name a new product yet. The honest near-term artifact is
**`headroom harnesses`** (inventory) — and *if* V1–V3 pass, "Conductor" becomes
headroom's coordination mode, not a separate thing. One tool that knows your budget AND
arbitrates your harness ecosystem is a coherent story; a second standalone framework is
scope we haven't earned.
