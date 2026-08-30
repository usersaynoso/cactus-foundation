# Call Masking for Shop - module plan

Status: plan only, nothing built.
Date: 2026-08-29 (revision 3 - Unified Inbox integration; revision 2 - safety
guards, callback branch, multi-supplier, transcription)

## Purpose

A supplier fulfilling a customer delivery often needs to ring or text the
customer to arrange it. We do not want to hand the supplier the customer's real
number. This module gives the supplier a throwaway Twilio number instead.

- Supplier rings the masked number, gets bridged to the customer.
- Customer's phone shows our main company number, not the masked one.
- Supplier texts the masked number, the text reaches the customer.
- Customer replies or rings back, and reaches the supplier.
- Every call is recorded **and transcribed**, every text is stored, so a
  delivery date agreed on the phone is written down rather than buried in an
  audio file nobody will ever play.
- The masked number stops pointing at the customer the moment the order is
  marked completed.
- Numbers are pooled, reused, bought automatically when the pool is dry, and
  released on the last day before Twilio would charge a second month.
- If the site runs the Unified Inbox, every one of those calls and texts turns
  up there beside the customer's emails, with the order attached, and nobody
  configures anything to make it happen. Section 11.

Generic feature, no site-specific behaviour. Every threshold, number type,
announcement and provider is a setting.

---

## 1. Module identity

New module. Not part of `twilio`.

| | |
|---|---|
| Name | `call-masking-for-shop` |
| Table prefix | `cm_` |
| Repo | `cactus-foundation-modules/call-masking-for-shop` |
| `requiresModules` | `["twilio", "shop"]` |
| `requiresCoreVersion` | whatever core is at build time |
| Permissions | `call-masking.access`, `call-masking.manage`, `call-masking.purge` |
| Nav | one entry, "Delivery Line", under the Purchasing group |
| Publishes | `core.conversation-provider` (section 11), a `purchaseOrderDocument` Puck block, a `shop.order-detail-panels` panel, a `core.admin-dashboard-widgets` widget |

`unified-inbox` is deliberately **not** in `requiresModules`. Nothing here needs
it, nothing here imports it, and the whole of the integration is one manifest
entry and one file. Section 11.

### Why not inside the twilio module

`modules/twilio` is generic today: forwarding rules, voicemail, opening hours,
call and message logs, SMS 2FA, recordings. It knows nothing about commerce.
Masking needs shop orders, purchase orders and suppliers. Folding it in would
give every site running plain call forwarding a set of masking tables, an admin
tab and two crons they will never use. That is the module-to-module isolation
rule, one level down from "no module-specific code in core".

**The `twilio` module gets zero schema changes and zero UI changes from this
work.** What this module reuses from it is code and credentials only:

- `lib/twilio.ts` - REST helper, region routing, `validateTwilioSignature`,
  `setNumberVoiceUrl`, `fetchRecordingAudio`, `escapeXml`
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN*` / `TWILIO_HOME_REGION` env
- the retention-cron pattern

Cross-module lib imports and cross-module raw SQL reads are already standard
across this platform, so this needs no new mechanism.

### Numbers must stay out of tw_site_numbers

Masked numbers are **not** added to `tw_site_numbers` and get **no**
`tw_forwarding_rules` row. Their voice and SMS webhooks point at this module's
own routes. The twilio module's voice webhook rejects numbers it has no rule
for, so there is no collision and nothing in twilio needs touching.

---

## 2. Safety invariants

These five come first because each one, if missed, is a defect nobody notices
until it has already done the damage. `tsc` and `eslint` will say nothing about
any of them.

### 2.1 Only release what we bought

`cm_numbers.purchased_by_module` is set true **only** by the auto-buy path. A
number an admin adds to the pool by hand is false and is **never** releasable,
by any code path, with no setting and no override. Without this guard an admin
who pools the main company number for testing loses it to the release job on a
Sunday morning, permanently, with no refund and no reliable way to get it back.

The release query filters on the column. It is not a warning, not a
confirmation dialog, it is a `WHERE` clause.

### 2.2 Never touch another account's numbers

`cm_numbers.account_sid` records which Twilio account a number belongs to. Every
mutating operation - release, webhook rewrite, unassign - checks the row's
account SID against the credentials currently in use and refuses if they differ.

This is a restore problem, not a paranoia problem. `cm_numbers` holds live
Twilio SIDs. Restore this site's backup onto any other site and the release job
would begin deleting numbers belonging to the site the backup came from. The
account SID check makes a restored row inert instead of destructive: it shows in
the admin as "belongs to another Twilio account, ignored", and the admin can
clear it.

### 2.3 Validate the destination before bridging

The bridge dials whatever sits in the assignment's `customer_phone`. If that
ever holds a premium-rate, personal-numbering or unexpected international
number, a supplier's call becomes a revenue-share payout billed to us.

At assignment time, and again if the destination is changed:

- must be valid per Twilio Lookup
- must be in `cm_settings.allowed_countries`
- must not match `cm_settings.blocked_prefixes`, which ships defaulted to the UK
  premium and personal ranges (`+4487`, `+4490`, `+4491`, `+4498`, `+44700`,
  `+4470`) and is editable
- must not be a number already in `cm_numbers` (no self-bridging loops)

A destination that fails validation blocks the assignment with a plain-English
reason on the PO screen. It never silently bridges.

### 2.4 Cap the spending

Auto-buy with no ceiling is one bad loop away from a large invoice.
`max_pool_size` caps total pooled numbers; `daily_buy_cap` caps purchases per
UTC day. Hitting either stops buying, logs loudly and surfaces on the admin
dashboard. It does not queue and retry into the next day silently.

### 2.5 A masked number is never a person

A masked number belongs to one customer this month and, once it has been
released back to the pool, a different one the month after. Anything that
records it as a party to a conversation is building a permanent identity out of
a temporary number.

The `unified-inbox` module, where a site runs it, keeps its own copy of every
conversation it collects and mints a **person** out of the number on it. That
copy outlives the assignment, and it outlives the number: releasing the number
does not go back and unpick it. So this is not untidiness that gets swept up
later, it is two unrelated customers merged into one record, found months
afterwards by somebody reading a history that makes no sense.

Two rules, and they hold whether or not that module is installed, because
whether it is installed is not this module's business:

- The conversation provider reports the **customer's real number** as the party
  to a delivery-line conversation. Never the masked one. Section 11.2.
- **No masked number is presented as a caller ID on a leg whose other end is one
  of the site's own numbers.** The `twilio` module's own provider lists calls by
  `To=` and `From=` on each number in `tw_site_numbers`, so a leg from the
  masked number to the main company number arrives in the hub as a call from an
  outside caller, and that caller is a number we are about to give to somebody
  else. Section 6.1.

Neither costs anything to get right and neither is visible until the first
number has been recycled, which is why they sit here with the other four rather
than in the integration section.

---

## 3. Schema

`migrations/001_initial.sql`. All DDL idempotent.

### cm_numbers - the pool

```sql
CREATE TABLE IF NOT EXISTS "cm_numbers" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    -- The Twilio account this number belongs to. Section 2.2: every mutating
    -- operation checks it against the live credentials and refuses on mismatch,
    -- so a restored backup can never release another site's numbers.
    "account_sid"    TEXT NOT NULL,
    "phone_sid"      TEXT NOT NULL,
    "phone_number"   TEXT NOT NULL,
    -- 'mobile' | 'national' - which class of customer number it can serve.
    "kind"           TEXT NOT NULL,
    "country"        TEXT NOT NULL DEFAULT 'GB',
    "sms_capable"    BOOLEAN NOT NULL DEFAULT false,
    -- Section 2.1. True only when THIS module bought it. Numbers added to the
    -- pool by hand are false and are never releasable by any code path.
    "purchased_by_module" BOOLEAN NOT NULL DEFAULT false,
    -- 'free' | 'assigned' | 'cooling'
    "state"          TEXT NOT NULL DEFAULT 'free',
    -- Twilio's own next monthly recurring charge date. Section 7 - tracked,
    -- never recomputed from purchased_at, because Twilio permanently moves the
    -- date earlier when it lands on a day a later month does not have.
    "next_bill_date" DATE NOT NULL,
    "purchased_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Last time anything happened on this number in either direction. Feeds the
    -- grace check so a number a supplier is still trying is never released.
    "last_activity_at" TIMESTAMP(3),
    -- Supplier of the most recent assignment, and when it ended. Stops a number
    -- being handed straight back to the same supplier for a different customer,
    -- which would silently re-point their existing text thread. Section 6.
    "last_supplier_id" TEXT,
    "last_released_at" TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cm_numbers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cm_numbers_kind_check" CHECK ("kind" IN ('mobile','national')),
    CONSTRAINT "cm_numbers_state_check" CHECK ("state" IN ('free','assigned','cooling'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "cm_numbers_phone_sid_key" ON "cm_numbers" ("phone_sid");
CREATE UNIQUE INDEX IF NOT EXISTS "cm_numbers_phone_number_key" ON "cm_numbers" ("phone_number");
CREATE INDEX IF NOT EXISTS "cm_numbers_state_idx" ON "cm_numbers" ("state", "kind");
CREATE INDEX IF NOT EXISTS "cm_numbers_next_bill_idx" ON "cm_numbers" ("next_bill_date");
```

### cm_assignments - one supplier, one customer, one line

Keyed on **supplier plus customer**, not on the shop order. A shop order that
splits across three suppliers gets three masked numbers. Two purchase orders to
the same supplier for the same customer share one, and both attach to it.

```sql
CREATE TABLE IF NOT EXISTS "cm_assignments" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "number_id"       TEXT NOT NULL,
    -- Plain references into shop / purchase-orders, declared in THIS module's
    -- migration. Neither of those modules is touched. Not foreign keys, for the
    -- same reason po_orders.source_ref is not one: the other module may go away.
    "shop_order_id"   TEXT NOT NULL,
    "supplier_id"     TEXT NOT NULL,
    "supplier_name"   TEXT NOT NULL DEFAULT '',
    -- Snapshot, because shp_orders.customer_phone can change after the PO went
    -- out. Changing it here is an explicit admin action. Section 6.5.
    "customer_phone"  TEXT NOT NULL,
    "customer_name"   TEXT NOT NULL DEFAULT '',
    -- Snapshot too, and not for anything this module does with it: it is what
    -- lets the Unified Inbox recognise the customer as the same person who
    -- emailed, and what turns their orders on in its context rail, which
    -- matches on the address and nothing else. Section 11.2. Snapshotted rather
    -- than joined so the tick stays one query and a deleted order does not take
    -- the conversation's owner with it.
    "customer_email"  TEXT NOT NULL DEFAULT '',
    -- Numbers allowed to connect through, as objects:
    --   {"number":"+4412...","source":"supplier_record"|"confirmed","added_at":"..."}
    -- jsonb to match the platform's existing convention for module arrays.
    "allowed_clis"    JSONB NOT NULL DEFAULT '[]'::jsonb,
    "sms_enabled"     BOOLEAN NOT NULL DEFAULT false,
    -- Set when the customer texts a stop keyword. Section 6.4.
    "sms_opted_out"   BOOLEAN NOT NULL DEFAULT false,
    "assigned_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at"       TIMESTAMP(3),
    -- 'order_completed' | 'order_cancelled' | 'manual' | 'destination_invalid'
    "closed_reason"   TEXT NOT NULL DEFAULT '',
    CONSTRAINT "cm_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cm_assignments_number_idx" ON "cm_assignments" ("number_id");
CREATE INDEX IF NOT EXISTS "cm_assignments_order_idx" ON "cm_assignments" ("shop_order_id");
-- At most one live assignment per number.
CREATE UNIQUE INDEX IF NOT EXISTS "cm_assignments_live_number_key"
    ON "cm_assignments" ("number_id") WHERE "closed_at" IS NULL;
-- At most one live assignment per supplier+customer+order, so a second PO
-- attaches rather than allocating a second number.
CREATE UNIQUE INDEX IF NOT EXISTS "cm_assignments_live_party_key"
    ON "cm_assignments" ("shop_order_id", "supplier_id", "customer_phone")
    WHERE "closed_at" IS NULL;

-- Purchase orders attached to an assignment. Many POs, one line.
CREATE TABLE IF NOT EXISTS "cm_assignment_pos" (
    "assignment_id" TEXT NOT NULL,
    "po_id"         TEXT NOT NULL,
    "po_number"     TEXT NOT NULL DEFAULT '',
    "attached_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cm_assignment_pos_pkey" PRIMARY KEY ("assignment_id", "po_id")
);
CREATE INDEX IF NOT EXISTS "cm_assignment_pos_po_idx" ON "cm_assignment_pos" ("po_id");
```

### cm_calls - with transcription

```sql
CREATE TABLE IF NOT EXISTS "cm_calls" (
    "call_sid"        TEXT NOT NULL,
    "assignment_id"   TEXT,
    "number_id"       TEXT NOT NULL,
    "from_number"     TEXT NOT NULL DEFAULT '',
    "to_number"       TEXT NOT NULL DEFAULT '',
    -- 'bridged' | 'blocked' | 'unknown_caller' | 'no_assignment'
    -- | 'unanswered' | 'destination_rejected'
    "outcome"         TEXT NOT NULL DEFAULT '',
    -- 'supplier' | 'customer' | 'unknown' - which side rang in.
    "caller_side"     TEXT NOT NULL DEFAULT 'unknown',
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "recording_sid"   TEXT NOT NULL DEFAULT '',
    -- Transcription. status: '' (not requested) | 'pending' | 'completed'
    -- | 'failed'. Section 8.
    "transcript_text"    TEXT NOT NULL DEFAULT '',
    "transcript_status"  TEXT NOT NULL DEFAULT '',
    "transcript_provider" TEXT NOT NULL DEFAULT '',
    -- Dates the transcript pass believes were agreed, as ISO strings, for the
    -- delivery-date summary on the order. jsonb array of strings.
    "extracted_dates" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "region"          TEXT NOT NULL DEFAULT 'us1',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cm_calls_pkey" PRIMARY KEY ("call_sid")
);
CREATE INDEX IF NOT EXISTS "cm_calls_assignment_idx" ON "cm_calls" ("assignment_id");
CREATE INDEX IF NOT EXISTS "cm_calls_transcript_idx" ON "cm_calls" ("transcript_status")
    WHERE "transcript_status" = 'pending';
```

### cm_messages

```sql
CREATE TABLE IF NOT EXISTS "cm_messages" (
    "message_sid"     TEXT NOT NULL,
    "assignment_id"   TEXT,
    "number_id"       TEXT NOT NULL,
    -- 'supplier_to_customer' | 'customer_to_supplier' | 'blocked'
    "direction"       TEXT NOT NULL,
    "from_number"     TEXT NOT NULL DEFAULT '',
    "to_number"       TEXT NOT NULL DEFAULT '',
    "body"            TEXT NOT NULL DEFAULT '',
    "media"           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- SID of the relayed copy we sent on, so a delivery failure can be traced.
    "relayed_sid"     TEXT NOT NULL DEFAULT '',
    "relay_error"     TEXT NOT NULL DEFAULT '',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cm_messages_pkey" PRIMARY KEY ("message_sid")
);
CREATE INDEX IF NOT EXISTS "cm_messages_assignment_idx" ON "cm_messages" ("assignment_id");
```

### cm_settings - singleton

```sql
CREATE TABLE IF NOT EXISTS "cm_settings" (
    "id"                    TEXT NOT NULL DEFAULT 'singleton',
    "enabled"               BOOLEAN NOT NULL DEFAULT false,
    -- Shown to the customer as caller ID, and where a masked line forwards once
    -- its order is done. Must be a number on the account.
    "main_number"           TEXT NOT NULL DEFAULT '',
    -- Twilio regulatory compliance bundle and address, required to buy any UK
    -- long code since 30 Sept 2024. Auto-buy fails without both.
    "bundle_sid"            TEXT NOT NULL DEFAULT '',
    "address_sid"           TEXT NOT NULL DEFAULT '',
    "country"               TEXT NOT NULL DEFAULT 'GB',

    -- Buying and releasing ---------------------------------------------------
    "auto_buy"              BOOLEAN NOT NULL DEFAULT true,
    "auto_release"          BOOLEAN NOT NULL DEFAULT true,
    -- Section 2.4.
    "max_pool_size"         INTEGER NOT NULL DEFAULT 20,
    "daily_buy_cap"         INTEGER NOT NULL DEFAULT 5,
    "grace_days"            INTEGER NOT NULL DEFAULT 7,

    -- Destination safety, section 2.3 ---------------------------------------
    -- jsonb arrays of strings. blocked_prefixes ships with the UK premium and
    -- personal ranges; allowed_countries with ["GB"].
    "allowed_countries"     JSONB NOT NULL DEFAULT '["GB"]'::jsonb,
    "blocked_prefixes"      JSONB NOT NULL DEFAULT '["+4487","+4490","+4491","+4498","+4470"]'::jsonb,

    -- Who gets connected, section 6.2 ---------------------------------------
    -- 'block' | 'confirm' | 'allow' - what happens when an unrecognised number
    -- rings a live masked line. 'confirm' asks for the order number and adds
    -- the caller to the allow-list on success.
    "unknown_caller_mode"   TEXT NOT NULL DEFAULT 'confirm',

    -- Recording and transcription, section 8 --------------------------------
    "record_calls"          BOOLEAN NOT NULL DEFAULT true,
    -- 'none' | 'twilio' | 'external'
    "transcribe_mode"       TEXT NOT NULL DEFAULT 'none',
    "transcribe_service_sid" TEXT NOT NULL DEFAULT '',
    "external_stt_endpoint" TEXT NOT NULL DEFAULT '',
    "external_stt_key"      TEXT NOT NULL DEFAULT '',
    "extract_dates"         BOOLEAN NOT NULL DEFAULT true,

    -- What is said ----------------------------------------------------------
    "supplier_announcement"  TEXT NOT NULL DEFAULT '',
    "customer_announcement"  TEXT NOT NULL DEFAULT '',
    "blocked_caller_message" TEXT NOT NULL DEFAULT '',
    "confirm_prompt"         TEXT NOT NULL DEFAULT '',
    "announcement_voice"     TEXT NOT NULL DEFAULT '',
    "sms_intro"              TEXT NOT NULL DEFAULT '',

    -- Notifications, section 9 ----------------------------------------------
    "notify_email"            TEXT NOT NULL DEFAULT '',
    "notify_new_message"      BOOLEAN NOT NULL DEFAULT true,
    "notify_unanswered"       BOOLEAN NOT NULL DEFAULT true,
    "notify_unknown_caller"   BOOLEAN NOT NULL DEFAULT true,
    "notify_buy_cap_hit"      BOOLEAN NOT NULL DEFAULT true,

    -- Retention, section 10 --------------------------------------------------
    -- 0 = keep forever. Covers recordings, transcripts and message bodies.
    "retention_days"        INTEGER NOT NULL DEFAULT 365,
    "store_recordings_locally" BOOLEAN NOT NULL DEFAULT false,

    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cm_settings_pkey" PRIMARY KEY ("id")
);
```

**Backup gate.** New tables means `npm run test:backup-roundtrip` must run and
really pass before this is done. A skip is a fail. The `jsonb` array columns
(`allowed_clis`, `media`, `extracted_dates`, `allowed_countries`,
`blocked_prefixes`) are exactly the shape that has broken serialisation before:
Prisma hands back a plain JS array for both a `jsonb` array and a `text[]`, and
they need different SQL literals. `udt_name` decides. Do not branch on
`Array.isArray`.

---

## 4. Where the customer's number comes from

Shop has **two** phone columns on `shp_orders` and they are not the same thing:

- `customer_phone` - the delivery number
- `notify_phone` - the number chosen for order updates, explicitly documented as
  "not necessarily the delivery number"

Use `customer_phone`, fall back to `notify_phone` only when it is empty. An
order with neither gets no masked line and a clear note on the PO screen; it
does not block the PO.

---

## 5. Number allocation

Triggered when a purchase order with `ship_to_kind = 'CUSTOMER'` is raised, and
re-checked whenever the PO is sent.

1. **Is there already a live assignment** for this shop order, supplier and
   customer number? If so, attach the PO to it via `cm_assignment_pos` and stop.
   One supplier dealing with one customer gets one line however many POs are
   involved.
2. **Validate the destination** per section 2.3. Failure blocks with a reason.
3. **Classify the customer number.** Twilio Lookup v2 `line_type_intelligence`
   is authoritative and cheap at this volume. Free prefix fallback if the lookup
   errors: `+447` is mobile, except `+44770` (personal numbering) and `+44776`
   (pagers, but `+447624` is Isle of Man mobile). Anything else is landline.
4. **Pick the wanted kind.** Mobile customer wants a `mobile` masked number so
   texts work. Landline customer wants a `national` (03) number, voice only,
   because a landline cannot receive a text anyway.
5. **Find a free number** of that kind and country, matching the current account
   SID, ordered by `last_released_at` ascending (least recently used first),
   **excluding any number whose `last_supplier_id` matches this supplier and
   whose `last_released_at` is inside the grace window.** Section 6.4 explains
   why that exclusion is load-bearing.
6. **Nothing free and `auto_buy` on:** check `max_pool_size` and
   `daily_buy_cap`, then search Twilio's available numbers for the wanted type,
   buy one passing `BundleSid` and `AddressSid`, insert it with
   `purchased_by_module = true`, the live `account_sid`, and `next_bill_date`
   one month on by the rule in section 7.
7. **Buy fails, cap hit, or nothing available:** fall back to a `national`
   number. Assignment is created with `sms_enabled = false` and the PO screen
   warns that texting is unavailable on this line. An 03 that takes calls beats
   no line at all.
8. **Point the number at us.** Voice URL to
   `{siteUrl}/api/m/call-masking/webhooks/voice`, SMS URL to
   `{siteUrl}/api/m/call-masking/webhooks/sms`, in the number's own Twilio
   Region. Region config is per-Region at Twilio - the twilio module's
   `setNumberVoiceUrl(sid, url, region)` already carries that trap, reuse it.
9. **Record the assignment**, `allowed_clis` seeded from the supplier's stored
   phone numbers with `source: "supplier_record"`, and `customer_email`
   snapshotted from the order alongside the name and number. It is not used by
   anything here; it is what makes the customer one person rather than two in
   the Unified Inbox (11.2), so it is taken at the same moment as the rest or it
   will be forgotten.

### On "cheapest"

`AvailablePhoneNumbers` does not return a price per number. Pricing is per
country per **type** via the Pricing API. "Cheapest" therefore means picking the
cheapest type that satisfies the mobile/landline rule, then taking any number of
that type. National is cheaper than mobile, and a mobile customer forces mobile,
so the only real choice is the fallback in step 7.

---

## 6. Voice and SMS flows

### 6.1 Voice, the shape

Inbound to `/api/m/call-masking/webhooks/voice`. Signature-validated, no
session.

```
validate signature -> 403 if bad
look up cm_numbers by To -> no row: <Reject/>
account_sid mismatch -> <Reject/>, log, flag in admin
look up live cm_assignments for that number

  no live assignment (free or cooling):
      <Dial>{main_number}</Dial>            <- no callerId. Section 2.5.
      log outcome 'no_assignment'

  live assignment, From matches customer_phone:      -> CUSTOMER branch (6.3)
  live assignment, From on allowed_clis:             -> SUPPLIER branch
  live assignment, From is anything else:            -> UNKNOWN branch (6.2)
```

**No `callerId` on that forward, and it matters.** Omitting the attribute
passes the original caller's own number through, which is exactly what
`modules/twilio` does for its own forwarding rules unless the site asks for
otherwise. Presenting the masked number instead would put a call leg on the
account whose `From` is the masked number and whose `To` is a site number, and
the twilio module's conversation provider lists calls by `To=` and `From=` on
every site number - so the masked number would arrive in the Unified Inbox as
an outside caller and become a person (2.5). Passing the caller through is also
plainly the more useful of the two for whoever answers, who now sees who is
actually ringing. A site that wants to know the call came in on a delivery line
gets a `<Say>` before the `<Dial>`, not a rewritten caller ID.

**Supplier branch:**

```xml
<Say voice="{announcement_voice}">{supplier_announcement}</Say>
<Dial callerId="{main_number}"
      record="record-from-answer-dual"
      recordingStatusCallback="{recording callback}"
      action="{dial status callback}">
  <Number url="{whisper url}">{customer_phone}</Number>
</Dial>
```

Points that matter:

- **`callerId` is the main company number**, which the account owns, so Twilio
  allows presenting it. The customer sees the company, never the masked line.
- **`<Number url="...">` plays TwiML to the customer when they answer**, before
  the bridge connects. That is where `customer_announcement` goes, so both
  parties are told the call is recorded. Announcing only to the supplier would
  not satisfy the obligation to inform.
- The announcement names the order and offers a way out: "Call about order one
  two three four five. This call is recorded. If you would rather not be
  recorded, hang up and call us on ...". Naming the order is also what stops a
  supplier who kept an old number thinking they are through to last month's
  customer.
- `record="record-from-answer-dual"` is the same attribute the twilio module
  already uses, so playback can reuse `fetchRecordingAudio`.
- The dial action callback writes duration and outcome; the recording callback
  writes `recording_sid` and queues transcription.

### 6.2 Unknown callers - the thing most likely to sink this

Suppliers will not reliably ring from the number on file. Switchboards present a
main outbound CLI, staff ring from their own mobiles, some withhold entirely. A
strict allow-list therefore blocks legitimate calls and the feature looks broken
on its first day.

`unknown_caller_mode` decides:

- **`block`** - `<Say>{blocked_caller_message}</Say><Hangup/>`, logged as
  `blocked`. Safest, least usable.
- **`confirm`** (default) - `<Gather>` the order or PO number. Correct answer
  adds the caller to `allowed_clis` with `source: "confirmed"` and bridges as
  normal. Wrong or no answer falls through to the blocked message. Two attempts,
  then hang up.
- **`allow`** - bridge anyway, log as `unknown_caller`, notify. For sites that
  would rather take the risk than miss a delivery call.

Withheld numbers can never satisfy `confirm` on CLI alone, so they are treated
as unknown and go through the same gather. Every unknown-caller event notifies
if `notify_unknown_caller` is on, so newly-confirmed numbers can be checked
after the fact and removed if they should not be there.

### 6.3 The customer rings the masked number back

They received a text from the masked 07, so some of them will ring it. The
customer branch:

- `From` matches `customer_phone` and the line is live -> announce and bridge to
  the first `allowed_clis` entry (the supplier's main number), recorded like any
  other call, `caller_side = 'customer'`.
- Line is cooling or free -> forward to the main company number, as any other
  caller.

Without this branch a customer ringing back hears "please call the office",
which is a poor look on a number we texted them from.

### 6.4 SMS

Inbound to `/api/m/call-masking/webhooks/sms`. Only ever live on `mobile`
numbers.

```
validate signature; account_sid check
look up cm_numbers by To -> none: drop
look up live assignment
  none: log 'blocked', stay silent
  live:
    From on allowed_clis        -> relay to customer_phone
    From is customer_phone      -> relay to first allowed_cli
    anything else               -> log 'blocked', do not relay
```

Both the received message and the relayed copy are written to `cm_messages`.
That is the record of tracking numbers and delivery dates texted between the
two.

Consequences, all already agreed:

- **The masked number is the sender to the customer.** It is the only way a
  reply threads back. So for SMS the customer sees the masked 07, not the main
  company number. The `sms_intro` prefix on the first message of a thread
  ("Deskwell delivery, order 12345:") is what stops it reading as spam.
- **Reassignment can re-point an existing thread.** If a number goes to a new
  order while the supplier still has the old thread open, their next text would
  reach a different customer. Two defences, both needed: the per-assignment
  `allowed_clis` check blocks a different supplier outright, and the
  "same supplier inside the grace window" exclusion at allocation stops the same
  supplier getting the same number straight back.
- **Stop keywords.** Twilio intercepts standard opt-out keywords on some number
  types and then blocks that pair silently, so the relay dies with no error at
  our end. Detect the inbound keyword, set `sms_opted_out`, notify, and show it
  on the PO screen so somebody rings instead of texting into a void.
- Delivery failures land in `cm_messages.relay_error` rather than being
  swallowed.

### 6.5 The customer changes their number

`customer_phone` is a snapshot taken at assignment. The reconcile job compares
it with the live `shp_orders.customer_phone` and, on a difference, flags the
assignment rather than silently re-pointing the line. An admin action
"change destination" re-validates through section 2.3 and updates it, writing an
audit note. Silent re-pointing would mean a supplier's saved thread quietly
starts reaching a different phone.

---

## 7. Release scheduler

The fiddly part, and the one place the original brief needed correcting.

### How Twilio actually bills

- The monthly recurring charge lands on the **provisioning anniversary**.
- There is **no proration**. Releasing mid-cycle refunds nothing.
- If the anniversary day does not exist in a month, Twilio bills on the **last
  day of that month, and that becomes the new permanent bill date**.

That last clause is the trap. A number bought on 31 January bills on 28
February, and from then on bills on the **28th of every month**, not the 31st.
Recomputing "one month after purchase" each cycle would eventually schedule a
release days after the charge had already gone through.

So `cm_numbers.next_bill_date` is stored and rolled forward one cycle at a time,
never derived from `purchased_at`.

```
rollForward(d):
    target = month after d
    if day(d) > daysIn(target): return lastDayOf(target)
    return date(target, day(d))
```

Worked through, matching the brief's own examples:

| Bought | Next bill | Release deadline |
|---|---|---|
| 4 Jan | 4 Feb | 3 Feb |
| 31 Jan | 28 Feb | 27 Feb |
| then | 28 Mar | 27 Mar |

Evaluate in **UTC**, which is what Twilio bills in. A release scheduled by London
local time in summer can land on the wrong side of midnight.

### The daily job

`/api/m/call-masking/cron/release`, once a day, well before the bill hour.

A number is released when **all** of:

- `purchased_by_module` is true (section 2.1, a `WHERE` clause not a warning)
- `account_sid` matches the live credentials (section 2.2)
- `state = 'cooling'`, no live assignment
- `auto_release` is on
- `next_bill_date - 1 day` is today or earlier
- `last_released_at` is more than `grace_days` ago
- `last_activity_at` is more than `grace_days` ago, so nobody is still ringing it

No "keep one spare" rule. That is how pools quietly grow. Auto-buy covers the
dry case.

If the job misses a day the number is billed one more month and its
`next_bill_date` rolls forward. Annoying, not broken. Logged as a warning so it
is visible rather than silent.

**Released numbers do not reliably come back.** Twilio has a restore path but it
is best-effort, time-limited, and the number may already be gone. That is what
`grace_days` protects: a supplier ringing a week after the order closed should
reach our main line, not a stranger.

### The hourly job

`/api/m/call-masking/cron/reconcile`, hourly.

Neither core nor the shop module fires an event on order status change, and
adding one is out of scope. So this job polls:

- assignments whose `shp_orders.status` is now `COMPLETED` or `CANCELLED` ->
  close the assignment, set the number to `cooling`, leave webhooks pointing at
  us so the "no assignment" branch forwards to the main number
- **orders that went back out of a closing status** (COMPLETED -> SHIPPED, which
  the shop module allows) -> re-open, preferring the same number if it is still
  cooling and still free
- POs raised with `ship_to_kind = 'CUSTOMER'` and no live assignment -> allocate
- destination drift (section 6.5) -> flag
- webhook drift: a number whose Twilio webhooks no longer point at us gets them
  re-set, with a warning logged
- account SID mismatches -> flag as foreign, never act

Core dispatches module crons hourly from `/api/cron/dispatch`, so both schedules
declare normally in `cactus.module.json` and no infrastructure work is needed.

**Which statuses end a line is a setting**, not a hardcode, because sites differ
on whether "completed" means dispatched or delivered.

---

## 8. Transcription

The stated purpose of recording is to know what delivery date was agreed. A
recording alone does not achieve that: nobody plays back a twenty-minute call to
find one sentence. Transcription is what makes the feature do what it is for.

**`<Dial>` has no `transcribe` attribute.** That attribute belongs to `<Record>`,
which is why the twilio module can use it for voicemail and this module cannot
use it for a bridged call. Three real options, chosen by `transcribe_mode`:

- **`none`** - recording only. Default, no extra cost.
- **`twilio`** - Twilio Voice Intelligence. Post-call processing of the
  recording, needs a Voice Intelligence Service SID in
  `transcribe_service_sid`. Gives a transcript plus operators that can pull
  entities out, which is the closest fit to "find the delivery date". Paid per
  minute.
- **`external`** - post the recording audio to a configured speech-to-text
  endpoint with its own key. Cheapest, and keeps the option open of using
  whatever the site already pays for. There is no core AI library to lean on, so
  the endpoint and key are module settings.

Flow: the recording status callback writes `recording_sid` and sets
`transcript_status = 'pending'`. The hourly job picks pending rows up, runs the
configured provider, writes `transcript_text`, and if `extract_dates` is on runs
a date pass over the text into `extracted_dates`.

The transcript is shown on the conversation timeline and, where dates were
found, summarised on the order panel as "supplier and customer discussed 14
March" with a link to the passage. That is the deliverable, not the audio.

Transcripts are personal data and fall under the same retention rule as the
recordings.

---

## 9. Notifications

Without these the module records everything and tells nobody, and the record is
found after the delivery has already gone wrong.

Email to `notify_email`, reusing core's email templates the way the twilio
module does:

- **New inbound message** on a live line, either direction
- **Unanswered supplier call** - a supplier tried to reach the customer and
  failed, which is a delivery-blocking event
- **Unknown caller** confirmed or blocked, so a wrongly self-added CLI can be
  spotted
- **Buy cap or pool cap hit**, and **auto-buy failed** (missing bundle SID is
  the usual cause, and finding that out at 3am on a Saturday is the worst
  possible time)
- **Stop keyword received**, SMS now dead on that line

The admin dashboard widget shows live line count, lines with unread messages,
and anything flagged.

**Where the Unified Inbox is installed**, `notify_new_message` and the hub's own
unread count are raising the same event twice. Leave the setting alone and add a
line on the settings screen saying the conversation will show up in the inbox as
well, so somebody can turn the email off if they would rather. Switching it off
automatically because another module happens to be installed is deciding for
them what they watch, which is not ours to decide. Section 11.9.

---

## 10. Retention, erasure and storage

**Retention.** One `retention_days` setting, default 365, 0 meaning forever,
matching the twilio module's convention. Applies to Twilio recordings (deleted
at Twilio, `recording_sid` blanked), transcripts, and message bodies and media
(blanked, rows kept for the audit trail). Runs on the daily job.

**Erasure.** Core has no data-erasure mechanism to hook into - only the privacy
notice template mentions the right. So this module carries its own: a
"purge customer" action behind `call-masking.purge`, taking a customer or an
order, which deletes the recordings **at Twilio** as well as blanking local
rows, and writes an audit entry of what was purged and by whom. Blanking local
rows alone would leave the customer's voice sitting in the Twilio account, which
is not erasure.

**Storage location.** `store_recordings_locally` optionally pulls each recording
into the site's own media library instead of leaving it at Twilio. Off by
default. On, it makes backup, erasure and access requests coherent in one place
and stops Twilio's per-recording storage charge accruing; off, it is one less
thing to hold.

**The hub keeps its own copy.** Where `unified-inbox` is installed it holds a
copy of every message this module publishes, in its own tables, and neither
retention nor purge here reaches it. That is not a hole to be plugged by
reaching into another module's data, it is a second deliberate action - see
section 11.8 for what the purge confirmation has to say and what has to be
verified.

**Privacy notice.** Recording, transcription, retention period and the supplier
relay all need a line in the site's privacy notice. Add the wording to the
module's wiki page so it is not left to chance.

---

## 11. Unified Inbox

`unified-inbox` presents every channel a site has - email, live chat, contact
form, calls, texts - as one list, with the site's own records beside them. A
masked delivery line is a conversation with a customer, so it belongs there. A
site that does not run the hub loses nothing: everything below is inert without
it.

### 11.1 One manifest entry, one file, no coupling

The hub **pulls**. It does not want to be told about anything, and there is no
registration step, no push, no webhook and no shared table.

```json
{ "point": "core.conversation-provider", "id": "call-masking",
  "label": "Delivery line", "permission": "call-masking.access",
  "serverOnly": true,
  "import": "./lib/conversation-provider",
  "component": "callMaskingConversationProvider" }
```

That entry plus `lib/conversation-provider.ts` exporting a `ConversationProvider`
(`lib/conversations/types.ts`) is the whole integration. **No line of this module
imports `modules/unified-inbox`, and no line of `modules/unified-inbox` is
edited.** Its context-rail adapters live in its own folder and adding one there
would be a change to somebody else's module, which is exactly the thing the
module-to-module isolation rule forbids. Nothing needs it: everything below is
reached through core's seam.

`serverOnly: true` is not decoration. The provider reads `cm_settings`, which
holds the external speech-to-text key, and its graph reaches `lib/twilio.ts` and
the account credentials. Without the flag the generator puts it in
`lib/modules/extension-points.public.ts` and the lot is reachable from a public
page.

Two consequences worth stating because they are what "seamless" actually means
here:

- **Install the hub afterwards and the lines simply appear**, history and all,
  on its next collection tick. There is no backfill to run, because the provider
  is read from scratch every pass and `since` only ever narrows it.
- **It pays for itself with the hub absent.** Core renders its own read-only
  **All** inbox tab as soon as two providers resolve for the viewer, and a site
  running this module already has `twilio` by `requiresModules`, which publishes
  one. This is the second.

### 11.2 One assignment is one conversation, and the party is the customer

| Field | Value |
|---|---|
| `id` | `cm_assignments.id` |
| `channel` | `'phone'` |
| `subject` | `Delivery for {order_number} - {supplier_name}` |
| `status` | `open` while `closed_at` is null, `closed` after |
| `lastMessageAt` | the later of the last call and the last message |
| `href` | `m/call-masking/conversations/{id}` |
| `preview` | the last thing that happened, in words |

**The id is the assignment, never the number.** The hub keys its copy on
`providerModule + externalId` permanently, so keying on a number would hand the
next customer the previous one's conversation the first time the pool recycles.

`href` is **admin-root relative with no leading slash** and no admin path -
`m/call-masking/conversations/{id}`, the same form `modules/contact-form` uses.
Only the rendering page knows what this site calls its admin root, and anything
containing `://` is dropped on the floor.

**The participant is the customer.** This is invariant 2.5 and it is the one
thing in this section that cannot be got wrong quietly:

```
participant.phone = cm_assignments.customer_phone   -- never the masked number
participant.name  = cm_assignments.customer_name
participant.email = cm_assignments.customer_email
```

Supplying the **email** as well as the number is the single field that makes the
rest of the hub work, and it is easy to leave out because the channel is a
telephone one. The hub's people layer collapses a person across their addresses
and their numbers, and the shop's context rail matches orders on the email
address and on nothing else. Give it the email and the delivery line lands on
the same person as their order confirmation, with their orders in the rail
beside it. Leave it out and the conversation sits next to a stranger the site
has apparently never dealt with.

### 11.3 Which side is `in` and which is `out`

Not a presentational choice. The hub's collector stamps the summary's
participant on **every** message handed to it as `in`, whoever actually sent
that one, because the newest inbound message is where it goes looking for who a
conversation is with. Mark a supplier's text `in` and the supplier's words are
filed under the customer's identity.

| What happened | Direction | `authorName` |
|---|---|---|
| Customer texts, or rings the line back | `in` | customer name |
| Supplier texts or rings the customer | `out` | supplier name |
| This module's own audit line | `note` | null |

Calling the supplier's side `out` is honest rather than convenient. The bridge
presents the main company number to the customer, so from the customer's end the
call did come from us, with the supplier speaking. Texts are the one exception -
the masked number is the sender, because it is the only way a reply threads back
(6.4) - and that number is still ours.

- **One call is one message.** Text is the transcript where there is one, and a
  sentence where there is not: "Supplier rang the customer, 4 min 12 sec, not
  recorded". A missed call is a message too, because a supplier who could not
  reach the customer is the event somebody most needs to see.
- **`note` carries the module's own story**: destination changed, allowed CLI
  added after a confirm gather, stop keyword received, line closed. That is what
  stops the hub's copy needing the Delivery Line screen open beside it to make
  sense.

### 11.4 Read in the hub, answered on the Delivery Line screen

```
capabilities: { reply: false, markRead: false, byIdentity: true }
```

No `send`. Core's seam names this exact case in its own comments - a channel
that only reports what happened, read here and answered elsewhere - and
`visibleProviderChannels` reads `canReply` off the capability, so the hub's
composer will not offer the channel rather than offering it and failing.

`reply: false` is a decision, not a shortcut:

- A reply typed in the hub would leave from the masked number and reach the
  customer **only**. The supplier is the other half of that conversation and is
  looking at the same thread on their phone; they would not get a copy. The hub
  would then show three parties in one thread, one of whom the supplier cannot
  see, which is a worse outcome than no reply button.
- Everything an admin genuinely needs to do to a masked line - change the
  destination, add or remove an allowed CLI, close it, purge it, play the
  recording - is not a reply, and belongs on the screen that owns the pool.

If a later phase wants replies, the condition is stated up front: relay the copy
to the supplier as well, or do not send it.

`byIdentity` is implemented and returns this module's conversations for a
customer's numbers, matched against `customer_phone` and never against
`cm_numbers`. Nothing reads it today - the hub declares the capability and no
consumer calls it yet - but it is one indexed query and it is what a person's
timeline will want the day something does.

**No `core.inbox-tabs` entry.** The hub suppresses the inbox tab of any module
that publishes a provider, on the sound grounds that two places to answer the
same message means one of them stops being read. This module publishes no such
tab, so nothing of its own is suppressed and the Delivery Line page behaves
identically with the hub installed and without it. Same arrangement `twilio`
already has, and for the same reason: the page is a pool of phone numbers, not
an inbox.

### 11.5 The order and the purchase order attach themselves

The hub scans a conversation's subject for something shaped like a record
reference and then asks the owning module whether it holds one. A pattern only
proposes; the shop disposes. So writing the order number into the subject
verbatim gets the order attached to the conversation, with no code at either
end and none of it aware of the other.

Two conditions, both real:

- **Write the reference exactly as the owning module formats it.** Shop order
  numbers are `{prefix}{six digits}` from `generateOrderNumber`, which the hub's
  default pattern `\b([A-Z]{1,6}-?\d{4,12})\b` matches. A site whose prefix is
  empty gets a bare number, which that pattern does not match - and the fix for
  that is the hub's pattern setting, not a prefix invented here.
- **Never invent one to make matching work.** A reference the shop never issued
  costs a failed lookup and nothing else; a reference that matches a *different*
  record is a wrong link on a customer's conversation.

The PO numbers on the assignment go in the conversation's first `note` message
rather than the subject, so a line serving two purchase orders links both
without a subject nobody can read.

### 11.6 What the tick costs

The hub's provider pass is bounded for every provider on the site at once: 40
conversations listed, 25 of them opened, six seconds for the lot. This one reads
its own Postgres tables, so it is the cheap provider on that list and has to
stay that way - the twilio provider is spending the same six seconds on paid API
calls over the network, and a slow neighbour is how its texts stop arriving.

- `list()` orders by last activity descending, honours `since` (which arrives as
  the newest thing the hub already holds, so a settled site costs one query) and
  `limit`, and returns a `nextCursor`.
- `thread(id)` is one query per table merged in memory.
- **Never call Twilio from `list` or `thread`.** Not for a recording, not for a
  lookup, not for a status. Recordings are already ours by then: the message
  carries the transcript text and the `href` goes to the screen that can play
  the audio.

### 11.7 Attachments do not cross, and that is the right answer

`ConversationMessage.attachments` is on the contract, and the hub's
`insertProviderMessage` writes no attachment row - a provider message carries
text. So an MMS photo of a delivery note is on the Delivery Line screen and not
in the hub's copy.

Do not work round it by putting a Twilio media URL in the body. Those need the
account credentials, and a link that only works for somebody holding the auth
token is worse than a plain sentence. The message text names what arrived
("Photo attached"), and the `href` goes where it can be seen.

### 11.8 Erasure runs twice, and says so

The hub holds its own copy and is never written back to. So `call-masking.purge`
deletes the recording at Twilio and blanks the local rows, and the hub's copy of
that transcript stays exactly where it is.

That seam is already the hub's own documented position in the other direction -
erasing somebody there does not take their orders and invoices with them - and
it is right, because a purge here that reached into another module's tables
would be precisely what its own adapters are forbidden from doing. What is not
acceptable is finding out about it during a subject access request. So:

- **The purge confirmation names the hub** when it is installed, and links to
  that person's page in it. The wiki page says the same thing in the same words.
- **Purged content must not come back.** The hub only inserts message ids it has
  not seen, so blanked rows neither overwrite its copy nor mint a second one.
  Verify that rather than assume it: purge, run a sync tick, confirm nothing was
  restored and nothing was duplicated.
- **Retention runs twice, independently.** `retention_days` here and the hub's
  own setting there. Each shortens its own side only, and the settings screen
  should not pretend otherwise.

### 11.9 Notifications

Covered in section 9: the setting stays, the settings screen mentions the hub,
nothing is switched off on somebody's behalf.

### 11.10 One overlap that stays, on purpose

The supplier bridge presents the main company number to the customer, which is
the entire point of the feature (6.1). That leg is `From = main_number,
To = customer_phone`, and the twilio module's provider lists calls by `To=` and
`From=` on each of its own numbers. So a bridged call also turns up in the hub
as an ordinary outbound call on the **Phone** channel, with no transcript,
alongside the full version on the **Delivery line** channel.

Left alone. Removing it means either changing the caller ID, which defeats the
feature, or editing `modules/twilio`, which is out of scope (16). The hub has no
cross-provider de-duplication and adding one is not this module's to add. It
gets a line on the wiki page so it reads as expected rather than as a fault.

The opposite direction - a masked number appearing in the hub as a person - is
not an overlap but a defect, and is fixed at source in 2.5 and 6.1.

---

## 12. Admin UI

One sidebar entry, "Delivery Line", tabbed page, per the platform's one-link
rule.

**Numbers** - the pool. Number, kind, state, which order and supplier it is on,
next bill date, release date, last activity, and a plain badge for
"bought by us" versus "added by hand, never auto-released". Foreign-account rows
show as inert. Manual actions: add an existing account number to the pool, force
release (only for module-bought numbers), force unassign.

**Conversations** - one row per assignment, opening into a merged timeline of
calls and texts, with transcript text inline and any extracted dates pulled to
the top. Recording playback streams through our own route with the Region's
credentials, same as the twilio module's `/api/admin/twilio/recordings/[sid]`,
so the browser never sees the Twilio auth. Per-assignment actions: change
destination, add or remove an allowed CLI, close the line, purge.

This screen stays exactly as it is when the Unified Inbox is installed, and is
not suppressed (11.4). The two are not duplicates: the hub reads the
conversation, this screen owns the **line** - the destination, the allow-list,
the closing, the purging, and the audio, none of which crosses the seam.

**Settings** - everything in `cm_settings`, grouped as the table is. Validation
must be loud: no bundle SID means every auto-buy will fail, and the settings
screen should say so before it happens rather than the dashboard saying so
after.

### Purchase order and shop order integration

- A Puck block for the existing `purchaseOrderDocument` layout type, so the
  masked number prints wherever the owner places it on the PO. Nothing is
  written into `po_` tables.
- A read-only panel on the shop order detail screen via the existing
  `shop.order-detail-panels` extension point: the masked number or numbers for
  that order (one per supplier), any agreed dates from transcripts, and a link
  into the conversation.
- A dashboard widget via `core.admin-dashboard-widgets`.
- A `core.conversation-provider` entry, which is the whole of the Unified Inbox
  integration and costs nothing on a site without it. Section 11.

---

## 13. Failure modes and what happens

| Situation | Behaviour |
|---|---|
| Admin pools the main company number | Never auto-released. `purchased_by_module` is false, and the release query filters on it |
| Backup restored onto another site | Rows are inert. Account SID mismatch blocks every mutating path and flags them in the admin |
| Destination is a premium-rate number | Assignment blocked at validation with a plain reason. Never bridged |
| Auto-buy loop misbehaves | Stops at `max_pool_size` or `daily_buy_cap`, notifies |
| Auto-buy fails, no bundle SID | Falls back to national or blocks, with the message naming the missing setting |
| Pool dry, auto-buy off | Allocation fails, PO screen shows a clear error, PO can still be sent without a line |
| No mobile available for a mobile customer | Falls back to an 03, `sms_enabled = false`, warning on the PO screen |
| Supplier rings from an unrecognised number | Per `unknown_caller_mode`: blocked, or asked to confirm the order number and self-added, or allowed with a notification |
| Supplier withholds their number | Treated as unknown, same gather |
| Customer rings the masked number back | Bridged to the supplier while live; forwarded to the main line once cooling |
| Anyone else rings a live line | Blocked message, logged, notified |
| Anyone rings a cooling or free number | Forwarded to the main company number |
| Old supplier rings a reassigned number | Blocked by `allowed_clis`; same-supplier case prevented by the grace exclusion at allocation |
| Customer texts a stop keyword | SMS closed on that assignment, flagged and notified |
| Customer's number changes on the order | Flagged, not silently re-pointed. Admin re-validates and applies |
| One order, three suppliers | Three assignments, three numbers, all pointing at the same customer |
| Two POs, same supplier, same customer | One assignment, one number, both POs attached |
| Order un-completed (COMPLETED to SHIPPED) | Re-assigned, preferring the same number if still cooling |
| Supplier could not reach the customer | Logged as unanswered and notified, because it blocks the delivery |
| Customer objects to being recorded | Announcement gives them the direct office number; per-line recording can be turned off |
| Customer asks for erasure | Purge action deletes recordings and transcripts at Twilio as well as locally, with an audit entry |
| Release job misses a day | Number billed one more month, `next_bill_date` rolls, warning logged |
| Twilio webhook config drifts | Hourly reconcile re-sets it and logs a warning |
| Unified Inbox installed after this module | Delivery lines appear on its next collection tick, history and all. No backfill, no migration, nothing to switch on |
| Unified Inbox uninstalled | Its copy goes with it. This module's own records are untouched and its screen never stopped working |
| Someone has `unifiedinbox.view` but not `call-masking.access` | They see no delivery lines in the hub. The permission on the provider entry is the same one guarding this module's own screen |
| A masked number is recycled | The hub's copy is keyed on the assignment, not the number, so last month's conversation stays with last month's customer |
| Customer erased in the Unified Inbox | The hub's copy goes. The recordings and transcripts here do not - purge here as well, which the confirmation says (11.8) |
| Customer purged here | Recordings deleted at Twilio, local rows blanked, the hub's copy remains until erased there. Named in the confirmation, not discovered later |
| A bridged call appears twice in the hub | Expected. The company-number leg is also an ordinary outbound call on the Phone channel (11.10) |
| Supplier's MMS photo not in the hub | Expected. Provider messages carry text; the photo is on the Delivery Line screen the conversation links to (11.7) |

---

## 14. Build order

Each phase is shippable on its own.

1. **Skeleton and voice.** Schema with all four safety guards in from the start,
   settings, manual pool, allocation with destination validation, voice webhook
   with all three caller branches, unknown-caller confirm gather, recording,
   `cm_calls`. Proves the routing and the caller ID.
2. **SMS relay.** SMS webhook both directions, `cm_messages`, intro prefix, stop
   keyword handling.
3. **Transcription.** Recording callback, pending queue, provider adapters,
   date extraction, transcript display.
4. **Auto-buy.** Lookup classification, available-number search, purchase with
   bundle and address, caps, webhook wiring, national fallback.
5. **Release scheduler.** `next_bill_date` tracking and roll-forward, cooling
   state, grace checks, daily release job, retention sweep, purge action.
6. **Surfaces.** PO Puck block, shop order panel, conversation timeline,
   dashboard widget, notifications, conversation provider.

Phases 1 to 3 give a working, useful, safe feature with a hand-managed pool.
Phases 4 and 5 are the automation.

**The conversation provider can land at the end of phase 3** rather than waiting
for phase 6. It needs `cm_calls`, `cm_messages` and the transcripts and nothing
else, it is one file, and on a site running the hub it is the cheapest screen
this module will ever get - the timeline, the search and the customer's history
all arrive without any of them being built here. The two invariants in 2.5 are
in from phase 1 regardless, because they are about what goes on the wire, not
about what reads it.

---

## 15. To verify before build

Not assumed, not guessed. Check against the live account:

- UK mobile number monthly rental, current inventory, and that they are both
  voice-capable and inbound-SMS-capable on this account.
- UK national (03) inventory and rental.
- That the account's regulatory bundle covers both mobile and national, and
  which address SID goes with it.
- Whether stop-keyword interception applies to UK mobile long codes here.
- Voice Intelligence pricing and availability, if `transcribe_mode` is going to
  be `twilio`.

At under ten concurrent lines the whole pool is a small monthly cost, so the
release scheduler is about tidiness rather than savings. Worth knowing that
before spending phase 5 on it.

---

## 16. Explicitly out of scope

- Voicemail on masked numbers. Unanswered calls fall to the main number and
  raise a notification; the twilio module already owns voicemail and duplicating
  it here would be waste.
- Any change to `modules/twilio`, `modules/shop`, `modules/purchase-orders` or
  `modules/unified-inbox`. The hub pulls; publishing a provider is the whole of
  it, and a context-rail adapter would have to be written inside somebody else's
  module.
- Replying to a masked line from the Unified Inbox, and cross-provider
  de-duplication of the bridged leg. Both have their reasons written down in
  11.4 and 11.10 rather than being left as oversights.
- Opening hours on masked lines. A supplier ringing a customer at 8pm is
  possible; add a window later if it turns out to matter.
- Non-UK customer numbers beyond "assign a national number, voice only". The
  country and allowed-country list are settings so this can grow, but only one
  country is modelled now.
- Supplier-portal integration. `purchase-orders` already has a public portal
  with its own tokens, and showing the line there is an obvious later addition,
  not part of this.

---

## 17. Wiki

New page, `Call-masking.md`: what the feature does, the settings, the regulatory
bundle prerequisite, what the customer and supplier each see, the recording and
transcription notice obligations with suggested privacy-notice wording, the
erasure action, and the retention default. Linked from `Home.md`, and mentioned
in `Architecture-overview.md` under module cron jobs.

A section of that page covers the Unified Inbox, in the site owner's language
rather than this one's: that delivery lines show up there on their own, that
they are read there and answered on the Delivery Line screen, that a bridged
call also appears as an ordinary outgoing call so the pair is expected rather
than a fault, and that erasing a customer is two actions because the two modules
keep their own records.

`Unified-Inbox.md` gains this module in its "The other channels" list beside
live chat, the contact form and Twilio, with the same one-line treatment they
get. That page is a separate git checkout and is pushed separately.
