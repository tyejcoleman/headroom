# Security

## Posture

Tokenroom is local-only by design and enforced by automated gates: **zero dependencies**,
**no network access of any kind**, reads only official harness surfaces and your own
files, writes only under `~/.tokenroom/` and (via the installer, with backup) your Claude
Code settings. It never touches credentials or undocumented endpoints — see ADR-1 in
[`docs/DECISIONS.md`](docs/DECISIONS.md) and the tripwires in
[`scripts/check-invariants.mjs`](scripts/check-invariants.mjs).

What tokenroom handles is low-sensitivity but not nothing: usage percentages, reset times,
session cost, and (in PreCompact snapshots) git branch/file names. Nothing leaves your
machine. `tap --capture` records raw statusline payloads locally for debugging —
sanitize before sharing them in issues.

Since the 2026-07-01 hardening commit, everything tokenroom writes is owner-only:
directories are `0700` and state files `0600` (snapshots and extracts can contain
verbatim user messages, so the whole state tree is treated as private).

## Reporting

Please report suspected vulnerabilities privately via
[GitHub security advisories](https://github.com/tyejcoleman/tokenroom/security/advisories/new)
rather than public issues. Expect an acknowledgment within a few days.
