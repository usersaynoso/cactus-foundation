# Unified Inbox - build plan

**Status:** in progress - S1 to S9 done, S10 next
**Plan written:** 2026-08-28
**Core version at time of writing:** 0.5.1381
**Module slug:** `unified-inbox` · **Table prefix:** `uin_` · **Repo (to be created):** `cactus-foundation-modules/unified-inbox`

---

## 0. How to use this plan (READ THIS FIRST - agent protocol)

This plan is built to be handed, whole and unedited, to a series of fresh agents. Each agent
does exactly one stage and stops. You are one of those agents.

**Your procedure:**

1. Read section 6 (Stage ledger). Find the **first stage whose status is not `DONE`**. That
   stage is yours. Do not do any other stage, do not "get a head start" on the next one.
2. Read sections 1 to 5 in full before touching anything. They are the shared context you would
   otherwise have to rediscover, and several of them describe traps that have already broken this
   codebase once.
3. Read your stage's detail in section 7. Do the work.
4. Run the gates listed for your stage. They must be genuinely green, not "mostly".
5. Edit **this file**: set your stage's ledger row to `DONE`, fill in its **Notes for later
   stages** block with anything the next agent cannot work out for themselves - decisions you
   took, things you found that contradict this plan, things you deliberately deferred.
6. Stop and report to Chris. Do **not** start the next stage. Do **not** commit, push or release
   unless Chris asks you to in that same turn.

**If your stage turns out to be wrong** (the plan says a file exists and it does not, an API
does not behave as described): do not silently improvise a different architecture. Do the part
that still holds, write what you found in the notes block, and tell Chris what needs re-deciding.

**Commit hygiene between stages:** this repo is shared by several agents at once. Stage work
must be left in the working tree for review. Chris commits between stages. If a stage's work
spans both core and `modules/unified-inbox/`, say so clearly in your report - they are two
separate git checkouts.

---

## 1. What we are building

A **Unified Inbox**: one place in the Cactus admin where every conversation with every outside
party lives, whatever channel it arrived on, with the site's own records attached to the side of it.

It is explicitly **not a CRM**. No pipelines, no deals, no stages, no lead scoring, no forecasting.
The people layer exists for exactly one reason: so two emails, a live chat and a phone call from the
same human collapse into one story.

Concretely, when it is finished, a Deskwell-shaped site can:

- Run several inboxes off one mail account - `hi@deskwell.co.uk` for customers and general
  enquiries, `marcus@deskwell.co.uk` for suppliers and purchasing - each with its own staff,
  signature and sending identity.
- Read and reply to email in the admin, with replies delivered through Brevo and (optionally)
  copied into the real mailbox's Sent folder so a phone's Mail app agrees with the admin.
- See live chat, contact form submissions, phone calls, voicemail and SMS in the same list.
- See, beside a conversation, what the rest of the site knows about that person: their orders,
  their POs, their unpaid bills, their quotes, their member account.
- Assign a conversation, snooze it, mark it done, leave an internal note, mention a colleague.
- Search all of it.

And a site that installs it with nothing else installed still gets a working email client.

---

## 2. Decisions already made (LOCKED - do not relitigate)

Chris decided these during planning. They are settled. If one of them turns out to be
technically impossible, say so and stop; do not quietly substitute your own answer.

| # | Decision |
|---|---|
| D1 | **Multiple inboxes, not one merged stream.** Per-inbox views are the primary UI. An **All** view exists as well, but it is not the default. |
| D2 | **An inbox is not a mail account.** Deskwell runs one iCloud IMAP connection carrying several domain aliases. Mail is routed to an inbox by delivered-to address. One connection, many inboxes, and also many connections if a site wants that. |
| D3 | **All outbound goes through Brevo**, not iCloud SMTP, with a per-inbox sending identity. Per-inbox SMTP override exists for sites that want it. |
| D4 | **IMAP APPEND to Sent is an admin toggle, per inbox** - off means the hub has everything and the phone's Sent folder stays empty; on means both agree. |
| D5 | **Sync is hourly cron plus a manual Check now**, resumable, never "sync everything then commit". |
| D6 | **Backfill 12 months** on first sync, admin-settable, chunked over many ticks. |
| D7 | **Core gains a generic `core.conversation-provider` extension point.** Channel modules publish normalised conversations plus a reply callback. Core suppresses a provider module's own inbox tab when a consuming module is installed. No module-specific code anywhere in core. |
| D8 | **Contact form gets the same treatment as live chat** - it becomes a provider, its own inbox tab is suppressed when Unified Inbox is present. |
| D9 | **Live chat module stays** (it owns Chatwoot, the widget, the connection). When Unified Inbox is installed, Unified Inbox is where chats are answered. |
| D10 | **Twilio is in scope at v1, in full** - calls, voicemail, SMS as conversations. |
| D11 | **Routing at v1 is delivered-to address only**, plus a per-inbox catch-all fallback. No sender-domain or subject rules yet. |
| D12 | **Compose at v1 includes new messages linked to a record** ("email this supplier about PO-1234" with the PDF attached), plus reply and forward, with attachments from the media library or a fresh upload. |
| D13 | **Core gains a generic outbound email log.** Every `sendEmail()` is recorded so automated mail (order confirmations, PO emails, quote emails) appears on a person's timeline - IMAP can never see those, because Brevo never touches the site owner's Sent folder. |
| D14 | **Reply Catcher is not deleted.** It stays for people who want the simple thing. When Unified Inbox is installed, Reply Catcher is marked superseded and recommended for removal, and the two must never poll the same mailbox at once. |
| D15 | **People layer is thin** - identities, dedupe, organisation by email domain. Nothing else. |
| D16 | **Per-inbox access control, configured by an admin** - a shop assistant must not be able to read `accounts@`. |
| D17 | **Retention/GDPR:** headers plus text plus sanitised HTML in Postgres; attachments fetched lazily to media storage; retention window settable; per-person export and erase. |
| D18 | Name: **Unified Inbox**. |

---

## 3. Architecture

### 3.1 The shape, in one paragraph

Core already owns an Inbox page that is *a host, not a feature*
([app/cactus-admin/inbox/page.tsx](../app/cactus-admin/inbox/page.tsx)) - modules publish tabs
into `core.inbox-tabs` and core renders whichever the URL asks for. We keep that, and add a second,
data-shaped seam beside it: `core.conversation-provider`, where a channel module publishes
*normalised conversations* rather than a React panel. Unified Inbox is the consumer of that seam,
plus a full email channel of its own, plus the people layer, plus the context rail. Everything
that is not email arrives through a provider; nothing in core or in the other modules knows that
Unified Inbox exists.

### 3.2 Why the provider point lives in core, not in the module

The strict rule in this repo is that a module never adds weight to another module for its own
benefit, and never puts its own code in core (see `feedback_module_to_module_isolation`,
`feedback_module_minimal_footprint`). Adding provider files to contact-form, live-chat and twilio
is only acceptable because the seam is generic and pays for itself without Unified Inbox:

- Core itself renders a small **All** tab on the Inbox page when two or more providers exist,
  listing merged conversations with a deep link into the owning module. A site running only
  contact form and live chat gains that today, with Unified Inbox nowhere in sight.
- The provider contract names no module and no consumer. It is the same shape as the existing
  `core.menu-entity-provider` and `smsProviders` seams.

That is the justification, and it must be written into each provider commit. If a reviewer cannot
answer "would a site running only contact-form notice or pay for this?" with "yes, they gain the
All tab", the change is wrong.

### 3.3 Tab suppression

A module may declare `consumesConversationProviders: true` in its manifest. When core resolves
inbox tabs it then hides (a) its own All tab and (b) the tab of any module that publishes a
conversation provider, because the consumer is presenting all of it in one place. The flag is a
plain boolean naming no module. Modules that publish a provider but no tab are unaffected.

### 3.4 The provider contract (core-owned types)

Lives at `lib/conversations/types.ts`. Sketch - refine names during Stage 1, but keep the shape:

```ts
export type ConversationChannel = 'email' | 'chat' | 'form' | 'phone' | 'sms'

export type ConversationParticipant = {
  name: string | null
  email: string | null
  phone: string | null
}

export type ConversationSummary = {
  /** Unique within the provider. Core/consumers namespace it with the module name. */
  id: string
  channel: ConversationChannel
  subject: string | null
  preview: string | null
  participant: ConversationParticipant
  lastMessageAt: Date
  unread: boolean
  status: 'open' | 'closed'
  /** Deep link into the owning module's own UI, for the core All tab. */
  href: string
}

export type ConversationMessage = {
  id: string
  direction: 'in' | 'out' | 'note'
  authorName: string | null
  text: string
  html: string | null
  sentAt: Date
  attachments: Array<{ filename: string; url: string; contentType: string | null }>
}

export type ConversationProvider = {
  label: string
  channel: ConversationChannel
  capabilities: { reply: boolean; markRead: boolean; byIdentity: boolean }
  list(opts: { since?: Date; limit: number; cursor?: string }):
    Promise<{ items: ConversationSummary[]; nextCursor?: string }>
  thread(id: string):
    Promise<{ summary: ConversationSummary; messages: ConversationMessage[] } | null>
  send?(id: string, body: { text: string; html?: string; authorUserId: string }): Promise<void>
  markRead?(id: string): Promise<void>
  /** Everything this provider holds for a given person, for the unified timeline. */
  byIdentity?(identity: { emails: string[]; phones: string[] }): Promise<ConversationSummary[]>
}
```

Providers are registered through the existing `extensionPoints` manifest array, exactly like
`contact-form.thread-messages` does today - a function export, not a component. No generator
change is needed: `scripts/generate-module-extension-points.mjs` already keys the registry by
arbitrary point string.

### 3.5 Email channel (the module's own)

```
IMAP (imapflow) ──► sync engine ──► uin_messages / uin_threads ──► UI
                       ▲                                            │
                   uin_sync_state                                   ▼
                   (uidvalidity, cursors)                    reply composer
                                                                    │
                                                                    ▼
                                            Brevo (core sendEmail, per-inbox identity)
                                                                    │
                                                       optional IMAP APPEND to Sent
```

Threading: RFC 5322 first (`Message-ID`, `In-Reply-To`, `References`), then a fallback heuristic
(normalised subject plus participant overlap plus a time window) for mail from clients that
mangle headers. Every outbound message we send gets a `Message-ID` we generate and store, so the
customer's reply threads back to us deterministically. This is why core `sendEmail()` needs a
headers passthrough.

### 3.6 Where the UI lives

One tab in the core Inbox page, published into `core.inbox-tabs`, containing:

- a left rail of inboxes (`hi@`, `marcus@`, ..., then **All**, then channel-only groups),
- a conversation list with status/assignee filters,
- a thread view with the composer,
- a right rail of context (person, organisation, linked records).

Settings go in **Settings → Unified Inbox** via `settingsTabs`. **No new sidebar link** - the core
Inbox link already exists and the standing rule is one link, tabs inside it
(`feedback_module_admin_sidebar_structure`).

---

## 4. Data model

All module tables are prefixed `uin_`. Core gets exactly one new model.

### 4.1 Core

**`EmailLog`** (Prisma model, core init SQL + a new `prisma/core-reconcile/031_email_log.sql`):

| column | type | note |
|---|---|---|
| id | text pk | cuid |
| toAddress | text | single recipient; one row per recipient |
| ccAddresses | text[] | |
| subject | text | |
| templateKey | text? | e.g. `shop.order-confirmed`, null for ad-hoc |
| moduleName | text? | which module asked for it, null for core |
| status | text | `sent` \| `failed` |
| error | text? | |
| messageId | text? | the `Message-ID` we set, when we set one |
| providerId | text? | Brevo's own id when it returns one |
| sentAt | timestamp | |
| meta | jsonb? | small, no bodies |

**Bodies are never stored here.** This is a delivery ledger, not an archive - it must stay small
enough that no site ever needs to prune it to stay alive. Retention: settable, default 12 months,
swept by an existing core cron.

### 4.2 Module (`uin_`)

Sketch DDL. Column types matter for the backup gate - stick to `text`, `text[]`, `jsonb`,
`boolean`, `integer`, `bigint`, `timestamp(3)`. Do not introduce a type
`lib/backup/serialize.ts` has no branch for without also extending it (see 5.4).

- **`uin_connections`** - a mail account. `id`, `label`, `imap_host`, `imap_port`,
  `imap_username`, `imap_password_encrypted`, `imap_tls`, `last_sync_at`, `last_sync_status`,
  `last_sync_error`, timestamps.
- **`uin_inboxes`** - an address people write to. `id`, `name`, `address` (unique, stored lower
  case), `connection_id` (nullable), `imap_folder` (default `INBOX`), `sent_folder`,
  `is_catch_all`, `send_transport` (`brevo` \| `smtp`), `brevo_api_key_encrypted` (null means the
  site key), `smtp_host/port/username/password_encrypted`, `from_name`, `signature_html`,
  `append_to_sent`, `colour`, `sort_order`, timestamps.
- **`uin_inbox_access`** - `inbox_id`, `user_id`, `can_reply`. Absence of any row for an inbox
  means "everyone with `unifiedinbox.view`"; presence means "only these people".
- **`uin_threads`** - `id`, `inbox_id` (nullable for provider-owned channels), `channel`,
  `provider_module` (nullable), `external_id` (nullable), `subject`, `subject_normalised`,
  `preview`, `status` (`open`\|`snoozed`\|`done`), `snooze_until`, `assignee_user_id`,
  `person_id`, `organisation_id`, `last_message_at`, `last_direction`, `unread`, `message_count`,
  timestamps. Unique `(provider_module, external_id)` where both are non-null.
- **`uin_messages`** - `id`, `thread_id`, `direction` (`in`\|`out`\|`note`), `channel`,
  `message_id_header`, `in_reply_to`, `references_header` text[], `from_name`, `from_address`,
  `to_addresses` text[], `cc_addresses` text[], `subject`, `body_text`, `body_html`,
  `snippet`, `sent_at`, `has_attachments`, `size_bytes`, `source` (`imap`\|`brevo`\|`provider`\|
  `manual`), `provider_message_id`, `delivery_status`, `delivery_error`, `author_user_id`,
  `created_at`.
- **`uin_attachments`** - `id`, `message_id`, `filename`, `content_type`, `size_bytes`,
  `media_id` (null until fetched), `imap_part_id`, `fetched_at`.
- **`uin_people`** - `id`, `display_name`, `primary_email`, `organisation_id`, `notes`, timestamps.
- **`uin_person_identities`** - `id`, `person_id`, `kind` (`email`\|`phone`\|`chat`), `value`
  (normalised; unique across the table), `source`, `created_at`.
- **`uin_organisations`** - `id`, `name`, `domain` (unique, nullable), timestamps.
- **`uin_record_links`** - `id`, `person_id` (nullable), `thread_id` (nullable), `module_name`,
  `record_type`, `record_id`, `label`, `confidence` (integer 0-100), `linked_by`
  (`auto`\|`user`), `created_at`. **No foreign keys out to other modules' tables** - a link is a
  soft pointer that must survive the other module being uninstalled.
- **`uin_sync_state`** - `connection_id`, `folder`, `uidvalidity`, `last_seen_uid`,
  `backfill_cursor_uid`, `backfill_complete`, `last_run_at`, `last_error`. PK
  `(connection_id, folder)`.
- **`uin_processed_messages`** - dedupe ledger, same idea as `rc_processed_messages`:
  `connection_id`, `folder`, `uid`, `message_id_header`, `thread_id`, `processed_at`. Unique
  `(connection_id, folder, uid)`.
- **`uin_events`** - audit: `id`, `thread_id`, `user_id`, `kind` (assigned, snoozed, status,
  linked, unlinked, merged), `detail` jsonb, `created_at`.
- **`uin_settings`** - singleton row: `backfill_months` (default 12), `retention_months`,
  `attachment_fetch` (`lazy`\|`always`\|`never`), `auto_link` boolean, `default_inbox_id`,
  timestamps.

Labels are deliberately out of v1. If a stage finds it cannot cope without them, note it rather
than adding tables on the quiet.

---

## 5. Constraints and traps (each one is real, several have bitten before)

### 5.1 The cron budget is the design constraint

The site has **one** Vercel cron entry which fans out through
[app/api/cron/dispatch/route.ts](../app/api/cron/dispatch/route.ts). That dispatcher runs with
`maxDuration = 60`, gives **any single job at most 25 seconds**, and orders jobs longest-waiting
first. A module route's own ceiling is 60s.

**The tick is hourly on paid Vercel plans and once a DAY on Hobby** - see the header comment in
[lib/cron/jobs.ts](../lib/cron/jobs.ts). A job's schedule is honoured to the tick, not to the
minute. Deskwell is on a paid team so it gets hourly, but a Hobby site running this module checks
its mail once a day, and the settings page and the wiki must both say so plainly rather than
promising hourly to everybody. Declaring `0 * * * *` is honest about the intent; the plan decides
the rest.

Therefore the IMAP sync must be **resumable at any instruction**: fetch a bounded batch of UIDs,
commit them, advance the cursor, return. Never "walk the whole folder then write". A first sync of
a mailbox with years of history takes many hourly ticks and that is fine, as long as progress is
visible and monotonic.

Also: a newly registered cron path is **seeded, not run**, on first sight. The first real run is
the following tick. Do not read that as a bug.

### 5.2 Brevo realities

- Brevo will refuse to send as `marcus@deskwell.co.uk` until that sender or domain is
  authenticated in Brevo. That is a setup step for the site owner, and the settings UI must say so
  plainly rather than letting a send fail with a raw API error.
- Brevo-sent mail never appears in the site owner's own Sent folder. That is precisely why D4
  (optional IMAP APPEND) and D13 (outbound log) exist.
- Brevo caps a message at 10MB including attachments; core already drops oversized attachments
  rather than losing the email (`MAX_ATTACHMENT_BYTES` in `lib/email/index.ts`). Keep that
  behaviour, but in this module surface it to the user - an attachment that silently did not go is
  worse here than in a transactional email.
- iCloud app-password IMAP has no push. Hourly plus manual is the ceiling, whatever anyone wishes.

### 5.3 Do not fight the module isolation rules

- Nothing named after Unified Inbox may appear in core or in another module. The provider point,
  the manifest flag, the email log and the headers passthrough are generic and stand on their own.
- Cross-module **reads** by raw SQL are fine. Cross-module **schema or UI edits** are not.
- Context-rail adapters live inside Unified Inbox, gated on "is that module installed and does the
  table exist". They never write.
- Verify before any commit that touches wiring:
  ```bash
  git grep "modules/unified-inbox" -- ':!modules' ':!wiki' ':!.gitmodules'
  ```
  Must come back empty.

### 5.4 The backup gate is not optional

New tables and new column types land squarely on the rules in `CLAUDE.md`. Any stage that adds or
changes a migration must:

1. Keep `lib/backup/schema-coverage.test.ts` green (it parses every column type out of every
   migration and asserts `isSupportedUdtName` has a branch for it - this runs in plain `npm test`,
   no key needed, and must never be skipped).
2. Run `npm run test:backup-roundtrip` and get a real **PASS**. A skip is a fail. The suite needs
   `RUN_BACKUP_ROUNDTRIP=1` plus `OVH_SERVER`/`OVH_USER`/`OVH_PASSWORD` exported into the shell
   from `/Users/chris/Git Local/Deskwell/Claude/.env` - never copied into this repo. Needs
   `sshpass` installed.

Remember the serialisation invariants: the column's `udt_name` decides the literal, never the JS
value shape; `bytea` comes back as `Uint8Array` and not always `Buffer`; unknown type means throw,
never guess. Sequences are not tables and are missed by `information_schema.tables`.

### 5.5 Checks, and the one that lies

- `npm run typecheck` (**not** bare `tsc --noEmit`) - the bare form reads a stale generated router.
- `eslint .`
- `npm test`
- **Never** `npm run build` / `next build` unless Chris asks for a build in that same turn. This is
  strict and includes "just to be sure before committing".

### 5.6 Module checkout gotcha

`scripts/checkout-modules.mjs` reverts uncommitted working-tree edits to tracked module files
during a local build. While developing inside `modules/unified-inbox/`, either commit in the module
repo first or skip `checkout-modules` and verify with the generators plus typecheck.

### 5.7 Two pollers, one mailbox

Reply Catcher polls the same mailbox on the same hourly dispatcher. If both are configured against
one account, replies get filed twice in two different places. Stage 7 owns the guard: Unified Inbox
detects an active Reply Catcher pointed at the same host and username, and refuses to sync that
connection until the owner resolves it, saying so in plain English in settings.

### 5.8 Design system

Colours are tokens (`--color-text`, `--color-border`, ...), never hex. Every new surface is checked
in light **and** dark for AA contrast before its stage is done. No new `eslint-disable` or
`@ts-ignore` without a one-line justification on the same line.

### 5.9 Copy

British spelling throughout. No em dashes anywhere - spaced hyphens or restructure. Admin-facing
copy is plain English for a small-business owner: no "IMAP UID", no "provider", no jargon in the
places a non-technical owner will read.

### 5.10 Edge cases (found during planning - each one is assigned to a stage)

Twenty-seven of them. These are not hypotheticals, and three - **E1**, **E2** and **E4** - are
outright data-loss or privacy defects if the stage is built the obvious way. The owning stage must
handle each case **and** cover it with a test where a test is possible.

**S1 (core seam)**

E1. **Tab suppression must be resolved per user, not globally.** Hiding the contact-form tab
    whenever Unified Inbox is installed locks out a user who has `contact.view` but not
    `unifiedinbox.view` - they lose their own inbox with no way back to it. Suppress only for
    users who can actually see the replacement tab. Test both kinds of user.

**S3 (ingest)**

E2. **Mail filed on a phone is never seen.** Hourly polling of `INBOX` alone means an email read
    and archived from Mail.app between two ticks is gone before we look. This is precisely how
    Deskwell works day to day, so "we sync the inbox" loses real customer mail. Sync the archive
    and any user-nominated folders as well, and make `Message-ID` the primary identity of a
    message with `(connection, folder, uid)` as merely its location. A message that moves folders
    is the same message, not a new one.
E3. **Cross-folder duplicates.** The same message legitimately exists in `INBOX` and `Archive`,
    and our own sent mail exists in `Sent` and possibly elsewhere. Dedupe per connection on
    `message_id_header`, with the folder/uid ledger only preventing re-reads.
E4. **Attachments must never reach the browsable media library.** A customer's invoice pulled from
    `accounts@` showing up in the media picker for anyone with media permission defeats the whole
    of D16. Private key prefix excluded from the library query, served only through a module route
    that re-checks the inbox ACL per request, signed and short-lived. If the library cannot be made
    to exclude them cleanly, stop and report rather than shipping the leak.
E5. **No `Delivered-To` on iCloud alias mail.** Every routing decision in D11 rests on that header.
    **Verify against a real message from a real iCloud custom-domain alias before building on it.**
    If it is absent, routing falls back to `To` then `Cc` then `Envelope-To`, and anything that
    still cannot be placed goes to the catch-all with a visible reason, not silently.
E6. **Concurrency.** The hourly tick, a manual Check now and a Stage 4 APPEND can all want the same
    account at once, and iCloud caps concurrent IMAP connections per account. Take a per-connection
    lock (a row with a held-until stamp is enough) and have the loser return "already running"
    rather than open a second connection.
E7. **Auto-replies, bounces and out-of-office.** A DSN from MAILER-DAEMON quotes our own
    `Message-ID` and will thread neatly into the customer's conversation as though the customer
    replied - marking it unread, moving it up the list, and lying about the state of the
    relationship. Detect `Auto-Submitted: auto-replied`, `Precedence: bulk` / `list`, and
    `multipart/report` DSNs; file them on the thread as a system event, not as an inbound reply.
E8. **Junk creating people.** Spam reaching `INBOX` mints a person, an organisation and a thread
    each. Do not create a person until a message survives a basic junk check, and make deleting a
    thread delete the person it created if nothing else references them.
E9. **Manual check gets a bigger budget.** Check now runs in a module route (60s ceiling), not in
    the dispatcher's 25s slice. Use it - a first sync should visibly move faster when a human is
    watching and pressing the button.
E10. **Silent auth failure.** A rotated or revoked app password stops sync dead. Raise a core
    `Notification` on repeated auth failure as well as showing status in settings, or the first
    anyone knows is a customer complaining they were ignored for a fortnight.

**S4 (send)**

E11. **Our own sent mail comes back at us.** With `append_to_sent` on, the next sync finds the copy
    we just appended and files it as a newly discovered message. Dedupe on the `Message-ID` we
    generated and stored before sending. Test this specific loop.
E12. **Forwarding must not preserve the original `From`.** Sending as somebody else's domain fails
    DMARC and damages the site's sending reputation. Forward as the inbox, with the original
    message quoted and its attachments carried.
E13. **Honour inbound `Reply-To`.** If it differs from `From`, it wins when replying. Getting this
    wrong sends the reply to a no-reply address and the customer never hears back.
E14. **Send idempotency.** A double-clicked button, or a retry after an ambiguous timeout, must not
    send twice. The pre-written `sending` row is the guard - key the send on its id.
E15. **Sender not authenticated in Brevo.** Check when the inbox is saved, not when the first reply
    fails. Say what to do about it in plain English.

**S5 (UI)**

E16. **Email HTML will eventually break the admin layout** - it is arbitrary third-party markup
    with its own CSS. Render it in a sandboxed iframe with `srcdoc` and a restrictive CSP, never
    inline in the page.
E17. **Search and the All view are the ACL leak.** Filter by visible inboxes inside the query, not
    on the results. A snippet from `accounts@` surfacing for someone who cannot open `accounts@`
    is the same breach as opening it.

**S6 (people)**

E18. **Own-domain addresses must not become people.** Otherwise every colleague turns into a
    customer record. Exclude the site's own domains and the admin users' addresses, configurably.
E19. **Role addresses are several humans.** `accounts@supplier.com` collapses to one person by
    design. Acceptable, but say so in the wiki rather than letting it look like a bug.

**S7 (providers)**

E20. **A provider module can be uninstalled while its threads exist.** Rows with a
    `provider_module` nobody serves must render as "this channel is no longer installed" and stay
    searchable, not throw.
E21. **Reply Catcher's existing caught replies.** Decide explicitly: either a one-time import into
    the hub, or none at all with a line in the wiki saying so. Do not leave it ambiguous.

**S8 (retention, backup)**

E22. **Erase is hub-only.** Erasing a person here does not erase their shop orders, their bills or
    their member account, and must not pretend to. Say exactly what it covers in the confirmation
    dialog and in the wiki.
E23. **Backup export now carries every email body.** Deskwell's export grows by an order of
    magnitude and restore truncates and re-inserts all of it. Check the round-trip at realistic
    volume, not with three rows, and decide whether bodies past the retention window belong in an
    export at all.

**S9/S10**

E24. **Two agents replying at once** is not handled at v1. Record it as a deliberate deferral
    rather than discovering it in production.

**Added on review**

E25. **The site's own notification mail duplicates the conversation.** (S7) A contact form
    submission emails the site owner - so the enquiry appears twice: once as a form conversation
    through the provider, and once as an ordinary email sitting in `hi@`. The same goes for any
    module that notifies the owner by email. Recognise mail whose sender is the site's own
    sending identity, or that carries the template markers core stamps, and fold it into the
    conversation it is about instead of creating a rival thread. Get this wrong and every
    enquiry Deskwell receives is two enquiries.
E26. **Replying to a chat needs the acting user's own Chatwoot agent token.** (S7)
    `lc_admin_tokens` is keyed by `user_id`, so a colleague who has never connected their
    Chatwoot account cannot reply, and the failure must say exactly that with a link to fix it -
    not "something went wrong", and never by silently posting as somebody else.
E27. **The sandboxed iframe needs a CSP entry.** (S5) Module CSP is generated by
    `scripts/generate-module-csp.mjs`. An email rendered with `srcdoc` under a restrictive policy
    will be blocked outright unless the module declares what it needs. Check the rendered page in
    a browser with the console open, not just in a unit test.

---

## 6. Stage ledger

Update this table. `DONE` means gates green and notes written.

| Stage | Title | Repo(s) touched | Status | Agent notes below |
|---|---|---|---|---|
| S1 | Core seam: provider point, All tab, email log, headers passthrough | core | DONE | § 7.1 |
| S2 | Module skeleton, schema, connections and inboxes settings | module (+ core pin later) | DONE | § 7.2 |
| S3 | IMAP ingest engine | module | DONE | § 7.3 |
| S4 | Send path (Brevo, identity, threading headers, APPEND) | module | DONE | § 7.4 |
| S5 | Inbox UI (rail, list, thread, composer, workflow) | module | DONE | § 7.5 |
| S6 | People, identity resolution, context rail adapters | module | DONE | § 7.6 |
| S7 | Channel providers: contact-form, live-chat, twilio | 3 module repos + module | DONE | § 7.7 |
| S8 | Retention, GDPR, backup, teardown, performance | module | DONE | § 7.8 |
| S9 | Docs, wiki, module art, packaging, release readiness | core + wiki | DONE | § 7.9 |
| S10 | Full review and fixes | all | DONE | § 7.10 |

---

## 7. Stages

### 7.1 S1 - Core seam

**Goal:** every generic thing Unified Inbox needs from core, built so that it earns its place on a
site that never installs Unified Inbox.

**Work:**

1. **`lib/conversations/types.ts`** - the contract in §3.4. Types only, no runtime imports of any
   module.
2. **`lib/conversations/providers.ts`** - resolver that reads installed modules' manifests, picks
   entries with `point === 'core.conversation-provider'`, looks the function up in
   `moduleExtensionPointComponents`, permission-filters it, and returns
   `{ moduleName, id, provider }[]`. Mirror `lib/modules/extension-tabs.tsx` closely - same
   `INSTALLED_MODULE_WHERE` gate, same permission check, same graceful behaviour when a manifest
   mentions an entry the generated registry has not caught up with yet.

   **Server-only flag - this one is a real bug if skipped.**
   `scripts/generate-module-extension-points.mjs` decides what goes into the client-reachable
   `lib/modules/extension-points.public.ts` by one rule: **is the component's file under
   `components/admin/`**. A provider living in `modules/<name>/lib/` therefore lands in the
   *public* map, which drags `imapflow`, the Twilio SDK and the Chatwoot client into a graph a
   public page can reach. That is the client/server graph leak this repo has been bitten by
   before. Add a generic `serverOnly?: boolean` to the `extensionPoints` manifest entry schema and
   have the generator withhold those entries from the public map regardless of where the file
   sits. Name it after the capability, not after any point or module. Confirm afterwards that
   `extension-points.public.ts` contains no provider import.
3. **Core All tab** on the Inbox page. Rendered only when two or more providers resolve. Merged
   list, newest first, channel badge, participant, preview, deep link via `summary.href`. Read
   only - no reply from here. Keep it small; it is a courtesy view, not a product.
4. **Manifest flag `consumesConversationProviders: z.boolean().default(false)`** in
   `lib/modules/manifest.ts`, with a comment explaining it names no module. When any installed
   module sets it: core hides its own All tab, and hides the `core.inbox-tabs` entry of every
   module that also publishes a conversation provider.

   **Suppression is per user, not global.** Resolve the consumer's own tab first: if *this* user
   cannot see it (they lack its permission), suppress nothing for them. Otherwise a user with
   `contact.view` but no `unifiedinbox.view` loses the contact inbox entirely and has no way back
   to their own messages. Test both users.
5. **`sendEmail()` headers passthrough** - add `headers?: Record<string, string>` to
   `EmailPayload` and pass it to both transports (Brevo's `headers` field, nodemailer's `headers`).
   This was added once for Reply Catcher and reverted as dead code; it comes back now because
   Stage 4 is a real consumer. Do not add anything else "while we are in here".
6. **Outbound email log (D13)** - `EmailLog` model per §4.1:
   - edit `prisma/migrations/20260626000000_init/migration.sql` **in place**,
   - add `prisma/core-reconcile/031_email_log.sql`, idempotent (`CREATE TABLE IF NOT EXISTS`,
     `CREATE INDEX IF NOT EXISTS`),
   - write the row from `sendEmail()` on both success and failure, and make a logging failure
     never take the email down with it (wrap, log, carry on),
   - `templateKey` and `moduleName` come from an optional field on the payload, defaulted, so no
     existing call site changes,
   - retention: there is **no existing generic core sweep** to piggyback on. Add a job to
     `CORE_CRON_JOBS` in [lib/cron/jobs.ts](../lib/cron/jobs.ts) alongside the members purge, and
     a route for it. Default 12 months, settable.
4b. **Manifest keys are stored, and stored manifests lag.** `Module.manifest` is rewritten from the
   deployed `cactus.module.json` by `scripts/sync-module-manifests.mjs` at build time, and the
   install-time schema drops fields it does not yet know (this is why `extension-tabs.tsx` has a
   fallback for a missing tab `label`). So a freshly installed module's stored manifest may not
   carry `consumesConversationProviders` until the next deploy. Suppression must **fail safe**:
   flag absent means suppress nothing. Never hide a tab on the strength of a field that might
   simply not have arrived yet.
7. Update [FIELD_NOTES.md](../FIELD_NOTES.md) - new model, new extension point, new manifest key,
   changed email payload.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`, and because core schema changed,
`npm run test:backup-roundtrip` with a real PASS.

**Do not:** build any part of the Unified Inbox module here. Do not add anything to core named
after it. Do not touch contact-form, live-chat or twilio - their providers are Stage 7.

**Notes for later stages:**

> **Done 2026-08-28. All of S1 is in the core working tree, uncommitted, unreleased.**
>
> **Names S2 onwards will need.**
>
> - `lib/conversations/types.ts` - `ConversationChannel`, `ConversationParticipant`,
>   `ConversationSummary`, `ConversationAttachment`, `ConversationMessage`,
>   `ConversationListOptions`, `ConversationListPage`, `ConversationThread`,
>   `ConversationIdentity`, `ConversationProvider`, `ResolvedConversationProvider`. Shape is
>   §3.4's, unchanged, split into named types so a module can import the halves it needs.
> - `lib/conversations/providers.ts` - `CONVERSATION_PROVIDER_POINT` (`'core.conversation-provider'`),
>   `resolveConversationProviders(user): Promise<ResolvedConversationProvider[]>`,
>   `conversationProviderModuleNames(modules)`, `conversationConsumerModuleNames(modules)`.
>   The last two take `{name, manifest}[]` and are pure, so they are testable without a database.
> - `lib/conversations/inbox-tabs.ts` - `ALL_TAB_ID` (`'core-all'`),
>   `resolveInboxTabs(user): Promise<{ tabs: ExtensionTab[]; showAllTab: boolean }>`.
> - `components/admin/InboxAllPanel.tsx` - `InboxAllPanel` (core's All tab, read only).
> - `lib/email/log.ts` - `recordEmailSend(entry)`, `purgeEmailLog()`, type `EmailLogEntry`.
>
> **Decision S2/S5 must honour: `ConversationSummary.href` is ADMIN-ROOT RELATIVE**, e.g.
> `inbox?tab=contact-form&id=42` - no leading slash, no admin path. The admin path is per-site and
> only the rendering page knows it. `InboxAllPanel` drops anything containing `://` rather than
> following it.
>
> **`EmailPayload` additions** (`lib/email/index.ts`): `headers?: Record<string, string>`,
> `templateKey?: string`, `moduleName?: string`. Nothing else changed, and no existing call site
> moved. `sendTemplateEmail` now fills `templateKey` itself and derives `moduleName` from the
> registry key's own namespace (skipping `auth`/`system`/`member`, which are core's). Both
> transports take the headers. `sendViaBrevo`/`sendViaSmtp` now RETURN the provider's message id
> (`string | undefined`) instead of `void` - S4 can read Brevo's id straight off a send if it
> wants, though the log already stores it.
>
> **The `Message-ID` you set is the one that gets logged.** `sendEmail` reads
> `headers['Message-ID']` case-insensitively and writes it to `EmailLog.messageId`, which is
> indexed. That is the join S4's APPEND-loop dedupe (E11) and S3's own-notification folding (E25)
> should use: generate the id, send with it, and later match an inbound message's
> `In-Reply-To`/`References` against `EmailLog.messageId` without needing any new table.
>
> **`EmailLog` is a ledger with no UI.** Model is §4.1's, with `error` truncated to 2,000
> characters. `SiteConfig.emailLogRetentionMonths` (INTEGER, default 12) holds the window and
> `GET /api/cron/email-log/purge` (`0 5 * * *`, in `CORE_CRON_JOBS`) sweeps it. **Deferred
> deliberately: there is no admin box to change that number and no screen that shows the log.**
> Neither is needed until the hub renders a person's timeline, so S6 (or S9's docs pass) should
> pick up whichever of the two it actually wants rather than S1 guessing.
>
> **`serverOnly` is the manifest key, and S7's providers MUST set it.**
> `extensionPoints[].serverOnly?: boolean`. The generator withholds those entries from
> `lib/modules/extension-points.public.ts` regardless of where the file sits. A provider in a
> module's `lib/` without it lands in the public map and drags imapflow / the Twilio SDK / the
> Chatwoot client into a public page's graph. Guarded by a new case in
> `lib/modules/extension-points-public.test.ts`, but that guard can only check entries that
> declare the flag - it cannot know a provider that forgot to.
>
> **The consumer flag is `consumesConversationProviders: true`** at the top level of
> `cactus.module.json`, exactly as §7.1.4 specified. Suppression is per user and fails safe on a
> missing flag; both are covered by tests in `lib/conversations/inbox-tabs.test.ts` (8 of them),
> including E1's two users.
>
> **`ExtensionTab` gained a `moduleName` field** (`lib/modules/extension-tabs.tsx`). Suppression
> needs to know whose tab it is holding, and re-reading every manifest to find out would have been
> a second pass over the same data. Media's tab host is unaffected.
>
> **Contradicted the plan, or worth knowing:**
>
> - §4.1 said the log's retention could be "swept by an existing core cron"; §7.1.6 said there is
>   no such sweep. §7.1.6 is right - there is no generic core purge job to piggyback on, so a new
>   one was added.
> - §7.1.3 said the All tab renders "when two or more providers resolve". Implemented as two or
>   more resolving **for that user**, which is the same rule applied consistently with E1: a user
>   who can see only one channel gains nothing from a merged view of it.
> - The All tab is placed FIRST in the tab strip. When the hub is installed it is suppressed
>   anyway, so S2's `order: 5` still puts the hub's tab first with nothing to fight over.
> - Providers are resolved through `moduleExtensionPointComponents` (the full map) and the
>   resolver shape-checks each one (`list`, `thread`, `channel`); a module publishing something
>   that is not a provider is skipped silently, same as an entry the registry has not caught up
>   with yet.
> - One provider failing inside the All tab costs that channel only - `InboxAllPanel` catches per
>   provider and logs.
>
> **Core version for S2's `requiresCoreVersion`:** `package.json` is still at the version this
> work started on, because S1 committed and released nothing (per the plan's protocol). **The seam
> ships in the NEXT core release**, so `requiresCoreVersion` must be that number - read it off the
> release Chris cuts for this work rather than off `package.json` today.
>
> **Gates, all genuinely green:** `npm run typecheck` clean (not bare `tsc` - §5.5),
> `eslint .` clean, `npm test` **4,060 passed / 100 skipped / 0 failed**,
> `npm run test:backup-roundtrip` **4 passed** against a real throwaway OVH database - a real PASS,
> not a skip. `git grep "modules/unified-inbox" -- ':!modules' ':!wiki' ':!.gitmodules'` is empty,
> and so is a grep for the module's name in any form across core.
>
> **Not done, on purpose:** no wiki page (S9 owns docs), no admin UI for the retention setting or
> the log, nothing touched in contact-form, live-chat or twilio (S7 owns their providers), and no
> commit, push or release.

---

### 7.2 S2 - Module skeleton, schema, connections and inboxes

**Goal:** the module exists, installs, migrates and can be configured. No mail moves yet.

**Work:**

1. Create `modules/unified-inbox/` following the shape of an existing recent module
   (`modules/purchase-orders/` and `modules/live-chat/` are the best references). **Do not create
   the GitHub repo and do not add an entry to `modules.json`** - ask Chris to create
   `cactus-foundation-modules/unified-inbox` when he is ready. Build locally until then.
2. `cactus.module.json`:
   - `name: "unified-inbox"`, `tablePrefix: "uin_"`, `version: "0.1.0"`,
   - `requiresCoreVersion` = the core version S1 shipped in (see S1 notes),
   - `requiresModules: []` - it stands alone,
   - permissions: `unifiedinbox.view`, `unifiedinbox.reply`, `unifiedinbox.manage`,
   - `settingsTabs`: one entry, label "Unified Inbox", permission `unifiedinbox.manage`,
   - `extensionPoints`: one `core.inbox-tabs` entry, label "Unified Inbox", order 5 (it should sit
     first),
   - `consumesConversationProviders: true`,
   - `requiredEnvVars`: `ENCRYPTION_KEY` (required), `CRON_SECRET` (optional),
   - `cronJobs`: `/api/m/unified-inbox/cron/sync` on `15 * * * *`,
   - `teardown`: every `uin_` table, children before parents.
   - `navEntries: []` - no sidebar link, ever.
3. `migrations/001_initial.sql` - the full schema from §4.2. Idempotent throughout
   (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN
   duplicate_object`). Indexes at minimum on: `uin_threads(inbox_id, last_message_at DESC)`,
   `uin_threads(status, last_message_at DESC)`, `uin_threads(person_id)`,
   `uin_messages(thread_id, sent_at)`, `uin_messages(message_id_header)`,
   `uin_person_identities(value)` unique, `uin_record_links(person_id)`,
   `uin_record_links(module_name, record_type, record_id)`.
4. `lib/db.ts` - typed raw-SQL helpers over those tables, in the style of the other modules'
   `db.ts`. Everything else in the module goes through it.
5. Credential storage - `encryptSecret` / `decryptSecret` / `tryDecryptSecret` from
   `lib/crypto/secrets.ts`. Never store a password or API key in plain text. Never return a
   decrypted secret to the browser; the settings UI shows "set" or "not set" and lets the user
   replace it.
6. Settings tab: connections list (add/edit/delete, **Test connection** button that opens IMAP,
   lists folders and reports in plain English), inboxes list (address, which connection, folder,
   catch-all, sending identity, signature, "copy replies to my Sent folder" toggle, per-inbox
   staff access), and the module settings (backfill months, retention, attachment behaviour,
   auto-link on/off).
7. Access control helper - `canViewInbox(user, inboxId)` / `canReplyToInbox(...)` implementing
   D16, used everywhere from Stage 3 onwards. Get this right once, here.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`, `npm run test:backup-roundtrip` real PASS
(new tables). Light and dark check on the settings tab.

**Do not:** write the sync engine, the send path or the inbox UI. Do not add the module to
`modules.json`.

**Notes for later stages:**

> **Done 2026-08-28. All of S2 is in `modules/unified-inbox/`, a module repo of its own
> (`cactus-foundation-modules/unified-inbox`, which now exists). Nothing in core changed, and the
> module is deliberately NOT in `modules.json` - pinning a skeleton that cannot fetch mail into
> every install is the wrong order round, and the generators ignore an unregistered directory.**
>
> **Manifest facts later stages depend on.** `requiresCoreVersion` is `0.5.1383`, the release S1
> shipped in. `consumesConversationProviders: true` is set already, so the moment this module is
> installed core stands down: no All tab, and no tab for any module publishing a provider. S7's
> providers are what make that a fair trade, so until then an install would hide contact-form's and
> live-chat's tabs behind a hub that cannot yet show their messages. Worth remembering when the
> module is first pinned.
>
> **Schema: §4.2 as written, with five deliberate differences.**
>
> - `uin_connections.extra_folders TEXT[]` added - the folders the owner nominates beyond the ones
>   we can work out (E2 needs somewhere to keep them).
> - `uin_sync_state` cursors are **BIGINT**, not integer: IMAP UIDVALIDITY is a 32-bit UNSIGNED
>   value and does not fit in a Postgres INTEGER. `uin_processed_messages.uid` is BIGINT for the
>   same reason.
> - `uin_sync_state.locked_until TIMESTAMP(3)` added for E6's per-connection lock. Nothing takes it
>   yet.
> - `uin_attachments.media_id` is called **`media_key`**, because these never get a `Media` row -
>   they are objects under this module's own key prefix, invisible to the library by construction
>   (see S3's note in §7.3.4). A column called `media_id` would have invited exactly the row that
>   must never exist.
> - `uin_threads` unique `(provider_module, external_id)` is a **partial** index
>   (`WHERE both IS NOT NULL`), or every email thread would collide on `(NULL, NULL)`.
>
> **NO `DO $$ ... $$` blocks in the migration, and none may be added.** The backup round-trip test
> skips any module whose migrations contain `$$` (`readModuleSchemas` in
> `lib/backup/roundtrip.test.ts` - `splitSqlStatements` is not dollar-quote aware). The first cut of
> this migration used them for the CHECK constraints, the gate passed, and `unified-inbox` was not
> in the list of schemas it built - a green run proving nothing about the new tables. Every CHECK is
> inline in its `CREATE TABLE` instead, which is just as idempotent under `CREATE TABLE IF NOT
> EXISTS`. **Check the `[roundtrip] module schemas built:` line names unified-inbox before believing
> a pass**, and if a future migration needs `$$`, that is a change to the test, not a shrug.
>
> Same reason `requiresModules` must stay empty: a module that declares one is also excluded.
>
> **`lib/db.ts` exports.** Connections: `listConnections`, `getConnection`, `getConnectionSecret`
> (encrypted string, server only), `createConnection`, `updateConnection`, `deleteConnection`,
> `recordConnectionSync(id, 'ok'|'error', error)`. Inboxes: `listInboxes`, `getInbox`,
> `createInbox`, `updateInbox`, `deleteInbox`, `addressTakenBy(address, exceptId?)`, type
> `InboxInput`. Access: `listInboxAccess(inboxId)`, `listAllInboxAccess()`, `setInboxAccess`.
> Settings: `getSettings()`, `updateSettings(partial)`.
>
> Secrets go IN as plaintext and come back OUT as booleans (`hasPassword`, `hasBrevoKey`,
> `hasSmtpPassword`) - `lib/db.ts` encrypts on the way in and never returns a decrypted value.
> `undefined` on a secret field means "leave it alone", `''` or `null` means "clear it". Mapped
> types are in `lib/types.ts` (`Connection`, `Inbox`, `InboxAccess`, `UnifiedInboxSettings`).
>
> **Threads, messages, people and the sync ledger have their tables but no helpers.** That is on
> purpose: S3 writes them, and inventing the write path now would only mean writing it twice.
>
> **Access control is settled, in `lib/access.ts`.** `canViewInbox(user, inboxId)`,
> `canReplyToInbox(user, inboxId)`, `visibleInboxIds(user, allInboxIds)`, and the pure
> `decideInboxAccess(rows, userId, perms)` the tests exercise. The rule: an inbox with NO access
> rows is open to anybody with `unifiedinbox.view`; an inbox with ANY rows is open to the people
> named on them and nobody else. `unifiedinbox.manage` passes any list, because whoever edits the
> guest lists can add themselves in two clicks. **E17: search and the All view must filter with
> `visibleInboxIds` INSIDE the query, never on the results.**
>
> **How a connection's folders are discovered** (`lib/imap.ts`): `openMailbox(credentials)` opens
> an `ImapFlow`, `listFolders(client)` calls `client.list()`, drops `\Noselect` entries and tags
> each folder with a `role` of inbox/sent/archive/junk/trash/drafts - from SPECIAL-USE where the
> server offers it, from the folder's own name where it does not (iCloud does offer it). The
> settings screen's Test connection button runs `testConnection(id)`, which returns
> `{ ok: true, folders }` or `{ ok: false, error }` and NEVER throws: `explainImapError` turns the
> handful of failures that actually happen into a sentence an owner can act on. Reuse both in S3
> rather than opening connections by hand, and note `credentialsForConnection(id)` is the only
> place a password is decrypted.
>
> **Routing already exists and is tested** (`lib/addresses.ts`): `routeToInbox(headers, inboxes)`
> implements D11 - delivered-to, then To, then Cc, then the catch-all - and returns `matchedOn` so
> "why did this land here?" has an answer. Also `normaliseAddress` (strips display names, lower
> cases), `parseAddressList` (quote-aware split), `addressDomain`, `isValidAddress`. Addresses are
> stored normalised; compare normalised or the routing table will disagree with itself.
>
> **Routes** (all under `/api/m/unified-inbox/`): `admin/settings` GET+PATCH (GET returns
> connections, inboxes, access, settings, staff list and `encryptionReady` in one go),
> `admin/connections` GET+POST, `admin/connections/[id]` PATCH+DELETE,
> `admin/connections/[id]/test` POST, `admin/inboxes` GET+POST, `admin/inboxes/[id]` PATCH+DELETE,
> `admin/inboxes/[id]/access` GET+PUT. Every one checks `unifiedinbox.manage`. The inbox body
> schema is shared from `lib/validation.ts` (`InboxBody`, `InboxPatchBody`) so create and edit
> cannot disagree.
>
> **`cron/sync` exists as a stub** and answers 200 with `collected: 0`. The manifest declares the
> path (`15 * * * *`), so it has to answer from install; S3 replaces the body. It already does the
> `CRON_SECRET` bearer check every other cron route makes.
>
> **`components/admin/InboxPanel.tsx` (`UnifiedInboxPanel`) is a placeholder** - it lists the
> inboxes this user may see and says reading mail arrives later. S5 replaces it wholesale; the tab,
> its permission and its place in the strip are the real part. Panels get
> `{ searchParams?: Record<string, string> }` from core's Inbox host.
>
> **Not done, on purpose:** no sync engine, no send path, no inbox UI, no people resolution, no
> providers, no wiki page (S9 owns docs), no `modules.json` entry, and nothing at all in core.
>
> **Gates:** `npm run typecheck` clean, `eslint .` clean, `npm test` **4,080 passed / 100 skipped /
> 0 failed** (S1's 4,060 plus 20 new ones covering routing and access), `npm run test:backup-roundtrip`
> **4 passed** against a real throwaway OVH database with `unified-inbox` named in the schemas it
> built. Core leak grep is empty.
>
> **One gate not run as written:** the settings tab has not been rendered in a browser in light and
> dark. It could not be - the module is not in `modules.json`, and the only database this repo can
> reach is the live Deskwell site, which is not somewhere to install a half-built module to look at
> it. Every colour in the tab is a semantic token (`--color-text-muted`, `--color-border`,
> `--color-danger`), all of which core defines for both themes, and every surface is an existing
> core class (`card`, `field`, `alert-info`, `alert-danger`, `btn`), so there is nothing new to
> theme - but that is reasoning, not a render. **Owed at S5**, when there is a real inbox screen
> worth looking at, along with E27's CSP check for the sandboxed iframe. Reviewed and agreed as a
> deliberate deferral rather than a miss: installing a half-built module against the live Deskwell
> database to look at a settings form is not a trade worth making.

---

### 7.3 S3 - IMAP ingest

**Goal:** mail arrives, threads correctly, lands in the right inbox, and never lands twice.

**Work:**

1. `lib/imap.ts` - connection handling with `imapflow`. Start from
   `modules/contact-form-reply-catcher/lib/imap.ts`, which already solves folder auto-detection via
   SPECIAL-USE with a common-name fallback. Connections must be closed on every path.
2. `lib/sync.ts` - the engine. Per connection, per folder:
   - read `uin_sync_state`; if `uidvalidity` changed, treat every cursor as invalid and re-seed
     (log it loudly - this is the case that silently duplicates a mailbox if fudged),
   - **forward pass**: fetch UIDs above `last_seen_uid` in bounded batches,
   - **backfill pass**: walk downwards from `backfill_cursor_uid` towards the D6 window, a bounded
     batch per tick, until `backfill_complete`,
   - hard wall-clock budget well inside 25s, checked between batches, not inside one,
   - every batch committed before the next starts. Interrupt at any point and the next tick
     resumes without loss or repetition.
3. Parsing with `mailparser`: headers, text, HTML. **Sanitise the HTML** before storing - use the
   same sanitiser core already trusts (jsdom is pinned at `^26` for a reason; do not swap it).
   Strip remote images by default and offer "show images" in the UI at Stage 5. Store a snippet
   for the list view so the list never reads bodies.
4. Attachments: record metadata and the IMAP part id at sync time. Do **not** download bytes
   during sync (D17, and the 25s budget). Fetch lazily on open, then fill `media_id`.

   **Attachments must not land in the browsable media library.** A customer's invoice pulled from
   `accounts@` appearing in the media picker for anyone with media permission defeats the whole of
   D16. Good news, checked: `uploadMedia` in `lib/media/upload.ts` **writes the object only - it
   does not create a `Media` row**. The caller does. So store attachments under our own key prefix
   and never mint a library row, and they are invisible to the library by construction. Serve them
   through a module route that re-checks the inbox ACL on every request - signed, short-lived,
   never a public URL.

   **But then publish a media usage provider.** `lib/media/reconcile.ts` classifies an object with
   no row and nothing pointing at it as **orphaned**, and orphans can be deleted by the
   storage-check repair - which would wipe every email attachment on the site. An object with no
   row that something vouches for is classified **claimed** and is never offered for deletion, and
   the way to vouch for it is a `core.media-usage-provider` entry, exactly as purchase-orders and
   the 3D module already do. Not optional.
5. Routing (D11): pick the inbox by matching `Delivered-To`, then `To`, then `Cc`, against
   `uin_inboxes.address`, case-insensitively; unmatched mail goes to the catch-all inbox; if there
   is no catch-all, it is recorded against the connection's default inbox and flagged so the owner
   can see it happened.
6. Threading: `In-Reply-To` and `References` against `uin_messages.message_id_header` first. If
   that finds nothing, fall back to normalised subject (strip `Re:`/`Fwd:` and the like) plus
   participant-address overlap plus a bounded time window. Record which route matched, so a
   mis-thread can be diagnosed rather than guessed at.
7. Dedupe: **`message_id_header` is the identity of a message**, per connection.
   `uin_processed_messages` unique on `(connection_id, folder, uid)` only prevents re-reading the
   same location - it does not decide whether we already hold the message. A message that exists
   in two folders, or that the owner moved between folders, is one message
   (§5.10 items E2, E3 and E11). Mail with no `Message-ID` at all falls back to a content hash of
   date, sender and subject. Reply Catcher's history contains a bug where the newest message was
   re-filed on every poll; do not reproduce it. Write a test for it.
8. Folders: ingest `INBOX`, the Sent folder (so mail the owner sent from their phone appears in
   the thread, marked outbound), the archive, and any extra folders the owner nominates in
   settings. Inbox-only sync loses every email the owner files from their phone before the next
   tick - see §5.10 item E2, which is the single most likely way this module silently loses real
   customer mail.
9. Cron route `/api/m/unified-inbox/cron/sync` (bearer `CRON_SECRET`, same check every other cron
   route makes) and an admin **Check now** route with a one-minute cooldown.
10. Status surfaced in settings: last sync, per-connection outcome in plain English, backfill
    progress ("2015 of about 4000 messages so far").

**Tests (real ones, in the module):** threading fallback, subject normalisation, delivered-to
routing including catch-all, dedupe across two consecutive runs, uidvalidity reset.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`.

**Do not:** send anything. Do not mutate the mailbox in any way at this stage - no flags, no moves,
no deletes. Read only.

**Notes for later stages:**

> **Done 2026-08-28. All of S3 is in `modules/unified-inbox/` (module repo, version bumped to
> 0.1.1 in both `package.json` and `cactus.module.json`). Nothing in core changed, and the module
> is still deliberately NOT in `modules.json`.**
>
> **Schema: a NEW file, `migrations/002_ingest.sql`.** 001 was not touched. What it adds:
>
> - `uin_messages`: `connection_id`, `imap_folder`, `imap_uid` (BIGINT), `thread_match`,
>   `routed_on`, `auto_kind`.
> - **`uin_messages` UNIQUE `(connection_id, message_id_header)`**, partial on both being non-null.
>   This is the constraint the whole stage rests on - see identity below.
> - `uin_attachments`: `media_provider`, `media_url` (the key alone cannot fetch the bytes back).
> - `uin_connections`: `locked_until` (E6's per-account lock lives here, not on `uin_sync_state` -
>   the lock is per account, and a sentinel folder row would have been a fiction), `auth_failures`.
> - `uin_sync_state`: `total_estimate`, `collected` - both BIGINT, for the progress line.
>
> **Two harness traps, both sprung from a COMMENT, both worth knowing before writing 003.**
>
> **The `$$` trap bit again, from inside a comment.** The first cut of 002 carried a comment
> *warning* about `DO $$` blocks, which contains `$$`, which excluded the whole module from the
> round-trip harness - a green-looking gate that had not built the new columns at all. The rule is
> not "no dollar-quoted blocks", it is **no `$$` anywhere in the file, comments included**. Check
> the `[roundtrip] module schemas built:` line names `unified-inbox` before believing any pass.
>
> **And `lib/backup/schema-coverage.test.ts` failed on the same file for the mirror reason.** It
> flags any module migration that matches `/CREATE\s+TABLE/i` but yields no parsed column - drift
> detection for its own regex. 002 is ALTER-only and merely *mentioned* the phrase in a comment,
> which was enough. In an ALTER-only migration, do not write those two words anywhere in the file,
> comments included.
>
> **Identity, and the three edge cases it settles.** A message IS its `message_id_header`, per
> connection. `(connection_id, folder, uid)` in `uin_processed_messages` only records that a
> LOCATION has been read.
>
> - E2/E3: the same mail in INBOX and in Archive, or moved between them from a phone, hits the
>   unique index and is recorded as another location of the message we already hold.
> - E11: before filing anything, the engine looks for an existing `direction = 'out'` row with that
>   Message-ID (`findOutboundByMessageId`). S4's appended copy of its own reply therefore comes back
>   as "already ours" - it gets a location attached so its attachments can be fetched, and nothing
>   is filed twice. **S4 must store the Message-ID it generates on the outbound row, without a
>   connection id, and this works.**
> - Mail with no `Message-ID` at all gets `contentIdentity()` - a hash of date, sender, normalised
>   subject and size, shaped like an address and suffixed `@no-message-id.unified-inbox`. One
>   identity column, two kinds of identity, and `isSyntheticIdentity()` tells them apart.
> - The Reply Catcher bug (newest message re-filed every poll) is `filterNewUids` in
>   `lib/sync-plan.ts`, with the test that names it. `n:*` always returns the newest message again;
>   it is dropped by the cursor check and by the ledger check, deliberately twice.
>
> **Folders (E2).** `planFolders` reads INBOX, every Sent folder, every Archive folder, plus
> anything the owner nominated in `extra_folders` or pointed an inbox at. **Junk, Trash and Drafts
> are never read** - spam would mint a conversation each, and a draft is not a message. A folder
> found in the Sent role is `kind: 'sent'`, and anything found there is filed `direction = 'out'`
> so a thread shows the reply the owner wrote on their phone.
>
> **Budgets settled on.** Cron `CRON_BUDGET_MS = 18_000` (the dispatcher allows 25s), manual Check
> now `MANUAL_BUDGET_MS = 45_000` in a route with `maxDuration = 60` (E9), `BATCH_SIZE = 15`
> messages per fetch. The clock is checked BETWEEN batches; every batch writes its cursor before the
> next starts, so the run is resumable at any instruction.
>
> **First sight of a folder seeds at the top, it does not read forwards from UID 1.** A new folder
> gets `last_seen_uid = uidNext - 1` and `backfill_cursor_uid = uidNext`, so the forward pass only
> ever collects new arrivals and history is the backfill's job, walking downwards a batch a tick
> until it reaches the owner's backfill window or UID 1. Reading forwards from 1 would spend every
> tick on the oldest mail in the account while today's went unread.
>
> **UIDVALIDITY change re-seeds and logs loudly** (`applyUidValidity`), and the Message-ID dedupe is
> what stops the re-read becoming a duplicated mailbox.
>
> **Threading.** `In-Reply-To`, then `References` newest-ancestor first, then a fallback needing all
> three of: matching `subject_normalised`, an overlapping participant address, and a message within
> `HEURISTIC_WINDOW_DAYS = 30`. Same inbox only. Which route matched is stored in
> `uin_messages.thread_match` ('in-reply-to' | 'references' | 'heuristic' | 'new'), and the routing
> header that chose the inbox in `routed_on`.
>
> **Subject normalisation** is `normaliseSubject()`: strips repeated `Re:`/`Fwd:`/`AW:`/`SV:`/
> `RE[2]:` prefixes and a leading `[list-tag]`, collapses whitespace, lower cases. Stored on the
> thread, so the fallback is one indexed lookup.
>
> **E7 handled:** `classifyAutomated()` marks an out-of-office, a DSN bounce or bulk/list mail in
> `auto_kind`, and those never mark a conversation unread. They still land on the thread - the owner
> wants to see that a message bounced - they simply do not lie about the customer having replied.
>
> **Routing.** Inbound uses S2's `routeToInbox` unchanged. Outbound uses a new
> `routeSentToInbox(from, headers, inboxes)` in `lib/addresses.ts`: the From line wins, because the
> recipient of our own sent mail is a customer and matches no inbox. `matchedOn` gained `'from'`.
> Mail that matched nothing and had no catch-all is stored with `routed_on = 'none'` and counted by
> `unroutedCount()`, which the settings screen shows as a plain-English notice - never silent.
>
> **Attachments (E4), and the bit that is not optional.** Metadata and a part index are recorded at
> sync time; bytes are fetched only when somebody opens one, then cached under
> `<media prefix>/unified-inbox/<messageId>/<attachmentId>-<name>`. **No `Media` row is ever
> minted**, so they cannot appear in the library or the picker. `lib/media-usage-provider.ts`
> publishes `core.media-usage-providers` (`unifiedInboxMediaUsageProvider`) returning every stored
> key and url, so the storage check counts them as CLAIMED rather than orphaned - without it the
> storage-check repair would delete every email attachment on the site. That entry deliberately does
> **not** set `serverOnly`: `getMediaUsageProviders()` reads the PUBLIC extension-point map, so a
> withheld entry would be invisible and the objects would read as orphans again. The file imports
> only `./db`, so nothing drags imapflow into a public graph.
>
> Serving is `GET /api/m/unified-inbox/attachments/[id]`: session required, `unifiedinbox.view`
> required, then `canViewInbox` for the message's own inbox on every request (a thread that landed
> in no inbox needs `unifiedinbox.manage`). Always `Content-Disposition: attachment`, `no-store`,
> `nosniff`. No storage url ever reaches a browser, so no signed-url expiry to get wrong.
>
> **HTML.** `prepareInboundHtml()` runs core's `sanitizeEmailHtml` (jsdom-backed DOMPurify, pinned
> ^26) and then parks remote image addresses on `data-uin-remote-src`, leaving the tag with no
> `src`. **S5 renders that attribute back into a `src` only when the reader presses "show images",
> and still inside the sandboxed iframe** (E16, and E27's CSP entry is S5's).
>
> **Routes added:** `cron/sync` (real now, `CRON_SECRET` bearer, `maxDuration = 60`),
> `admin/check-now` POST (`unifiedinbox.manage`, optional `connectionId`, 60s cooldown per account),
> `attachments/[id]` GET. `admin/settings` GET gained `collection` (per-account progress) and
> `unrouted`.
>
> **New `lib/db.ts` exports S4 and S5 will want:** `getSyncState`, `listSyncState`, `saveSyncState`,
> `acquireConnectionLock`/`releaseConnectionLock`, `recordAuthFailure`/`clearAuthFailures`/
> `getAuthFailures`, `getProcessedUids`, `markLocationProcessed`, `findMessageByIdentity`,
> `findOutboundByMessageId`, `attachLocation`, `threadsForMessageIds`, `candidateThreads`,
> `createThread`, `insertMessage`, `touchThread`, `insertAttachment`, `getAttachment`,
> `listAttachmentsForMessage`, `recordAttachmentStored`, `listAttachmentStorageRefs`,
> `collectionStats`, `unroutedCount`. Engine entry points are `syncConnection(id, {budgetMs})` and
> `syncAllConnections({budgetMs})` in `lib/sync.ts`.
>
> **Deliberately deferred, and why:**
>
> - **No people or organisations are created.** `uin_threads.person_id` stays null. That is S6's, and
>   E8 (junk minting people) is genuinely solved by not creating any yet plus never reading Junk.
> - **E5 not verified against a real iCloud alias.** The plan says to check whether iCloud sets
>   `Delivered-To` on custom-domain alias mail before building on it. There is no mailbox on this
>   machine to check against and the only live site is a customer's, so the fallback chain was
>   built to cope either way: `Delivered-To`, `X-Delivered-To`, `Envelope-To`, `To`, `Cc`,
>   catch-all, then a visible unrouted count. **Somebody with the real account should still look**,
>   and if `Delivered-To` is absent the answer is already the fallback rather than a rebuild.
> - **`attachment_fetch = 'always'` behaves as `'lazy'`.** Pulling every attachment on an account
>   through a 25 second cron slice is not a plan; the setting is honoured for `'never'` (nothing is
>   fetched) and 'always' currently means the same as lazy. Worth either implementing properly in
>   S8 with its own budget or renaming the option.
> - **Reply Catcher's two-pollers guard is S7's** (§5.7) and is not here.
> - **E25 (the site's own notification mail duplicating a form submission) is S7's** and is not
>   here. The join it needs exists: `EmailLog.messageId` against an inbound `In-Reply-To`.
> - Nothing in `FIELD_NOTES.md`, no wiki page: the module is not in `modules.json` and S9 owns docs.
>
> **Gates:** `eslint .` clean. `npm test` **4,149 passed / 100 skipped / 1 failed**, and
> `npm run typecheck` has **one error** - both of them in `modules/purchase-orders`
> (`components/puck/po-doc-style.test.tsx`, and `lib/portal-view.test.ts` on a `proformaRequired`
> that is now optional), which another agent has open in this shared tree right now. Nothing in
> `modules/unified-inbox` errors or fails: typecheck was clean end to end earlier this evening,
> before those files changed underneath it, and the module's own 90 tests all pass
> (`npx vitest run modules/unified-inbox`). S2's 4,080 plus 70 new ones covering threading, sync
> planning, inbound HTML and sent-mail routing.
>
> **`npm run test:backup-roundtrip`: 3 passed, 1 failed, and the failure is not this stage's.** The
> real round-trip - dump, restore, byte-identical comparison - **passed with `unified-inbox` named
> in `[roundtrip] module schemas built:`**, so every new column type in 002 survives a backup. The
> test that fails is the harness's own coverage assertion, "had module tables and module counters in
> front of it": it wants at least one module SEQUENCE in the fixture, and **every module that owns a
> sequence is excluded from the harness** - `shop` and `purchase-orders` by the `$$` rule (both have
> had `DO $$` blocks in their migrations for months), `quote-for-shop` because it declares
> `requiresModules`. Unified Inbox creates no sequence, so it cannot affect that count either way -
> and the assertion failed identically on the earlier run when this module was excluded altogether.
> **A red module-coverage assertion is often not yours.** It depends on whichever OTHER modules
> happen to be includable in the tree at that moment, so a colleague with a migration half-written
> turns it red for everybody. That is exactly what happened here: `purchase-orders` owns the
> sequences the assertion needs and somebody had its migrations mid-edit. Check whether anybody
> else has a migration open before assuming it is your stage.
>
> **Somebody should decide whether that skip rule gets fixed** (making `splitSqlStatements`
> dollar-quote aware) rather than leaving the counter half of the gate permanently dark, but it is a
> core harness question, not an S3 one.
>
> **Not rendered in a browser.** Same reason as S2: the module is not in `modules.json` and the only
> reachable database is the live Deskwell site. The settings additions are one paragraph and two
> lines of muted text using existing core classes and tokens. Still owed at S5, along with E27.

---

### 7.4 S4 - Send

**Goal:** a reply leaves the building, threads properly at the other end, and is recorded.

**Work:**

1. `lib/send.ts`:
   - build the message: per-inbox `from_name` and address, signature, quoted original for replies,
     `Reply-To` where the inbox needs it,
   - generate and store our own `Message-ID`; set `In-Reply-To` and `References` from the thread's
     history, using the core headers passthrough from S1,
   - send through core `sendEmail()` using the site's Brevo key, or the inbox's own key/SMTP when
     overridden (D3),
   - write the outbound `uin_messages` row **before** the network call with
     `delivery_status = 'sending'`, then settle it. A crash mid-send must never lose the fact that
     we tried.
2. Attachments: from the media library by id, or a fresh upload. Enforce the 10MB ceiling **up
   front in the UI**, and never silently drop one (§5.2).
3. Optional `IMAP APPEND` to the mailbox's Sent folder when `append_to_sent` is on (D4). This is
   the first and only place the module writes to a mailbox - guard it, and make the failure
   non-fatal: the email has already gone, and a failed APPEND must not read as a failed send.
4. Forward, including original attachments.
5. Compose new (D12): to a person, or to a record ("email the supplier on PO-1234"), with the
   record's document attached where the owning module exposes one. Record the link in
   `uin_record_links`.
6. Bounce and failure handling: a Brevo failure surfaces on the message in the thread, in plain
   English, with a retry button. No silent failures anywhere.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`. Send tests are unit-level against a mocked
transport; do **not** send live mail to real addresses from a dev machine.

**Do not:** build the UI beyond what you need to exercise the path - Stage 5 owns the composer's
appearance.

**Notes for later stages:**

> **Done 2026-08-28. S4 is a TWO-REPO stage: `modules/unified-inbox/` (module repo, version
> 0.1.2 in both `package.json` and `cactus.module.json`) AND core (`0.5.1387`). The module is
> still deliberately NOT in `modules.json`.**
>
> ## D3 is met in full. Core changed to make it so.
>
> **The core change, decided by Chris mid-stage and built here.** `EmailPayload` gained two
> additive optional fields in `lib/email/index.ts`, no call site moved, nothing named after this
> module:
>
> - `from?: EmailSender` - `{ name?: string; address: string }`. `resolveSender()` prefers it over
>   `getEmailConfig()` in **both** transports. An address given without a name keeps the site's
>   display name, because a bare address in a From line reads as spam to a person and to a filter.
> - `transport?: EmailTransport` - `{ provider: 'brevo'; apiKey }` or
>   `{ provider: 'smtp'; host; port?; user?; pass? }`. A new `dispatch()` picks the payload's
>   transport when there is one and the environment's otherwise, so **every existing caller behaves
>   exactly as it always did**.
>
> Two consequences worth knowing:
>
> - **A payload carrying its own `transport` now satisfies the `isEmailConfigured()` guard.**
>   Credentials being tested before they are saved are precisely the case where the environment is
>   still empty, and the old guard would have refused them.
> - **`sendTestEmailWithCredentials` now goes through `sendEmail`** instead of calling the
>   transports directly, so the settings "send a test" button finally writes an `EmailLog` row. It
>   was the one send on the whole site that left no trace - which is the send somebody is most
>   likely to go looking for afterwards, because it is the one they make when something is already
>   wrong. **This is what makes the change earn its place on a site that never installs this
>   module.** 13 tests in `lib/email/send.test.ts`.
>
> **What the module now does with it** (`lib/transport.ts`, the file S4 predicted would be the only
> one to change, and was):
>
> - `sendingIdentity(inbox)` gives core the `from`. **A customer who wrote to `hi@` is answered by
>   `hi@`, and a supplier who wrote to `marcus@` by `marcus@`** - which is the whole of D3 and the
>   reason per-inbox sending identities exist at all.
> - `transportForInbox(inbox)` returns the inbox's own Brevo key or SMTP account when it has one,
>   null for the site's. The secret is decrypted **here and nowhere else**, held for one send, and
>   never returned to anything that could serialise it. `getInboxSecrets(id)` in `lib/db.ts` hands
>   them over still encrypted for exactly that reason. A secret that will not decrypt returns null
>   and falls back to the site's account rather than throwing - the encryption key has changed under
>   it, and falling back sends the email where an exception would lose it.
> - `Reply-To` is still set to the inbox address. Belt and braces now rather than the mechanism: it
>   means a reply comes back to the right place even if a receiving server rewrites the sender,
>   which some do when a domain is not fully set up.
>
> **E15 is DONE, not deferred.** The plan assigns it to S4 and the reason for deferring it - that
> checking an identity we do not send under is theatre - expired with the change above.
> `lib/sender-check.ts` asks Brevo whether it will send as an address: an exact sender match, or an
> authenticated domain covering it (which is how most sites are actually set up, so checking only
> the sender list would tell people to fix something already working). Run when an inbox is
> **saved**, from the create and update routes, returned as `senderWarning` and shown as one line in
> the settings tab. It never blocks the save, and a service that will not answer is `unknown`
> rather than a failure - an inbox that cannot send yet still collects mail perfectly well. The
> timing is the point: when the inbox is saved the person present is the owner with Brevo open in
> another tab and five minutes' work ahead of them; when the first reply fails the person present is
> a colleague trying to answer a customer, who can do nothing about it at all.
>
> ## The exact header set emitted, as the plan asked
>
> `outgoingHeaders()` in `lib/compose.ts` emits **these three and nothing else**, and there is a
> test asserting the key set exactly so a fourth cannot appear by accident:
>
> - `Message-ID: <uin.{nanoid21}@{sending inbox's domain}>` - always.
> - `In-Reply-To: <parent Message-ID>` - only when answering something.
> - `References: <oldest> <...> <parent>` - space separated, oldest first, only when there is a
>   chain. Capped at 20: the first is kept because it identifies the conversation, then the most
>   recent 19, because a year-long thread grows a header some servers truncate or refuse.
>
> **Message-IDs are stored WITHOUT angle brackets and emitted WITH them.** That is not cosmetic -
> S3's `cleanMessageId` strips brackets on the way in, so a stored id with brackets would never
> compare equal to an inbound `In-Reply-To` and every reply would start a new conversation.
> `messageIdHeader()` is the only thing that puts them back.
>
> ## What Brevo does to headers in transit - AND THE PART THAT IS NOT VERIFIED
>
> Core passes `payload.headers` straight into Brevo's `headers` field and into nodemailer's
> `headers`, so what we set is what is asked for. **What Brevo does with a custom `Message-ID` has
> NOT been verified from this machine** - no live mail was sent, per the stage's own gate, and
> there is no test mailbox to send to. Brevo is known to return its own `messageId` from the API
> and may replace ours on the way out.
>
> **That risk is defended rather than assumed away, in two places:**
>
> 1. **The copy filed in Sent is built by us** (`lib/mime.ts`), so it carries OUR `Message-ID`
>    whatever Brevo did to the one that travelled. E11's dedupe therefore holds either way: the
>    sync engine meets the appended copy, `findOutboundByMessageId` recognises it, and nothing is
>    filed twice. There is a test asserting the appended copy's `Message-ID` equals the one stored
>    on the row.
> 2. **`threadsForMessageIds` in `lib/db.ts` now also matches `provider_message_id`.** If Brevo
>    does rewrite the id, the customer's client quotes BREVO's id back at us in `In-Reply-To`, and
>    matching only on ours would start a fresh thread for every single reply. Both handles now lead
>    to the same conversation. `provider_message_id` is stored through `cleanMessageId` for the
>    bracket reason above.
>
> **Somebody with a real mailbox should still send one reply and look at the raw headers of what
> arrives.** If Brevo preserves our `Message-ID`, defence 2 is harmless redundancy. If it does not,
> defence 2 is the only thing keeping threading alive, and the note above is what tells the next
> person why that UNION is in the query. Note also that `deliver()` currently returns
> `providerMessageId: null` - `sendEmail` records Brevo's id on the `EmailLog` row but does not
> hand it back to the caller. Retrieving it means either reading the log row back or having
> `sendEmail` return it, and that is a second small core question rather than something to fudge.
>
> ## The order of operations, which is the whole safety story
>
> `sendMessage()` in `lib/send.ts`, in this order, with a test asserting the sequence:
>
> 1. **Everything refusable is refused first** - no inbox, no recipient, a bad address, no subject,
>    an attachment that will not fit. Nothing has been written and nothing sent, so the person
>    fixes it and presses Send again at no cost.
> 2. **The row is written**, `delivery_status = 'sending'`, before the network call. A crash from
>    here on leaves evidence that we tried; writing it afterwards would lose an email the customer
>    has already received.
> 3. **Send.**
> 4. **Settle** - `'sent'` with the provider id, or `'failed'` with a sentence and a retry.
> 5. **Copy to Sent**, which is allowed to fail (below).
>
> ## Schema: a NEW file, `migrations/003_send.sql`. 001 and 002 were not touched.
>
> - `uin_messages.idempotency_key` TEXT + partial UNIQUE index. **E14 needs a token from whoever
>   pressed the button.** The pre-written 'sending' row can only guard a send once something has
>   created it, and a double-clicked Send is two requests that would each create their own. So the
>   composer generates the key, `insertOutboundMessage` returns `{ row, created }`, and
>   `created: false` means "this exact press already happened, hand back the first row and send
>   NOTHING". **S5: generate one token per composer session and reuse it across retries of the same
>   press; a fresh token per click defeats the whole mechanism.**
> - `uin_messages.append_status` / `append_error` - what became of the Sent-folder copy.
> - `uin_messages.inbox_id` - which inbox a message was sent FROM. An outbound message has no
>   folder or UID to work backwards from, and the thread's inbox is not always the answer (a thread
>   can be moved, and an unrouted thread has no inbox at all). Identity, signature and - most of
>   all - who may read it afterwards all hang off this.
> - `uin_messages.reply_to` - **and this one is a fix to S3, not an addition to it.** E13 says
>   honour the sender's `Reply-To`, and **S3 never stored it**, so E13 was unimplementable. The
>   column is added here and `lib/sync.ts` now writes `parsed.replyTo` on the way in. Mail already
>   collected has NULL and falls back to `From`, which is the right answer for the overwhelming
>   majority of it.
> - Partial index on `(delivery_status, created_at) WHERE delivery_status = 'sending'` - anything
>   sitting in 'sending' longer than a send takes is a crash between the row and the network call,
>   and somebody has to be able to find those. **Nothing sweeps them yet; that is S8's if it wants
>   it.**
>
> Both harness traps were respected: no `$$` anywhere in 003 including comments, and the phrase for
> making a new table appears nowhere in it (the file is ALTER-only, and `schema-coverage` flags a
> migration that mentions that phrase but yields no parsed column).
>
> ## The Sent-folder copy (D4), and why it can never fail a send
>
> `lib/append.ts` is the **first and only place this module writes to a mailbox**, kept in its own
> file so that stays true by construction rather than by memory. By the time it runs, Brevo has
> accepted the message and the customer is receiving it, so **every path out of it returns a
> result and none of them throws** - including the recording of the outcome, which is itself
> wrapped. A failed copy means one folder on the owner's phone is missing a duplicate. Showing that
> as "your email did not send" would be a lie that stops people trusting the screen.
>
> It takes the same per-account lock the sync engine takes (E6) and loses gracefully to an hourly
> tick. The copy is appended `\Seen`, because our own reply showing as unread on somebody's phone
> is a false alarm every time. The folder is the inbox's `sent_folder` if the owner named one,
> otherwise whichever folder the server calls Sent via SPECIAL-USE; if there is no such folder it
> says so in English rather than creating one.
>
> ## Other decisions S5 and S7 inherit
>
> - **`lib/compose.ts` is entirely pure and is where the awkward parts live** - `replyRecipients`
>   (E13's Reply-To precedence, reply-all minus our own addresses so no mail loop),
>   `buildReferences`, `replySubject`/`forwardSubject`, `quoteForReply`/`quoteForForward`,
>   `assembleBody`, `checkAttachmentBudget`. 34 tests. S5 should call these rather than
>   re-deriving any of it in a component.
> - **E12: a forward goes out as the inbox.** The original `From` is reproduced as text inside the
>   body, never in the envelope - sending as a domain the site does not own fails DMARC and costs
>   the site its sending reputation. Tested.
> - **Attachments are refused, never dropped (5.2).** Core silently drops anything over 8MB and
>   sends the email anyway, which is right for an order confirmation and quite wrong for a person
>   who has just attached a quote. `checkAttachmentBudget` refuses **before** a row exists,
>   measuring the **base64-encoded** size (four bytes per three) against a 9MB ceiling, because
>   that is what actually travels - four 2MB files are 8MB raw and 10.6MB encoded. The refusal
>   names the file and contains no jargon.
> - **Bytes come from storage, never from the browser.** `SendBody` describes an attachment by its
>   media key and url; a filename and a size in a request body are a claim. Outbound attachment
>   rows keep `media_key`/`media_provider`/`media_url` with no `imap_part_id`, so the existing
>   attachment route and the media-usage provider both keep working unchanged.
> - **Access is checked in the ROUTE, not in `lib/send.ts`**, because the route holds the session.
>   `unifiedinbox.reply` plus `canReplyToInbox(user, inboxId)` - holding the permission is not
>   enough, since an inbox has its own guest list and somebody who cannot read `accounts@` must not
>   be able to send as it (D16).
> - **Retry reuses the row AND the original Message-ID.** A retry is one message having another
>   go, not a second message that says the same thing; a new id would arrive as an unrelated email
>   if the first attempt turned out to have gone after all. Only a `'failed'` message can be
>   retried - `reopenForRetry` is a conditional UPDATE, so a retry cannot race a send still in
>   flight.
> - **Every failure is a sentence.** `explainSendError` in `lib/transport.ts` turns the handful of
>   failures that actually happen into something an owner can act on, E15's "sender not
>   authenticated in Brevo" included. Routes answer 400 with that sentence, never a 500.
>
> ## Routes added
>
> - `POST /api/m/unified-inbox/send` - reply, reply-all, forward and compose-new (D12, including
>   `link` which writes a `uin_record_links` row). `maxDuration = 60`, for fetching attachment
>   bytes out of storage.
> - `POST /api/m/unified-inbox/messages/[id]/retry`.
>
> ## New `lib/db.ts` exports S5 will want
>
> `insertOutboundMessage`, `settleDelivery`, `recordAppendOutcome`, `reopenForRetry`, `getMessage`,
> `getQuotableMessage`, `newestMessageOnThread`, `getThread`, `insertOutboundAttachment`,
> `recordLink`, `createOutboundThread`, plus types `OutboundMessageInput`, `OutboundMessageRow`,
> `QuotableMessage`, `ThreadRow`.
>
> ## Deliberately not done, and why
>
> - **No composer UI.** The stage says not to build one, and S5 owns it. `InboxPanel.tsx` is still
>   S2's placeholder. The send path is exercised by 30 unit tests against a mocked transport, not
>   by a screen.
> - **No live mail was sent from this machine**, per the stage's own gate. Which is why the Brevo
>   header question above is flagged rather than answered, and why E15's check is exercised against
>   a mocked Brevo rather than a real account.
> - **Nothing renders**, so nothing was checked in light and dark. Still owed at S5 along with E27.
> - Nothing in `FIELD_NOTES.md` **about the module** and no wiki page for it: it is not in
>   `modules.json`, and S9 owns its docs. The **core** half is written up in both, because that
>   ships to every install: `FIELD_NOTES.md` (the payload additions and the now-logged test send)
>   and two wiki pages - `Configuration-reference.md` (test sends appear in the email log) and
>   `Authoring-a-module.md` (`headers`/`from`/`transport` are what a module author may pass).
>   **`wiki/` is a separate git checkout and must be committed and pushed on its own.**
>
> ## Gates, all genuinely green
>
> `npm run typecheck` clean (exit 0, zero errors). `eslint .` clean (exit 0).
> `npm test` **4,285 passed / 100 skipped / 0 failed**. This stage adds 93: 34 compose, 37 send,
> 13 append, 9 sender-check in the module, plus 13 in core's new `lib/email/send.test.ts`.
> `npx vitest run modules/unified-inbox` is **171 passed**.
>
> `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with
> `[roundtrip] module schemas built: ... unified-inbox` confirmed in the output, so every column
> 003 adds survives a dump and restore. The module-coverage assertion that was red for S3 is green
> again now that `purchase-orders` is back in the harness - which is exactly the "it is often not
> yours" S3 warned about.
>
> Core leak grep is empty: `git grep "unified-inbox\|unifiedinbox\|Unified Inbox"` outside the
> module, wiki, plans and its art file returns nothing.

---

### 7.5 S5 - Inbox UI

**Goal:** the thing Chris actually looks at all day.

**Work:**

1. The panel published into `core.inbox-tabs`:
   - **left rail**: inboxes with unread counts, then **All** (D1 - present, not default), then
     channel groups once Stage 7 lands,
   - **list**: subject, participant, snippet, channel badge, time, assignee, status; filters for
     status/assignee/unread; keyboard-friendly; paginated by query param, not client state (the
     core Inbox host renders only the tab the URL asks for, and its panels read their own query
     params),
   - **thread**: messages oldest to newest, inbound/outbound distinguished by more than colour
     alone, quoted history collapsed, remote images blocked until asked for, attachments listed
     with lazy fetch,
   - **composer**: reply, reply-all, forward, internal note; signature applied; attachment picker.
2. Workflow (D10 light set): assign to a user, snooze until a time, mark done, reopen, internal
   note, `@mention` a colleague raising a core `Notification`. Every one of those writes a
   `uin_events` row.
3. Search across subject, snippet, participants and body. Postgres full-text with a GIN index.
   Checked so you do not have to: `tsvector` **is** already in the backup serialiser's supported
   set, and generated columns are excluded from dumps, so a
   `GENERATED ALWAYS AS (to_tsvector(...)) STORED` column is safe on the backup gate. A GIN index
   on the expression avoids the column entirely and is the simpler option - either is fine, and
   both go in a **new** numbered migration rather than an edit to `001`.
4. Empty states, loading states, and an honest error state for "sync has never run yet".
5. Accessibility and theming: tokens only, AA contrast in light and dark, focus states, sensible
   tab order, tested at mobile width as well as desktop.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`. Visual check in both themes - **render it,
do not reason about the CSS** (this is a standing rule after a previous miss).

**Do not:** invent CRM surfaces. No pipelines, no stages, no scoring.

**Notes for later stages:**

> **Done 2026-08-28. All of S5 is in `modules/unified-inbox/` (module repo, version 0.1.3 in both
> `package.json` and `cactus.module.json`). NOTHING in core changed - the harness that made the
> render check possible is described below and was taken back out. `requiresCoreVersion` stays
> `0.5.1387`; nothing newer was needed. The module is still deliberately NOT in `modules.json`.**
>
> ## Component names S7 needs, which is what this block was asked for
>
> Everything lives under `components/admin/inbox/`, and all of it takes props - the panel does the
> fetching. A provider-backed thread renders through exactly the same components as an email one.
>
> - **`ThreadPane`** (`ThreadPane.tsx`) - one conversation. Props:
>   `{ base, params, thread: ThreadDetail, inboxName, messages: ThreadMessageView[], events,
>   staff, staffById, canReply, cannotReplyReason, replyTo, replyAllTo, now }`.
>   **`ThreadMessageView` = `ThreadMessageRow & { attachments: AttachmentRow[] }`**, and that type
>   is the seam: a provider's messages become `uin_messages` rows in S7, so they arrive here
>   already shaped. `thread.providerModule` being set with no messages renders "this channel is no
>   longer installed" rather than throwing (E20) - S7 should keep that path working by leaving the
>   rows in place when a provider goes away.
> - **`ThreadListView`** - the list. Rows are `ThreadListRow` from `lib/db.ts`; it already draws a
>   channel tag for anything that is not email via `channelLabel()` in `lib/list.ts`, so a chat or
>   a call needs no new component, only rows with the right `channel`.
> - **`InboxRail`**, **`Filters`**, **`MessageBody`**, **`Composer`**, **`ThreadActions`**,
>   **`RetryButton`**, **`InboxStyles`** (the stylesheet), **`icons.tsx`**.
> - **`channelLabel()` is where a new channel gets its name in English.** It falls back to
>   "Message" for anything it does not know, so an unrecognised channel is untidy rather than
>   broken.
> - **The composer sends through `POST /api/m/unified-inbox/send` in every mode.** S7's provider
>   replies need that route to learn to hand off to the provider's own `send` when the thread has a
>   `provider_module` - the composer itself needs no change, but `Composer`'s `canReply` and
>   `cannotReplyReason` props are how "you have never connected your Chatwoot account" (E26) should
>   reach the screen: a sentence, computed on the server, shown above the box.
>
> ## The rendering gate, and exactly how it was met
>
> S2 and S3 both deferred their light/dark check to this stage, so three screens were owed. Here is
> what was actually done, in full, because the whole point of the rule is that "I read the CSS" is
> not an answer.
>
> **A throwaway database and a real dev server.** A `cactus_rt_uinpreview` database was provisioned
> on the OVH VPS with the round-trip harness's own helper (`lib/backup/vps-database.ts`), core's
> init migration and all four of this module's migrations were applied to it, and `next dev` was
> pointed at it. Nothing went near the live Deskwell database at any point, and the throwaway
> database and its role were dropped afterwards.
>
> **A harness page rendering the components against fixtures**, at `app/uin-preview/page.tsx`, plus
> a fixture route serving one real HTML email into the sandboxed frame. **Both deleted, along with
> a two-line `ALWAYS_PASS` entry in `proxy.ts`** - `git status` on core is clean of all three.
> Note for anybody repeating this: a folder whose name starts with an underscore is PRIVATE in
> Next.js and is not a route at all, so `app/__uin-preview` silently fell through to the public
> catch-all and 500ed on a module table. Name it without the underscores.
>
> **What was seen.** Both themes at 1280 wide and at 375, with a scripted contrast audit over every
> piece of text on the screen (125 elements): **light mode, zero failures; dark mode, two, both of
> them core's own `.btn-primary`** - white on the primary green measures **3.61:1**, which is under
> AA for 13px text, on every button of that class on every admin screen. That is a core question,
> not a module one, and it is left alone deliberately.
>
> **Three real contrast failures of this module's own were found and fixed**, all in dark mode and
> none of them visible by reading the CSS: the rail's unread badge (white on primary, 3.61:1 - now
> a tinted chip), the list preview and timestamp on the OPEN row's tinted background (4.19:1 - now
> `--color-text-secondary`), and the timestamp on an internal note's amber ground (4.09:1 - same
> fix). Focus rings were confirmed by tabbing, not asserted: 2px solid `--color-border-focus` with
> a 2px offset, which clears 3:1 in both themes. At 375px the rail and the list step aside and the
> conversation gets the screen, with `document.scrollWidth === clientWidth` - no sideways scroll.
>
> **One thing could NOT be rendered in that browser and is honestly flagged.** The in-app browser
> blocks every sandboxed iframe outright - `net::ERR_BLOCKED_BY_CLIENT` on `sandbox=""`,
> `sandbox="allow-scripts"` and the real attribute alike, while the identical URL in an
> unsandboxed frame returns 200. So the frame was verified in the two halves the environment
> allowed: the message document was **loaded as a page and looked at** (sender's own styling and
> table intact, the tracking pixel loading nothing, the quoted history folded behind a toggle that
> works with no script), and the height-reporting script was verified **in an unsandboxed frame of
> the same document**, which posted 374px to the parent three times. What remains unproven is only
> that a real browser applies the sandbox attribute, which is not in doubt. **Somebody looking at
> this on a real install should confirm an email renders at its own height in the frame.**
>
> ## E16 and E27, and why there is no cspOrigins entry
>
> The plan expected the email body to go in an iframe with `srcdoc`, and expected that to need a
> CSP entry in the manifest. **It is served from a route instead, and needs no entry at all**,
> which is a better answer for a reason worth writing down: **a `srcdoc` frame inherits the parent
> page's content policy, while a document loaded from a URL carries its own.** So
> `GET /api/m/unified-inbox/messages/[id]/body` serves the message with
> `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-...';
> form-action 'none'; base-uri 'none'; frame-ancestors 'self'` - far tighter than the admin around
> it, which a srcdoc frame could never have been. `frame-src 'self'` in core already allows a
> same-origin frame, so the manifest declares nothing.
>
> The frame is also sandboxed from the outside (`allow-scripts allow-popups
> allow-popups-to-escape-sandbox`, and deliberately **no** `allow-same-origin`, so the frame has an
> origin of its own and nothing in a stranger's email can reach the page, its cookies or its
> storage). The only script in the document reports the height back and carries a nonce.
> `openLinksInNewTab()` adds `target="_blank" rel="noopener noreferrer"` to every link, because a
> sandboxed frame cannot navigate itself and a link that does nothing reads as a broken message.
>
> **The message renders on a light surface in both themes, on purpose.** The sender chose their
> colours assuming a white page; repainting their background dark while leaving their text colours
> alone is how a message ends up black on black. The chrome follows the theme, the message does
> not. Plain-text messages are rendered in the page itself and are fully theme-aware.
>
> ## Remote images: a proxy, not a restored src (this is a decision S8 should know about)
>
> S3 parks remote image addresses on `data-uin-remote-src`. "Show pictures" does **not** put them
> back. It reloads the frame with `?images=1`, which rewrites each one to
> `/api/m/unified-inbox/messages/[id]/image/[index]` - **an index into the stored message, never a
> URL from the request**, so nothing can talk the route into fetching an arbitrary address.
> `lib/remote-images.ts` then refuses anything that is not https, resolves the host and refuses
> private, loopback, link-local and carrier-NAT addresses (the cloud metadata endpoint is the
> attack this exists for), follows redirects by hand so every hop is checked, insists on a real
> image content type and caps it at 5MB.
>
> Two reasons this is right rather than merely careful: the admin's own `img-src` is `'self'` plus
> the media store and **no module may widen it to "anywhere on earth"**, so a restored `src` would
> simply have been blocked in production; and a pixel fetched by the server tells the sender
> nothing about the person who opened the message.
>
> ## Schema: a NEW file, `migrations/004_ui.sql`. 001, 002 and 003 were not touched.
>
> **Indexes only - no new column, no new type, nothing for the backup serialiser to learn.**
>
> - `uin_messages_search_idx`, a GIN index over
>   `to_tsvector('english', subject || from_name || from_address || body_text)`. The expression
>   index rather than a `GENERATED ... STORED` column: both are safe on the backup gate, and this
>   one does not widen every message row for something only the search box uses. **The query in
>   `lib/db.ts` spells that expression EXACTLY as the migration writes it** (see `SEARCH_VECTOR`
>   there) - Postgres matches an expression index by the text of the expression, so a reordered
>   field turns search into a sequential scan of every email the site holds. Verified with
>   `EXPLAIN` against a real database: `Bitmap Index Scan on uin_messages_search_idx`.
> - `uin_threads_unread_idx` (partial, unread only), `uin_threads_last_message_idx`,
>   `uin_threads_snooze_due_idx` (partial).
>
> Both harness traps respected: no `$$` anywhere including comments, and the phrase for making a
> new table appears nowhere in this ALTER-free file.
>
> ## E17, and the thing that would be easy to undo by accident
>
> **The access filter is inside the SQL, in one place.** `visibilityClause()` in `lib/db.ts` builds
> the inbox condition and `listThreads`, `countThreads` and `unreadCounts` all take it, so the three
> can never disagree. Nothing filters results afterwards. Search is an `EXISTS` subquery **inside**
> the same WHERE, so a snippet from `accounts@` is never fetched, never counted and never paged for
> somebody who cannot open it. There is a test for exactly that: the same search that finds a
> conversation with the right inbox visible finds nothing with the wrong one.
>
> **An empty visible-inbox list returns `null` from `visibilityClause` and the caller returns an
> empty page**, rather than running a query whose WHERE clause would be empty and therefore true.
> That is the shape to keep: an "everything is visible" fallback here is the leak.
>
> Only `unifiedinbox.manage` sees conversations that landed in no inbox at all ("Not filed" in the
> rail), on the same reasoning as S3's attachment route.
>
> ## New `lib/db.ts` exports
>
> `listThreads`, `countThreads`, `unreadCounts`, `getThreadDetail`, `listThreadMessages`,
> `attachmentsForThread`, `getMessageHtml`, `recordEvent`, `listThreadEvents`, `setThreadRead`,
> `assignThread`, `setThreadStatus`, `wakeDueThreads`, `insertNote`, plus types
> `ThreadListFilters`, `ThreadStatusFilter`, `ThreadListRow`, `ThreadDetail`, `ThreadMessageRow`,
> `ThreadEventRow`, `ThreadEventKind`.
>
> **`ThreadMessageRow` gained `replyTo`** - S4 added the column and had `lib/sync.ts` write it, but
> nothing read it back. The composer needs it, because E13 says the sender's `Reply-To` beats their
> `From`.
>
> **`listAttachmentsForMessage` was doing one query per attachment** (a `SELECT id` then
> `getAttachment` in a loop). It and the two new attachment readers now share one
> `ATTACHMENT_SELECT` fragment and one `mapAttachment`. Same shape out, one round trip.
>
> **The participant on a list row comes from the newest INBOUND message where there is one**, not
> simply the newest. Our own replies carry an address and no name, so ordering purely by time meant
> a conversation we answered last lost the customer's name off the list. There is a test.
>
> ## Other decisions S6 and S7 inherit
>
> - **Every piece of state is in the query string** - `?inbox=&status=&unread=&assignee=&q=&page=&id=`
>   parsed by `parseInboxParams()` in `lib/list.ts`, links rebuilt by `inboxHref()`. The core Inbox
>   host renders only the tab the URL asks for, so client state would describe a screen the server
>   had not drawn - and this way a colleague can be sent the view somebody is looking at.
>   `?inbox=none` is the "Not filed" rail entry and is NOT an inbox id; `parseInboxParams` returns
>   `unroutedOnly` for it.
> - **Opening a conversation marks it read**, in the panel, because that is what everybody means by
>   opening one. An elapsed snooze is woken on the way into the list (`wakeDueThreads`) rather than
>   on a tick, since that is the only moment anybody would notice.
> - **A note deliberately does not bump the conversation or mark it unread.** Us talking among
>   ourselves must not look like the customer writing again. It is a `uin_messages` row with
>   `direction = 'note'`, so nothing sends it, and it says "Internal note, not sent" on its face.
> - **Mentions raise a core `Notification`, and core's notifications are SITE-WIDE, not per person**
>   (there is no `userId` on the model). So the title names who was wanted and nothing else - the
>   subject of a conversation in `accounts@` has no business on a bell everybody can see - and a
>   mention is only raised for somebody who could open that conversation anyway, via the new
>   `canUserViewInbox(userId, inboxId)` in `lib/access.ts`, which reads THEIR role rather than the
>   acting user's. **If core ever gains per-user notifications, this is the first thing that should
>   move to them.**
> - **Direction is signalled four ways, never by colour alone** (E-something the plan did not
>   number but §7.5 asked for): the words in the header ("Received from...", "Sent to...",
>   "Internal note, not sent"), an arrow icon, the style of the left edge (solid, dashed, dotted)
>   and the tint. An internal note is a fifth thing again.
> - **The composer carries one idempotency token per session and reuses it across retries of the
>   same press**, exactly as S4 asked. It is regenerated only once a message has genuinely gone and
>   the box is empty.
> - **The attachment picker lists the media library and never uploads.** The send path takes an
>   attachment by where it already lives in storage, so a filename and a size in a request body
>   would be a claim. A fresh upload is therefore "upload it to the library first", which is one
>   more step than D12 imagined - **worth revisiting in S9 if it grates in practice.**
> - **`PER_PAGE` is 25.**
>
> ## Deliberately not done, and why
>
> - **No context rail.** That is S6's, and there is nothing to put in it yet.
> - **No keyboard shortcuts** (j/k, e to archive). The screen is fully keyboard-reachable with a
>   visible focus ring and sensible tab order, which is the accessibility requirement; single-key
>   shortcuts are a nicety and would have wanted a help sheet nobody has written.
> - **`?q=` searches with `websearch_to_tsquery('english', ...)`.** A site corresponding in another
>   language gets exact-word matching rather than stemming. Noted rather than solved: making the
>   dictionary a setting means reindexing, which is S8-shaped.
> - **Nothing sweeps `delivery_status = 'sending'` rows** - still S8's, as S4 said.
> - **No wiki page, nothing in `FIELD_NOTES.md`**: the module is not in `modules.json` and S9 owns
>   docs.
>
> ## Something for whoever tidies core
>
> `lib/email/send.test.ts` (core, from S4) uses the literal string `'unified-inbox'` as a
> `moduleName` fixture, so the standing leak grep is no longer empty. It is a test fixture rather
> than behaviour, and one word to change - but it should be changed, or the grep stops being a
> gate. Left alone here because it is another stage's core file in a shared tree.
>
> ## Gates, all genuinely green
>
> `npm run typecheck` **exit 0** (clear `.next/dev/types` first if a deleted harness route leaves
> stale generated types behind - it will report errors about files that no longer exist).
> `eslint .` **exit 0**. `npm test` **4,339 passed / 100 skipped / 0 failed**; this stage adds 44
> unit tests (20 for the URL and the quoted-history splitting, 8 for the picture proxy, 13 for the
> message document and its policy, 3 for notes).
> `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with
> `[roundtrip] module schemas built: ... unified-inbox` confirmed in the output.
>
> **The SQL was exercised against a real Postgres, not only typechecked.** Thirteen throwaway
> tests were run against the provisioned database covering the visibility clause, the empty-visible
> case, search inside the ACL, paging, the unread tallies, the LATERAL participant join, notes,
> events and snooze waking. They found two genuine defects before any of this was rendered (the
> participant-name problem above, and the search expression). **Those tests were deleted with the
> rest of the harness**, because they need a database and `npm test` must stay runnable without
> one - if S6 or S8 wants a permanent home for that kind of test, that is a harness decision worth
> making deliberately rather than by leaving a file behind.

---

### 7.6 S6 - People and context

**Goal:** conversations collapse per human, and the site's own records sit beside them.

**Work:**

1. Identity resolution: on ingest, normalise the address (lower case, strip plus-addressing for
   matching but keep the original), find or create `uin_person_identities`, attach to a person.
   Organisation inferred from the email domain, with a blocklist of consumer domains (gmail,
   outlook, icloud, yahoo and friends) that must never become an "organisation".
2. Manual merge and split of people, with an audit row. Merging must be reversible enough that a
   mis-merge is not a disaster.
3. Person view: every conversation across every channel, plus outbound automated mail read from
   core's `EmailLog` (D13), on one timeline.
4. Context rail adapters, each in `lib/adapters/<module>.ts`, each read-only, each gated on "module
   installed and table present", each returning a small typed summary plus a deep link:
   - **shop**: orders by email, order status, totals, saved addresses,
   - **purchase-orders**: supplier record, open POs, recent bills,
   - **uk-bookkeeping**: counterparty, unpaid bills/invoices,
   - **quote-for-shop**: open quotes,
   - **core members**: the member account, if any.
   An adapter whose module is absent renders nothing and costs one cheap check.
5. Auto-linking with confidence (`uin_record_links`): an order number in a subject, a known
   supplier's domain, a quote reference. Every automatic link is visible, attributed to `auto`,
   and removable in one click. **Never link silently and irreversibly.**
6. Deskwell's needs are settings, not hardcodes: order-number and PO-number patterns come from
   module settings with sensible defaults, not from a regex with `DW` in it.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`. If a `uin_` migration was added, backup
round-trip real PASS.

**Do not:** write to any other module's tables. Ever. Reads only.

**Notes for later stages:**

> **Done 2026-08-28. All of S6 is in `modules/unified-inbox/` (module repo, version 0.1.4 in both
> `package.json` and `cactus.module.json`). NOTHING in core changed - core's working tree is clean
> of this stage, and the render harness described below was taken back out. `requiresCoreVersion`
> stays `0.5.1387`; nothing newer was needed. The module is still deliberately NOT in
> `modules.json`.**
>
> ## The adapter interface, which is what this block was asked for
>
> `lib/adapters/types.ts`. S7 adds a record source by writing one file in that folder and one line
> in `ADAPTERS` (`lib/adapters/index.ts`). Nothing else in the module knows how many there are.
>
> ```ts
> type ContextAdapter = {
>   moduleName: string      // as it appears in the module list; 'core' for core's own
>   permission: string      // what the VIEWER must hold before anything is fetched
>   tables: string[]        // all must exist or the adapter does not run
>   load(query: ContextQuery): Promise<ContextSection | null>
>   lookup?(kind: LinkKind, reference: string): Promise<LinkTarget | null>
> }
> type ContextQuery = { emails: string[]; phones: string[]; domains: string[]; organisationName: string | null }
> type ContextSection = { moduleName; label; items: ContextItem[]; total: number; moreHref: string | null }
> type ContextItem = { id; title; detail; status; at: Date | null; href }
> ```
>
> **`href` is ADMIN-ROOT RELATIVE with no leading slash** (`shop/orders/abc123`), the same rule S1
> set for `ConversationSummary.href`, because the admin path is per site and only the rendering page
> knows it. `ContextItem.at` is for ORDERING only - the rail deliberately does not draw it, because
> the detail line already carries the date and printing both read as a stutter (found by looking at
> it, not by reading the code).
>
> Five adapters ship: `members` (core, `members.view`), `shop` (`shop.orders`), `quote-for-shop`
> (`quotes.access`), `purchase-orders` (`purchase-orders.access`), `uk-bookkeeping`
> (`bookkeeping.access`).
>
> ## Which installed-checks were used, which is the other thing asked for
>
> `lib/installed.ts`, and it is deliberately BOTH halves plus a third:
>
> 1. **Installed** - `prisma.module.findMany({ where: INSTALLED_MODULE_WHERE })`, memoised 30s.
>    Answers "has this site got it", which is what the rail is really asking.
> 2. **Tables present** - one `to_regclass` query covering EVERY adapter's tables at once, memoised
>    30s. Answers "have its migrations actually run", which a module installed five minutes ago
>    mid-deploy has not. Reading a table that is not there is an EXCEPTION, not an empty list, and
>    an exception in a side panel takes the conversation down with it.
> 3. **The viewer's permission** - one `hasPermissions(user, keys)` call for all five at once.
>
> So the whole rail costs three round trips regardless of how many adapters exist, and an adapter
> whose module is absent costs its share of those and nothing else. A failed read clears the memo
> rather than caching "nothing is installed" for thirty seconds. The pattern for (2) is the house
> one - `modules/filters-for-shop/lib/variations-probe.ts`.
>
> **`loadContext` catches per adapter.** One module's panel failing costs that block only.
> `confirmReference` (the linker's path) runs with NO session and therefore checks no permissions:
> it decides what a conversation is ABOUT, not what a given person may look at. The permission gate
> is in the rail, where the viewer is.
>
> ## D15 held: the people layer is thin, and here is exactly how thin
>
> Identities, a display name, a note, and an organisation guessed from the mail domain. No pipeline,
> no stage, no score, no lead anything, no "value", no next action. `lib/people.ts` is pure and says
> so at the top. There is **no people browsing screen** either - `GET /api/m/unified-inbox/people`
> exists solely to find the other half of a merge, and a directory of everybody who has ever emailed
> is precisely how a conversation hub turns into a CRM by accident.
>
> ## Never wrote to another module's table
>
> Reads only, raw SQL only, no import of another module's code anywhere in `lib/adapters/`. The
> status words those queries filter on (`SENT`, `QUERIED`, ...) are **copied rather than imported**,
> with a comment saying why: importing drags that module's dependencies into our graph and breaks
> the day it is removed, whereas a word that changes there and not here costs one row in a side
> panel. `git grep "unified-inbox\|unifiedinbox\|Unified Inbox"` outside the module, wiki and plans
> is **empty** - including core, which means whoever owned S5's note about `lib/email/send.test.ts`
> using the module's name as a fixture has since fixed it. The grep is a real gate again.
>
> ## Nothing Deskwell-shaped is hardcoded
>
> - **Reference patterns are settings** with generic defaults (`uin_settings.order_number_pattern`,
>   `po_number_pattern`, `quote_number_pattern`; NULL means the default). The default is
>   `\b([A-Z]{1,6}-?\d{4,12})\b` - letters, optional hyphen, digits, which is what a prefix-plus-
>   counter scheme looks like nearly everywhere and is what both the shop and purchasing generate.
>   No site's prefix appears anywhere in this module.
> - **The safety property that lets the pattern stay generous: A PATTERN ONLY PROPOSES, THE OWNING
>   MODULE DISPOSES.** Nothing is linked until `lookup()` finds a record with exactly that number.
>   A pattern that matches too much costs a failed lookup, never a wrong link. This is the single
>   most important sentence in `lib/linking.ts` and S7 should keep it true.
> - A pattern out of a settings box is user input: it is refused at the route if it will not
>   compile, refused again at compile time in `compilePattern` (which logs and disables that kind
>   rather than throwing mid-collection), capped at 20,000 characters of body scanned and 10 hits
>   per kind, and guarded against a zero-width match looping for ever.
> - **Consumer domains** are a built-in list of ~35 plus a site-settable extra list. Never a company.
>
> ## Every automatic link is visible, attributed and removable - and merges are reversible
>
> - Auto links are written `linked_by = 'auto'`, `confidence: 90`, and render with a "Found
>   automatically" tag and a Remove button. Manual ones are `'user'`, `confidence: 100`.
> - `uin_record_links` gained **two partial unique indexes** so re-running the linker updates nothing
>   rather than growing a duplicate row every hour, and `recordLink` now does `ON CONFLICT DO NOTHING`.
> - **A merge keeps the losing row**, with `merged_into_id` set: it disappears from every list and
>   `getPerson` follows the pointer, so an old link lands on whoever now holds their mail rather than
>   on an empty page (depth-capped at 8 - a cycle should be impossible, but this runs while a page
>   renders and a hung request is worse than a missing person).
> - `uin_person_merges` holds a snapshot of the losing person plus **the ids of every identity,
>   conversation and link that moved**. Undo puts back exactly those, **by id** - so anything that
>   arrived AFTER the merge stays where it arrived, because it was never the other person's and
>   handing it over would be a second mistake dressed as fixing the first. There is a test for that
>   distinction against a real database.
> - Merging asks first, in a sentence naming the person and counting their conversations, and leaves
>   a "Put it back" button standing for as long as the merge does.
> - **Splitting** is the same operation from the other end: identities move to a new person and their
>   conversations follow the address they were had with. It refuses to move EVERY address (that
>   leaves nobody behind - the user wanted a rename).
> - Merge, undo and split are `unifiedinbox.manage`; editing a name, a note and links is
>   `unifiedinbox.reply`.
>
> ## Schema: a NEW file, `migrations/005_people.sql`. 001 to 004 were not touched.
>
> - `uin_settings`: `own_domains TEXT[]`, `personal_domains TEXT[]`, and the three pattern columns.
> - `uin_people.merged_into_id` (self FK, SET NULL) + index.
> - `uin_person_identities.match_value` + index. **`value` keeps what the sender wrote, plus tag and
>   all; `match_value` is what matching compares on.** Replying to the stripped form throws away
>   whatever the person was sorting their own mail by.
> - **`uin_events.thread_id` is now NULLABLE and there is a `person_id`** - one audit table answers
>   for a person as well as a conversation, which is what "with an audit row" wanted.
> - `uin_person_merges` (the only new table).
> - `uin_threads.linked_at` + partial index: the linker looks at a conversation again once something
>   NEWER has arrived on it, so a reference in the third reply gets caught without re-reading every
>   conversation on the site every hour.
> - Two partial unique indexes on `uin_record_links`, and a partial index for unresolved threads.
>
> **Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, and `DO $$` is forbidden** (the round-trip
> harness skips any module whose migrations contain `$$`, comments included). The answer is
> `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`, which is idempotent and needs no block. Both
> harness traps respected; `[roundtrip] module schemas built: ... unified-inbox` confirmed.
>
> ## Where identity resolution actually runs, and the budget it gets
>
> **Not inline per message.** `runPeoplePass()` in `lib/identity.ts` runs AFTER the mail is collected
> and committed, from both `cron/sync` and `admin/check-now`, with a deadline measured from the
> start of the whole run (`CRON_PEOPLE_DEADLINE_MS = 22_000`, `MANUAL_PEOPLE_DEADLINE_MS = 55_000`
> in `lib/sync-plan.ts`). S3's collection budget was NOT reduced. The reasoning: collecting the mail
> is the part that must not be squeezed, because a person can be worked out at any later tick and an
> email that was never fetched cannot. It takes `person_id IS NULL` newest-first in batches of 40,
> so it covers both the new arrivals and the backlog left by S3 with one code path - there are not
> two sets of rules about who becomes a person.
>
> ## E18 and E8, and the trap in the obvious implementation of E18
>
> Nobody becomes a person if they are one of our inboxes, a staff account's own address, at one of
> our own domains, or a machine (`mailer-daemon`, `no-reply` and friends). **`accounts@supplier.com`
> DOES become a person** - E19 says a role address is several humans collapsed to one by design, and
> that belongs in the wiki rather than being worked around.
>
> **`own_domains` NULL means "work it out from the addresses you collect mail on", and that
> inference deliberately skips free providers.** A site whose only inbox is a Gmail address would
> otherwise stop recognising every Gmail correspondent it has, which is the entire customer list on
> some sites. An explicit list wins outright **including an empty one** - somebody who cleared the
> box has said something. NULL and `[]` are genuinely different values all the way down, and there
> is a live test asserting they survive a round trip through the settings row.
>
> E8: no person is minted from an automated message (`auto_kind` set), which is a bounce, an
> out-of-office or bulk mail. S3 already never reads Junk.
>
> ## E17 again, in a shape S5 could not have covered
>
> **A person's page is a second way of asking the search box's question, so it needed the same
> gate.** `threadsForPerson` filters inside the SQL with S5's own `visibilityClause` (extracted
> alongside a new shared `THREAD_LIST_SELECT`, so the inbox list and a person's page cannot drift).
> But that alone leaks: `?person=<id>` was reachable by anybody with `unifiedinbox.view`, and the
> name, the addresses, the organisation and the outbound SUBJECT LINES are not inbox-scoped. So the
> panel now refuses the page outright unless the viewer can see at least one of that person's
> conversations, or holds `unifiedinbox.manage` - and it says "not here, or in an inbox not shared
> with you" either way, because telling the two apart is itself the leak.
>
> ## D13 is met: the timeline carries the automated mail
>
> `outboundLogForAddresses` reads core's `EmailLog` by `toAddress` (indexed, case-insensitive) and
> `PersonView` interleaves it with the conversations in one list, newest first. It shows what went
> and when, and says plainly on the page that there is no copy of what it said - because the log is
> a delivery ledger with no bodies and never will have any. A failed send shows "It did not send".
>
> ## Gates, all genuinely green
>
> `npm run typecheck` **exit 0** (and confirmed the module is really in the program - 90 of its
> files are in `tsc --listFiles`, so this is not a hollow pass). `eslint .` **exit 0**, no new
> `eslint-disable` or `@ts-ignore` anywhere in the stage. `npm test` **4,401 passed / 100 skipped /
> 0 failed**; this stage adds 62 unit tests (people, linking, adapter formatting).
> `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with
> `[roundtrip] module schemas built: ... unified-inbox` confirmed in the output, so every column 005
> adds survives a dump and restore. `cactus_rt_*` databases and roles on the VPS confirmed gone
> afterwards; the live Deskwell database was never named, opened or touched.
>
> **Note for whoever runs the round-trip next: do NOT `source` the Deskwell `.env`.** Line 18 holds
> an unquoted `&` and `set -a; . .env` dies with a parse error at exit 126 - which the shell then
> reports through whatever ran last, so it can read as a pass when the test never ran at all. Parse
> the three `OVH_*` values out of it instead.
>
> ## The SQL was exercised against a real Postgres, and so were the adapters
>
> Twenty throwaway tests against a provisioned `cactus_rt_*` database on the OVH VPS covering: the
> merge, the undo (including the after-the-merge distinction), the split and its refusal case, the
> E17 visibility gate, the linker's "needs another look" query, the outbound ledger read, the
> settings NULL-versus-empty distinction, and a regression check that the ordinary inbox list still
> works after the `THREAD_LIST_SELECT` extraction. **The adapters were run against the REAL
> `CREATE TABLE` statements lifted out of shop, purchasing, bookkeeping and quotes' own migrations**,
> so a column name I imagined would have failed rather than passing quietly. All 20 passed.
>
> **Those tests were deleted with the harness**, same decision S5 took: `npm test` must stay runnable
> without a database. If S8 wants a permanent home for database-backed tests that is a harness
> decision worth taking deliberately. One trap worth writing down for whoever repeats this:
> `lib/backup/restore.ts` (where `splitSqlStatements` lives) imports the app's prisma singleton, and
> that singleton reads `DATABASE_URL` **once, at module load** - import it before pointing the
> environment at the throwaway database and every query in the file goes looking for a connection
> that is not there. Import it dynamically, after.
>
> ## Rendered in both themes, not reasoned about
>
> A temporary `app/uin-preview/page.tsx` rendered both new surfaces against fixtures, with a
> two-line `ALWAYS_PASS` entry in `proxy.ts`. **All three are gone and core's `git status` is clean
> of them.** No database was needed for this half - both components take props - so nothing went
> near a real site.
>
> Scripted contrast audit over every piece of text on the screen: **108 elements, light mode zero
> failures, dark mode zero failures.** At 375px it is one column with
> `document.scrollWidth === clientWidth` - no sideways scroll.
>
> **Three things were wrong and were only visible by looking:**
> 1. Every row printed its date twice - once inside the detail line and once under it. The standalone
>    date is gone; `ContextItem.at` is now for ordering only.
> 2. The collapsed "Attach something" chip stretched the full width of its card (a button in a grid),
>    reading as an empty input box. Now `justify-self: start`.
> 3. The rail's link heading said "Attached to this conversation" on a PERSON's page, where there is
>    no conversation. It now reads "Attached to them" when there is no thread.
>
> Every colour is a semantic token; no hex anywhere in the new CSS. `.uin-ctx-sub` is
> `--color-text-secondary` rather than `--color-text-muted` on purpose: it carries real information
> (an address, a total, a date) and muted measures under AA against the card in dark mode.
>
> ## Deliberately not done, and why
>
> - **No people browsing screen.** See D15 above. The search endpoint exists only for the merge picker.
> - **No phone or chat identities are created yet** - nothing produces them until S7's providers
>   arrive. `phoneKey()`, the `'phone'`/`'chat'` identity kinds and `ContextQuery.phones` are all in
>   place and tested, so S7 attaches a caller to a person by calling `addIdentity` with `kind: 'phone'`.
> - **The bookkeeping adapter matches on the ORGANISATION NAME only**, because a transaction there
>   has a counterparty name and no address. A person whose organisation we have not worked out shows
>   nothing, which is the honest answer: matching a surname against a counterparty is how a
>   supplier's unpaid bills end up beside a customer's enquiry. Aliases (`bk_counterparty_aliases`)
>   are resolved first, since that is the owner's own list of "this name means that one".
> - **The purchasing supplier link points at the suppliers LIST**, not at one supplier - that module
>   has no `suppliers/[id]` page to point at.
> - **No wiki page and nothing in `FIELD_NOTES.md`**: the module is not in `modules.json` and S9 owns
>   docs. S9 must cover, at minimum: E19 (a role address is one person by design), what "your own
>   domains" does, and that erase/export are S8's rather than here.
> - **No commit, push or release.**

---

### 7.7 S7 - Channel providers

**Goal:** chat, form, phone and SMS arrive in the same place as email.

This stage touches **four repos**. Each provider is justified by the All tab in core (§3.2) and
must be written as if Unified Inbox did not exist.

**Work:**

1. **contact-form** (D8): `lib/conversation-provider.ts` exporting a `ConversationProvider` over
   `cf_contact_submissions` and `cf_contact_submission_replies`. `send` posts a reply through the
   module's existing reply path so the owner's signature and templates still apply. Register at
   `core.conversation-provider`. Bump both `package.json` and `cactus.module.json` versions.
2. **live-chat** (D9): provider over `lc_conversations` / `lc_messages`; `send` goes through the
   existing Chatwoot client (`lib/chatwoot.ts`) using the agent token in `lc_admin_tokens`, so a
   reply from Unified Inbox is a proper agent reply in Chatwoot, not a forgery. The module keeps
   its widget, its settings and its Chatwoot connection untouched.
3. **twilio** (D10): provider over calls and messages. Note the real shape here - the twilio module
   stores **voicemails** locally (`tw_voicemails`) but reads **calls and SMS live from the Twilio
   API** (`listCallsForNumber` and friends in `lib/twilio.ts`); there is no inbound-SMS webhook
   today. So:
   - `list` pulls recent calls and messages from the API plus voicemails from the table,
   - `thread` groups by the outside party's number,
   - `send` sends an SMS through the module's existing Twilio client,
   - keep API calls bounded and cached - this runs on an hourly tick, not on every page view.
   If realtime inbound SMS is wanted later, that is a webhook in the twilio module and a separate
   piece of work; note it, do not build it here.
4. **unified-inbox**: consume the providers. Provider conversations become `uin_threads` rows with
   `provider_module` and `external_id` set, refreshed on the sync tick, with bodies cached for
   search. Replies route back through `provider.send`. Identity resolution (S6) applies to their
   participants, so a customer who emailed and then rang is one person.
5. Confirm core's suppression works: with Unified Inbox installed, the contact-form and live-chat
   tabs disappear from the core Inbox and the All tab does too; uninstall it and they come back.
6. Reply Catcher guard (D14, §5.7): if Reply Catcher is installed and configured against the same
   host and username as a Unified Inbox connection, refuse to sync that connection and say so in
   settings, in plain English, with what to do about it.

**Gates:** `npm run typecheck`, `eslint .`, `npm test` in each repo touched. Isolation check:
```bash
git grep "unified-inbox" -- ':!modules/unified-inbox' ':!wiki' ':!.gitmodules' ':!plans'
```
must return nothing outside the provider registrations, and no provider file may mention Unified
Inbox by name.

**Notes for later stages:**

> **Done 2026-08-29. S7 is a FOUR-REPO stage, all four left uncommitted in the working tree.**
>
> | Repo | Version now | Both files bumped | `requiresCoreVersion` |
> |---|---|---|---|
> | `modules/contact-form` | **0.1.38** (was 0.1.37) | yes | raised 0.5.1329 -> **0.5.1383** |
> | `modules/live-chat` | **0.1.21** (was 0.1.20) | yes | raised 0.5.1098 -> **0.5.1383** |
> | `modules/twilio` | **0.1.30** (was 0.1.29) | yes | raised 0.5.1090 -> **0.5.1383** |
> | `modules/unified-inbox` | **0.1.5** (was 0.1.4) | yes | unchanged, 0.5.1387 |
>
> Their release tags track the MANIFEST version, and manifest and `package.json` now agree in all
> four. **Nothing in core changed** - core's working tree is clean of this stage, and core sat on
> 0.5.1393 while it was built. **`requiresCoreVersion` had to move on the three channel modules**:
> each provider imports `@/lib/conversations/types`, which does not exist on a core older than the
> release carrying the S1 seam, so a site on an older core would fail to build rather than merely
> not offering the feature. S8/S9 should hold that number to whatever release actually carries S1
> when Chris cuts it.
>
> ## The isolation grep is clean, including the provider registrations
>
> ```
> git grep "unified-inbox" -- ':!modules/unified-inbox' ':!wiki' ':!.gitmodules' ':!plans'   # empty
> git grep -in "unifiedinbox\|Unified Inbox" -- ':!modules/unified-inbox' ':!wiki' ':!plans' # empty
> grep -rin "unified.inbox\|unifiedinbox" modules/{contact-form,live-chat,twilio,contact-form-reply-catcher}  # empty
> ```
>
> Not "empty apart from the registrations" - genuinely empty. A provider entry names a point, an
> id, a permission and a file, none of which mention any consumer, so there was nothing to
> exempt. Each provider's own header says what earns its place on a site that never installs this
> hub: core's All tab, which appears the moment two providers resolve.
>
> ## The three providers
>
> **contact-form** (`lib/conversation-provider.ts`, `contactFormConversationProvider`). Over
> `cf_contact_submissions` + `cf_contact_submission_replies`. **The reply route was refactored, not
> duplicated**: everything a reply involves - the signature in whichever of the three kinds it was
> authored in, the site's email design, the send, the row, the unread count - moved into a new
> `lib/reply.ts` (`replyToSubmission`), and both the screen's route and the provider call it. Two
> code paths that both send an email and both write a row are two chances to disagree about which
> signature went out. Order preserved exactly: **send first, record second**, because a failed send
> must leave nothing behind. Two new `lib/db.ts` readers, `listSubmissionSummaries` and
> `submissionSummariesForEmails`, order by **newest activity** (a reply counts) rather than by when
> the enquiry arrived - right for a list of enquiries, wrong for a list of conversations. Deep link
> is `m/contact-form/inbox/<id>`, which is a real per-enquiry page.
>
> **live-chat** (`liveChatConversationProvider`). Over the `lc_` mirror; Chatwoot stays the source
> of truth and nothing else in the module was touched - widget, settings, connection, webhook all
> untouched. **`send` goes through `chatwoot.sendMessage` with the acting person's own agent token**
> from `lc_admin_tokens`, so a reply is a genuine agent reply attributed to the colleague who wrote
> it. **E26 is handled as a sentence, not a forgery**: no token means the send is refused with
> "You have not connected your live chat account yet, so this reply would go out as somebody else.
> Connect it under Settings, Live Chat, and then send it again." A private Chatwoot note maps to
> `direction: 'note'` and can never render as something the customer saw. `markRead` clears the
> mirror and best-efforts Chatwoot - a chat that will not mark itself read at the far end is not a
> reason to fail the caller. Deep link is `inbox?tab=live-chat`: that module has no per-conversation
> URL, and inventing one would be a link to nowhere. Two new `db.ts` readers,
> `listConversationSummaries` (both statuses, which the screen's own tabs deliberately split) and
> `listConversationsByEmails`.
>
> **twilio** (`twilioConversationProvider`) - **and this is the one the API made awkward, as
> predicted.**
>
> - **Nothing is stored but voicemail.** Calls and texts are read live per site number, and there is
>   still no inbound-SMS webhook, so a text is only visible once a listing runs. **Realtime inbound
>   SMS is noted as future work and deliberately not built**: it is a webhook in the twilio module,
>   a `tw_` table and a signature check, which is its own piece of work.
> - **Three requests per number, and `Calls.json` filters on only one of To/From per request** - so
>   a listing is To + From + a Region-wide `Recordings.json`, and the texts are two more. That is
>   five requests per SMS-capable number. Hence **`MAX_NUMBERS = 4`, `PER_NUMBER = 50`, and a five
>   minute in-process cache** (`forgetCachedConversations()` drops it, and sending a text does). A
>   site with more numbers than that is **logged, not silently truncated** - "the rest are not
>   listed".
> - **Region is load-bearing.** A number's calls exist only in its own routing Region, so each
>   number is read with `number.region` from `getSiteNumbers()`. Get that wrong and the account
>   looks empty rather than erroring.
> - **A conversation is one outside NUMBER**, not one call: every call, voicemail and text with
>   +447700900123 is one story with one human, which is the whole point of the people layer.
>   `channel` is `'sms'` when there is nothing but texts and `'phone'` otherwise. Our own numbers
>   ringing each other (a forwarded call) are dropped - that is the phone system talking to itself.
> - **`unread` is always false**, because this module records nobody having looked at anything and
>   inventing a read flag would be a lie in both directions.
> - A withheld caller ('anonymous', or an empty From) is kept as a conversation but **refused for
>   texting in plain English** rather than failing at Twilio.
> - One new reader, `recentVoicemails()` in `lib/voicemail-log.ts`.
>
> ## The consumer half
>
> **`lib/provider-registry.ts`** - the manifest read, done here rather than borrowed from core.
> `resolveConversationProviders(user)` is core's and needs a session; **the tick has none, and must
> collect every channel the site has regardless of whose permissions are involved** - access is
> decided on the reading screen, not at collection. So: `allConversationProviders()` (no user, for
> the tick), `providerForModule(name)` (for replying), `visibleProviderModules(user)` and
> `visibleProviderChannels(user)` (labels + whether the channel can be answered). Same rules as
> core's resolver - installed modules only, generated registry decides what exists, non-providers
> skipped silently. **This is ~30 lines that mirror core; it was the alternative to a core change,
> and a core change is what the stage brief said to stop and ask about.**
>
> **`lib/provider-sync.ts`** - the mirror. Provider conversations become `uin_threads` rows with
> `provider_module` + `external_id`, their messages `uin_messages` rows with `source = 'provider'`.
> Bounded at every level: `PROVIDER_LIST_LIMIT = 40` asked for, `PROVIDER_THREAD_LIMIT = 25`
> opened, `PROVIDER_BUDGET_MS = 6_000` for the whole pass, **after** the mail and inside its own
> deadline (S3's collection budget was not reduced - a chat is safely in its own module and can be
> copied next tick; an email nobody fetched may be somewhere else by then).
>
> **There is no cursor table.** The watermark is `MAX(last_message_at)` per provider off our own
> threads, less a minute of slack, so the pass is resumable by construction: interrupt it anywhere
> and the next tick asks the same question and gets the right answer. First pass on a site with
> years of history takes **90 days** rather than everything.
>
> **A conversation is only OPENED when something has happened on it** - `providerThreadState()`
> compares what we hold against what the summary claims - so a settled channel costs one `list`
> call and nothing else. That is the difference between the telephony provider costing five
> requests an hour and costing five requests per conversation per hour.
>
> **A provider is another module's code running inside our pass**, so everything it returns is
> checked: an empty id, a date that will not parse or an unknown channel costs that conversation,
> a throwing `list` costs that channel, a throwing `thread` costs that conversation. One broken
> channel never stops another.
>
> **`lib/provider-send.ts`** - replying. It sends nothing itself: it asks the owning module, then
> records. **The owning module's own error message is passed through verbatim**, because it knows
> why its own send failed and "you have not connected your chat account" is a sentence somebody can
> act on. A channel whose module has gone answers "no longer installed" rather than throwing (E20).
>
> **The double-copy problem, and how it is solved.** A reply typed here is written down immediately
> so the person sees their own words, carrying a placeholder id `uin-out:<ms>:<userId>`. The far end
> then hands the same message back with an id of its own, which would be a second row saying the
> same thing. `claimLocalOutbound()` matches on same conversation + same text + within 15 minutes +
> still carrying our placeholder, and **rewrites the id in place**, so from then on the two are one
> message by the ordinary unique index. **The clean fix would be `ConversationProvider.send`
> returning the provider's own message id - that is a change to a core type, so it was not made.**
> Worth doing in S10 or v2 if core is being touched anyway; the current mechanism is deterministic
> but it is matching on prose.
>
> ## Access, and the change to the visibility clause
>
> **A provider conversation is governed by the owning module's own permission**, not by the inbox
> guest lists - it never had an address to be filed under. `visibilityClause()` gained a third arm,
> and the "not filed" arm was **narrowed to `inbox_id IS NULL AND provider_module IS NULL`**: before
> that, every chat and enquiry would have fallen into "Not filed", which means "an email nobody
> could place" and is manage-only. That one line is the difference between chat conversations being
> visible to the people who may read them and being visible only to an administrator, in a bucket
> labelled as something they are not.
>
> `listThreads`, `countThreads`, `unreadCounts` and `threadsForPerson` all take the provider list,
> so they cannot disagree - S5's rule, unchanged. `unreadCounts` now keys provider rows as
> `m:<module>`.
>
> **The rail gained an "Other channels" group**, one entry per provider module, addressed as
> `?inbox=m:<module>`. `parseInboxParams` returns `providerModule`; anything with the `m:` prefix
> takes that slot even if it names nothing, or `?inbox=m:` would have been read as an inbox id.
>
> ## People (S6 still holds)
>
> `resolveProviderThreadPerson` + `catchUpProviderPeople` run in the same `runPeoplePass` as the mail
> one, in their own batch, and `unresolvedThreads` was narrowed to email so the two passes cannot
> both claim a conversation. **A caller is recognised by their number**: `uin_messages.from_phone` is
> a NEW column, deliberately not folded into `from_address`, because that column is what email
> identities are matched on and a phone number in it would mint a person whose email address is a
> telephone number. Somebody who emailed in March and rang in April is now one person with two
> identities, which is the entire point of the layer. Same E18 gate as email - our inboxes, our
> staff and our own domains never become customers; a number is not put through it, because a number
> has no domain to judge and our own numbers never appear as the other party.
>
> ## Reply Catcher guard (D14, §5.7)
>
> `lib/reply-catcher-guard.ts`. If Reply Catcher is installed, its tables are present, it is
> configured for the plain mailbox kind, and its host+username match one of ours (case and
> whitespace insensitive), **that account is not collected** and the settings screen carries a
> plain-English notice naming the account and the mailbox with what to do about it. Refusing to
> collect is the right way round: the other module was there first and is filing into a screen
> somebody is already using, and mail left in a mailbox is not lost, whereas mail filed twice in two
> systems is a mess somebody unpicks by hand.
>
> **It deliberately does NOT stamp the account's last-checked time.** That stamp is what the Check
> now cooldown reads, and marking a blocked account "just checked" every tick would turn the button
> away for every other account too. The settings screen asks the same question directly.
>
> Reads only, raw SQL only, no import of that module's code, and **fails open**: a guard that cannot
> read must not stop the mail.
>
> **Deskwell runs Reply Catcher, contact form, live chat and telephony today.** So the day this hub
> is installed there, it lands straight into the two-pollers-one-mailbox configuration this guard
> exists for. **That makes the guard the first thing to check on that install, not a theoretical
> safeguard**: expect the mail account to refuse to collect and the settings screen to say why, and
> if it does not, stop before the second poller has filed a morning's mail twice.
>
> **E21 decided, and it is "none".** Reply Catcher's existing caught replies are NOT imported. They
> live in `rc_caught_replies` keyed to contact form submissions and are already visible on the
> contact form thread they belong to; importing them would mean writing another module's history
> into ours with no way to tell an imported copy from a collected one, and the hub's own collection
> will pick up anything still in the mailbox. **S9 must put that in the wiki** - the plan says not to
> leave it ambiguous, and this is the answer.
>
> ## E25, which was S7's and is now partly done
>
> `ownNotification()` in `lib/sync.ts`: inbound mail whose sender is the site's own sending address
> is marked `auto_kind = 'own-notification'`. So the contact form's "somebody filled in your form"
> email - and every order confirmation and purchase order email to an address we also collect - no
> longer marks a conversation unread and never mints a person. **What is NOT done is the folding**:
> it still lands as its own conversation rather than being attached to the form submission it is
> about. Doing that properly means matching an arriving email against a provider conversation by
> content, which is a heuristic with a real false-positive cost (attaching a customer's mail to the
> wrong enquiry), and the harm E25 actually names - every enquiry showing as two unread enquiries -
> is gone. **Left for S10 to decide deliberately rather than half-built.**
>
> Also fixed while in there: `AUTO_LABELS` in `ThreadPane` was keyed `'out-of-office'` and the engine
> writes `'auto-reply'`, so that label had never once appeared.
>
> ## Schema: a NEW file, `migrations/006_providers.sql`. 001 to 005 untouched.
>
> - `uin_messages.provider_module`, `uin_messages.from_phone`.
> - UNIQUE `(thread_id, provider_message_id)` partial on `source = 'provider'` - the dedupe the
>   whole mirror rests on.
> - Index `(provider_module, last_message_at DESC)` for the watermark.
>
> Both harness traps respected: no `$$` anywhere including comments, and the phrase for making a new
> table appears nowhere in this ALTER-only file.
>
> ## §7.7.5 - what was and was not confirmed
>
> **Confirmed by test, not by reasoning**: `modules/unified-inbox/lib/suppression.test.ts` reads the
> four REAL manifests off disk and puts them through core's own
> `conversationProviderModuleNames` / `conversationConsumerModuleNames`. With the hub present,
> contact-form's and live-chat's inbox tabs are the ones suppressed and the All tab stands down;
> without it, nothing is suppressed and two or more providers resolve, which is what earns core's
> All tab. Twilio is untouched by suppression because it has no inbox tab to take. Core's own eight
> tests in `lib/conversations/inbox-tabs.test.ts` already cover the RULE including E1's two users;
> this covers the WIRING, which is the half that is strings in a JSON file.
>
> **NOT confirmed on a running site**, and honestly flagged: the module is still not in
> `modules.json`, so it is not in the generated registry, and the only reachable database is the
> live Deskwell site. Nobody has watched a tab disappear. **The two-user check (a user who can see
> the hub, and one who cannot) exists only as core's unit tests.** First install is where somebody
> should actually look.
>
> ## Deliberately not done, and why
>
> - **Provider attachments are not mirrored.** Chat attachments are Chatwoot-hosted URLs; storing
>   them as `uin_attachments` rows would either mean a `media_key` that is not ours (the attachment
>   route and the media usage provider both assume our own storage) or copying somebody else's files
>   onto our storage bill without being asked. Contact form and telephony have none. **S8 should
>   decide whether chat attachments are worth fetching**; the message text is complete either way.
> - **No realtime inbound SMS.** A webhook in the twilio module, as the plan says.
> - **`markRead` is not called on the far end when a conversation is opened here.** Opening a chat in
>   this hub marks it read HERE. Reaching back into Chatwoot to mark it read there on every open is a
>   network call on a page render and a surprise for anybody using the Chatwoot app as well - worth a
>   decision, not a default.
> - **Nothing in `FIELD_NOTES.md`, no wiki page**: the module is not in `modules.json` and S9 owns
>   docs. S9 must now also cover E21 (no import of caught replies), the Reply Catcher refusal, what
>   "other channels" means in the rail, and that the phone conversation is per number.
> - **Nothing rendered in a browser this stage.** The rail gained one heading and a list of links
>   using the existing `.uin-rail` classes and tokens, and the settings notice is an existing
>   `alert-danger`. No new colour, no new surface. S5's render harness would have to be rebuilt for
>   two links; flagged rather than claimed.
> - **No commit, push or release.**
>
> ## Gates, in every repo touched
>
> `npm run typecheck` **exit 0** (not bare `tsc`). `eslint .` **exit 0**, no new `eslint-disable` or
> `@ts-ignore`. `npm test` **4,494 passed / 100 skipped / 0 failed** - this stage adds 65: 13
> contact-form, 9 live-chat, 14 twilio, 11 provider mirror, 10 provider replies, 8 the Reply Catcher
> guard, 12 the suppression wiring, 5 E25, 1 the rail's new address. The three channel modules and
> the hub are all in the same tsc program and the same vitest run, so "in each repo" is one command
> covering all four.
>
> `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with
> `[roundtrip] module schemas built: ... unified-inbox` confirmed in the output, so both columns 006
> adds survive a dump and restore. The OVH credentials were **parsed out** of the Deskwell `.env`
> rather than sourced - line 18's unquoted `&` kills the shell at exit 126 while reporting success,
> which is a gate that never ran wearing a green hat. `cactus_rt_*` throwaway databases dropped;
> the live Deskwell database was never named, opened or touched.

---

### 7.8 S8 - Retention, GDPR, backup, teardown, performance

**Goal:** it can be lived with for years, and legally.

**Work:**

1. Retention sweep on the sync cron or its own: messages older than the window are removed along
   with their attachment media. Never delete a message that is linked to a record without saying
   so first - offer "keep linked conversations" as a setting, defaulted on.
2. Per-person **export** (everything held about them, as a file) and **erase** (remove person,
   identities, threads and messages, with a confirmation that spells out exactly what goes).
3. `teardown` list in the manifest verified against the real tables, children first. Uninstall must
   leave nothing behind and must not fail on a foreign key.
4. Backup: `lib/backup/schema-coverage.test.ts` green, and `npm run test:backup-roundtrip` a real
   PASS. If a sequence was introduced anywhere, confirm it is carried - sequences are invisible to
   `information_schema.tables` and this has bitten before.
5. Performance pass with a realistic volume (tens of thousands of messages): list queries hit
   indexes, no query reads bodies for a list, search stays sane, the sync tick still finishes
   inside budget when the mailbox is large.
6. Cookie categories, CSP entries and any `outputFileTracingIncludes` the module needs - check the
   generators pick the module up correctly.

**Gates:** everything, including the round-trip PASS. This is the stage where a skip is a fail.

**Notes for later stages:**

> **Done 2026-08-29. All of S8 is in `modules/unified-inbox/` (module repo, version 0.1.6 in both
> `package.json` and `cactus.module.json`). NOTHING in core changed - core's working tree is clean
> of this stage, and the render harness described below was taken back out. `requiresCoreVersion`
> stays `0.5.1387`; nothing newer was needed. The module is still deliberately NOT in
> `modules.json`.**
>
> ## Schema: a NEW file, `migrations/007_retention.sql`. 001 to 006 untouched.
>
> **Two columns, no index, and the missing index is a finding rather than an omission.**
>
> - `uin_settings.retention_keep_linked` BOOLEAN NOT NULL DEFAULT true - requirement 1's setting.
> - `uin_settings.retention_last_run_at` TIMESTAMP(3) - so the screen can say when the last pass
>   was, rather than leaving the owner wondering whether anything happens at all.
>
> The first cut of this file added three indexes. **All three already existed**: 001 ships
> `uin_record_links_thread_idx`, `uin_threads_person_idx` and `uin_attachments_message_idx`, and a
> partial copy of an existing index under the same name is a `CREATE INDEX IF NOT EXISTS` that does
> nothing at all while reading like work. They were taken out and the reasoning left in the file.
> **Check `grep INDEX migrations/*.sql` before adding one** - this module has 44 of them already.
>
> Both harness traps respected: no `$$` anywhere including comments, and the phrase for making a new
> table appears nowhere in this ALTER-only file. Both are now **asserted by a test** rather than
> remembered - see the teardown guard below.
>
> ## Retention (requirement 1), and why it is a job of its own
>
> `lib/retention.ts`. `sweepRetention({deadline})` removes conversations whose newest message is
> older than the window, in batches of 50, committing each batch before the next. Blank window means
> nothing is ever removed, which is where every site starts.
>
> **The unit swept is the CONVERSATION, not the message.** Deleting the old half of a thread and
> keeping the recent half leaves a stub that reads as though the customer opened with a reply.
>
> **`retention_keep_linked` defaults ON and the screen shows both numbers.** With it on, a
> conversation carrying a `uin_record_links` row survives whatever its age. The settings screen shows
> "the next tidy-up would remove N conversations last written to before <date>" plus "another M are
> old enough but are being kept because something is attached to them" - **before** anything runs,
> from `retentionPreview()`, which shares its counting query with the sweep so the two cannot
> disagree. A window set for old mailing lists must not quietly take the correspondence behind a
> disputed invoice with it, and the second number is what makes that visible rather than lucky.
>
> **Stored attachments go BEFORE their rows.** An interrupted sweep then leaves an object in storage
> with nothing pointing at it - which core's storage check finds and offers up - rather than a row
> pointing at bytes that have gone. A storage failure is counted and carried, never fatal: keeping
> rows because storage was briefly unreachable would mean the window silently stopped working.
>
> **The location ledger keeps its row with a NULL thread**, by the FK 001 already declared. That is
> deliberate and load-bearing: it is what stops the next sync collecting the very mail the owner has
> just asked us to stop holding. There is a test asserting the ledger row survives the delete.
>
> **Orphans are pruned, carefully.** `pruneOrphanPeople` takes a person only if they hold no
> conversations, no links, nobody merged into them, no live merge row - **and nobody ever typed a
> name or a note on them**. A name or a note is somebody's own work. That is E8's other half, and
> there is a test with four fixtures covering exactly which of them survives.
>
> **`cron/housekeeping` is a NEW cron entry, daily at `40 3 * * *`.** Not another passenger on the
> mail tick: that 25 second slice is already spoken for by collection (18s), the channels (6s) and
> the people pass (to 22s), and none of those can wait, whereas removing a year-old conversation
> eleven hours later than it might have been costs nothing. **The manifest now declares two cron
> paths**, which is the only manifest change besides the version.
>
> **The stalled-send sweep DID go on the hourly tick**, because an hour is about as long as anybody
> should look at a message stuck saying "sending". `failStalledSends` marks anything in `'sending'`
> for more than 15 minutes as `'failed'` with a sentence - **marked, not removed**, because the row
> is the only evidence the attempt happened and a failed message has a Retry button. This is the
> thing S4 and S5 both left for S8; it is done. One update against the partial index 003 added, which
> on any ordinary site holds no rows.
>
> ## Export and erase (requirement 2), and exactly how far erase reaches
>
> `lib/person-data.ts`, plus `GET /api/m/unified-inbox/people/[id]/export`,
> `GET .../people/[id]/erase` (the preview) and `POST .../people/[id]/erase` (the deed). Both are
> **`unifiedinbox.manage`**, not the everyday view permission - downloading a customer's whole
> correspondence is a serious thing and is never a side effect of looking at a page.
>
> **Neither is filtered by the inbox guest lists, on purpose.** These answer a legal request about a
> named human. An export that quietly left out the inboxes this particular administrator happens not
> to be on would be a false answer to it. That is the one deliberate exception to E17 in the module,
> and it is bought with the strongest permission there is.
>
> **E22 is met by saying it, twice, in the interface and in the file.** The screen asks what would go
> before it offers the button, from `personErasePreview` - counted from the very tables the delete
> runs against, so the dialog and the deed cannot disagree. It lists what goes (conversations,
> messages, attached files, addresses, everything worked out about them) AND what does not: the
> records attached to their conversations **named by module**, their orders/invoices/quotes/member
> account, and core's record that N automated emails were sent to them. The export file carries the
> same three sentences in a `notIncluded` field at the top, because whoever opens it next may be a
> solicitor rather than the person who exported it.
>
> **Core's `EmailLog` rows are NOT deleted, and this is a decision worth reviewing.** Those rows hold
> the person's address and the subject of automated mail and never a body. Deleting core rows from a
> module is a bigger step than anything else in this stage, and the plan says to stop and ask before
> touching core. So: it is left, it is counted in the preview, and it is stated in plain English in
> both the dialog and the file. **S10 or Chris should decide whether a hub erase ought to reach it.**
> Under-deleting loudly is the safe side of that line; over-deleting silently is not.
>
> **The merge ledger is cleared by hand.** `uin_person_merges` holds no foreign key (so a merge
> survives its rows), so `deletePersonRow` deletes by `winner_id`/`loser_id` explicitly. There is a
> test asserting zero merge rows survive an erase - that is the assertion that catches it if somebody
> stops doing that.
>
> ## Teardown (requirement 3): verified against the real tables, by a test that runs for ever
>
> **`lib/teardown.test.ts` parses every migration and asserts three things**, with no database, so it
> can never be skipped and it covers 008 as well as 007:
>
> 1. the manifest's `teardown` list is **exactly** the set of tables the migrations create - neither
>    a table left off (which survives an uninstall) nor a name no migration ever makes (a silent
>    no-op that makes the list look more complete than it is);
> 2. every name carries the module's own prefix;
> 3. **children are listed before their parents**, checked against the foreign keys parsed out of the
>    migrations themselves, both the inline ones and the `ALTER TABLE ... ADD CONSTRAINT` ones.
>
> **The list as S2 wrote it is correct** - 15 tables, correct order, including `uin_person_merges`
> which S6 added. Nothing needed changing; what changed is that it is now checked rather than
> remembered. Core's uninstall uses `DROP TABLE IF EXISTS ... CASCADE`, so the ordering cannot
> actually fail on a foreign key, but a list in the wrong order is a list nobody has checked.
>
> **One thing uninstall does NOT take, and S9 should say so in the wiki:** the attachment objects in
> media storage. Teardown drops tables; the objects under `<media prefix>/unified-inbox/` stay. Once
> the media usage provider goes with the module they read as orphans, so core's storage check finds
> them and offers them up - visible and recoverable rather than a silent leak, but it is a step the
> owner has to take.
>
> ## Backup (requirement 4): a real PASS, and the sequence question answered
>
> `npm run test:backup-roundtrip` **4 passed, 0 failed**, with
> `[roundtrip] module schemas built: boards, contact-form, directory, google-tag, live-chat,
> purchase-orders, search, twilio, ultimate-seo, unified-inbox` - **`unified-inbox` named**, so 007's
> two columns survive a dump and restore. `lib/backup/schema-coverage.test.ts` green inside plain
> `npm test`.
>
> **This module owns NO sequence, anywhere, and that is now asserted rather than checked once.** The
> teardown test refuses `SERIAL`, `BIGSERIAL`, `CREATE SEQUENCE` and `GENERATED ... AS IDENTITY`
> across every migration, with a comment saying that the day one is genuinely needed, the backup's
> sequence handling is what to check before the line is relaxed. Every id in this module is a `TEXT`
> primary key defaulting to `gen_random_uuid()::text`, so there was never a counter to lose. The same
> test refuses `$$` in any migration file, comments included - the trap that has now bitten this
> module twice.
>
> **The credentials were parsed out of the Deskwell `.env`, never sourced.** Line 18's unquoted `&`
> kills the shell at exit 126 while the failure surfaces through whatever ran last, which is a gate
> that never ran wearing a green hat.
>
> ## Performance (requirement 5): measured, and it found two things
>
> A throwaway `cactus_rt_uinperf` database was provisioned on the OVH VPS with the round-trip
> harness's own helper, built with core's init migration and all seven of this module's, and seeded
> with **14,000 conversations, 30,800 messages, 6 inboxes, 3,000 people, 400 record links - 85MB of
> `uin_` tables**. Twenty-two tests: `EXPLAIN (ANALYZE, BUFFERS)` on every query the screens and the
> tick actually run, plus the destructive paths run for real. The database and its role were dropped
> afterwards and the server confirmed clean of `cactus_rt%`; the live Deskwell database was never
> named, opened or touched.
>
> **Finding 1, fixed: the conversation list joined the participant for every matching row, not for
> the 25 it showed.** `listThreads` sorted and paged AFTER the LATERAL join, so an All view spent
> 68ms and read 30,000 buffers to return a page - and that cost grows with the size of the MAILBOX
> rather than the size of the page, so the same screen on a site with ten times the mail would be ten
> times slower, for ever, on every page load. `THREAD_LIST_SELECT` is now `threadListQuery(where,
> limit, offset)`, which takes the page in an inner query first (an index scan, since the ordering is
> `uin_threads_last_message_idx`'s own) and joins only those rows. **68ms and 7,234 participant
> lookups became 9ms and 25.** Deep page 40: 72ms to 24ms. `threadsForPerson` shares it, so the two
> still cannot drift. **There is a test asserting both shapes return identical rows in identical
> order** across four filter and offset combinations, because a faster query that returns different
> rows is not a fix.
>
> **Finding 2, NOT a defect, and the way it nearly became a wrong "fix" is the useful part.** The
> first measurement showed search taking 4.7 seconds and never opening `uin_messages_search_idx`. It
> looked exactly like S5's correlated `EXISTS` being the wrong shape, and an uncorrelated
> `t.id IN (SELECT ...)` was written to replace it. **The real cause was the fixture**: every seeded
> message carried the same body, so the search term matched 52% of the table and Postgres was quite
> right to ignore the index. With varied bodies, the shipped shape answers in **20ms using the GIN
> index**, and the "fix" measured the same to within noise. The change was reverted and the finding
> written into `lib/db.ts` as a warning for whoever measures this next. **A fixture where every row
> is the same is how a measurement tells you the opposite of the truth.**
>
> **Everything else, at that volume:** one inbox page 1 **0.5ms**; the count **6ms**; the rail's
> unread tallies **1.4ms**; one conversation **0.06ms**; a person's conversations **0.1ms**; the
> retention batch **0.7ms**; the retention preview **40ms**; the stalled-send sweep **0.06ms**; the
> erase preview **0.3ms**. The sync engine's own lookups - `findMessageByIdentity`,
> `threadsForMessageIds`, `candidateThreads`, `unresolvedThreads` - are all **under 0.15ms**, so a
> big mailbox costs the tick nothing beyond the mail it is actually fetching. **No list query reads a
> body column**, asserted in the harness against the real column list.
>
> Remaining sequential scans are all on `uin_threads` where the access filter matches about half the
> table, which is the planner making the right choice rather than a missing index.
>
> **The destructive paths were RUN, not just planned.** The sweep keeps linked conversations and
> takes unlinked ones; the delete cascades to messages while the location ledger survives; the orphan
> prune spares a named person, a noted person and a linked person and takes the bare one; a stalled
> send is failed while a live one is not; an erase removes the person, their conversations, their
> identities and their merge rows and leaves the neighbour's conversations exactly as they were; an
> export carries the message bodies and states its limits. All 22 green.
>
> ## Generators (requirement 6): run, not assumed
>
> The generators read `modules.json`, and this module is deliberately not in it - so a scratch root
> was built (a copy of `scripts/`, a symlink to `modules/`, and a `modules.json` with the entry
> added) and the real generators were run against it. **All five pick the module up correctly**:
> `generate-module-router` emits all 26 routes including the new `cron/housekeeping`,
> `people/[id]/export` and `people/[id]/erase`; `generate-module-settings-tabs` lists it;
> `generate-module-extension-points` emits both entries; `generate-module-csp` and
> `generate-module-cache-cookies` correctly emit nothing for it. The manifest was also put through
> core's own `ModuleManifestSchema` and parses, with both cron schedules.
>
> - **`cookieCategories: []` is right.** `grep` for `document.cookie`, `cookies()`, `Set-Cookie`,
>   `localStorage` and `sessionStorage` across the module returns nothing. It is an admin surface that
>   rides on core's session and sets nothing of its own.
> - **No `cspOrigins`, still.** S5's reasoning holds: the message body is served from a route with its
>   own policy rather than a `srcdoc` frame, and remote images are proxied through our own route, so
>   `img-src 'self'` covers it. Nothing to declare.
> - **No `outputFileTracingIncludes` needed.** Those keys are for files read via `fs` at runtime that
>   the tracer cannot see statically. This module reads no such file - the only `fs` use anywhere in
>   it is a test reading manifests - and its dependencies (`imapflow`, `mailparser`) are ordinary
>   static imports the tracer follows. The existing generic `'/api/m/**'` key already covers module
>   assets, and a key naming this module would be a leak into core besides.
>
> ## Rendered in both themes, and it found a real failure
>
> A temporary `app/uin-preview/page.tsx` plus a client wrapper rendered the two new surfaces - the
> erase panel and the retention settings block - side by side in `data-theme="light"` and
> `data-theme="dark"` panes, with a two-line `ALWAYS_PASS` entry in `proxy.ts`. **All three are gone
> and core's `git status` is clean of them.** No database was needed. The wrapper stubs the one
> request `PersonActions` makes, so the panel opens through its **real** code path rather than by
> copying its markup into the harness where it could quietly drift.
>
> **The failure, which was only visible by looking:** the erase panel is an `alert-danger`, and
> `alert-danger` sets its own text colour - core's danger red, which on its own tinted ground measures
> **4.4:1 at 15px in light mode**. Under AA, on the one block of text somebody must read carefully
> before taking a customer's history away. The body and both headings are now `--color-text`; the
> alert's tint, its border and the red button carry the seriousness, and the words only have to be
> readable. **Light: 30 elements, zero failures, lowest passing 4.9:1. Dark: 30 elements, one
> failure.**
>
> That one dark failure is **core's own `.btn-primary` problem wearing a different jacket**: white on
> `.btn-danger`'s red is **3.87:1** at 13px, on every button of that class on every admin screen.
> Left alone deliberately, exactly as S5 left `.btn-primary` at 3.61:1. **Somebody should take both
> to core at once** - they are the same decision about the same two button colours.
>
> At 375px: one column, `scrollWidth === clientWidth`, nothing overflowing the viewport.
>
> ## Deliberately not done, and why
>
> - **`attachment_fetch = 'always'` still behaves as `'lazy'`.** S3 flagged it for here. Pulling every
>   attachment on an account through a cron slice needs its own budget, its own resumable cursor and
>   its own storage-cost conversation with the owner, which is a piece of work rather than a setting.
>   **The honest options are to build it properly or to rename the option**, and renaming a setting is
>   S9's territory. Still open.
> - **Chat attachments are still not mirrored.** S7 asked S8 to decide. **Decided: no.** They are
>   Chatwoot-hosted and Chatwoot holds them; copying somebody else's files onto the site's storage
>   bill without being asked is not a default, and the message text is complete either way. If a site
>   wants it, it wants to be a setting with a size cap, which is a v2 question.
> - **`?q=` still uses `websearch_to_tsquery('english', ...)`.** S5 noted making the dictionary a
>   setting is "S8-shaped". It is not: changing the dictionary changes the expression, and the query
>   must spell the expression EXACTLY as the index declares it, so a per-site dictionary means a
>   per-site index and a reindex of every message on the site. That is a migration strategy, not a
>   setting. **Left as a v2 question with the reason written down.**
> - **No retention "run it now" button.** The preview tells the owner what would happen and the daily
>   job does it. A button that removes several hundred conversations while somebody watches is a
>   button somebody presses to see what it does.
> - **Nothing in `FIELD_NOTES.md`, no wiki page.** The module is not in `modules.json` and S9 owns
>   docs. **S9 must now also cover:** what the retention window does and that it cannot be undone;
>   that "keep linked conversations" is on by default and why; that export and erase are
>   administrator-only; **that erase is hub-only and exactly what it does not touch (E22)**, including
>   core's record of automated mail; and that uninstalling leaves the attachment objects in storage
>   for the storage check to find.
> - **No commit, push or release.**
>
> ## Gates, all genuinely green
>
> `npm run typecheck` **exit 0 for this module** - the only errors in the tree are six files under
> `plans/unified-inbox-webhooks/`, another agent's untracked work in progress that appeared partway
> through this stage. Nothing in `modules/unified-inbox` errors. `eslint .` **exit 0**, no new
> `eslint-disable` or `@ts-ignore` anywhere in the stage. `npm test` **4,515 passed / 100 skipped /
> 0 failed**; this stage adds 12 permanent tests (5 teardown and migration guards, 7 retention
> arithmetic and budgets) on top of S7's 4,494, the rest of the growth being another agent's.
> `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with `unified-inbox` named in
> the schemas it built.
>
> Core leak grep is empty, both forms. `cactus_rt%` databases and roles on the VPS confirmed gone
> afterwards - the server was queried directly for both, and answered with nothing.

---

### 7.9 S9 - Docs, art, packaging

**Goal:** a site owner can install it and understand it without asking anyone.

**Work:**

1. **Wiki** - new `wiki/Unified-Inbox.md`, written for site owners in the house voice: dry,
   British, no jargon. Cover: what it is, setting up a connection, adding inboxes, why an inbox is
   not an account, Brevo sender authentication, the Sent-folder toggle and what each choice means,
   how often it checks, what the context rail shows, access control, retention and erasure, and the
   Reply Catcher relationship (D14 - superseded, recommend removal, never run both on one mailbox).
   Update `wiki/Reply-catcher.md` with the superseded notice, `wiki/Modules.md`,
   `wiki/Architecture-overview.md` (new extension point, new core table, changed email payload),
   `wiki/Configuration-reference.md` if any env var moved, and the Live Chat, Contact form and
   Twilio pages where the new provider changes where a person answers messages.
   Then push the wiki separately:
   ```bash
   cd wiki && git add -A && git commit -m "Unified Inbox" && git push
   ```
2. **README** module list in core - add Unified Inbox.
3. **Module card art** - write the prompt first, get it approved, then place the image in all three
   places the other modules use (`module-art.webp` in the module, `public/module-art/`, and the
   listing).
4. **FIELD_NOTES.md** - routes, tables, permissions, cron paths, settings keys, extension points.
5. Packaging: `modules.json` entry and version pin **only once Chris has created the repo and asked
   for it**. Confirm `requiresCoreVersion` matches the core release that carries the S1 seam, and
   remember a core release does not carry module pins to an install - the two must work in either
   install order.

**Gates:** `npm run typecheck`, `eslint .`, `npm test`. Wiki pushed. No commits to core or the
module without Chris asking.

**Notes for later stages:**

> **Done 2026-08-29. S9 is a DOCS AND PACKAGING stage and touched no code.** Everything is in
> **core** (`modules.json`, `README.md`, `FIELD_NOTES.md`, `public/module-art/unified-inbox.webp`,
> `plans/module-card-art-prompts.md`, this file) and in **`wiki/`, which is a separate git checkout
> and is pushed on its own**. `modules/unified-inbox/` was not touched at all - its working tree is
> clean and v0.1.6 is already tagged and released - so there is **no module release in this stage**.
>
> ## The packaging step, which is the part that makes any of this real
>
> **`modules.json` now carries the entry**, appended after `purchase-orders` in the shape every
> other entry uses:
>
> ```json
> { "name": "unified-inbox",
>   "repoUrl": "https://github.com/cactus-foundation-modules/unified-inbox",
>   "version": "v0.1.6" }
> ```
>
> **The three channel modules were bumped with it**, caught in review: `modules.json` still pinned
> the pre-S7 releases, so a site would have taken the new hub alongside the old versions of the very
> three modules meant to feed it. `contact-form` v0.1.37 -> **v0.1.38**, `live-chat` v0.1.20 ->
> **v0.1.21**, `twilio` v0.1.29 -> **v0.1.30**. All three tags and releases were confirmed on GitHub
> and match the manifests on disk, and all three declare `requiresCoreVersion: 0.5.1383`, which any
> core carrying this pin already satisfies. Remember these pins are for fresh installs and this
> repo's own build: **an existing install updates its own modules**, which is exactly why S7 wrote
> both halves to work in either order.
>
> Chris was asked directly whether to pin now or after the S10 review and chose **now, in stage 9**,
> so §7.9.5's condition is met. `v0.1.6` exists as a tag and as a GitHub release (all seven releases
> so far are pre-releases). **S10 must re-check this pin before the release is cut**: if S10 ships a
> fix the module version moves, and a pin naming a tag that is not the newest is worse than no pin.
>
> **`requiresCoreVersion` stays `0.5.1387` and is correct.** 0.5.1383 carries the S1 seam; 0.5.1387
> carries `EmailPayload.from`/`transport`, without which a per-inbox sending identity is impossible,
> so 1387 is the real floor. Core was on 0.5.1394 when this was written and moves several times an
> hour, so read `package.json` and `git log` at the moment of committing rather than trusting that
> number.
>
> **The generators were run against the REAL registry**, not S8's scratch root, and pick the module
> up correctly: `generate-module-router` emits its routes including both cron paths (32 modules now),
> `generate-module-settings-tabs` lists it as the 27th tab, `generate-module-extension-points` emits
> both entries with the inbox panel withheld from the public map and the media-usage provider
> deliberately left in it, and `generate-module-csp` / `generate-module-cache-cookies` emit nothing
> for it, as expected.
>
> ## Card art: already done, verified rather than trusted
>
> Nothing was generated, prompted for or re-encoded. All three homes confirmed on disk:
> `public/module-art/unified-inbox.webp` (RIFF WebP, **1200x675, 10.3KB**, untracked in core and
> staged by this stage), `modules/unified-inbox/module-art.webp` (identical dimensions, already
> committed and released in the module repo), and the `<img src="module-art.webp">` block above the
> title in the module's README. `plans/module-card-art-prompts.md` carries the prompt as entry 33
> with the count bumped from 32 to 33.
>
> ## Wiki (separate checkout - commit and push on its own)
>
> **New: `wiki/Unified-Inbox.md`** (~3,200 words), owner-facing, British, no em dashes, no jargon
> beyond "app password" which the Reply Catcher page already uses. It leads on the one idea the rest
> depends on - **a mail account and an inbox are two different things** - then covers connections and
> folders, adding inboxes and routing, sending identity and the Brevo authentication step, the
> Sent-folder copy, attachment limits, how often it checks (**hourly on paid, once a day on Hobby**,
> said plainly), the screen, the other channels, people, the context rail, permissions and per-inbox
> access, retention, export and erase, Reply Catcher, uninstalling, and a "not in this version" list.
>
> **Changed:** `Reply-catcher.md` (superseded block above the fold: what supersedes it, never both on
> one mailbox, what happens when they clash, and that already-caught replies are not imported),
> `Modules.md` (footer link), `Contact-form.md` / `Live-Chat.md` / `Twilio.md` (each says where
> answering moves when the hub is installed, that everything else about the module is untouched, and
> the one thing peculiar to that channel - the chat agent token, the phone conversation being per
> number, the contact tab staying for colleagues who lack the hub's permission),
> `Architecture-overview.md` (new **Conversations, and the record of what the site sent** section
> covering `core.conversation-provider`, the All tab, per-user suppression, `serverOnly` and the
> `EmailLog` ledger; plus core's cron count corrected from four to five),
> `Authoring-a-module.md` (the `core.conversation-provider` row in the extension-point table, the
> `serverOnly` row in the contributed-entry field table, and the `consumesConversationProviders`
> manifest key), and `Configuration-reference.md` (what the outgoing email log holds, what it never
> holds, and its twelve-month sweep).
>
> **Staging warning for whoever commits.** `wiki/*.md` files show as modified in **core's** status as
> well, because core tracks stale copies of them at the same paths. They are already committed and
> pushed in the wiki repo. **Never stage a `wiki/` path in core.** Other agents also have
> `Members.md` and `Product-3D-views.md` open in the wiki checkout - stage only the eight files
> listed above.
>
> ## The five things the docs say out loud
>
> Each shipped deliberately, each now written down where an owner will find it rather than discover
> it: `attachment_fetch = 'always'` behaves as `'lazy'`; uninstalling leaves the attachment objects
> in media storage for the library's Unused count to offer up; the site's own notification mail is
> recognised and kept quiet but **not yet folded onto the enquiry it describes**, so a form
> submission can still read as two things; **erasing a person does not remove core's `EmailLog`
> record of automated mail sent to them** (described as behaviour, with no promise of a change -
> S10's call); and two people replying at once is not handled at v1. Sending identity per inbox
> **does** work, and the wiki says so as the plain answer rather than as a caveat.
>
> ## FIELD_NOTES and README
>
> `FIELD_NOTES.md` gained a dated top entry (what was registered, what the generators emitted, what
> the docs say honestly) and a full **### Unified Inbox** section in the Modules inventory: manifest,
> the core seam it consumes and why `requiresCoreVersion` is 1387 rather than 1383, all 15 tables and
> seven migrations, both harness traps and the tests that now assert them, all 26 routes, both cron
> paths and their budgets, the Message-ID identity rule, the send order, the attachment and email-HTML
> isolation, the single-place visibility clause, the measured performance numbers, the three provider
> modules, and every deliberate v1 limit. The Modules preamble count moved to thirty **and now notes
> that its own list has lagged `modules.json`, which registers 32** - a pre-existing drift, flagged
> rather than silently patched. `README.md` gained the module in the available-modules list and in
> the wiki links line.
>
> ## Gates
>
> `npm run typecheck` **exit 0** (not bare `tsc`). `eslint .` **exit 0**.
> `npm test` **4,506 passed / 100 skipped / 0 failed**, 334 files - including
> `lib/modules/extension-points-public.test.ts`, which is the guard that matters now the module is in
> the real registry. No round-trip run: this stage changed no migration and no serialiser, and the
> module's schema was gated as a real PASS at S8.
>
> Isolation greps clean: `git grep "modules/unified-inbox"` outside `modules/`, `wiki/` and `plans/`
> returns only `modules.json` and the two documentation files, and a case-insensitive grep for the
> module's name in any form across core **code** returns nothing at all.
>
> ## What S10 inherits
>
> - **Re-check the `modules.json` pin against the module's newest release before the core release is
>   cut.** If S10 changes anything in `modules/unified-inbox/`, that is a module release and a pin
>   bump, and the wiki may need a line changing with it.
> - **Three open questions are documented as current behaviour, not as promises**, so a decision
>   either way costs a paragraph: `attachment_fetch = 'always'`, whether erase should reach core's
>   `EmailLog`, and whether the site's own notification mail should fold onto the enquiry (E25's
>   remaining half).
> - **Nobody has watched a tab disappear on a running site.** Suppression is covered by core's unit
>   tests and by the module's manifest-wiring test, and the first install is still where somebody
>   should look - along with the Reply Catcher guard, which on Deskwell will fire on day one.
> - Two core-wide contrast failures found at S5 and S8 are still open and are **core's**, not this
>   module's: `.btn-primary` white-on-green at **3.61:1** and `.btn-danger` white-on-red at
>   **3.87:1**, on every admin screen. They are one decision about two button colours and should be
>   taken to core together.
> - **Committed, pushed and released**, on Chris's standing authorisation for every stage of this
>   run, once the chief-of-staff session had re-verified the gates on the corrected tree.
>   **Core `v0.5.1395`** - seven files (the six above plus `package.json`), pushed to `origin`, tag
>   confirmed to dereference to `main` HEAD (`44b08975`) rather than trusted through the chain, notes
>   passed with `-F` and the release flagged prerelease. The plan file's diff is +957 lines, because
>   core's tracked copy was the version S1 started from: **this one commit carries every stage's
>   notes, S1 to S9.** The **wiki** went as its own commit and push to its own remote,
>   nine files (`ceb853a`); `Members.md` and `Product-3D-views.md` were left dirty there, being
>   another agent's.
> - **These closing lines are NOT in that release** - they describe it, so they could not be. They
>   sit uncommitted in the working tree for S10's own plan commit to carry, rather than costing a
>   second core release for one paragraph.

---

### 7.10 S10 - Full review and fixes

**Goal:** find what the previous nine stages got wrong, and fix it.

This is a real review, not a victory lap. Read the whole diff across every repo touched, against
this plan and against the standing rules. Fix what you find; if a fix is too large to be safe,
write it up plainly rather than half-doing it.

**Checklist:**

- **Decisions**: walk D1 to D18 and prove each one is actually implemented as decided.
- **Isolation**: nothing named after Unified Inbox in core or in another module; the grep in §5.3
  is clean; no other module gained a column, a table or a UI branch for our benefit; provider files
  read as generic.
- **Dead weight**: the core headers passthrough has a live consumer; the `EmailLog` write has
  callers; no orphan helper, no speculative "generic" infrastructure with no user
  (this exact failure happened during Reply Catcher).
- **Data safety**: dedupe genuinely holds across restarts and uidvalidity changes; no path mutates
  a mailbox except the guarded APPEND; secrets encrypted at rest and never returned to the browser;
  erase really erases.
- **Backup**: `npm run test:backup-roundtrip` real PASS, coverage test green, teardown complete.
- **Budget**: sync completes inside the dispatcher's 25s slice on a large mailbox; no route
  approaches the 60s ceiling.
- **UI**: tokens not hex; AA in light and dark; mobile width sane; the panel renders identically
  wherever it is hosted; empty and error states are honest.
- **Copy**: British spelling, no em dashes, no jargon in owner-facing text, error messages that
  say what to do next.
- **Checks**: `npm run typecheck`, `eslint .`, `npm test` all zero errors and zero warnings, in
  core and in every module repo touched. No new `eslint-disable` or `@ts-ignore` without a
  justification on the same line.
- **Docs**: wiki matches what was actually built, FIELD_NOTES current.

Finish with a written summary for Chris: what was built, what was fixed in review, what was
deliberately deferred to v2 (expected: inbound SMS webhook, labels, sender-domain routing rules,
AI drafting), and what he needs to do himself (create the repo, authenticate Brevo senders, decide
when to retire Reply Catcher on Deskwell).

**Notes:**

> **Done 2026-08-29. The review found two real defects, both fixed, both in
> `modules/unified-inbox/` (version 0.1.7 in both `package.json` and
> `cactus.module.json`). Core's only change is the pin, this file and
> `FIELD_NOTES.md`. `requiresCoreVersion` stays `0.5.1387`.**
>
> ## Defect 1: a channel conversation was administrator-only for everything but replying
>
> Six routes decided who may act on a conversation with `thread.inboxId ? canViewInbox : manage`.
> That reads "in no inbox" as "an email nobody could place", which is an administrator's problem -
> and a chat, an enquiry or a call is in no inbox **by nature**, because it never had an address
> to be filed under. S7 got this right in the rail, in the list query and in the send route, and
> the other six were left behind.
>
> So a colleague who could plainly see a chat on their screen, and answer it, could not mark it
> done, snooze it, assign it, leave a note on it, attach an order to it, or open an enquiry's own
> HTML - every one of those answered 403 unless they held `unifiedinbox.manage`. Worse and
> quieter: **mentioning somebody on a channel conversation raised no notification at all**, because
> the mention check was `thread.inboxId ? canUserViewInbox(...) : false`. Nothing failed; the
> colleague was simply never told.
>
> This is E1's shape a second time - a permission rule that locks somebody out of the thing they
> are looking at - and it would have shown up on Deskwell on day one, which runs all three channels.
>
> **Fixed in one place rather than six.** `lib/access.ts` gains the pure `threadAccessKind()`,
> which names the three shapes a conversation has (`filed`, `channel`, `unfiled`), plus
> `canOpenThread(user, thread)` and `canUserOpenThread(userId, thread)` built on it.
> `lib/provider-registry.ts` gains `providerPermissionFor(moduleName)`, so a colleague's own
> permissions can be checked against the owning module's key the way `canUserViewInbox` already
> reads a colleague's role. A channel whose module has gone answers `known: false` and therefore
> nobody, which keeps E20 intact. `getMessageHtml` now returns `providerModule` beside `inboxId`,
> because two of the six routes ask about a message rather than a conversation.
>
> Three tests on `threadAccessKind` - the distinction is the defect, so it is the assertion.
>
> ## Defect 2: the hourly tick could be reaching past the dispatcher's abort
>
> Every pass in `cron/sync` holds its budget honestly, but each one takes it **from the clock when
> that pass begins**. Collection running to the edge of its 18 seconds therefore handed the
> channels a fresh 6 on top, and the people pass its own deadline after that - so the tick could
> still be working when the dispatcher aborts it at 25 seconds. Nothing is lost when that happens,
> because every pass commits as it goes, but the run's own summary is never written and the
> settings screen cannot say what happened. `CRON_TICK_DEADLINE_MS = 24_000` and
> `MANUAL_TICK_DEADLINE_MS = 52_000` (the manual route's ceiling is 60) now cap the later passes
> against the start of the run. Two tests.
>
> ## What the review checked and found sound
>
> - **D1 to D18 all implemented as decided**, with one deviation, below.
> - **Isolation**: `git grep` for the module's name in any form across core code is empty; the only
>   mentions anywhere in core are `modules.json`, `README.md` and `FIELD_NOTES.md`, which is
>   registration rather than leakage. All three provider files name no consumer, and all three set
>   `serverOnly`; `lib/modules/extension-points.public.ts` contains no provider.
> - **Dead weight**: the core headers passthrough has a live consumer (`outgoingHeaders` in
>   `lib/compose.ts`), `EmailPayload.from`/`transport` have one (`lib/transport.ts`), and
>   `recordEmailSend` is called on both paths out of `sendEmail`. Core's All tab is wired into
>   `app/cactus-admin/inbox/page.tsx` and cannot be reached by asking for an unknown `?tab=` when it
>   is suppressed - `activeId` is chosen from the strip, which does not contain it.
> - **Data safety**: `recordEmailSend` genuinely never throws, so a missing `EmailLog` table cannot
>   take an order confirmation down with it. No `Media` row is minted anywhere in the module. No
>   secret is decrypted outside `lib/transport.ts` and `credentialsForConnection`. Every one of the
>   26 routes checks a session and a permission; the ACL lives inside the SQL in one place.
>   `claimLocalOutbound` claims the oldest matching placeholder and rewrites it, so two identical
>   replies inside the window claim one row each rather than colliding.
> - **Backup**: `npm run test:backup-roundtrip` **4 passed, 0 failed - a real PASS**, with
>   `[roundtrip] module schemas built: ... unified-inbox` in the output. The OVH credentials were
>   parsed out of the Deskwell `.env`, never sourced. `cactus_rt%` databases and roles on the VPS
>   confirmed gone afterwards by querying the server directly; the live Deskwell database was never
>   named, opened or touched.
> - **UI and copy**: no hex anywhere in the module's components, one `eslint-disable` and it carries
>   its justification on the same line, no em dash in any file of the module or in the wiki page, no
>   American spelling in either.
> - **Checks**: `npm run typecheck` exit 0, `eslint .` exit 0, `npm test` green.
>
> ## The one deviation from a locked decision - PUT TO CHRIS, AND ACCEPTED
>
> **D12 says attachments come "from the media library or a fresh upload", and there is no fresh
> upload.** The composer picks a file by where it already lives in storage, because the send path
> takes a media key rather than a filename and a size out of a request body, which would be a
> claim. So a file that is not in the library yet has to be put there first - one more step than
> D12 imagined, and the wiki says so plainly rather than hiding it. Building the upload properly
> means an upload control, gating it on the viewer's own media permission, and a render check in
> both themes; that is a piece of work rather than a review fix, and half of it would be worse than
> none. The same step is what stands between D12's "email this supplier about PO-1234 with the PDF
> attached" and being one action.
>
> **Chris answered: "accept the attachment thing as documented, ship it."** So this is settled
> behaviour rather than an outstanding defect - the wiki already describes it, nobody is to build
> the upload as a fix, and it sits on the v2 list below. D12 stands as decided in every other
> respect.
>
> ## The v2 list
>
> Deliberately not in v1, each with its reason already written down somewhere above or in the
> stage that met it:
>
> - **A fresh upload from the composer** - accepted as documented, above. A file goes in the media
>   library first.
> - **Inbound SMS in real time.** A webhook in the twilio module, a `tw_` table and a signature
>   check. Texts appear on the ordinary check until then.
> - **Labels of your own.** Status, assignee and the inbox are what there is.
> - **Filing rules by sender or subject.** Filing is by the address post was delivered to, plus a
>   catch-all (D11).
> - **Suggested replies.** Nothing writes anything for anybody.
> - **Two people replying at once** (E24), and **chat attachments mirrored onto our own storage**
>   (S7 asked, S8 decided no), and **a per-site search dictionary** (a per-site expression index and
>   a reindex of every message, so a migration strategy rather than a setting).
> - **`attachment_fetch = 'always'` doing something different from `'lazy'`** - it needs its own
>   budget, its own cursor and a storage conversation with the owner. Documented as it stands.
> - **The site's own notification mail folded onto the enquiry it describes** (E25's remaining
>   half). The harm E25 named - every enquiry showing as two unread ones - is already gone.
>
> **Awaiting Chris's decision, listed here so they are not mistaken for faults:**
>
> - Whether **erasing a person should reach core's `EmailLog` rows**. Today it does not, and says so
>   in the dialog, the export and the wiki.
> - Whether **`ConversationProvider.send` should return the provider's real message id**. It is a
>   core type change; until it does, a reply is claimed by conversation, text and a fifteen minute
>   window.
>
> ## Still open, and still not S10's to decide
>
> Both were put to Chris rather than implemented, exactly as S8 and S7 asked, and both are on the
> v2 list above **awaiting his answer rather than as faults**:
>
> 1. **Should erasing a person remove core's `EmailLog` rows for them?** Today it does not, it is
>    counted in the preview and stated in the dialog, the export and the wiki. Under-deleting
>    loudly is the safe side of the line, and deleting core rows from a module is a bigger step
>    than anything else in the module.
> 2. **Should `ConversationProvider.send` return the provider's own message id?** It is a core type
>    change. Until it does, `claimLocalOutbound` matches a reply on conversation, text and a
>    fifteen minute window - deterministic, but matching on prose.
>
> **Two core-wide contrast failures are still open and are core's, not this module's**:
> `.btn-primary` white-on-green at **3.61:1** and `.btn-danger` white-on-red at **3.87:1**, on every
> admin screen. One decision about two button colours, and it wants taking to core on its own.
>
> **Nobody has still watched a tab disappear on a running site**, and nobody has seen the Reply
> Catcher guard fire. Both are covered by tests and both will happen on Deskwell the day the hub is
> installed there - which is why the guard is the first thing to look at on that install rather
> than a safeguard to assume.

---

## 8. Standing rules recap (the ones most likely to be forgotten mid-build)

- Never commit, push or release unless Chris says so in that turn. Never `git add .`.
- Never run `npm run build` unless Chris asks for a build in that turn.
- Never update a live install. Release, hand over, stop.
- Never hand-apply DDL to Deskwell's database. A reconcile file or nothing.
- Core schema change = edit the init migration in place **and** add an idempotent
  `prisma/core-reconcile/NNN_*.sql`. Module schema change after the first release = a **new**
  numbered migration file, never an edit to `001`.
- `lib/modules/router.ts` and `lib/puck/module-components.ts` are generated. Never hand-edit.
- Do not delete "unused" code on static evidence alone - module wiring is referenced by string at
  runtime.
- British spelling, no em dashes, dry wit in owner-facing copy.
