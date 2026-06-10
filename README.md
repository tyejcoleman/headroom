# Headroom

[![CI](https://github.com/tyejcoleman/headroom/actions/workflows/ci.yml/badge.svg)](https://github.com/tyejcoleman/headroom/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

**Make your coding agent aware of its own budgets.** Headroom feeds Claude Code's two
scarcest resources — account **rate-limit headroom** (5h / 7d windows) and session
**context headroom** (tokens before compaction) — *to the agent itself*, so it plans work
that fits, defers what doesn't, survives compaction, and stops wasting capacity that
expires.

> **Status: 0.3.0, ship-ready.** Working end-to-end and dogfooded hard by its author
> (including surviving its own compactions and scheduling its own resumes); every
> behavioral claim eval-tested (below); macOS/Linux; Windows untested. npm package lands
> with the public launch — install from source today. [Report sharp edges](.github/ISSUE_TEMPLATE).

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
statusline tap  ──▶  ~/.headroom/state.json  ──▶  push   prompt stamps + MID-TURN updates (band
 (rate_limits +       + velocity engine                    crossings, cost receipts) + post-compaction
  context_window)       (learned tokens/%,                 re-injection (facts → checkpoint → pins)
                         flow, burn bands)         pull   MCP: resource_state · estimate_remaining ·
PreCompact hook ──▶  ground-truth snapshot                fit_check · plan_resume · checkpoint · pin_fact
 + transcript anchor      + verbatim extracts     policy  skill: scope-to-fit rules · governor modes ·
hooks (every event) ─▶  token-flow samples                 opt-in compact guard + launch gate
                         + audit log              human   statusline HUD · watch · line · audit · doctor
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
   `fits | tight | exceeds | defer`, `plan_resume` for deferred work, `checkpoint` (the
   agent's own pre-compaction survival note), and `pin_fact` (facts that must survive
   compaction verbatim).
4. **Skill** — the eval-tested planning policy (size-to-fit, cheap-first under pressure,
   checkpoint before the ceiling, never defer out of caution).
5. **Compaction hooks** — PreCompact snapshot + SessionStart re-injection (below).

Requires Claude Code ≥ 2.1.92 with a Pro/Max subscription for rate-limit data; on API-key
auth Headroom degrades gracefully to context-only awareness.

### Reading the HUD

`⛶ 60% left (≈310k) ↻22:30 · ctx 56% (560k) · $26.03`

| Segment | Appears | Meaning |
|---|---|---|
| `60% left (≈310k) ↻22:30` | always | your quota: remaining %, **learned** ≈tokens-left (after calibration), reset clock |
| `week 22% left` | only when the weekly window is the binding constraint (<30%) |
| `ctx 56% (560k)` | always | room before auto-compaction (`⚠compact soon` under 10%) |
| `⚠ empty ~18:40–19:55` | only when the burn band lands **before** the reset | confidence band, not a twitchy point; suppressed entirely while idle |
| `✓ deferred work ready` | only when actionable | a waiting plan is hidden (see `headroom resume`) |
| `$26.03` | when ≥ $0.01 | this session at API prices |

A segment's *appearance* is itself the signal — healthy sessions stay terse.

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

### Live everywhere else: `headroom line`

`headroom line` prints one compact line with **countdowns computed at call time** —
poll it every second and the display is genuinely live, anywhere:

```
5h 64% ↻3h 58m · 7d 84% · ctx 45% · $51.63
```

**tmux status bar** (live in the same window as Claude Code):

```tmux
set -g status-interval 1
set -g status-right '#(headroom line) '
set -g status-right-length 80
```

**macOS menu bar** via [SwiftBar](https://swiftbar.app)/xbar: copy
[`integrations/xbar/headroom.1s.sh`](integrations/xbar/headroom.1s.sh) into your plugin
folder — budgets in the menu bar, refreshed every second, with a detail dropdown.
Linux bars (waybar, polybar) work the same way: exec `headroom line` on an interval.

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
remembered. And the snapshot **anchors back to disk**: it carries the path to the full
pre-compaction transcript plus a sidecar of verbatim extracts (every user message, recent
failed commands), so the model *searches* instead of reconstructing from memory.

Three more layers ride the same loop:

- **`checkpoint`** — when a mid-turn update warns context is low, the *agent* saves its
  own survival note (task, decisions + why, ruled-out approaches, exact next steps);
  re-injected after compaction. Facts from hooks, judgment from models.
- **`pin_fact` / `headroom pin`** — constraints whose exact wording must never be
  paraphrased away ("no deploys before June 16") are re-injected verbatim after every
  compaction until unpinned or expired.
- **Silent-trim detection** — Claude Code's microcompaction clears old tool results with
  *no hook and no UI signal*; headroom's tap notices the context cliff and the next stamp
  discloses it once, with the transcript path as the recovery route.

Continuity eval results (including the honest nulls): [`eval/REPORT.md`](eval/REPORT.md).

## Defer now, resume when the window resets — or wake up and do it

When `fit_check` says work won't fit the current window, the model records a plan with
`plan_resume`. The moment the window resets, prompt stamps, new sessions, and the HUD
(`✓ deferred work ready`) announce it. Capacity that used to expire silently now has a
queue (`headroom resume` to inspect, `--clear` when picked up).

And with **armed resume** (`headroom resume --arm`), the deferred work runs *itself* at
the reset: a launchd one-shot fires the official `claude -p` headless mode with the plan
as its prompt, guard-railed (`--max-turns`, pinned cwd, output to a reviewable log),
self-disarming after one run. Strictly consent-first (ADR-16): you arm it per-plan — or
set `auto_arm: true` for the fully autonomous defer → wake → resume loop. Headroom never
schedules your quota by itself.

## The agent sees costs while it works — not just balances

- **Mid-turn updates:** stamps arrive with your prompts, but long autonomous turns used
  to burn blind. A PostToolUse hook now re-stamps the model the moment a budget crosses a
  worsening band (25/10/5% left), throttled, never chatty.
- **Cost receipts:** a tool call that visibly moves the budget gets a one-line receipt —
  `receipt: that Task cost ≈5% of the 5h window (+$3.30) — 55% left` — so agents learn
  unit economics instead of pricing by vibes.
- **Velocity engine:** hooks sample exact token flow from the transcript and calibrate it
  against the window's %-steps, *learning* your account's tokens-per-percent. That's how
  the HUD earns `≈tokens left`, exhaustion becomes a confidence band, and the warning
  disappears entirely while you're idle.
- **Governor modes:** `mode: performance | ondemand | powersave` shifts *when* headroom
  speaks (bands, receipt floors, throttle) — never what it says. Applies without restart.
- **Opt-in guards:** `compact_guard_min` blocks *auto*-compaction minutes before a reset
  (a post-reset `/clear` beats compacting into a dying window — never blocks your manual
  `/compact`); `launch_gate` denies expensive subagent/workflow launches when the window
  verdict is defer. Both fail open, always.

## Audit the loop: `headroom audit` · diagnose it: `headroom doctor`

`headroom audit` renders the awareness loop as a timeline — every stamp injected (and why
skipped), band crossings even when silent by design, every MCP consult with its verdict,
the compaction lifecycle — closing with steering-signal counts. You can *see* whether
your agent actually consulted its budgets.

`headroom doctor` answers "why isn't it working?" before you file an issue: wiring,
stale paths, data freshness, calibration state — and it flags *other* hooks sharing your
events, because Claude Code doesn't attribute hook errors per-hook and their failures
will look like headroom's.

## Does it actually change behavior? We tested it.

Before building the connector, we ran agents through [simulated-budget evals](eval/):
real repo, real tools, a live budget burning down behind a `fit_check` CLI, graded from
artifacts (commits, test suites, journals — never self-reports). Across haiku and sonnet:

- **Naive agents** plowed through ~33k estimated tokens of work the window couldn't
  cover — work that dies at exhaustion, including a mid-flight atomic migration.
- **Equipped agents** shipped exactly what fit, stopped on the DEFER verdict, and wrote
  reset-aware resume plans — while spending ~40% fewer tokens.
- On healthy budgets, equipped agents completed everything with no false caution.

The full comparison table — regenerated by `npm run eval`, which fails if any number's
evidence file is missing — lives in [`eval/REPORT.md`](eval/REPORT.md), honest nulls
included. Methodology rules in [ADR-9](docs/DECISIONS.md).

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

`ResourceState v0` is deliberately provider-neutral — an adapter for any harness (Codex
CLI next) can be written from [`docs/RESOURCE-STATE.md`](docs/RESOURCE-STATE.md) alone;
everything downstream (HUD, stamps, MCP, audit) works unchanged.

## Compliance posture

Headroom uses only surfaces vendors expose on purpose: statusline stdin JSON, hooks, MCP,
and your own local files. It **never** reuses subscription OAuth tokens outside official
clients, calls undocumented endpoints, spoofs harness identity, makes network requests,
or burns interactive quota headlessly — enforced by automated gates, not just policy.
See [`SECURITY.md`](SECURITY.md) and ADR-1.

## Project layout

```
bin/ src/        the CLI: tap · hook · mcp · install · watch · line · resume · pin · audit · doctor (zero-dep ESM)
skill/           the behavioral policy installed into Claude Code
schema/          ResourceState v0 JSON Schema
scripts/         invariant gates (the hard-gate layer)
test/            node:test suites + the payload fixture corpus
eval/            behavioral eval harnesses + published results (v0 · v1 · v2-continuity)
docs/            ONE-PAGER · PLAN · VALIDATION · ARCHITECTURE · DECISIONS
.claude/         repo agent harness: gates hook + procedure commands
```

## Teams & orgs

Running coding agents against shared seat quota or org API keys? A team/org layer
(fleet visibility, org budgets fed to every agent, policy push) is being explored —
see [docs/PRO.md](docs/PRO.md). If that's you, [open an issue](../../issues) tagged
`org` and describe your setup; design partners shape what gets built.

## License

[Apache-2.0](LICENSE).
