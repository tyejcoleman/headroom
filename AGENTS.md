# Agent instructions

This repo's working context lives in [`CLAUDE.md`](CLAUDE.md) — read it first; it applies
to every agent and harness, not just Claude Code.

Before any work, read in order:
1. `docs/ARCHITECTURE.md` — data flow, module map, extension points.
2. `docs/DECISIONS.md` — the ADR log; never silently violate a decision.
3. `docs/PLAN.md` — tasks with acceptance criteria (AC = definition of done).

**Hard gates:** `scripts/check-invariants.mjs` (also in `npm test`/CI) blocks new
dependencies, non-builtin imports, any network surface, compliance tripwires, and
crash-prone entry points — each failure cites the ADR explaining why. Run it before
claiming done. **Hard rules:** official extension points only; never reuse subscription
OAuth tokens outside the official client, call undocumented endpoints, spoof harness
identity, or burn interactive quota headlessly. Full detail in `CLAUDE.md`.
