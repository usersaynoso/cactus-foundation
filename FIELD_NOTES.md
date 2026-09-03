Last updated: 2026-09-03 (**A shelf can point at the rest of itself, and the Category filter works off a category page** - `shop` and `filters-for-shop`, uncommitted working tree. `ShopProductGrid` gains `showViewAll` / `viewAllLabel` / `viewAllHref` and two shared helpers, `gridViewAllHref` and `gridViewAll`, in `modules/shop/components/puck/ShopProductGrid.tsx`; blank href resolves from the grid's own scope (tag > category > collection > supplier, else `/shop`). The link renders inside `GridSectionHead`, so both halves emit identical markup, and it carries `data-cactus-unstyled` because core recolours every `main a`. The heading strip's CSS moved to `modules/shop/components/puck/parts/section-head-css.ts` (`SHOP_SECTION_HEAD_CSS`, dependency-free) and is now emitted by both `card-parts.tsx` and the editor half from that one string. In `filters-for-shop`, `buildBranchIndex(all, parentId)` takes `null` for the top of the tree, so `ShopFilterGrid`'s synthetic Category group now appears on pages with no category of their own - tag, collection, supplier, and ALL-sourced filter pages - offering the top-level categories; `wantCategoryFilter` no longer requires `categorySlug`, and a `categorySlug` naming nothing still offers no group. `tsc`, `eslint .` and 5018 tests green.)

Last updated: 2026-09-03 (**The follow-up is offered the way snoozing is** - `unified-inbox` v0.1.42, core pin v0.5.1480. The chase dropdown is gone: `followUpOptions(sendAt, timezone)` mirrors `snoozeOptions` word for word, with the same day-and-time box, and the chosen MOMENT is stored as the length between it and the send (`followUpMinutesBetween`) so a message leaving late is chased late. Migration 023 relaxes 022's day-long CHECK floor to five minutes - "in three hours" is three hours. Send and Save as a draft are hidden while a draft is `scheduled`/`sending`. Live SQL suite 18/18 with 023 applied, backup round-trip a real PASS.)

Last updated: 2026-09-03 (**Chase it up, and stand it down** - `unified-inbox` v0.1.41, core pin v0.5.1479. A scheduled message can carry a follow-up - once it has gone the conversation is snoozed until the chase is due and assigned to whoever WROTE the draft, not whoever sent it - and inbound mail from the person a scheduled message is addressed to stands that message down rather than letting it ask a question they have just answered. Migration 022, `lib/follow-up.ts`, `holdScheduledDraftsFor`. Live SQL suite 18/18 and the backup round-trip a real PASS.)

Last updated: 2026-09-03 (**Write it now, send it later** - `unified-inbox` v0.1.40, core pin v0.5.1478. A draft can carry a departure time and goes out on its own; the scheduled-send cron claims due rows with SKIP LOCKED and the send route's idempotency key is the draft id, so one message goes once. Previously: **A layout type added to an EXISTING module now seeds its layout - core **v0.5.1474**, `filters-for-shop` **0.1.47**.** Root cause of the supplier-pages complaint two entries down, and it is structural, not a supplier bug. `Module.layoutsSeededAt` is ONE stamp for a whole module, and `planModuleSeeds` only gives a stamped module another go when `types.every((t) => !typesWithRows.has(t))`. Deskwell's shop has 48 `shopCategory` rows, so that is false forever: **any layout type added to shop in a later update can never seed**. `shopSupplier` reached a live site with starters and no layout, the page fell back to the plain grid, and the filter panel - the whole point - was absent until the owner hand-built a layout.

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

## unified-inbox - chase it up, and stand it down (v0.1.41, core pin v0.5.1479)

**Migration:** `modules/unified-inbox/migrations/022_follow_up_and_hold.sql`. Three columns on `uin_drafts` - `follow_up_minutes INTEGER` (CHECKed 1440..527040), `held_by_thread_id TEXT` (FK `uin_threads` ON DELETE SET NULL) and `held_at TIMESTAMP(3)` - plus a partial index `uin_drafts_held_idx`. INTEGER/TEXT/TIMESTAMP only, so the backup schema-coverage backstop needs no new branch. 021 untouched.

**Follow-up.** A scheduled draft may carry a length of time. Once the message has actually gone the conversation is SNOOZED for that long and ASSIGNED to `draft.author_user_id` - not to whoever pressed Send, because a shared address means a colleague can finish somebody else's message and the person waiting on an answer is the one who asked the question. Expressed as a snooze deliberately: `reopenOnReply` already wakes a snoozed conversation, so a chase nobody needs cancels itself. New `lib/follow-up.ts` (`applyFollowUpAfterSend`) is called from BOTH send paths - the cron in `lib/scheduled-send.ts` and `app/api/send/route.ts` for a hand-sent draft - and never throws: the message has gone.

**`deleteDraft` now goes through `deleteDraftReturning` (DELETE ... RETURNING \*)** so `discardDraftAfterSend` hands back the row it removed; the chase outlives the draft that carried it without a second query racing the delete.

**Standing a message down.** Inbound, non-automated mail whose sender matches a scheduled draft's To line (case-insensitively) clears `send_state` and sets the two held columns - `holdScheduledDraftsFor`, called from `writeSide` in `lib/sync.ts` beside `reopenOnReply`. The TIME IS KEPT so the screen can say what it was going to do; a time with no state is an ordinary draft to every other query. Only `send_state = 'scheduled'` rows: one already claimed as `'sending'` may be at the mail server. Two new thread events, `held` and `awaiting`, both unattended.

**UI:** `SendLater` gains the follow-up menu and the held notice; `ThreadPane` shows the held-draft banner (fed by `draftsHeldByThread`, read through the same visibility clause as every other draft read) and names the chase's owner in the log; `DraftListView` shows `Held - they wrote first` via `scheduleLabel`. `DraftBody` gains `followUpMinutes`, bounded by `decideFollowUp`.

**Verified:** `tsc` clean, `eslint` clean, `npm test` for the module 544 passed, and `RUN_INBOX_SCHEDULE_GUARDS=1` `scheduled-send.live.test.ts` a real PASS against a throwaway VPS database - the migration and all five new statements executed, including the hold's `unnest`/`lower` match and the author-not-sender assignment.

---

## unified-inbox - write it now, send it later (v0.1.40, core pin v0.5.1478)

**Migration:** `modules/unified-inbox/migrations/021_scheduled_send.sql`. Four columns on `uin_drafts` - `send_at TIMESTAMP(3)`, `send_state TEXT` (`scheduled` | `sending` | `failed`, CHECKed), `send_error TEXT`, `claimed_at TIMESTAMP(3)` - plus two partial indexes (`uin_drafts_due_idx`, `uin_drafts_claimed_idx`) and a CHECK that a state cannot exist without a time. All TEXT/TIMESTAMP, so the backup schema-coverage backstop needs no new branch. 013 is untouched: an applied migration is never edited, and 021 runs after it on fresh installs anyway.

**A scheduled message is a DRAFT WITH A DEPARTURE TIME, not a third kind of thing.** No new table, no new tab, no new access rule: `draftScope`/`editScope`, the Drafts list, the Drafts count, the cascade when an inbox or a user is deleted and the tidy-up after a send all already govern it. It is deliberately not a status on `uin_messages` - an unsent message must never be walked by retention, webhooks, threading or the Sent list.

**New:** `lib/scheduled.ts` (pure - `decideSendAt` turns a typed wall clock into an instant **in the site's zone** via core's `instantAtWallClock`, `toWallClock` back again, `describeSendAt`/`scheduleLabel`, `plainTextToHtml`, `MIN_LEAD_MS` 60s, `MAX_AHEAD_DAYS` 366, `STALE_CLAIM_MS` 10min) with `lib/scheduled.test.ts`; `lib/scheduled-send.ts` (`runDueScheduledSends`, `SCHEDULED_BUDGET_MS` 20s, `SCHEDULED_BATCH` 10); `components/admin/inbox/SendLater.tsx`; `app/api/cron/scheduled-send/route.ts`.

**New cron job:** `/api/m/unified-inbox/cron/scheduled-send`, `*/5 * * * *` in `cactus.module.json`. The site's dispatcher is hourly (daily on Hobby), so that means "every tick", and the copy says "at that time or shortly after, never before it" rather than promising a minute. `POST /api/m/unified-inbox/admin/check-now` also flushes what is due first, with an 8s slice, and reports `sentOnSchedule` - somebody watching the screen is a better clock than the tick.

**Sending twice is guarded twice.** `claimDueScheduledDrafts` moves the row out of `scheduled` in the same UPDATE that finds it (`... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`), so a second run gets nothing; and the idempotency key handed to `sendMessage` is `scheduled-<draftId>`, so even two claims land on one `uin_messages` row.

**Rights are checked when it LEAVES, not when it was set.** New in `lib/access.ts`: `canUserReplyToInbox(userId, inboxId)` and `userCanReply(userId)`, the send-side twins of `canUserViewInbox`. Somebody taken off `accounts@` on Friday does not have a message leave as `accounts@` on Monday - it fails with a sentence and the writing is kept.

**`saveDraft` now has three answers about time, not two:** a Date schedules, `null` cancels, and **left out means leave it alone** - the SET clause is assembled from two `Prisma.sql` fragments for exactly that. Pressing "Save as a draft" on a message set for the morning must not quietly cancel the morning. `DraftBody` gains `sendAt` as a wall-clock string (`"2026-09-04T09:00"`, no zone); the drafts route refuses a past time, a time over a year out, a missing address, an empty body and (for a new conversation) missing recipients or subject **at the point somebody presses the button**, not at 3am.

**Live SQL guard:** `lib/scheduled-send.live.test.ts`, opted into with `RUN_INBOX_SCHEDULE_GUARDS=1` against a throwaway `cactus_rt_*` database on the OVH VPS. Nothing else executes these statements - the claim's SKIP LOCKED semantics and the two-fragment SET are claims about Postgres, not about TypeScript.

**UI:** `SendLater` under the box in both composers (reply and new message), the picker's floor (`minSendAt`) computed on the server in the site's zone and carried through `ThreadPane` → `ComposerSlot` → `Composer`. Drafts rows carry a `uin-tag-snoozed` "Goes out ..." tag, or `uin-tag-failed` "Did not go out" with the reason in the title. `DraftReadOnlyView` says the same for a colleague's. New styles: `.uin-sendlater`, `.uin-sendlater-picker`.

**Also in this release, from separate work in the same tree:** `chooseSignatureSource` takes a third argument, `sendingInboxIsSomebodysOwn`, and returns the sending inbox outright when it is true - an address that is somebody's own signs as them whoever pressed Send, so a colleague posting Marcus's draft does not sign it in their own name. `lib/send.ts` asks `inboxIsSomebodysOwn(inbox.id)` first and only reads the sender's own default inbox when the answer is no.

**Wiki:** `Unified-Inbox.md`, new "Sending it later" section.

---

## unified-inbox - the writing box opens on request, and the header is pinned (v0.1.39, core pin v0.5.1477)

No migration, no API change. The composer was mounted under every conversation whether anybody was writing or not.

**New:** `components/admin/inbox/ComposerOpen.tsx` - `ComposerOpenProvider` (client context holding `{ mode, at } | null`), `ReplyActions` (the Reply / Forward / Internal note buttons, for the head) and `ComposerSlot` (the box itself, where the composer always sat). Two places, one answer, which is why it is a context rather than state in either. Keyed on `thread.id` in `ThreadPane`, so opening the next conversation starts shut.

**Reply to all is deliberately not a fourth button** - it is a variation on Reply and only exists when somebody else is on the message, so it stays a chip inside the box. The Reply button reads as pressed for both.

**Changed:** `Composer` exports `ComposerMode` and takes `requestedMode` / `requestedAt`. `requestedAt` counts presses so a second press of the same button still reads as an instruction; it is applied **during render** (React's adjust-state-on-prop-change idiom), not in an effect - `react-hooks/set-state-in-effect` refuses the effect version, and rightly.

**Not rendered while shut, rather than hidden:** the composer holds a draft, an idempotency token and a beforeunload guard, none of which should be alive on a conversation nobody is writing on. A draft opens the box on the way in - `openAs = draft && draft.mode !== 'new' ? draft.mode : null` - because a draft nobody can see is a draft nobody finishes.

**`cannotReplyReason` moved with it.** It used to be an alert inside the always-open box; with the box shut, a missing Reply button and no explanation reads as a fault, so `ReplyActions` shows the reason beside the buttons when `!canReply`. The composer still shows it too.

**Sticky again, and only above 900px.** `.uin-thread-head` gets `position: sticky; top: 0; z-index: 3` inside the media query where `.uin` is the sticky frame and each pane scrolls its own contents. Below that the page scrolls and the band would pin to the phone's viewport, which is what the comment removed here warned about - the original unpinning was because the composer sat open directly beneath it, and that is no longer true.

**Wiki:** `Unified-Inbox.md`, the reply paragraph and the newest-first paragraph.

---

## unified-inbox - pressing refresh refreshes, it does not refuse (v0.1.38, core pin v0.5.1476)

No migration. `POST /api/m/unified-inbox/admin/check-now` no longer answers 429 "A check has just run - give it N seconds and try again."

**Three things were wrong with the old rule.** It refused the WHOLE request when ANY one account had been visited inside the minute, so a second mailbox that was hours stale went uncollected. It refused rather than refreshing, so the press did nothing at all - the client only calls `router.refresh()` on an ok. And it used one cooldown for a round the page ran on its own and one a person pressed for, which are not the same question.

**New:** `lib/check-cooldown.ts` - `COOLDOWN_MS` (60s, automatic), `PRESSED_COOLDOWN_MS` (10s, pressed), `cooldownFor(automatic)`, `dueForCheck(accounts, cooldownMs, now)` returning `{ due, restedSeconds }`. Pure, with `lib/check-cooldown.test.ts` (9 cases) - the whole point being that this rule is only ever wrong in ways `tsc` has no opinion about.

**Changed:** the route filters to the due accounts and syncs those one at a time against one shared deadline (as `syncAllConnections` does; it no longer calls it). All resting is `200 { ok: true, checked: false, message: 'Your mail was checked N seconds ago, so this is up to date.' }` - the screen reloads on the back of it. Successful checks now carry `checked: true`.

**Changed:** `components/admin/inbox/CheckNowButton.tsx` posts `{ auto: quiet }` - the interval's rounds are `auto: true` and keep the minute; a press gets the ten seconds.

**Wiki:** `Unified-Inbox.md`, the refresh-button paragraph.

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
