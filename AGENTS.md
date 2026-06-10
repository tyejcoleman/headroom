# Agent instructions

This repo's working context lives in [`CLAUDE.md`](CLAUDE.md) — read it first; it applies
to every agent and harness, not just Claude Code.

Before any work, read in order:
1. `docs/ONE-PAGER.md`
2. `docs/PLAN.md`
3. `docs/VALIDATION.md` — and respect the validation gate (don't build Phase 0 until
   Spike S0 confirms the statusline data exists).

**Hard rules (non-negotiable):** official extension points only; never reuse subscription
OAuth tokens outside the official client, call undocumented endpoints, spoof harness
identity, or burn interactive quota headlessly; parse defensively and never crash the
statusline. Full detail in `CLAUDE.md`.
