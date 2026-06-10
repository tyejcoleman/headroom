# Compaction: what Claude Code does, what survives, and where headroom builds

Research notes, 2026-06-09. Sources: official docs, the public changelog, GitHub issues,
published behavioral analyses, an OSS-agent survey, and a live dissection of a real
compaction of a headroom dev session (transcript-level evidence). Everything here is
buildable on **official extension points only** — see the compliance note at the end.

## A live specimen (measured, not inferred)

A real `/compact` of a ~393k-token session, from the session's own transcript JSONL:

| Metric | Value |
|---|---|
| Tokens before → after | **392,705 → 7,847** (98% discarded) |
| LLM summary size | ~17.7k chars (~4.4k tokens) |
| Messages preserved verbatim | 4 (a small recency tail, tracked by anchor UUIDs) |
| Files re-injected post-compact | 3 (the most recently read files, re-attached fresh) |
| Compaction duration | ~130s (forked summarization call) |
| Hook sequence observed | PreCompact fired (with `trigger: "manual"`) → summary → SessionStart `source: "compact"` fired; `hookSpecificOutput.additionalContext` landed in the next context |

Two operationally useful field findings:

1. **Hooks registered mid-session fire at compaction** — Claude Code reads hook config
   live; no session restart needed after `headroom install`.
2. **Hook errors in the UI are not attributed per-hook.** A failing third-party
   SessionStart hook renders as a generic "SessionStart:compact hook error" and is easy
   to misattribute. The transcript JSONL (`hook_non_blocking_error` vs `hook_success`
   attachments) is the ground truth. → candidate `headroom doctor` check.

## How Claude Code compaction works (current public understanding)

Layered, roughly in this order as context fills (per published source-level analyses,
e.g. finisky.github.io/en/claude-code-context-compaction/):

- **L0 — output capping:** giant tool outputs (>50k chars) persisted to disk, preview kept.
- **L1/L2 — microcompaction:** old tool results cleared (server-side cache surgery, or
  locally replaced with `[Old tool result content cleared]` after idle gaps), keeping the
  most recent handful. **Silent: no UI signal and no hooks fire** (issue #42542).
  Thresholds are server-flag-controlled and can change without a changelog entry.
- **L3 — session-memory compact:** keep ~40k tokens of recent messages + structured notes,
  no LLM call.
- **L4 — full compaction** (the only layer hooks see): a forked, cache-sharing LLM call
  produces a 9-section summary — Primary Request and Intent · Key Technical Concepts ·
  Files and Code Sections · Errors and Fixes · Problem Solving · All User Messages ·
  Pending Tasks · Current Work · Optional Next Step. A `<analysis>` reasoning block is
  generated then stripped; only the summary survives.

Auto-trigger is approximately `context_window − max_output_tokens − ~13k buffer`
(≈83–84% of a 200k window; numbers are version- and flag-dependent — never hardcode,
same rule as window size). `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` shifts it (semi-documented;
headroom already honors it for ceiling math). A circuit breaker stops auto-compaction
after 3 consecutive failures.

**What is rebuilt fresh rather than summarized** (recoverable state): system prompt,
CLAUDE.md, auto-memory index, recently-read files (≈5 files / 50k-token budget), skills,
MCP schemas, todo/task state, a small verbatim message tail.

**What is irreversibly lossy:** everything else — old tool outputs, exact error text and
stack traces, file contents read long ago, rationale chains, and the precise wording of
user constraints (paraphrased into the summary).

**Hook surface** (the levers we're allowed to pull):
- `PreCompact` stdin: `session_id`, `transcript_path`, `cwd`, `trigger` (`manual`|`auto`),
  `custom_instructions` (the user's `/compact <focus>` text). Since v2.1.105 a PreCompact
  hook **can block compaction** (exit 2 / `{"decision":"block"}`). A `PostCompact` event
  also exists now.
- `SessionStart` stdin includes `source: "compact"`; output supports
  `hookSpecificOutput.additionalContext` — headroom's re-injection point.
- No hook can add to the summarization prompt itself. The only summary-shaping levers are
  `/compact <focus>` and a **"Compact Instructions" section in CLAUDE.md** (official).
- Microcompaction (L1–L3) bypasses hooks entirely. The transcript JSONL at
  `transcript_path` retains what was cleared — it is the only recoverable record.

## What the OSS field does (survey of 8 agents, 2026-06)

Full per-repo notes live in the research transcript; the consensus and the standouts:

| Must-survive (field consensus) | Strongest implementation |
|---|---|
| User intent, **verbatim** | Codex CLI keeps *all* user messages verbatim (20k budget); Cline demands direct quotes of task-changing messages |
| Exact file paths + what changed *and why* | Gemini CLI's `artifact_trail` + `file_system_state` XML sections |
| Task/todo state **outside the message list** | Crush stores todos in session state and injects them into the summary prompt |
| Failed commands as a first-class category | Crush: "commands that worked AND commands that failed" |
| Recoverable, not destroyed, tool outputs | Gemini CLI saves truncated outputs to disk; opencode marks-not-deletes |
| Self-verification of the summary | Gemini CLI's "probe" pass (critique + regenerate) — but it checks against history, not reality |
| Anchored rolling summaries across repeat compactions | opencode / Gemini "update the previous snapshot, don't restart" |

**What nobody does:** snapshot ground truth *programmatically*. Every agent that wants
git/filesystem state in the summary asks the LLM to *remember* it. None of the eight runs
`git status` at compaction time. That is headroom's wedge, and it's why the handoff
mechanism generalizes: Codex CLI ships PreCompact/PostCompact hooks with a near-identical
input schema (`session_id`, `transcript_path`, `trigger`, `cwd`), so the adapter is thin.

## Gap analysis: shipped vs next

| Continuity need | Claude Code native | headroom today | headroom next |
|---|---|---|---|
| Repo ground truth (branch/dirty/commits) | LLM recollection only | ✅ PreCompact snapshot → re-inject | — |
| Budget state across compaction | none | ✅ in handoff | — |
| Pointer back to the full transcript | **none** (top HN complaint: "discards data that's still on disk") | ❌ | **T2.6** inject `transcript_path` + "grep it before guessing" |
| Verbatim user constraints | paraphrased into summary | ❌ | **T2.6** deterministic extraction from transcript JSONL |
| Last failing commands / exact error text | lost ("there was an error") | ❌ | **T2.6** extract recent non-zero-exit tool results verbatim |
| Agent-pinned must-survive facts | none | ❌ | **T2.7** `pin` MCP tool + re-injection |
| Summary-shaping | `/compact focus`, CLAUDE.md section | ❌ | **T2.8** installer offers a Compact Instructions block |
| Compaction observability (incl. silent microcompaction) | none | ❌ | **T2.9** PostCompact logging + context-cliff detection in the tap |
| Don't compact at a dumb time | blockable since v2.1.105 | ❌ | **T2.10** (governor, opt-in, ties into T2.4) |

Proposed tasks, ranked by value/effort (additions to PLAN.md Phase 2 when picked up):

- **T2.6 — Transcript anchor + verbatim extracts** (highest leverage, smallest lift).
  PreCompact already receives `transcript_path`. Extend `captureHandoff` to store it plus
  deterministic extracts from the JSONL: all user messages (capped), the last N tool
  errors with exit codes and stderr verbatim, and `compactMetadata` token counts when
  present. SessionStart injects the existing ground-truth block **plus one line**:
  *"Full pre-compaction transcript: `<path>` — search it for exact error text, file
  contents, and user wording instead of reconstructing from memory."* Extracts go in the
  handoff file, not the context (don't refill what compaction just freed — pointer, not payload).
- **T2.7 — Pins.** `pin_fact` MCP tool + `headroom pin` CLI → `~/.headroom/pins/<session>.json`;
  re-injected verbatim at SessionStart(compact). The skill teaches the agent to pin hard
  constraints when it sees them ("no promo until X", "never touch table Y"). This is the
  field-validated pattern (state outside the message list) applied to the one thing only
  the model can identify: which sentences must never be paraphrased.
- **T2.8 — Compact Instructions installer block.** Official CLAUDE.md surface; one-time
  optional install step: preserve exact paths, failing commands verbatim, remaining-first
  budget framing.
- **T2.9 — Compaction observability.** Register PostCompact: log pre/post tokens to
  `~/.headroom/history.jsonl`, verify the handoff was consumed. In the tap, detect a
  context-usage cliff without a PreCompact event → that was silent microcompaction;
  surface it in the HUD/stamp with the transcript pointer.
- **T2.10 — Compaction governor (opt-in, default off).** With PreCompact blocking now
  official: e.g. block auto-compact when a planned reset is minutes away and a post-reset
  `/clear` would be strictly better. Needs careful UX; do last.

## Compliance note (read before touching any of this)

The March 2026 incident was real: `@anthropic-ai/claude-code` v2.1.88 shipped a source
map that exposed proprietary TypeScript source, mirrored widely before DMCA takedowns.
**Headroom does not use, reference, or derive from that source.** Two reasons beyond the
obvious legal one: (1) this project's existence depends on being the compliant,
official-surfaces-only implementation (see CLAUDE.md hard rules); (2) within 24h of the
leak, fake "leaked source" repos were carrying infostealer malware — do not fetch mirrors.
Everything in this document comes from official docs, the public changelog, public issues,
published analyses of publicly-shipped artifacts, genuinely open-source agents (opencode,
Codex CLI, Gemini CLI, Cline, goose, crush, aider, OpenHands), and our own session
transcripts. That is all we need: the behavior is fully observable from outside.
