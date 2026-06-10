# Headroom — agent working context

Headroom is a **resource-aware layer for coding agents**. It makes the agent aware of
its two scarcest resources — account **rate-limit headroom** (5h / 7d windows) and
session **context headroom** (tokens before compaction) — so it can plan work to fit,
spend efficiently, and use capacity that would otherwise expire.

## Read this before any work

1. `docs/ONE-PAGER.md` — what we're building and why (architecture, data sources, schema).
2. `docs/PLAN.md` — the phased plan; every task has acceptance criteria (AC).
3. `docs/VALIDATION.md` — **start here in practice.** The project rests on two
   load-bearing assumptions that we de-risk *before* building the full system.

## Hard rules (compliance — non-negotiable)

These are the project's reason to exist responsibly. Any change that touches them is wrong:

- **Official extension points only:** statusline stdin JSON, hooks (`UserPromptSubmit`,
  `SessionStart`, `PreCompact`, `PreToolUse`), MCP, OTel, and the user's own
  `~/.claude` / `~/.codex` files.
- **Never** reuse a subscription OAuth token outside the official client, call
  undocumented endpoints (e.g. `api/oauth/usage`), spoof harness identity headers, read
  `.credentials.json` to make API calls, or burn interactive subscription quota headlessly.
- **Defensive parsing always:** every field we read may be absent, malformed, or buggy
  (e.g. epoch values leaking into `used_percentage`). Degrade gracefully, clamp to valid
  ranges, never crash the statusline.

If a task seems to require crossing one of these lines, stop and surface it — don't route around it.

## Execution process (for `/goal` and agents)

- **Validation gate:** Do not begin Phase 0 proper until Spike **S0** in `docs/VALIDATION.md`
  confirms the statusline payload actually carries `rate_limits` + `context_window` on a
  real account. If S0 fails, the plan changes — see the kill/pivot criteria there.
- **Pick the next task:** the lowest-numbered unchecked task in the current phase whose
  dependencies are met. Honor its AC literally — AC is the definition of done.
- **Check off** tasks in `docs/PLAN.md` (`[ ]` → `[x]`) as you complete them.
- **Test with each task.** Schema-validate tap output; unit-test defensive parsing against
  the fixture corpus (subscription / API-key / absent-field / epoch-leak).
- Keep the core open-source-clean: no secrets, no machine-specific paths in committed code,
  Apache-2.0 headers where appropriate.

## Stack

Single **zero-dependency** npm package (`headroom-cc`): plain ESM under `bin/` + `src/`,
`node:test` suites, skill in `skill/`, JSON Schema in `schema/`. No build step — this is
deliberate (auditability + npx-ability); don't add dependencies without strong cause.
State lives at `~/.headroom/state.json` (atomic temp-file + rename writes only).

## Current status

**P0 + P1 are built and tested** (tap, schema+fixtures, hook stamp, MCP server, skill,
installer; CI on node 18/20/22). A2 (the behavioral bet) is **directionally validated**
via the simulated evals in `eval/` and `eval/v1/` (see their `results/`). Adopted lessons:
stamps lead with *remaining* + absolute tokens; eval prompts never offer deferral slots.
**A1 confirmed on a live Max account (2026-06-09)**: real `rate_limits` (both windows)
and `context_window` (1M-token window — size varies by model, never hardcode) flowed
through the shipped tap on first render. All validation gates green, including G2
(continuity, sim — see `eval/v2-continuity/results/`). **v0.2.0 ships Phase 2's core:**
compaction survival (PreCompact ground-truth snapshot → SessionStart re-injection) and
the reset scheduler (`plan_resume` MCP tool, HUD countdown, readiness flags). Remaining
targets: npm publish, launch post, larger-fixture continuity eval, T2.1 burn priors,
T2.4 governor modes, T2.5 reproducible eval runner.
