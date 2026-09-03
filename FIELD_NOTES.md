Last updated: 2026-09-03 (**A layout type added to an EXISTING module now seeds its layout - core **v0.5.1474**, `filters-for-shop` **0.1.47**.** Root cause of the supplier-pages complaint two entries down, and it is structural, not a supplier bug. `Module.layoutsSeededAt` is ONE stamp for a whole module, and `planModuleSeeds` only gives a stamped module another go when `types.every((t) => !typesWithRows.has(t))`. Deskwell's shop has 48 `shopCategory` rows, so that is false forever: **any layout type added to shop in a later update can never seed**. `shopSupplier` reached a live site with starters and no layout, the page fell back to the plain grid, and the filter panel - the whole point - was absent until the owner hand-built a layout.

Counting Layout rows cannot fix it. "No rows for this type" reads identically whether the type is new or whether the owner **deleted** its layout on purpose to fall back to the built-in page, and re-minting the latter is core redesigning a live site unasked - which is exactly what the existing narrow test was protecting. So what has actually been seeded is now recorded.

**New `Module.seededLayoutTypes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`** - schema.prisma, the init migration edited in place, and `prisma/core-reconcile/033_module_seeded_layout_types.sql` for existing installs. **Back-filled EMPTY on purpose.** New pure `planTypeSeeds(moduleName, ledger, declaredTypes)` in `lib/setup/starterLayouts.ts` returns `{seed, ledger}` with three rules: an EMPTY ledger on a stamped module means it predates the column, so it **adopts everything it declares today and seeds nothing** (no live site gets a layout minted retrospectively - only types appearing after this lands are ever seeded); a real ledger seeds whatever is declared but missing from it; and **declaring nothing means the module's code is absent from THIS build** (see isModuleInBuild), so the ledger is left exactly as it is rather than adopted empty, which would wipe it and let the next build re-seed every type.

`seedPendingModuleLayouts` gains a top-up pass before the existing full-seed loop, skipping any module that loop will handle. **It deliberately does NOT call `autoPlaceModuleBlocks`** - placement is first-install-only and re-running it would re-add marker blocks the owner has since deleted. A new layout type is not a new install. `seedModuleDefaultLayouts` takes an optional `onlyTypes`, narrowed BEFORE `planModuleSeedTemplates` so its one-per-type choice is made over the new types alone. The full-seed path now writes the ledger alongside the stamp.

**filters-for-shop 0.1.47** marks `starter-shop-supplier-filtered` `publishByDefault: true`, so the seeded supplier page is the one WITH the panel; flagged beats unflagged in `planModuleSeedTemplates`, and a shop without this module still seeds shop's plain starter. Note `moduleStarterTemplates(name)` filters by the type's OWNING module, so a contributed starter for `shopSupplier` is included when shop seeds - which is what makes this work at all.

Verified: `tsc` clean, `eslint` clean, `npm test` 4961 passed (6 new `planTypeSeeds` cases, including "keeps a type on the ledger after the owner deletes its layout"), **`npm run test:backup-roundtrip` real PASS** - mandatory here, the core init migration gained a column, and unlike the shop tables the round-trip DOES cover core's `Module`, so the new `text[]` is genuinely exercised against the `udt_name` rules. filters gate green on the tag before release.

**Standing rule now in memory**: a new Puck layout type ships with a default layout auto-created. A hardcoded fallback page is not an acceptable resting state when it cannot do what the feature was asked for.)

Last updated: 2026-09-03 (**A reply now puts an inbox conversation back in Open - snoozed or done** - `unified-inbox` v0.1.36, core pin v0.5.1473. v0.1.35 did the snoozed half. Previously: **The timezone sweep, pinned and finished - core **v0.5.1471** pinning `shop` **v0.1.376**, `unified-inbox` **v0.1.34**, `contact-form` **v0.1.40**, `contact-form-reply-catcher` **v0.1.13** and `advanced-shipping-for-shop` **v0.1.50**.** All five gates green on their tags, all five released. Sequence, for the record, because it could not be done in one pass: core v0.5.1470 shipped the `timezone.ts` / `timezone.server.ts` split with the four pins wound back to their last building versions, the modules were then tagged and gated against it, and this release re-pins them.

**Dead tags, left in place deliberately:** `shop` v0.1.375, `unified-inbox` v0.1.33, `contact-form` v0.1.39 and `contact-form-reply-catcher` v0.1.12 exist as git tags but have **no GitHub release** - their gates failed (or, for the last two, their code was superseded before release). Nothing pins them and the updater only ever offers releases, so they are inert. Do not create releases for them.

**Core v0.5.1469 is likewise superseded** - it pins two tags that do not build. It is no longer the newest release, so it is not offered.)


---

## unified-inbox - our own reply, recognised when a relay rewrote its Message-ID (v0.1.37, core pin v0.5.1475)

No migration. Fixes replies appearing twice in a conversation: once as the row the send path wrote, once as the delivered copy collected from IMAP.

**The mechanism, read off the live database, not inferred.** Brevo's relay replaces the `Message-ID` we set with one of its own (`<uuid>@smtp-relay.sendinblue.com`) - the API answer echoes ours, so `EmailLog.providerId` holds our id and looks fine, while the mail on the wire carries the relay's. When the delivered copy is collected (which happens on every message between two of the site's own addresses, and on any account that files a copy of its own outgoing mail into a folder we read), `findOutboundByMessageId` cannot recognise it and it is filed as a second message. The Sent-folder copy is unaffected - we APPEND our own bytes, so it still carries our id. `append_to_sent` is **not** the trigger, despite looking like one.

**New:** `lib/relay-copy.ts` - `chooseRelayCopy(candidates, incoming)`, `RELAY_COPY_WINDOW_MS` (120s), `OutboundCandidate`. Pure, no database. Matches on sender, exact `to` and `cc` sets, normalised subject and time, and picks the nearest by time so two replies a minute apart pair off one-to-one.

**New:** `lib/db.ts` `unlocatedOutboundNear({ fromAddress, sentAt, windowMs })` - outbound email rows with `connection_id IS NULL`, which is the "never been found in a mailbox" marker (the send path leaves it empty; `attachLocation` fills it, so a row is claimable once). `recordRelayIdentity(id, relayMessageId)` writes the relay's id to `provider_message_id`.

**Changed:** `lib/sync.ts` - `matchRelayCopy()` runs when `findOutboundByMessageId` returns nothing and the sender is one of this account's own addresses; its result feeds the existing `ours` branch unchanged, so the internal path still writes the colleague's side.

**Second thing it fixes:** `threadsForMessageIds` already matched `provider_message_id`, but nothing ever populated it - `deliver()` returns null because core does not hand Brevo's id back. A customer's reply quotes the relay's id in `In-Reply-To`, so header threading was falling through to the subject heuristic on every reply to a message this hub sent. Claiming a copy fills that column in.

**Gate:** `lib/relay-copy.test.ts` (9 cases) plus a real-database case in `lib/internal-threads.live.test.ts` - claims the row, proves it cannot be claimed twice, and proves the relay id then leads to the conversation. `npm run test:inbox-guards`, 16 tests, real PASS.

**Existing duplicate rows are not cleaned up by this.** The fix stops new ones. Deskwell's 19 were removed by hand on 2026-09-03 - each duplicate merged into the row it was a copy of (relay id onto `provider_message_id`, location by COALESCE) and then deleted, `message_count` recounted on the six conversations involved, with a JSON backup and a verified rollback script. A pairing that was not one to one aborted the transaction.

---

## unified-inbox - a reply puts a conversation back in Open (in the working tree, unreleased)

Module **v0.1.36**, core pin **v0.5.1473**. Supersedes v0.1.35, which did this for `snoozed` only. No migration: `uin_events.kind` is free text and `uin_events.user_id` is already nullable.

**API change (v0.1.35 -> v0.1.36):** `wakeSnoozedThread(id): Promise<boolean>` is gone, replaced by `reopenOnReply(id): Promise<ReopenedFrom>` where `ReopenedFrom = 'snoozed' | 'done' | null`. Widened from `"status" = 'snoozed'` to `"status" <> 'open'`, so both ways out of Open are reversed by one rule.

**The statement is the unusual bit.** The old status has to come back to the caller, and plain `RETURNING` hands back the value just written - so it is a CTE that selects `id, status` under `FOR UPDATE`, then `UPDATE ... FROM "before" ... RETURNING "before"."status"`. `FOR UPDATE` is also what settles two ticks racing: the second blocks, re-reads under EvalPlanQual, finds the row open and matches nothing. Executed for real, not assumed.

**Why `done` mattered more than `snoozed`:** `unreadCounts` (db.ts) counts `unread = true AND "status" <> 'done'`. A reply to a done conversation set `unread`, bumped `last_message_at` and produced no badge anywhere - unread and invisible, indefinitely. A snoozed one at least resurfaced via `wakeDueThreads`. `unreadCounts` is deliberately left as it is; reopening is the fix.

**New event kind:** `'woken'` added to `ThreadEventKind`, written with `user_id` NULL. Detail carries `{ was: 'snoozed' | 'done' }` plus `{ direction }` from mail or `{ providerModule }` from another module's channel.

**Changed:** `lib/sync.ts` `writeSide()` calls `reopenOnReply` after `touchThread` when `!automated`, both directions - an inbound message here is the customer, and an OUTBOUND one is a colleague answering outside this hub, because a reply typed here is turned away earlier by `findOutboundByMessageId`. `lib/provider-sync.ts` does the same when `stored > 0`, after `recountProviderThread`.

**Deliberately does not reopen:** automated mail (out-of-office, bounce - same `automated` flag E7 uses for the unread flag, and the thing that stops a mailing list dragging a finished conversation back weekly), internal notes (`insertNote` still touches nothing), and this hub's own send (never reaches `touchThread`).

**Changed:** `components/admin/inbox/ThreadPane.tsx` - `unattendedEvent(event)` replaces the `UNATTENDED_EVENTS` map, since the wording now depends on `detail.was`. An actorless event renders its own whole sentence instead of "Somebody ...".

**Retention is unaffected:** `threadsDueForRetention` filters on `last_message_at`, never on status.

**Gate:** `lib/reopen-on-reply.live.test.ts` (renamed from `snooze-wake.live.test.ts`), `RUN_INBOX_REOPEN_GUARDS=1` (renamed from `RUN_INBOX_SNOOZE_GUARDS`), needs `OVH_SERVER`/`OVH_USER`/`OVH_PASSWORD`. Eight tests against a real throwaway Postgres: opens from `snoozed` and from `done` and reports which, clears the stamp with it, idempotent from both, leaves `open` alone, touches no bystander, accepts a null `user_id` on the event, moves the row between the status tabs' lists, and restores the unread badge that `done` suppresses. A skip is a fail.

**Script:** `npm run test:inbox-guards` - runs `reopen-on-reply.live.test.ts` and `internal-threads.live.test.ts` with both flags set, `--no-file-parallelism`.

---

## unified-inbox - colleague mail on both conversations (in the working tree, unreleased)

**Migration** `migrations/020_internal_threads.sql`. Swaps the `uin_messages` unique index from `(connection_id, message_id_header)` to `(connection_id, thread_id, message_id_header)`; adds column `internal_key` with a unique index on `(thread_id, internal_key)`; winds `uin_sync_state.last_seen_uid` back, per folder, to just before the oldest internal message in it, so the sweep re-reads and fills in missing sides. Idempotent.

**New:** `lib/addresses.ts` `internalSides()`; `lib/threading.ts` `internalPairKey()`, `ThreadRef`, `chooseThread({ restrictToInbox })`; `lib/db.ts` `threadsHoldingIdentity()`, `recentRecipients()`, `threadsForMessageIds()` now returns `Map<string, ThreadRef[]>`; `lib/sync.ts` `writeSide()` covers both the mirrored and the ordinary path.

**New route:** `app/api/admin/recipients/route.ts` → `GET /api/m/unified-inbox/admin/recipients?inbox&q&limit`. Bounded by `visibleInboxIds`. Zod on the query string.

**New component:** `components/admin/inbox/RecipientField.tsx` - combobox behind the To and Cc lines on Write a message. Styles under `.uin-recipient-field` / `.uin-suggestions` in `components/admin/inbox/styles.tsx`.

**Changed:** `components/admin/inbox/CheckNowButton.tsx` - an automatic check no longer posts a notice, even when it collected something. Only a pressed button reports.

**Gate:** `lib/internal-threads.live.test.ts`, `RUN_INBOX_INTERNAL_GUARDS=1`, needs `OVH_SERVER`/`OVH_USER`/`OVH_PASSWORD`. Executes migration 020 and both unique indexes against a real throwaway Postgres. A skip is a fail.
