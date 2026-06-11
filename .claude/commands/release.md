---
description: Cut a headroom release — preflight script, version, CHANGELOG, tag, publish, registry verification
---

Cut a release. Follow exactly; stop and report at any failed gate. Everything below is
agent-executable EXCEPT the one human ceremony in step 0.

0. **Token ceremony (HUMAN, once — and after any credential exposure):** CI publishes
   with the `NPM_TOKEN` repo secret, which must be a **granular access token** with
   **Read and write / All packages** AND **"Bypass two-factor authentication" ENABLED**.
   (Classic "Automation" tokens are retired — npm offers granular only now.) All-packages
   scope is required for FIRST publishes (an unpublished name can't be selected). Both
   failure signatures fire at the publish step only, after all gates pass:
   - `E403 You may not perform that action with these credentials` — wrong token type
     (field 2026-06-10, run 27315632200);
   - `E403 Two-factor authentication or granular access token with bypass 2fa enabled
     is required` — granular token created WITHOUT the bypass toggle (field 2026-06-11,
     run 27385109918). If the toggle is absent from the token form, the account's 2FA
     write-requirement setting is pinned to "always" — relax it to the granular-bypass
     option first. Granular tokens EXPIRE (~90d cap): calendar the renewal.
   After creating: `gh secret set NPM_TOKEN`, revoke the previous token. Fallback that
   needs no token changes: a human runs `npm publish --access public --otp=<code>`
   locally (loses provenance for that release). Agents must NEVER print, commit, or
   echo token values (gate G6); a failed publish is re-run with `gh run rerun <id>` —
   tags never move.
1. **Preflight:** `node scripts/release-preflight.mjs` — tree, tests, gates, dated
   CHANGELOG section, tag state, tarball scope, registry collision, secret presence.
   Fix every ✗ before proceeding. (CI runs it with `--offline`.)
2. **Version:** bump `version` in `package.json` only — single source of truth (ADR-10).
   Patch = fixes, minor = features, pre-1.0.
3. **CHANGELOG.md:** a DATED section `## X.Y.Z — YYYY-MM-DD` (release.yml extracts it;
   "Unreleased" headings block the GitHub release notes). Grouped Added/Fixed/Changed,
   written for users.
4. **Commit & tag:** `release: vX.Y.Z` commit → `git tag vX.Y.Z && git push && git push --tags`.
5. **The tag does the rest** — `.github/workflows/release.yml`: gates → tag==version
   check → `npm publish --provenance` → GitHub release from the CHANGELOG section.
   Watch: `gh run watch $(gh run list --workflow release --limit 1 --json databaseId -q '.[0].databaseId')`.
   **If it fails at the publish step with E403:** that is the token type (step 0) — fix
   the secret, then `gh run rerun <run-id>`. The tag is fine; never delete/move it.
6. **Registry verification (the release is not done until this passes):**
   - `npm view headroom-harness version` → the new version;
   - in a temp prefix: `npm install -g --prefix $(mktemp -d) headroom-harness` and run
     the installed `headroom` binary: `line` (degrades to "no data"), `tap` with a
     fixture payload (renders HUD), `doctor --config-dir $(mktemp -d)` (reports, exits 1
     on the empty sandbox — expected);
   - npm page shows the provenance badge ("built and signed on GitHub Actions").
7. **Announce** only per the launch plan (`launch/RUNBOOK.md`) — publishing is not
   promotion; do not post anywhere unless the user has explicitly green-lit the launch.
