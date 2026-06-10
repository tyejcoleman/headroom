# Security

## Posture

Headroom is local-only by design and enforced by automated gates: **zero dependencies**,
**no network access of any kind**, reads only official harness surfaces and your own
files, writes only under `~/.headroom/` and (via the installer, with backup) your Claude
Code settings. It never touches credentials or undocumented endpoints — see ADR-1 in
[`docs/DECISIONS.md`](docs/DECISIONS.md) and the tripwires in
[`scripts/check-invariants.mjs`](scripts/check-invariants.mjs).

What headroom handles is low-sensitivity but not nothing: usage percentages, reset times,
session cost, and (in PreCompact snapshots) git branch/file names. Nothing leaves your
machine. `tap --capture` records raw statusline payloads locally for debugging —
sanitize before sharing them in issues.

## Reporting

Please report suspected vulnerabilities privately via
[GitHub security advisories](https://github.com/tyejcoleman/headroom/security/advisories/new)
rather than public issues. Expect an acknowledgment within a few days.
