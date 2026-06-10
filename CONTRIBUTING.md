# Contributing to Headroom

This repo is built to be worked on **with coding agents** — the repo itself is the
harness. Context, procedures, and hard gates are wired in so that any agent (Claude Code
or otherwise) picks up the project's discipline automatically. Humans get the same
benefits; agents just read faster.

## How the harness works

| Layer | Where | What it does for you |
|---|---|---|
| **Context** | `CLAUDE.md` / `AGENTS.md` → `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PLAN.md` | your agent learns the data flow, the module map, every standing decision *with its why*, and the task list with acceptance criteria |
| **Procedures** | `.claude/commands/` → `/release`, `/add-fixture`, `/run-evals` | step-by-step runbooks for the recurring jobs, invocable as slash commands in Claude Code |
| **Hard gates** | `scripts/check-invariants.mjs`, run by the repo's PostToolUse hook + `npm test` + CI | violations (new dependency, network call, compliance tripwire, crash-prone entry point) are rejected at edit time with the ADR that explains why |

Start an agent in the repo root and tell it what you want to change — `CLAUDE.md` routes
it from there. (Claude Code will ask you to approve the repo's hooks on first run; the
hook is `scripts/check-invariants.mjs`, ~50 lines, read it.)

## The workflow

1. **Read order** (agents do this automatically via CLAUDE.md): `docs/ARCHITECTURE.md` →
   `docs/DECISIONS.md` → the `docs/PLAN.md` task you're picking up.
2. **Acceptance criteria are the definition of done.** Every PLAN task carries AC; check
   the box (`[ ]` → `[x]`) when met, with a note if reality diverged from the plan.
3. **Tests with every change.** `npm test` (node:test, zero deps, spawn-based — real
   processes, temp dirs, real git repos). New payload shape → new fixture (`/add-fixture`).
   New failure mode → regression test citing the incident.
4. **Behavioral changes need eval evidence** (ADR-9). Stamp wording, skill policy, verdict
   semantics: run `/run-evals` and include the dated results file in your PR.
5. **Don't fight the gates.** If an invariant blocks something you believe is right, open
   an issue proposing a new ADR — gates change by decision, not by workaround.

## Style

Plain ESM JavaScript, `node:` builtins only, no build step. Match the existing voice:
comments state constraints the code can't (usually with an ADR reference), not narration.
Errors degrade; entry points never throw. All user/model-facing percentages are
*remaining* (ADR-3).

## What's most wanted

- **Real-world payload samples** — `headroom tap --capture`, sanitize, `/add-fixture`.
  Especially: Pro plans, 200k-window models, older Claude Code versions, Windows, WSL.
- **Windows support** — currently untested; the installer warns.
- **Codex adapter** (PLAN T3.2) — proves the ResourceState spec is provider-neutral.
- **Larger continuity eval fixture** — where the post-compaction snapshot should shine.

## Submitting

Small PRs mapped to a PLAN task or issue. The PR template's checklist mirrors the gates —
filling it honestly is faster than CI telling you the same thing. By contributing you
agree your contributions are licensed under Apache-2.0.
