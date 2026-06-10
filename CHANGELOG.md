# Changelog

## 0.3.0 — Unreleased

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

### Changed
- **HUD redesigned around "only what changes your next decision"** (field feedback):
  `5h 10% left ↻03:30` (explicit "left", ↻ for reset); healthy 7d window hidden (shown
  only under 30% left); context shows tokens (`ctx 580k`), the actionable unit; burn
  warning rephrased `⚠ empty by ~00:34` — a clock time that can no longer be misread as
  a duration; deferred-work segment compressed to `⏲ queued` → `✓ deferred work ready`
  (the duplicate reset clock is gone).

### Notes
- New skill/stamp wording (pins section, transcript-anchor guidance, cliff disclosure)
  is pending the ADR-9 eval pass before npm publish.

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
