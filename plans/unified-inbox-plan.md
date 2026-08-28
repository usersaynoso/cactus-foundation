# Unified Inbox - build plan

**Status:** in progress - S1 done, S2 next
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
| S2 | Module skeleton, schema, connections and inboxes settings | module (+ core pin later) | NOT STARTED | § 7.2 |
| S3 | IMAP ingest engine | module | NOT STARTED | § 7.3 |
| S4 | Send path (Brevo, identity, threading headers, APPEND) | module | NOT STARTED | § 7.4 |
| S5 | Inbox UI (rail, list, thread, composer, workflow) | module | NOT STARTED | § 7.5 |
| S6 | People, identity resolution, context rail adapters | module | NOT STARTED | § 7.6 |
| S7 | Channel providers: contact-form, live-chat, twilio | 3 module repos + module | NOT STARTED | § 7.7 |
| S8 | Retention, GDPR, backup, teardown, performance | module (+ core if log sweep) | NOT STARTED | § 7.8 |
| S9 | Docs, wiki, module art, packaging, release readiness | core + module + wiki | NOT STARTED | § 7.9 |
| S10 | Full review and fixes | all | NOT STARTED | § 7.10 |

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

> _(S2 agent: fill in. Especially: final table and column names if they drifted from §4.2, the
> exported names in `lib/db.ts`, and how a connection's folders are discovered.)_

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

> _(S3 agent: fill in. Especially: the exact budget numbers you settled on, how you normalise
> subjects, and anything iCloud does that the RFCs do not predict.)_

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

> _(S4 agent: fill in. Especially: the exact header set you emit, and anything Brevo does to
> headers in transit.)_

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

> _(S5 agent: fill in. Especially: component names S7 needs to render provider-backed threads.)_

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

> _(S6 agent: fill in. Especially: adapter interface, and which installed-checks you used.)_

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

> _(S7 agent: fill in. Especially: version numbers you bumped, and anything the Twilio API made
> awkward.)_

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

> _(S8 agent: fill in.)_

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

> _(S9 agent: fill in.)_

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

> _(S10 agent: fill in.)_

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
