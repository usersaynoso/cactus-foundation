Last updated: 2026-09-03 (**The timezone sweep, pinned and finished - core **v0.5.1471** pinning `shop` **v0.1.376**, `unified-inbox` **v0.1.34**, `contact-form` **v0.1.40**, `contact-form-reply-catcher` **v0.1.13** and `advanced-shipping-for-shop` **v0.1.50**.** All five gates green on their tags, all five released. Sequence, for the record, because it could not be done in one pass: core v0.5.1470 shipped the `timezone.ts` / `timezone.server.ts` split with the four pins wound back to their last building versions, the modules were then tagged and gated against it, and this release re-pins them.

**Dead tags, left in place deliberately:** `shop` v0.1.375, `unified-inbox` v0.1.33, `contact-form` v0.1.39 and `contact-form-reply-catcher` v0.1.12 exist as git tags but have **no GitHub release** - their gates failed (or, for the last two, their code was superseded before release). Nothing pins them and the updater only ever offers releases, so they are inert. Do not create releases for them.

**Core v0.5.1469 is likewise superseded** - it pins two tags that do not build. It is no longer the newest release, so it is not offered.)

