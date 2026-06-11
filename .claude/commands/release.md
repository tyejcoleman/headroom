---
description: Cut a headroom release — gates, version, CHANGELOG, tag, publish checklist
---

Cut a release. Follow exactly; stop and report at any failed gate.

1. **Preflight gates:** working tree clean; latest `main` CI green (`gh run list --limit 1`);
   `npm test` green locally; `node scripts/check-invariants.mjs` OK.
2. **Version:** bump `version` in `package.json` only — it is the single source of truth
   (ADR-10); nothing else hardcodes it. Patch = fixes, minor = features, pre-1.0.
3. **CHANGELOG.md:** add a section for the new version, grouped Added/Fixed/Changed, one
   line each, written for users not committers.
4. **Commit & tag:** `release: vX.Y.Z` commit, then `git tag vX.Y.Z && git push && git push --tags`.
5. **The tag does the rest** — `.github/workflows/release.yml` re-runs the gates, verifies
   tag == package.json version, publishes to npm with provenance (NPM_TOKEN repo secret),
   and cuts a GitHub release from the matching CHANGELOG section. Watch it:
   `gh run watch $(gh run list --workflow release --limit 1 --json databaseId -q '.[0].databaseId')`.
6. **Post-publish smoke:** `npm view headroom-harness version` shows the new version; in a temp
   dir, `npm i -g headroom-harness && headroom install --dry-run` shows sane paths (NOT an npx
   cache path — the installer must refuse those).
