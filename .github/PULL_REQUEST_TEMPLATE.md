## What & why

<!-- One paragraph. Link the docs/PLAN.md task or issue this maps to. -->

## Gates (mirror of what CI enforces — filling honestly is faster)

- [ ] `npm test` green (includes the invariant gates)
- [ ] No new dependencies; imports are `node:` builtins or relative (ADR-2)
- [ ] No network surfaces, no compliance tripwires (ADR-1)
- [ ] New payload shape or failure mode → fixture + test (`/add-fixture`)
- [ ] Behavioral change (stamp/skill/verdict wording) → eval evidence attached (ADR-9, `/run-evals`)
- [ ] Standing decisions respected, or a new ADR proposed in `docs/DECISIONS.md`
- [ ] `docs/PLAN.md` checkbox / CHANGELOG updated where applicable

## Evidence

<!-- Test output, eval results file, before/after behavior — whatever proves it works. -->
