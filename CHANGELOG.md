# Changelog

## 0.3.0 — 2026-06-10

### Added
- **Transcript anchor (T2.6, ADR-11):** the post-compaction injection now points at the
  full pre-compaction transcript JSONL plus a sidecar of deterministic verbatim extracts
  (every user message, recent failed tool calls) — search, don't reconstruct. `/compact
  <focus>` custom instructions are captured and echoed back after compaction.
- **Pins (T2.7, ADR-12):** `pin_fact` MCP tool and `headroom pin|pins|unpin` — facts
  re-injected word-for-word after every compaction until unpinned or expired (7d default).
- **Compact Instructions (T2.8):** the installer appends a marked, removable block to
  `~/.claude/CLAUDE.md` shaping what compaction preserves (exact paths, failing commands
  with error text, user wording verbatim, remaining-first budgets).
- **Compaction observability (T2.9):** PostCompact hook + `~/.headroom/events.jsonl`;
  silent context cliffs (microcompaction fires no hooks) are detected by the tap and
  disclosed once in the next stamp, with the transcript path as the recovery route.
- **Compact guard (T2.10, ADR-13, opt-in):** `compact_guard_min` blocks auto-compaction
  when the 5h reset is ≤N minutes away; never blocks manual `/compact`; fail-open.
- `docs/COMPACTION.md`: compaction research — algorithm layers, OSS survey, gap analysis.
- **Audit log (`headroom audit [--since N]`):** the awareness loop as a timeline — every
  stamp injected (or why skipped), band changes even when silent by design, every MCP
  consult with its verdict (fit_check/plan_resume/pin_fact), compaction lifecycle —
  closing with steering-signal counts. Shows what the agent was told and what it
  consulted; behavioral change measurement stays the eval's job.
- **Mid-turn re-stamps (T2.11, ADR-14):** PostToolUse hook injects a budget update when
  a window/context band worsens mid-turn (25/10/5% left), throttled to one per 2 minutes
  — long autonomous turns no longer burn blind.

- **Governor modes (T2.4):** `mode: performance | ondemand | powersave` in config —
  shifts band thresholds, receipt floors, and the re-stamp throttle (when headroom
  speaks, never what it says). Applies without restart.
- **Velocity engine (T2.1):** hooks sample exact token flow from the transcript usage
  records (incremental cursor, cheap); the tap cross-calibrates flow against %-steps to
  LEARN tokens-per-percent. Unlocks: `≈230k` tokens-left on the quota (HUD + stamp,
  always ≈), exhaustion as a confidence band (`⚠ empty ~00:40–01:30`) instead of a
  twitchy point, and idle suppression — no burn in 10 min clears the warning.
- **Cost receipts (T2.13):** a single tool call that visibly moves the budget gets a
  one-line receipt (`receipt: that Task cost ≈5% of the 5h window (+$3.30) — 55% left`)
  — per-action unit economics; floors (≥2 points or ≥$1) keep receipts rare.
- **Launch gate (T2.14, opt-in `launch_gate`):** PreToolUse denies expensive
  Task/Agent/Workflow launches when the window verdict is defer, with an actionable
  reason; cheap tools never gated; fail-open on any error.
- **Model-authored checkpoint (T2.12, ADR-15):** the `checkpoint` MCP tool — the agent
  saves its own survival note (task, state, decisions+why, ruled-out approaches, exact
  next steps, key values) when a ctx update warns the ceiling is near; re-injected after
  compaction AFTER the fact snapshot. Facts from hooks, judgment from models.
- **Armed resume (T2.15, ADR-16):** `headroom resume --arm` schedules the deferred plan
  at the reset via launchd + official `claude -p` headless mode — guard-railed
  (max-turns, pinned cwd, reviewable log), self-disarming after one run, `--disarm`
  anytime. `auto_arm` config flag = standing consent: every plan_resume self-schedules
  (truly autonomous defer→wake→resume loop). Headroom never arms without consent.

### Changed
- **HUD redesigned around "only what changes your next decision"** (field feedback):
  `5h 10% left ↻03:30` (explicit "left", ↻ for reset); healthy 7d window hidden (shown
  only under 30% left); context shows tokens (`ctx 580k`), the actionable unit; burn
  warning rephrased `⚠ empty by ~00:34` — a clock time that can no longer be misread as
  a duration; deferred-work segment compressed to `⏲ queued` → `✓ deferred work ready`
  (the duplicate reset clock is gone).
- HUD v3 (same session, second field pass): primary quota unlabeled (`58% left ↻03:30`
  — leading position + reset clock say what it is); weekly shown as `week N% left` only
  when binding; ctx shows both views `ctx 57% (570k)`; a WAITING deferred plan is hidden
  entirely (not actionable — `headroom resume` shows it), only `✓ deferred work ready`
  surfaces. Quota tokens-left deliberately absent: the payload has no token denominator
  — estimation lands with T2.1 burn priors rather than fake precision.

- `headroom audit` (awareness-loop timeline) and `headroom doctor` (install diagnosis,
  incl. flagging other hooks sharing events — errors aren't attributed per-hook).
- T2.5 reproducible eval report: `npm run eval` regenerates `eval/REPORT.md` and fails
  if any number's evidence file is missing.
- `docs/RESOURCE-STATE.md`: the provider-neutral adapter contract (T3.3).

### Notes
- ADR-9 eval gate for the new skill/stamp wording: **PASSED 2026-06-10**
  (`eval/v3-wording/results/`); confounds documented in the results.
- npm publish is deliberately held to land with the public launch.

## 0.2.0 — 2026-06-09

### Added
- **Compaction survival:** PreCompact hook snapshots ground truth (branch, uncommitted
  files, recent commits, budgets); SessionStart re-injects it after compaction, with
  wrong-session and staleness guards.
- **Reset scheduler:** `plan_resume` MCP tool records deferred work; HUD countdown
  (`⏲ resume 22:30` → `✓ deferred ready`); stamps and session starts flag readiness;
  `headroom resume [--clear]`.
- Stamp and `resource_state` disclose data age (`(5m old)` past 2 minutes, `age_seconds`).
- G2-sim continuity eval harness and published results (`eval/v2-continuity/`).

### Changed
- Installer registers all three hooks; uninstall generalized across every hook event.
- MCP server version read from package.json (single version source).

## 0.1.1 — 2026-06-09

### Fixed
- Burn-rate hallucination from poisoned/interleaved samples — estimator is now
  median-of-buckets over a ≥10-minute baseline (field-reported: "183.2%/h").
- Raw `%/h` removed from HUD/stamp; burn surfaces only as a pre-reset exhaustion warning.
- Multi-session correctness: stamps omit another session's context/cost; `$0.00` hidden.

## 0.1.0 — 2026-06-09

Initial release: statusline tap → ResourceState v0 (`~/.headroom/state.json`) + HUD;
UserPromptSubmit budget stamp; stdio MCP server (`resource_state`, `estimate_remaining`,
`fit_check`); headroom skill; idempotent installer/uninstaller; fixture-corpus defensive
parsing; zero dependencies.
