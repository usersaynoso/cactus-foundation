# Purchasing automation: from a paid order to a closed purchase order

Stage 0 shipped. Stages A to E are all built (2026-10-01), uncommitted, pending release.

Revised 2026-09-30. The first version of this file planned Stage 0 alone and said "nothing here is
built yet", which stopped being true on 2026-08-28. This version keeps what that one got right,
records what shipped, and plans the rest of the chain:

1. A customer pays. **Stage 0, shipped.**
2. The purchase orders for that order are drafted. **Stage 0, shipped.**
3. They are sent to the supplier without anybody pressing Send. **Stage A.**
4. The supplier's paperwork arrives by email: proforma, sales order (their acknowledgement), and
   later the VAT invoice, sometimes several invoices in one PDF. Each one is read, split where
   needed, matched to its purchase order and filed on it. **Stages B, C and D.**
5. Delivery tracking arrives by email, either from the supplier or from the carrier they booked.
   It is matched to the purchase order, recorded as a despatch, and put on the customer's order
   so the customer sees it. **Stage E.**

Paying a proforma stays a human job. Nothing in this plan moves money.

**Modules touched:** `purchase-orders` (most of it), `unified-inbox` (one new seam), `shop` (one
observer). **Core:** pins, FIELD_NOTES, wiki. No core schema change.

Current versions when this was written: shop 0.1.465, purchase-orders 0.1.44 (latest migration
`016_bill_surcharge.sql`), unified-inbox 0.1.107 (latest migration `069_thread_contact.sql`).

---

## Stage 0 - draft on paid (shipped)

Shipped in purchase-orders 0.1.15 and shop 0.1.357 on 2026-08-28, then refined. What exists:

| Piece | Where |
| --- | --- |
| `shop.order-paid` point, observers not contributors, fired once from `fulfillPaidOrder` | `shop/lib/order-paid-hooks.ts` |
| Observer: setting off → return; else raise drafts, report problems | `purchase-orders/lib/order-paid-provider.ts` |
| Setting `autoDraftFromPaidOrders`, default off | `purchase-orders/lib/config.ts` |
| Nightly catch-up sweep, 7-day window, reports POs orphaned by a refund | `purchase-orders/lib/paid-sweep.ts`, run from `cron/reorder` |
| `raisedBy: 'AUTO' \| 'USER'` on the audit, "drafted automatically" on the Purchasing panel | `lib/from-order-run.ts`, `OrderPurchasePanel.tsx` |
| Problem-only email `PO_AUTO_DRAFT_REPORT` | `lib/auto-draft-report.ts`, `lib/email.ts` |

Changes since the original plan, all shipped:
- The sweep also picks up partially refunded orders and drafts only the quantity still owed
  (2026-09-22).
- Replacement orders never draft (2026-09-17).
- A sweep that drafted nothing no longer reports success (2026-09-08).
- `unified-inbox` also observes `shop.order-paid` (customer contacts), so the point has two
  listeners and the "one bad observer cannot stop the next" rule is now actually doing something.

Everything else the rest of this plan needs was built for other reasons and is reused, not
rebuilt:

- **Proforma terms and paperwork columns** (`007`): `proforma_media_id/_ref/_amount/_received_at`,
  `ack_media_id/_ref`, derived proforma stage (`lib/proforma-stage.ts`).
- **Despatches** (`007`): `po_shipments` + lines, with carrier, tracking ref and tracking url.
- **Supplier invoices as draft bills**, `stated_total` beside our own arithmetic, and
  `PENDING_CLOSE` (`011`), including the "tick what this invoice covers, priced at the order's
  prices" logic in `lib/portal-invoice.ts`.
- **Drop-ship suppliers** (`014`): invoices checked against what was ordered, not booked in.
- **Reading a supplier PDF**: `lib/pdf-text.ts` (hand-written, handles the standard empty-password
  encryption) and `lib/document-reference.ts` (`guessDocumentReference`, `guessInvoiceDetails`),
  used today by the bill screen's scan and by the drop box.
- **Filing a file on an order**: `lib/portal-upload.ts` `storeOrderDocument`, plus
  `setProformaDocument`, `setAcknowledgementDocument` in `lib/proforma.ts`.
- **Inbox** already stores every received attachment as a library Media row
  (`Inbox/<address>/Received/…`) and already links a conversation to a purchase order when a PO
  number appears in the subject or body (`lib/linking.ts`, `lib/adapters/purchase-orders.ts`).
- **Shop** already turns a parcel with tracking into customer emails and a live tracking poll
  (`lib/db/shipments.ts` `createShipment` / `updateShipmentDetails`, `tracking-added-email.ts`,
  hourly `cron/delivery-tracking`).
- **Core** `downloadMedia` in `lib/media/upload.ts` reads the bytes back.

### What real use has taught us (evidence from the live install, 2026-09-30)

Every purchase order on the live install has been drafted automatically, and **10 of the first 14
had their prices lowered by hand before they were sent**, by anything from 2% to 26%. The
supplier's own paperwork then agreed with the corrected figure. Some of that is the sale
surcharge and carriage work shipped between 24 and 29 September; whether it is all of it is not
yet known, because no order has been drafted since the last of those fixes.

That one fact shapes Stage A more than anything else in this file: **a draft that is usually wrong
must not be sent by a machine.** Decided 2026-09-30: auto-send is a plain per-supplier switch and
the owner judges when to press it, so the supplier screen shows the edit record beside the switch
(A.2) to make that an informed press rather than a hopeful one.

The supplier paperwork on the live install looks like this, which is also what the fixtures in
Stage C must imitate (synthetic copies only, never a real document: they carry customers' names
and addresses):

- Proforma, sales order and VAT invoice each arrive as their own email, from several different
  staff addresses at the supplier's domain, not from the one address on the supplier record.
- All three quote **our PO number** in the document, beside a "Customer Order No." or
  "Cust Order No." label. The subject quotes it only on the sales-order email.
- VAT invoices come in a daily batch: **one PDF, one page per invoice, each page for a different
  purchase order.** The PDFs are small, classic cross-reference table, no object streams, and
  RC4-encrypted with an empty password.
- Tracking arrives three ways: the supplier replying on the purchase-order thread, a two-person
  delivery firm's notifications (quoting the supplier's own sales-order number without its
  leading zeros, the consignment number and the delivery postcode), and a parcel carrier's
  notifications (quoting little more than a parcel number and a link).

Two faults in the existing reader, found while checking this, both fixed in Stage C:
`guessInvoiceDetails` returns `date: null` on that supplier's invoice layout, and on a
multi-invoice file it reports the first invoice only and says nothing about the others.

---

## Stage A - send the drafts automatically

**Module:** purchase-orders. **No inbox or shop change.** Can ship before or after B-E.

### A.1 What it does

A draft raised by Stage 0 is sent to the supplier by the half-hourly core cron tick, after a hold
period, exactly as if somebody had pressed Send: same route logic, same email, same portal link,
same audit, same status change. Nothing about a manual send changes.

The send route's body (`app/api/admin/orders/[id]/send/route.ts`) moves into
`lib/send-run.ts` `sendOrderRun({ orderId, userId, by: 'USER' | 'AUTO' })` so the button and the
cron share one implementation. The route becomes a session check and a call.

### A.2 The switch: per supplier, plain (decided)

- **Per supplier**, not global: `po_suppliers.auto_send BOOLEAN NOT NULL DEFAULT false`
  (migration `019_auto_send.sql`, idempotent, and `001` carries it for fresh installs).
- **A plain checkbox.** No lock, no minimum track record: the owner decides.
- **Beside it, the record, for information only:** "of the last 10 automatic drafts to this
  supplier, 3 were changed before they were sent" (from the audit: `order.created` with
  `raisedBy: 'AUTO'`, then any `order.updated` before `order.sent`). Costs one query and makes the
  decision an informed one.
- **It never turns itself off.** Where the supplier's proforma or invoice total disagrees with
  the PO total (Stage D detects that), the order is flagged and the problem-only report email
  says so, naming the supplier's auto-send as on. The switch stays where the owner put it.
- Global setting `autoSendEnabled` (default off) still exists as the master switch, for the
  same reason all four of its siblings are default off.

### A.3 The hold window

`autoSendHoldMinutes`, default 60. A draft becomes eligible at `created_at + hold`. The cron tick
is every 30 minutes, so in practice it goes 60-90 minutes after the customer paid. Long enough for
a refund, an order edit, or a person to open the draft and touch it; short enough that a
next-day supplier cut-off is still met on most days.

Opening a draft in the editor and saving it takes it out of the automatic queue for good: a
person has touched it, so a person sends it. Stored as `po_orders.auto_send_state`
(`QUEUED`, `SENT`, `HELD`, `REFUSED`) plus `auto_send_note`, same migration.

### A.4 Refusals (each one leaves the draft as a draft, says why, and emails the report)

- Supplier not opted in, or master switch off.
- Customer order since cancelled or refunded (re-read at send time, not at draft time).
- Approval required for this total (`canSend` already refuses; the cron never approves).
- Supplier has no email address.
- Any line skipped when drafting, any line at a zero or missing price, any line whose price did
  not come from the supplier's current catalogue when catalogues are on.
- Draft edited by a person (A.3).
- Draft is an amendment of an order already sent. Amendments are never automatic.

### A.5 Who authorised it

Sending approves (`sendingApproves` in `lib/lifecycle.ts`), and the document prints "Authorised
by". Decided: an automatic send prints **"Sent automatically"** there, not a person's name. That
is the truth, and it is not the empty line migration `013` was written to fix.

`approved_by_user_id` stays null and `approved_at` is stamped, so a new column is needed to tell
"sent automatically" apart from the old blank: `po_orders.approved_automatically BOOLEAN NOT NULL
DEFAULT false` (same migration, `019`). The document, the order screen and the Reports tab read
it. The audit records `order.approved` with `by: 'AUTO'`.

### A.6 Files

`lib/send-run.ts` (new, from the route), `lib/auto-send.ts` (new: eligibility, pure and tested),
`app/api/cron/auto-send/route.ts` (new, `*/30`, early exit on one indexed count when nothing is
queued), `cactus.module.json` (cron, version), `lib/config.ts` (`autoSendEnabled`,
`autoSendHoldMinutes`), settings tab, supplier screen (switch + edit record), the document parts
that print "Authorised by", `OrderPurchasePanel.tsx` ("sends automatically at 14:30 unless you
open it"),
`migrations/019_auto_send.sql`, `001_initial.sql`. Backup round-trip gate applies.

---

## Stage B - the inbox tells other modules that mail has arrived

**Module:** unified-inbox. A generic seam that names no module, like `shop.order-paid`.

### B.1 The point: `unified-inbox.message-received`

Fired once per **inbound** message, after its attachments are stored as Media rows, from the one
place both sync and push ingestion finish. Not fired for outbound, internal notes, spam, blocked
senders, or messages classified automated-bulk (`auto_kind`); bounces and out-of-office are not
paperwork.

Payload, primitives only so no listener imports the inbox:

```ts
export type InboundMessageEvent = {
  messageId: string          // uin_messages.id - the idempotency key for every listener
  threadId: string
  fromAddress: string
  toAddresses: string[]
  subject: string
  bodyText: string           // capped, as linking.ts caps it
  sentAt: string
  attachments: Array<{
    attachmentId: string
    filename: string
    mimeType: string
    sizeBytes: number
    mediaId: string | null   // null for inline parts, which listeners ignore
  }>
}
```

### B.2 Handlers, not bare observers

Unlike `shop.order-paid`, a handler may return something:

```ts
export type InboundMessageOutcome = {
  links?: Array<{ moduleName: string; recordType: string; recordId: string; label: string }>
  note?: string               // one line shown on the message: "Filed on PO-01234 as the proforma"
}
```

The inbox stores `links` through its existing `recordLink` as automatic links (visible,
attributed, removable, exactly like pattern links today) and the note on the message. That is how
a proforma email with no PO number in its subject still ends up linked to its purchase order.
Nothing a handler returns is required; a thrown handler is logged and the next one runs.

### B.3 Where it runs

Inline at the end of ingestion, inside the existing per-message try/catch, with a per-handler
time budget (5 s). A handler that needs longer (Stage D reads PDFs) does its cheap check inline
and queues the rest for its own cron. Sync must never be slowed or failed by a listener.

Storage: `uin_messages.handled_at TIMESTAMPTZ` and `handler_notes JSONB` (migration
`070_message_handlers.sql`), so a message is handled once, and a catch-up pass at the end of the
inbox's hourly sync cron re-offers anything received in the last 3 days with `handled_at IS NULL`
(handler crashed, deploy mid-flight, module installed later). Listeners key on `messageId`, so a
second offer is harmless.

**Backfill:** an admin action "offer the last 14 days again" per inbox, for switching on Stage D
after the paperwork has already arrived.

### B.4 Files

`lib/message-handlers.ts` (new: gather, run, store), the ingestion finish in `lib/sync.ts` and
`lib/provider-sync.ts`, the sync cron route (catch-up pass), `migrations/070_…`,
`001_initial.sql`, `lib/types.ts`, the message view (the note), `cactus.module.json` (version).
Backup round-trip gate applies. The point is documented in `wiki/Unified-Inbox.md` for module
authors.

---

## Stage C - reading and splitting supplier PDFs

**Module:** purchase-orders. Pure library code, no schema, no behaviour change on its own.

### C.1 Page-aware text

`lib/pdf-text.ts` gains `pdfPages(bytes): string[] | null`: walk the page tree from the catalogue,
decrypt and decode each page's content streams, return text per page. The existing `pdfText`
becomes `pdfPages(...).join('\n')` so every current caller is unchanged.

### C.2 Classify and extract

New `lib/supplier-document.ts`:

```ts
type SupplierDocKind = 'proforma' | 'acknowledgement' | 'invoice' | 'credit-note' | 'unknown'
type ReadDocument = {
  kind: SupplierDocKind
  pages: [number, number]          // 1-based, inclusive
  supplierRef: string | null       // their invoice / proforma / sales order number
  ourPoNumbers: string[]           // every one of OUR numbers found on these pages
  date: string | null
  total: string | null
}
readSupplierDocuments(filename, bytes, knownPoNumbers: Set<string>): ReadDocument[]
```

- **Kind** from the document's own heading first ("Pro Forma Invoice", "Sales Order",
  "Credit Note", "Invoice"), then the filename, then the email subject. Order matters:
  "Pro Forma Invoice" contains "Invoice".
- **Our PO number** found by looking for the numbers we actually issued (the set of open PO
  numbers for that supplier) rather than by label. Exact, cheap, and immune to how the supplier
  labels it. Labels are only a tie-breaker.
- **Segmenting a multi-invoice file:** a new document starts on a page whose supplier reference
  differs from the previous page's. A page with no reference of its own (a continuation) belongs
  to the document before it. One reference across every page = one document.
- Fix `dateFromText` for the two-column layout where the label and the date sit on one line with
  a wide gap, and make `guessInvoiceDetails` use the first segment so the bill screen behaves as
  before.

### C.3 Splitting the file

`lib/pdf-split.ts` `extractPages(bytes, [from, to]): Uint8Array | null`.

Written by hand for the same reason `pdf-text.ts` was (a module cannot add a dependency). It is
also the only approach that works on these files: the obvious library, pdf-lib, refuses encrypted
PDFs outright, and every file in question is encrypted.

The trick that keeps it small: **keep every object number and the encryption exactly as they
are.** RC4/AES keys are derived per object from its number and generation, so an object copied
byte for byte, under the same number, with the same `/Encrypt` dictionary and `/ID`, still
decrypts. The writer:

1. Collects every object reachable from the chosen pages (resources, fonts, images, content),
   not following `/Parent`.
2. Copies those objects' bytes verbatim.
3. Writes a new `/Pages` node under the old Pages number with only the chosen kids, and a new
   catalogue under the old number with nothing but `/Type /Catalog /Pages` (outlines, forms and
   names would point at pages that are gone).
4. Writes a fresh cross-reference table and a trailer carrying the original `/Encrypt` and `/ID`.

**It refuses, rather than guesses,** on anything outside that shape: cross-reference streams,
object streams, incremental updates, more than one `%%EOF`, an encryption revision it cannot
handle, or pages sharing annotations. **Every output is checked** by reading it back with
`pdfPages`: exactly the expected page count, and the supplier reference that segmented it must be
on it. A split that fails the check is thrown away.

When it refuses, the fallback is the whole original file attached to each bill, with the page
number written into the bill's notes ("page 2 of 3 in the attached file"). Slower to read, never
wrong. The original multi-invoice file is always kept in the library as received, whatever
happens; the split files are new Media rows beside it, filed under the purchase order's folder.

### C.4 Tests

Synthetic fixtures only, generated by a test helper (plain, RC4-encrypted, multi-page,
continuation page, object stream, xref stream, incremental update, credit note), never real
supplier documents. Round-trip every split through `pdfPages`, and in the local suite also through
`pdftotext` where it is installed, as an independent reader.

---

## Stage D - filing supplier paperwork automatically

**Module:** purchase-orders, handling `unified-inbox.message-received`.

### D.1 Is this our post?

A message is purchasing's business only if **the sender is a supplier**: its address matches a
supplier's email or CC, or its domain matches a supplier's domain. The domain is derived from the
supplier's email unless that is a free-mail domain (a fixed list: gmail, outlook, hotmail, yahoo,
icloud and so on), and a supplier can carry extra domains or addresses of its own:
`po_suppliers.inbound_senders TEXT[]` (migration `017_inbound_filing.sql`). Anything else is
ignored inline in microseconds, which is nearly all mail.

Carrier notifications are not supplier mail. Stage E handles them.

### D.2 The filing queue

Matching supplier mail with a PDF attachment is queued, not read inline (B.3's time budget):

```
po_inbound_documents
  id, message_id, attachment_id, source_media_id,
  page_from, page_to, kind, supplier_ref, total, doc_date,
  order_id NULL, filed_media_id NULL,
  outcome   -- QUEUED | FILED | NEEDS_EYES | IGNORED
  reason    -- the sentence for NEEDS_EYES / IGNORED
  created_at, handled_at
  UNIQUE (attachment_id, page_from)
```

The unique key is the idempotency: an offer made twice files once. Processed by a new cron
(`*/30`, early exit on one indexed count) and immediately after the handler when the time budget
allows.

### D.3 Rules, per document found in the file

A document is filed **only when all of these hold**; otherwise it is `NEEDS_EYES` with a reason:

1. Exactly one of our PO numbers is on it, and that PO belongs to the sending supplier.
2. The PO is in a state that expects this paperwork (no proforma onto a cancelled order, no
   invoice onto a draft).
3. It is not a credit note. Credit notes are always left for a person in the first version.

Then, by kind:

- **Proforma:** split out if needed, `setProformaDocument` with ref, amount and received date.
  A second proforma for the same PO (a revision) replaces the first on the order; the earlier
  file stays in the library and in the audit. If its total differs from the PO total by more
  than `priceVarianceTolerancePercent`, the order is flagged and the problem-only report email
  says so. The supplier's auto-send is never switched off (decision 1, A.2).
- **Acknowledgement (sales order):** `setAcknowledgementDocument` with the supplier's sales order
  number as `ack_ref`. The status moves to ACKNOWLEDGED straight away, exactly as the portal's
  acknowledgement does, **including on a proforma order whose proforma is not yet paid**
  (decided 2026-09-30: the supplier has accepted the order, so it is acknowledged).
  Knock-on that must ship with it: `proformaStage` in `lib/proforma-stage.ts` only looks at SENT
  orders, so an acknowledged order with an unpaid proforma would lose its "Proforma received"
  badge and drop out of `proformaWaitsOnUs`, the one colour in the list that says money is owed.
  Widen it to SENT or ACKNOWLEDGED while the proforma is unpaid, and say "Acknowledged, proforma
  to pay" on the badge; update `proforma-stage.test.ts` to match.
- **VAT invoice:** a **draft** bill, `source = 'INBOX'` (the `po_bills_source_check` constraint
  is widened in `017`), lines = everything still left to invoice on that PO, priced at the
  order's prices (the `portalInvoiceLines` rule: money never comes from the supplier's document),
  `stated_total` from the document, the split page attached, supplier ref and date filled in.
  If that leaves nothing un-invoiced, the order moves to PENDING_CLOSE, as the portal route
  already does. **Never approved, never sent to the books automatically.** Somebody reads it,
  which is the whole reason PENDING_CLOSE exists.

Each filing writes a purchase-order audit entry naming the email it came from, and returns a
link and a note to the inbox (B.2).

### D.4 What a person sees

- On the conversation: "Filed on PO-01234 as the proforma", linked.
- On the purchase order: the document in its slot, with "from an email on 28 Sep" and a link to
  the conversation.
- New **Paperwork** tab (or a panel on the Orders tab): everything `NEEDS_EYES`, each with its
  sentence and three buttons: file it on this PO, it is not ours, ignore. A manual choice there
  runs the same filing code.

### D.5 Settings

`inboundFilingEnabled` (default off), with a line saying what it will and will not do. No
per-kind switches in the first version; if a kind misbehaves the fix is the rule, not a knob.

### D.6 Files

`lib/inbound-handler.ts` (new: the inline sender check and queueing), `lib/inbound-filing.ts`
(new: rules, pure where possible, tested), `lib/inbound-run.ts` (new: the cron worker),
`app/api/cron/inbound-documents/route.ts` (new), `lib/bills.ts` (source INBOX), `lib/proforma.ts`
(deferred acknowledgement), the Paperwork screen, `migrations/017_inbound_filing.sql`,
`001_initial.sql`, `cactus.module.json` (extension point, cron, version),
`lib/media-usage-provider.ts` (vouch for split files). Backup round-trip gate applies; the live
database suites apply (new SQL).

---

## Stage E - delivery tracking onto the customer's order

**Modules:** purchase-orders (recognise, match, record the despatch, announce), shop (observe and
put it on the customer's order).

### E.1 Recognising tracking in an email

`lib/tracking-recognise.ts` in purchase-orders: pull tracking links and numbers out of a message
body and subject, returning `{ carrier, trackingNumber, trackingUrl }[]`. Generic recognisers by
carrier, not by customer: parcel-carrier deep links and parcel numbers, Multidrop-style
`/<code>/<postcode>` links used by several delivery firms, consignment numbers written beside a
"Consignment" label, and any link whose path contains "track". The URL patterns are a small copy
of what shop's `lib/tracking/*` already knows, deliberately duplicated: purchase-orders cannot
import shop, and the list is short.

### E.2 Matching it to a purchase order, strongest first

1. **Our PO number** in the subject or body, or the conversation is already linked to exactly
   one PO. (Supplier replies on the PO thread.)
2. **The supplier's own reference** we already hold: `ack_ref` or `proforma_ref`, compared with
   leading zeros stripped, because the delivery firm prints "123456" for sales order
   "0000123456".
3. **A consignment or parcel number** already recorded on one of our despatches (later updates
   from the same carrier).
4. **Delivery postcode only**, when exactly one open drop-ship PO to that postcode is awaiting
   despatch.

Rules 1-3 apply the tracking. **Rule 4 only proposes it** (a `NEEDS_EYES` row with a one-click
"yes, that one"). A wrong match here emails one customer another customer's delivery, which is
not a mistake the site gets to make twice.

Carrier mail is recognised as carrier mail by content (it carries tracking and no supplier
sender), not by a list of carrier addresses, so the rules work for carriers nobody has configured.

### E.3 Recording it

- A `po_shipments` row, `source = 'INBOX'` (CHECK widened in `018_inbox_tracking.sql`), carrier, tracking ref and
  url, covering every line still undespatched. Later mail for the same consignment updates it
  (a delivery slot, a better link) rather than adding a second.
- Then the new point **`purchase-orders.despatch-recorded`**, primitives only:

```ts
type DespatchRecordedEvent = {
  purchaseOrderNumber: string
  source: { module: 'shop'; orderId: string } | null   // from po_orders.source_ref
  lines: Array<{ sourceOrderItemId: string; qty: number }>   // po_order_lines.source_order_item_id
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  deliveryDate: string | null      // 'YYYY-MM-DD' when the mail named one
  deliverySlot: [string, string] | null
}
```

### E.4 Shop's half

`shop/lib/despatch-observer.ts`, registered against `purchase-orders.despatch-recorded`:

- The customer order already has a parcel for those lines with no tracking (the owner dispatched
  it by hand with the tracking left blank, which the live data shows is common): fill it in with
  `updateShipmentDetails`. Shop's existing tracking-added email and hourly poll take it from
  there.
- Same tracking number already on the order: nothing (idempotent).
- Otherwise: `createShipment` for those items with the tracking, then
  `sendShipmentDispatchedEmail` exactly as the admin dispatch route does (`createShipment` itself
  sends nothing).

Setting on shop, `despatchFromSupplierTracking`: `off` (default) / `record only` (put it on the
order, email nobody) / `record and tell the customer`. Decided rollout: "record only" for
a fortnight, checked by hand against what actually arrived, then "record and tell the customer".

Shop stays generic: it knows a module announced a despatch against its order lines, not that
purchasing exists. Purchase-orders never writes a `shp_*` table.

### E.5 Files

purchase-orders: `lib/tracking-recognise.ts` (+ tests from synthetic emails),
`lib/tracking-match.ts` (+ tests), the handler from D (tracking is a second job for the same
message), `lib/shipments.ts` (source INBOX, update-by-consignment), `lib/despatch-hooks.ts` (the
point, modelled on `shop/lib/order-paid-hooks.ts`), manifest. shop: `lib/despatch-observer.ts`,
`lib/config.ts`, settings, manifest. No shop migration.

---

## Release order

Every stage builds and runs on its own, and each pair releases in either order (the standing rule
that a split fix must build in either order):

| Stage | Releases | Works alone? |
| --- | --- | --- |
| A | purchase-orders | Yes |
| B | unified-inbox | Yes, fires to nobody |
| C | purchase-orders | Yes, bill screen reads multi-invoice files better |
| D | purchase-orders | Needs B to receive anything; the Paperwork tab and a manual "read this file" work without it |
| E | purchase-orders + shop | Shop's observer with no announcer is idle; the announcer with no observer records the PO despatch only |

`requiresModules` stays `[]` everywhere. Each release: module tag, build gate green, core pin,
one core release (per the standing release rules).

Suggested order of building: **B, C, D, E, then A.** A is the smallest and, being a plain switch,
could go first - but the drafts are not yet trustworthy, and D's proforma-vs-PO comparison is what
turns a wrong auto-sent price into a flagged order rather than a surprise on a bill. Building A
last means that safety net is already there on the day the switch is pressed.

## Gates

- `npm run typecheck`, `eslint .`, `npm test` in every stage.
- **Backup round-trip** for A (purchase-orders 019), B (unified-inbox 070), D (017), E (018, and shop 068_quiet_parcels). A skip is a fail.
- **`npm run test:ledger-guards` locally** before any purchase-orders release in D and E (new SQL
  that no build executes).
- Stage C's splitter is checked against a real multi-invoice file on the Mac before release, by
  running it locally and opening every output, and that file never enters the repo.

## Risks, honestly

- **Auto-send puts wrong prices in front of a supplier.** The owner's judgement (with the edit
  record beside the switch), the hold window, "a person touched it, a person sends it", and the
  mismatch report are the whole defence. No automatic cut-out, by choice.
- **A wrong tracking match leaks one customer's delivery to another.** Only exact references
  apply automatically; postcode-only matches ask.
- **A split PDF that loses or mixes a page.** Refuse on any unfamiliar structure, verify every
  output by re-reading it, always keep the original.
- **An invoice filed on the wrong PO.** It needs our exact PO number, from that supplier, on that
  page. Bills stay drafts either way.
- **Inbox ingestion slowed by listeners.** Inline work is a sender check; PDF reading is queued.
- **Supplier paperwork changes layout.** The PO number match is layout-proof; the reference and
  total guesses degrade to blanks, and blanks send the document to Paperwork rather than filing
  it wrong.

## Rough size

A: a day. B: a day. C: two days, most of it the splitter and its fixtures. D: two days. E: two
days. Roughly eight to nine days of building, five module releases, five core pins.

## Decisions (2026-09-30)

1. **Auto-send:** a plain per-supplier switch, no evidence lock, no automatic cut-out. The edit
   record sits beside it for information (A.2).
2. **Authorised by** on an automatic send prints "Sent automatically", backed by
   `po_orders.approved_automatically` (A.5).
3. **Multi-invoice PDFs** are split into one file per invoice, falling back to the whole file
   with a page note only where the splitter refuses (C.3).
4. **An acknowledgement on an unpaid proforma order** moves the status to ACKNOWLEDGED straight
   away, and the proforma stage is widened so the unpaid proforma stays visible (D.3).
5. **Customer tracking emails:** a fortnight of "record only", then on (E.4).
