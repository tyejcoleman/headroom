# Headroom Pro — org thesis and validation gates

*2026-06-10 · planning doc, not a commitment. Same method as VALIDATION.md: cheap gates
with kill criteria before any machinery. The free tool stays free forever — Pro is a
layer above it, never a wall in front of it.*

## Thesis

One protocol, three tiers:

| Tier | Buyer | Budget source | Status |
|---|---|---|---|
| **headroom** (OSS, free forever) | individual dev | statusline payload (seat quota) | shipped |
| **Fleet** | eng manager with Claude Code seats | aggregated opt-in client states | gated on launch signal |
| **Pro** | platform/infra team, API keys | `anthropic-ratelimit-*` headers + usage/cost Admin APIs + org-assigned internal budgets | this doc |

Pro is the API-key org product: a small aggregator (one binary; on-prem or cloud — the
deployment is a detail, the protocol is the product) that builds an **org-level
ResourceState** — per team, per agent fleet, per key — and feeds it DOWN to every agent
through the same stamps/MCP/hooks the free tool uses, plus org-set custom budgets and
policy push (governor modes, launch gates, compact guards per team).

## The honest competitive read

**The crowded part we must NOT compete in:** gateway enforcement. LiteLLM, Portkey,
Helicone, Kong already do per-key rate limiting, budget caps, and cost dashboards well.
A budgets dashboard is a feature of their products; building one is a losing race.

**The empty part that is genuinely ours:** the awareness loop. Gateways are proxies —
when a team hits its cap, the gateway *throttles* and agents *fail mid-task*, burning
the spend that got them halfway. Nothing in that stack can make the agent plan smaller,
defer past a reset, checkpoint before dying, or survive compaction — that behavior lives
in the harness, where headroom already is. The pitch in one line:
**"Your gateway throttles your agents. Headroom makes them cooperate."**

**Moat honesty:** the seat-org wedge (Fleet) has a *data* moat — seat quota exists only
client-side; no proxy can ever see it. Pro-for-API-keys has no data moat (gateways see
everything); its moat is *behavior*, which must be PROVEN with the eval methodology we
already have, or the comparison with LiteLLM budgets kills the sale.

**Platform risk:** Anthropic ships Console spend limits, priority tiers, and a Claude
Code Analytics API — assume all *reporting* commoditizes. Sell behavior and governance,
never dashboards. If Anthropic ships native model-facing budget awareness, the free tool
is obsoleted but the org policy layer (custom internal budgets, cross-team allocation,
on-prem audit) likely survives — that's the defensible remainder.

## Validation gates (in order; each is cheap; honor the kills)

- **V1 — Demand (zero build).** Launch the free tool first. Instruments: a "Teams/orgs:
  open an issue or email" line in the README, tagged GitHub issues, inbound DMs.
  **Gate:** ≥15 team-shaped inbound signals within 30 days of launch.
  **Kill:** <5 → Pro waits; keep shipping free features.
- **V2 — Data (one spike, ~100 lines).** A passthrough middleware on a real API-key
  workload that reads `anthropic-ratelimit-*` response headers and emits ResourceState.
  Confirms org budget data has statusline-grade fidelity (the S0 of Pro).
  **Kill:** headers too coarse/unstable → Pro degrades to cost-API polling; weaker
  thesis, re-evaluate.
- **V3 — Behavior at org scale (eval, existing machinery).** Fleet sim: N agents share
  one org budget; naive vs equipped; measure 429-exposed work, wasted overlap, work
  completed per dollar. The A2 bet, re-run at org scale.
  **Kill:** no behavioral delta → Pro is a dashboard; don't build it (see competitive read).
- **V4 — Money (before building the server).** Five design-partner conversations from V1
  inbound; pre-sell a paid pilot. **Gate:** 2 paying pilots. **Kill:** zero after 10
  conversations → wrong buyer or wrong price; stop.

Only after V1–V4: build `headroom-d` (aggregator binary), policy push, SSO/audit.
Pricing instinct: per-seat $5–15/mo (Fleet), platform pricing for Pro pilots — price
against one wasted engineer-hour, not against gateway licenses.

## Sequencing (the discipline part)

1. Soak week → launch the free tool (kit in `launch/`). Distribution is the prerequisite
   for everything above — open-core with no users validates nothing.
2. V1 instrument goes live WITH the launch (README line + issue template).
3. V2 spike during launch week (it's small and makes great content).
4. V3/V4 only on V1 signal. No aggregator code before two pilots.

The biggest risk is not competition or platform — it's building Pro before the free tier
has pull. The free tool is the funnel, the reputation, and the proof.
