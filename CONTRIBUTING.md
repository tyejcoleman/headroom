# Contributing to Headroom

Thanks for helping build a resource-aware layer that works in *anyone's* setup.

## Read first

- [`CLAUDE.md`](CLAUDE.md) — working context and the hard rules.
- [`docs/ONE-PAGER.md`](docs/ONE-PAGER.md) — the design.
- [`docs/PLAN.md`](docs/PLAN.md) — phased tasks with acceptance criteria.
- [`docs/VALIDATION.md`](docs/VALIDATION.md) — what we're de-risking and the decision gates.

## Principles

- **Validation-first.** Don't build machinery ahead of the assumption that justifies it.
  Phase 0 waits on Spike S0; Phase 1 waits on S1. See the gates in `docs/VALIDATION.md`.
- **Acceptance criteria are the definition of done.** Every task in `PLAN.md` carries AC;
  a PR that doesn't meet its task's AC isn't finished. Check the box (`[ ]` → `[x]`) when it does.
- **Defensive by default.** Every external field can be absent, malformed, or buggy.
  Clamp, degrade, never crash the statusline. Add a fixture for each new failure mode.
- **The hard rules are absolute** (see `CLAUDE.md`): official extension points only; no
  OAuth reuse outside official clients; no undocumented endpoints; no harness spoofing; no
  headless burning of interactive quota. PRs that cross these lines will be declined.

## Dev setup

TypeScript monorepo, pnpm workspaces (`packages/{tap,mcp,hooks,skill,schema}`). Once
scaffolded: `pnpm install`, `pnpm build`, `pnpm test`, `pnpm eval`.

## Submitting

Small, focused PRs mapped to a `PLAN.md` task. Include tests (schema validation + the
relevant fixtures). By contributing you agree your contributions are licensed under
Apache-2.0.
