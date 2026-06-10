# Headroom

[![CI](https://github.com/tyejcoleman/headroom/actions/workflows/ci.yml/badge.svg)](https://github.com/tyejcoleman/headroom/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

**Make your coding agent aware of its own budgets.** Headroom feeds Claude Code's two
scarcest resources — account **rate-limit headroom** (5h / 7d windows) and session
**context headroom** (tokens before compaction) — *to the agent itself*, so it plans work
that fits, defers what doesn't, survives compaction, and stops wasting capacity that
expires.

> **Status: early (0.2.x).** Working end-to-end and dogfooded daily by its author;
> validated by behavioral evals (below); macOS/Linux; Windows untested. npm package
> coming — install from source today. Expect sharp edges; [report them](.github/ISSUE_TEMPLATE).

## The problem

Claude Code retries 429s silently and compacts context mid-task; the model plans as if
both budgets were infinite. Subscription windows are use-it-or-lose-it, and compaction
breaks task continuity. Every existing tool (ccusage, dashboards, menu-bar apps) is
**human-facing and retrospective** — nothing feeds either budget *to the agent*. Headroom
is **model-facing, real-time, planning-oriented**: the model plans differently because it
knows.

## How it works

```
collectors                state                      awareness connector → Claude Code
----------                -----                      ---------------------------------
statusline tap  ──▶  ~/.headroom/state.json  ──▶  push   UserPromptSubmit hook: tiny [headroom] stamp
 (rate_limits +       + burn model,                       SessionStart: post-compaction re-injection
  context_window)       projections               pull   MCP: resource_state · estimate_remaining ·
                                                          fit_check · plan_resume
PreCompact hook ──▶  ground-truth snapshot        policy  skill: scope-to-fit planning rules
                                                  human   statusline HUD · `headroom watch` live dashboard
```

Zero dependencies. No network, ever. Official extension points only (statusline, hooks,
MCP). Event-driven — no daemon, no polling. Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Install

```bash
git clone https://github.com/tyejcoleman/headroom && cd headroom
node bin/headroom.mjs install        # --dry-run to preview · uninstall to remove cleanly
```

One idempotent command wires up (and `uninstall` reverts, restoring any statusline you had):

1. **Statusline tap** — collects `rate_limits` + `context_window` from the payload Claude
   Code already pipes to statuslines; atomically maintains `~/.headroom/state.json`.
2. **Prompt stamp** — ~30 tokens of live budget context with each prompt:
   `[headroom] 5h: 58% left, resets 14:00 · 7d: 85% left · ctx: ~38k tokens before compaction`.
   Age-disclosed when stale; silent rather than wrong; `HEADROOM_DISABLE=1` to mute.
3. **MCP tools** — `resource_state`, `estimate_remaining`, `fit_check({est_tokens})` →
   `fits | tight | exceeds | defer`, and `plan_resume` for deferred work.
4. **Skill** — the eval-tested planning policy (size-to-fit, cheap-first under pressure,
   checkpoint before the ceiling, never defer out of caution).
5. **Compaction hooks** — PreCompact snapshot + SessionStart re-injection (below).

Requires Claude Code ≥ 2.1.92 with a Pro/Max subscription for rate-limit data; on API-key
auth Headroom degrades gracefully to context-only awareness.

### Reading the HUD

`⛶ 5h 60%→22:30 · 7d 92% · ctx 56%(560k) · $26.03`

| Segment | Meaning |
|---|---|
| `5h 60%→22:30` | 5-hour rate-limit window: 60% **remaining**, resets at 22:30 |
| `7d 92%` | 7-day window: 92% remaining |
| `ctx 56%(560k)` | context left before auto-compaction (`⚠compact` when low) |
| `$26.03` | this session at API prices (hidden when ~$0) |
| `⚠exh 22:10` | only when current burn would exhaust the window **before** its reset |
| `⏲ resume 22:30` / `✓ deferred ready` | deferred-work countdown / readiness |

Every percentage is **remaining**, never used. The statusline re-renders on session
activity (that's Claude Code's schedule), so it shows absolute clock times that never go
stale. For a truly **live** view, open a second pane:

```bash
headroom watch        # 1-second ticks: live countdowns, live data age, instant updates
```

```
HEADROOM · live · 22:52 · data 0s old

5h window   ███████████████████████░   95% left   resets 03:30 (in 4h 38m)
7d window   ██████████████████████░░   91% left   resets in 1d 6h
context     ██████████████░░░░░░░░░░   47% left   ≈470k tokens before compaction
burn        7.3%/h · no exhaustion risk before reset
```

## Your agent's work survives compaction

Compaction summarizes the conversation — and garbles exactly the facts an in-flight task
depends on. Headroom's **PreCompact** hook snapshots ground truth the instant before
compaction (branch, uncommitted files, recent commits, budget state), and the
**SessionStart** hook re-injects it right after:

```
[headroom] post-compaction ground truth (snapshot taken 20:41, just before compaction):
- branch: main
- uncommitted changes (2):  M src/auth/middleware.js,  M test/auth.test.js
- recent commits: e508784 baseline · 1f201d4 migrate token.js
Trust this snapshot for repository state: check the uncommitted files first…
```

Hard facts, not summaries — the model resumes from what *is*, not what the compactor
remembered. In our continuity eval, snapshot-equipped agents resumed a half-done
migration with ~19% fewer tool calls ([results](eval/v2-continuity/results/)).

## Defer now, resume when the window resets

When `fit_check` says work won't fit the current window, the model records a plan with
the `plan_resume` MCP tool. The HUD counts down (`⏲ resume 22:30`); the moment the window
resets, prompt stamps and new sessions announce `deferred work now ready: …`. Capacity
that used to expire silently now has a queue. Clear with `headroom resume --clear`.

## Does it actually change behavior? We tested it.

Before building the connector, we ran agents through [simulated-budget evals](eval/):
real repo, real tools, a live budget burning down behind a `fit_check` CLI, graded from
artifacts (commits, test suites, journals — never self-reports). Across haiku and sonnet:

- **Naive agents** plowed through ~33k estimated tokens of work the window couldn't
  cover — work that dies at exhaustion, including a mid-flight atomic migration.
- **Equipped agents** shipped exactly what fit, stopped on the DEFER verdict, and wrote
  reset-aware resume plans — while spending ~40% fewer tokens.
- On healthy budgets, equipped agents completed everything with no false caution.

Published results, including the honest weak spots: [`eval/v1/results/`](eval/v1/results/),
[`eval/v2-continuity/results/`](eval/v2-continuity/results/). Methodology rules in
[ADR-9](docs/DECISIONS.md).

## This repo is an agent harness

Headroom is built to be maintained **by coding agents, consistently** — the repo itself
carries the discipline:

- **Context:** [`CLAUDE.md`](CLAUDE.md)/[`AGENTS.md`](AGENTS.md) route any agent through
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (what talks to what) and
  [`docs/DECISIONS.md`](docs/DECISIONS.md) (every standing decision *with its why*).
- **Procedures:** repo slash-commands — `/release`, `/add-fixture`, `/run-evals` — encode
  the recurring jobs as runbooks.
- **Hard gates:** [`scripts/check-invariants.mjs`](scripts/check-invariants.mjs) runs
  after every agent edit (repo PostToolUse hook) and in CI: new dependency, network
  surface, compliance tripwire, or crash-prone entry point → blocked on the spot, with
  the ADR that explains why.

Point your agent at the repo and tell it what to change; the harness does the rest.
Details in [`CONTRIBUTING.md`](CONTRIBUTING.md). Most wanted: payload samples from other
plans/models/OSes (`headroom tap --capture` → [donate a fixture](.github/ISSUE_TEMPLATE)),
Windows testing, the Codex adapter.

## The spec

`ResourceState v0` ([`schema/`](schema/)) is deliberately provider-neutral — the contract
for adapters beyond Claude Code (Codex next; see [`docs/PLAN.md`](docs/PLAN.md) Phase 3).

## Compliance posture

Headroom uses only surfaces vendors expose on purpose: statusline stdin JSON, hooks, MCP,
and your own local files. It **never** reuses subscription OAuth tokens outside official
clients, calls undocumented endpoints, spoofs harness identity, makes network requests,
or burns interactive quota headlessly — enforced by automated gates, not just policy.
See [`SECURITY.md`](SECURITY.md) and ADR-1.

## Project layout

```
bin/ src/        the CLI: tap · hook · mcp · install · status · watch · resume (zero-dep ESM)
skill/           the behavioral policy installed into Claude Code
schema/          ResourceState v0 JSON Schema
scripts/         invariant gates (the hard-gate layer)
test/            node:test suites + the payload fixture corpus
eval/            behavioral eval harnesses + published results (v0 · v1 · v2-continuity)
docs/            ONE-PAGER · PLAN · VALIDATION · ARCHITECTURE · DECISIONS
.claude/         repo agent harness: gates hook + procedure commands
```

## License

[Apache-2.0](LICENSE).
