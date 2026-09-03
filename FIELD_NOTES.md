Last updated: 2026-09-03 (**A reply now cancels a snooze in the unified inbox** - `unified-inbox` v0.1.35, core pin v0.5.1472. Previously: **The timezone sweep, pinned and finished - core **v0.5.1471** pinning `shop` **v0.1.376**, `unified-inbox` **v0.1.34**, `contact-form` **v0.1.40**, `contact-form-reply-catcher` **v0.1.13** and `advanced-shipping-for-shop` **v0.1.50**.** All five gates green on their tags, all five released. Sequence, for the record, because it could not be done in one pass: core v0.5.1470 shipped the `timezone.ts` / `timezone.server.ts` split with the four pins wound back to their last building versions, the modules were then tagged and gated against it, and this release re-pins them.

**Dead tags, left in place deliberately:** `shop` v0.1.375, `unified-inbox` v0.1.33, `contact-form` v0.1.39 and `contact-form-reply-catcher` v0.1.12 exist as git tags but have **no GitHub release** - their gates failed (or, for the last two, their code was superseded before release). Nothing pins them and the updater only ever offers releases, so they are inert. Do not create releases for them.

**Core v0.5.1469 is likewise superseded** - it pins two tags that do not build. It is no longer the newest release, so it is not offered.)


---

## unified-inbox - a reply cancels a snooze (in the working tree, unreleased)

Module **v0.1.35**, core pin **v0.5.1472**. No migration: `uin_events.kind` is free text and `uin_events.user_id` is already nullable.

**New:** `lib/db.ts` `wakeSnoozedThread(threadId): Promise<boolean>` - single statement, `WHERE "id" = $1 AND "status" = 'snoozed'`, returns whether a snooze was actually cancelled so the caller writes one timeline entry rather than one per polled message. Sits beside `wakeDueThreads()` (unchanged, still the time-elapsed sweep run on the way into the list).

**New event kind:** `'woken'` added to `ThreadEventKind`, written with `user_id` NULL. Detail is `{ direction }` from mail, `{ providerModule }` from another module's channel.

**Changed:** `lib/sync.ts` `writeSide()` calls `wakeSnoozedThread` after `touchThread` when `!automated`, both directions - an inbound message here is the customer, and an OUTBOUND one is a colleague answering outside this hub, because a reply typed here is turned away earlier by `findOutboundByMessageId`. `lib/provider-sync.ts` does the same when `stored > 0`, after `recountProviderThread`.

**Deliberately does not wake:** automated mail (out-of-office, bounce - same `automated` flag E7 uses for the unread flag), internal notes (`insertNote` still touches nothing), and this hub's own send (never reaches `touchThread`).

**Changed:** `components/admin/inbox/ThreadPane.tsx` - new `UNATTENDED_EVENTS` map so an actorless event renders its own whole sentence instead of "Somebody ...".

**Gate:** `lib/snooze-wake.live.test.ts`, `RUN_INBOX_SNOOZE_GUARDS=1`, needs `OVH_SERVER`/`OVH_USER`/`OVH_PASSWORD`. Seven tests against a real throwaway Postgres: wakes and clears the stamp together, idempotent, leaves `done` and `open` alone, touches no bystander, accepts a null `user_id` on the event, and the woken row appears in the Open list. A skip is a fail.

**New script:** `npm run test:inbox-guards` - runs `snooze-wake.live.test.ts` and `internal-threads.live.test.ts` with both flags set, `--no-file-parallelism`.

---

## unified-inbox - colleague mail on both conversations (in the working tree, unreleased)

**Migration** `migrations/020_internal_threads.sql`. Swaps the `uin_messages` unique index from `(connection_id, message_id_header)` to `(connection_id, thread_id, message_id_header)`; adds column `internal_key` with a unique index on `(thread_id, internal_key)`; winds `uin_sync_state.last_seen_uid` back, per folder, to just before the oldest internal message in it, so the sweep re-reads and fills in missing sides. Idempotent.

**New:** `lib/addresses.ts` `internalSides()`; `lib/threading.ts` `internalPairKey()`, `ThreadRef`, `chooseThread({ restrictToInbox })`; `lib/db.ts` `threadsHoldingIdentity()`, `recentRecipients()`, `threadsForMessageIds()` now returns `Map<string, ThreadRef[]>`; `lib/sync.ts` `writeSide()` covers both the mirrored and the ordinary path.

**New route:** `app/api/admin/recipients/route.ts` → `GET /api/m/unified-inbox/admin/recipients?inbox&q&limit`. Bounded by `visibleInboxIds`. Zod on the query string.

**New component:** `components/admin/inbox/RecipientField.tsx` - combobox behind the To and Cc lines on Write a message. Styles under `.uin-recipient-field` / `.uin-suggestions` in `components/admin/inbox/styles.tsx`.

**Changed:** `components/admin/inbox/CheckNowButton.tsx` - an automatic check no longer posts a notice, even when it collected something. Only a pressed button reports.

**Gate:** `lib/internal-threads.live.test.ts`, `RUN_INBOX_INTERNAL_GUARDS=1`, needs `OVH_SERVER`/`OVH_USER`/`OVH_PASSWORD`. Executes migration 020 and both unique indexes against a real throwaway Postgres. A skip is a fail.
