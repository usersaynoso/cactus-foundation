Last updated: 2026-09-03 (**A reply now puts an inbox conversation back in Open - snoozed or done** - `unified-inbox` v0.1.36, core pin v0.5.1473. v0.1.35 did the snoozed half. Previously: **The timezone sweep, pinned and finished - core **v0.5.1471** pinning `shop` **v0.1.376**, `unified-inbox` **v0.1.34**, `contact-form` **v0.1.40**, `contact-form-reply-catcher` **v0.1.13** and `advanced-shipping-for-shop` **v0.1.50**.** All five gates green on their tags, all five released. Sequence, for the record, because it could not be done in one pass: core v0.5.1470 shipped the `timezone.ts` / `timezone.server.ts` split with the four pins wound back to their last building versions, the modules were then tagged and gated against it, and this release re-pins them.

**Dead tags, left in place deliberately:** `shop` v0.1.375, `unified-inbox` v0.1.33, `contact-form` v0.1.39 and `contact-form-reply-catcher` v0.1.12 exist as git tags but have **no GitHub release** - their gates failed (or, for the last two, their code was superseded before release). Nothing pins them and the updater only ever offers releases, so they are inert. Do not create releases for them.

**Core v0.5.1469 is likewise superseded** - it pins two tags that do not build. It is no longer the newest release, so it is not offered.)


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
