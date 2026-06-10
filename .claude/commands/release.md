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
5. **Wait for CI** on the release commit; abort (revert tag) if red.
6. **npm publish** (human step — requires `npm login`): `npm publish --access public`.
   Then verify from a clean dir: `npm view headroom-cc version`.
7. **GitHub release:** `gh release create vX.Y.Z --notes` with the CHANGELOG section.
8. **Post-publish smoke:** in a temp dir, `npm i -g headroom-cc` then `headroom install --dry-run`
   shows sane paths (NOT an npx cache path — the installer must refuse those).
