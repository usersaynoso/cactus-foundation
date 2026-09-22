# Shop module bug audit - resolution

**Date:** 2026-09-22 · **Audit:** SHOP_MODULE_BUG_AUDIT.md (163 findings, written against shop v0.1.449) · **Code:** shop v0.1.451 working tree, uncommitted

**Outcome:** every finding investigated against the code. **107 fixed**, **52 not a bug** (deliberate and sound, a missing feature, or a positive observation), **4 debunked** (the code does not do what the audit says). Nothing on the audit's own list is left open.

| Severity | Findings | Fixed | Not a bug | Debunked |
|---|---|---|---|---|
| High | 7 | 7 | 0 | 0 |
| Medium | 53 | 44 | 6 | 3 |
| Low | 71 | 54 | 17 | 0 |
| Info | 32 | 2 | 29 | 1 |

## Found and fixed along the way (not on the audit's list)

Real faults that turned up while fixing the audit, or in the four independent reviews of the fixes afterwards:

- **Checkout could charge the old total.** A card order prepared before the shopper changed delivery, coupon, basket or address was paid at the old figure and sent to the old address. The order is now prepared again when the checkout changes, a charge whose answer never came back is re-sent rather than taken twice, and the automatic prepare waits for a finished postcode and a pause in typing.
- **Orders export held 200 rows, not 5,000.** The list caps a page at 200. It now pages to 5,000, names a cut-short file, and every list sort ends on the id so paging cannot skip tied rows.
- **A free-shipping discount with a threshold gave free delivery on every order,** and a threshold left on a non-free-shipping rule gave free delivery too. Thresholds now apply only to free-shipping rules, after every discount.
- **The tax report overstated refunded VAT** on tax-exclusive shops (divided by the net figure) and understated it on discounted orders (divided by the undiscounted figure). Both fixed; date filters now start at midnight in the site's timezone.
- **Refunds:** two reconcile runs could settle the same refund twice; duplicate lines in one refund each passed the caps; the refund box asked for more than a discounted order took; an approval refund on a bank-transfer order was refused for want of a card reference; a charged replacement's refund went to a card provider that never took the money.
- **Stock:** the checkout checked each basket line against the whole stock count separately; a replacement part's stock never came off at all (the wiki said it came off at dispatch; nothing did that).
- **Returns:** a returned-and-refunded unit was counted twice, so the rest of the line could not be returned; a whole-order cancellation could be approved after part of the order had shipped, refunding goods the customer held.
- **Payments:** a Stripe payment still "processing" was reported to the shopper as failed; a payment that landed after its unpaid order had been pruned vanished without trace (now raised on the orders screen, only for this site's own payments); a payment arriving again after a chargeback re-ran fulfilment (stock, coupon and emails twice); a failed confirmation email stopped the invoice, the owner's alert and the purchase-order hook for that order for good.
- **Downloads:** a HEAD request spent a download; the account page listed links for refunded items.
- **Other modules that read `payment_status = 'PAID'`** would have dropped refunded orders once refunds started moving that column: purchase-orders' nightly sweep (which also ordered refunded lines from suppliers), shop-variations' sales report and reviews-for-shop's invitations - all fixed. google-shopping's feed now leaves out spare parts; google-sheet's empty pull closes its import job.
- **Smaller:** zone save said "Zone saved." on a refused save; a text message was skipped whenever the email beside it failed; the uninstall list missed three tables of customer data; stale-refund email only ever sent on the 06:00 run; legacy discount dates moved a day on sites west of UTC; an import ending on a skipped row left a batch-old tally that a Sheet pull then double-counted; manual related/upsell picks showed draft products.

## Worth knowing before this ships

**What owners and shoppers will notice** (the wiki pages `Shop.md` and `Authoring-a-module.md` are updated on disk, not pushed):

- Payment badges and filters say **Part refunded** / **Refunded** after a refund; undispatched units go back into stock.
- A paid order cannot be cancelled or marked refunded from the status menu without the refund on record.
- Orders are put **On hold** with a note when paid-for stock had already gone, a pre-order limit was passed, or a card or PayPal payment does not match the order.
- With the shop closed, customers can still track orders, open receipts and order pages, and download what they paid for.
- Spare parts have no public page and cannot be bought at checkout (staff manual orders still can).
- A shop with zones but no catch-all zone refuses postcodes no zone reaches (physical goods only); Deskwell has a catch-all, so is unaffected.
- `shop.access` alone can no longer raise invoices or credit notes or answer product questions.
- Stale refunds become a rolling admin-bell notice; the refund reconciler runs hourly.
- Many new input ceilings, all far above what the screens send, each with a plain message.

**Other repositories changed** (each needs its own release, then core's pins): `purchase-orders`, `shop-variations`, `reviews-for-shop`, `google-sheet-products-for-shop`, `google-shopping-for-shop`. Core itself changes `package.json` (the new live suite added to `test:ledger-guards`), `lib/config/timezone.ts` (a clock-change fix, with tests) and `FIELD_NOTES.md`.

**Deskwell, read only:** no spare-part products, no add-on links to spare parts, no automatic discounts, its one zone is a catch-all, no orders refunded before this change (so no data backfill is needed), database in UTC.

## Follow-ups done after the first pass

You asked for the six open items to be done:

1. **Delivery refunds** - done. Refunds can carry the delivery charge (migration 060, `shp_refunds.shipping_amount`), capped at what is left of it; a whole-order cancellation approved before anything was sent gives it back automatically; credit notes and invoices handle it; the tax report counts it.
2. **Built-in PayPal** return/capture path - built (PayPal returns to the confirmation page, which captures once; cancel goes back to checkout; a refused capture leaves the order unpaid). **Not yet tested against the PayPal sandbox** - that has to happen before release.
3. **Tax report** - done. Delivery VAT is in "collected" and "refunded", split across rates the way the invoices split it; the Tax tab has dates, refunded and owed columns and totals.
4. **Refunds made in the Stripe or PayPal dashboard** - done. A full refund is recorded automatically (items, delivery, stock, credit note); a part refund leaves a note, and the refund box has an "Already refunded" tick to record which items it covered without sending money again.
5. **Uploads** - done. Files over 4 MB go straight to media storage (needs R2, B2 or S3): CSV imports up to 20 MB, digital files up to 20 MB (the most a buyer can download inside the one-minute route that streams it).
6. **Discount expiry** - now an inclusive "Last day". Nothing stored changed: existing discounts stop exactly when they always did, and simply show their true last day.

Also fixed on the way: core's `instantAtWallClock` was an hour out at midnight on the day Sydney or Auckland put the clocks forward.

## How it was checked

- `tsc --noEmit` clean; `eslint .` clean; full `vitest run` 8,161 passed, 0 failed.
- Every changed SQL statement executed against a throwaway Postgres (`cactus_rt_*`) through the function that owns it: new permanent suite `modules/shop/lib/db/audit-fixes.live.test.ts` (22 tests, gated on `RUN_LEDGER_GUARDS=1`, now part of `npm run test:ledger-guards`), plus the existing shop live suites, `test:shop-sql` and `test:po-sql` - 100 tests in all, passing. The backup round-trip gate passes with the new migration (4 tests, not skipped).
- Four independent read-only reviews of the whole diff; every verified finding fixed and re-tested.
- One schema change (migration 060, additive and idempotent); no new dependency. Nothing committed, pushed or released.


## Every finding


### High

| ID | Finding | Verdict | What was found / done |
|---|---|---|---|
| SHOP-001 | Concurrent checkout can oversell tracked stock (silent clamp) | FIXED | fulfilment takes stock via takeStockForPaidOrder (row locks in id order, stock ledger row with before/after); any BLOCK-product shortfall puts the order ON_HOLD with an internal note naming the products instead of silently clamping. |
| SHOP-002 | Unauthenticated checkout confirm can DoS pending orders | FIXED | ShpPaymentResult.declined; confirm marks FAILED only on a provider-reported decline/cancel of this order's own intent; empty payload / foreign intent / processing leaves the order alone; bank transfer/cash branch acts only while PENDING (no more re-sent pay-by-transfer emails). |
| SHOP-003 | Per-customer coupon limit is TOCTOU under concurrent checkout | FIXED | after payment the per-customer paid uses are re-counted (this order included); over the limit adds an internal note (no hold). |
| SHOP-019 | Refunds and cancellations do not restore tracked stock (normal lines) | FIXED | restockRefundedUnits after a refund settles (processRefund and reconcile): only undispatched units of normal lines, never more than the ledger shows the order took; pre-order and dispatched units never come back; settleRefund now only settles a PENDING row (closed a double-settle race). |
| SHOP-029 | Refunded or unpaid orders still serve digital downloads | FIXED | new lib/download-access.ts downloadRefusal used by the download route and page: refused (plain message) when the line is fully refunded, the order is refunded/cancelled, or payment is not PAID/PARTIALLY_REFUNDED. Review follow-up: a HEAD request no longer spends a download slot. |
| SHOP-062 | Confirmation page is blank without a published layout | FIXED | confirmation page renders OrderConfirmationClient when no layout is published (starter is seeded, so only bites if unpublished/deleted). |
| SHOP-067 | Admin can cancel a paid order without recording a refund | FIXED | statusChangeRefusal: hand-picked CANCELLED refused while a paid SALE order still holds money (points staff to Refund); unpaid, failed, awaiting, fully refunded, free and replacement orders unaffected; internal flows unaffected. Review follow-up: a part refund made in the provider dashboard (payment part refunded, no line refunded) can still be cancelled by hand, since the Refund button cannot finish it. |

### Medium

| ID | Finding | Verdict | What was found / done |
|---|---|---|---|
| SHOP-004 | In-memory rate limits weak on multi-instance deployments | NOT A BUG | Documented trade-off (lib/rate-limit.ts). The state-changing abuse it enabled is closed at source by SHOP-002 (confirm no longer changes another shopper's order) and track-order already has a per-order database lockout; what is left guards cost, not money. A shared limiter needs a new shop table or shop names in core's closed action list (a module leak into core) - out of proportion to the residual risk. |
| SHOP-005 | Pre-order cap not enforced atomically at fulfilment | FIXED | incrementPreOrderCount is one UPDATE ... RETURNING that also switches pre-order off at the cap; over the cap holds the order with a note. |
| SHOP-006 | Coupon global limit: paid order may retain discount if increment loses race | FIXED | incrementCouponUsage false return now checked; used-up coupon adds an internal note. |
| SHOP-007 | Product CSV import in `after()` may exceed 60s module ceiling | FIXED | import-engine takes a time budget (45s from the route), stops cleanly before the next row, marks the job FAILED naming the row; re-uploading carries on (unchanged rows compare equal). Sheet pull unchanged. |
| SHOP-008 | Floating-point money on Stripe confirm path | DEBUNKED | totals rounded to 2dp (lib/checkout.ts resolveOrderTotals) and both sides go through Math.round(x*100), identical pence for any 2dp value in range; PayPal compares toFixed(2). |
| SHOP-009 | Repeated payment-intent POST creates orphan PENDING orders | NOT A BUG | Bounded: the client reuses one prepared order per payment method per visit, payment-intent is limited to 10 per 15 minutes per address, and unpaid orders are pruned daily. Gaps in order numbers carry no weight (invoice numbers are a separate sequence). The one real risk nearby - an unpaid Stripe order pruned and then paid from a tab left open - now raises the stranded-payment alarm instead of vanishing (see extra fixes). |
| SHOP-020 | Stranded PENDING refunds block and consume caps | FIXED (partly wrong) | PENDING stops blocking after 5 minutes already; real hole: stranded rows on hand-recorded methods could never resolve - reconcile now sets them aside as FAILED and emails the owner once; emails name orders by number. |
| SHOP-021 | Request-approval auto-refund may under-refund on EXCLUSIVE tax shops | FIXED | lib/request-refund-lines.ts: approval refunds what the customer paid per unit (total less order-discount share, plus tax on EXCLUSIVE shops), kept within remaining refundable. Review follow-ups: cancellation refunds cover only units still on the shelf; a whole-order cancel cannot be approved once part has shipped; approval refunds route like the order screen (bank transfer, cash and replacements recorded). |
| SHOP-022 | Back-in-stock dispatch is all-or-nothing on send failure | FIXED | per-subscriber claim before send, release on failure; stops after 3 consecutive failures; failure no longer throws into product save. |
| SHOP-023 | Customer email failures leave no order comms record | FIXED | sendShopEmail failure for an order adds an internal system note (shp_order_notes created_by null) and still rethrows. |
| SHOP-027 | Bulk product delete lacks redirect and audit trail | NOT A BUG (missing feature) | single-row list delete has no redirect either; order lines keep snapshots (ON DELETE SET NULL); bulk Archive is the non-destructive path. |
| SHOP-030 | Per-product download limit is check-then-act under concurrency | FIXED | reserveDownloadSlot takes a slot atomically (conditional UPDATE ... download_count < limit) before fetching; 410 on a lost race; slot handed back once on fetch throw, storage error, mid-transfer failure or abandon. |
| SHOP-032 | Hosted-checkout drafts settle stale shipping and totals | FIXED | (a) real in-session bug: prepared order/intent never refreshed when delivery/coupon/basket/address changed, so the shopper was charged the old total; snapshot compared at Place order, fresh prepare on change. (b) confirmDraft refuses a draft older than 24h before money moves. Review follow-up: an unanswered confirm is re-sent rather than re-prepared (no double charge), and the auto-prepare waits for a postcode-shaped value and a pause in typing, retrying only after the checkout changes. |
| SHOP-035 | Public product search is unrate-limited and ILIKE-heavy | FIXED | public products route: 60/min per IP (nothing on the storefront calls it; grids render server-side), Zod on type (bad value used to 500), search max 200 chars. |
| SHOP-036 | Stale refund reconcile runs once daily, not hourly | FIXED | reconcile schedule 30 * * * * (hourly); the "still unresolved" digest only on the 06:xx run. Review follow-up: the "needs checking" digest is a rolling admin-bell alert that emails only when the list changes, instead of only on the 06:00 run. |
| SHOP-040 | Invoice issued but netted-refund marks may fail silently | FIXED | invoice insert + netted-refund marks in one transaction; void + release marks in one transaction; reissue marks inside its existing transaction. |
| SHOP-041 | Credit note tax point uses refund creation time, not settlement | DEBUNKED | refunds settle in the same request that creates them (reserve, provider call, settle); the stale reconcile settles a row whose provider call happened in the creating request, so createdAt is when money moved; no settled timestamp column exists. |
| SHOP-043 | Pending customer cancellation does not block dispatch | FIXED (warning) | ask is not an approval so no hard block; dispatch screen shows pending cancel/return units and a banner. |
| SHOP-044 | Request-approval auto-refund omits delivery and order-level charges | FIXED | Delivery can now be refunded: shp_refunds.shipping_amount (migration 060), capped at what is left of the delivery charge tax included; approving a cancellation of the whole order before anything was sent refunds the delivery too; the refund box offers it; credit notes credit it and invoices leave refunded delivery off. Tax basis corrected under SHOP-021. |
| SHOP-045 | Cart line resolvers run concurrently per basket line | NOT A BUG | lines resolve concurrently but resolvers on one line run in order and prefetchers complete first; all four installed resolvers read only their own request store; contract now documented above CartLineResolver. |
| SHOP-047 | `shop.access` can raise invoices and credit notes via POST | FIXED | invoice POST and credit-note POST require shop.orders (shop.access alone refused; wiki defines it as view-only); GET panels unchanged. |
| SHOP-048 | Invoice void/resend does not verify invoice belongs to order route | FIXED | invoiceOnOrder checks the invoice belongs to the URL order before void/resend; 404 otherwise. |
| SHOP-049 | Credit note issue/resend ignores order id in URL | FIXED | credit-note issue checks the refund's order; resend checks the credit note's order; 404 on mismatch. |
| SHOP-051 | Automatic free-shipping threshold ignores post-coupon subtotal | FIXED | automatic free-shipping threshold now reads the post-discount goods total; also fixed: a FREE_SHIPPING rule gave free delivery on every order whatever its threshold said; comparisons rounded to the penny. Review follow-up: thresholds are judged after every automatic discount, not at the rule's place in the priority order. |
| SHOP-053 | Checkout total updates are not announced to screen readers | FIXED | polite live region announces the order total on change. |
| SHOP-054 | Declined payment may reuse a failed order without a fresh intent | DEBUNKED | Stripe declines are reported by Stripe.js before confirm is called; reusing the same PaymentIntent is Stripe's documented retry; a FAILED order can still settle. |
| SHOP-064 | Module teardown drops all order PII with no export or anonymise hook | FIXED (part) / NOT A BUG (rest) | data dropped only on explicit "Remove code and data (irreversible)"; teardown list was missing shp_credit_notes, shp_guest_carts, shp_product_slug_redirects - added, with guard test lib/manifest-teardown.test.ts. Erase hooks are a core feature. |
| SHOP-068 | Provider webhooks mark orders paid without amount verification | FIXED | webhooks report paidAmount (Stripe amount_received, PayPal decimal parse); mismatch on amount/currency still records the payment but holds the order with a note. |
| SHOP-069 | Automatic discount windows use database UTC, not site timezone | FIXED (via SHOP-060) | JS new Date() vs SQL NOW() compare the same stored instant, so no timezone disagreement; the real hour error was the input conversion, fixed above. |
| SHOP-070 | Coupon minimum order value ignores post-coupon subtotal (automatic rules do not) | NOT A BUG | one rule for all minimums: checked after every discount applied before it, before its own; coupon applies first so reads the full subtotal; audit's scenario is backwards; documented and tested (lib/discount-stacking.test.ts). |
| SHOP-071 | Orders CSV export silently truncates at 5,000 rows | FIXED (worse than reported) | listOrders caps pages at 200 so the export only ever held 200 rows; now walks 200-row pages up to 5,000 and names the file "first-N-of-TOTAL" when cut short. Review follow-up: every order-list sort ends on the id, so paging cannot skip tied rows. |
| SHOP-074 | Pre-order hold check N+1s product lookups per line | FIXED | outstandingPreOrderItems uses one getProductsByIds call. |
| SHOP-084 | `parts_only` spares remain buyable off-catalogue | FIXED | parts-only products 404 for shoppers (staff preview with banner), refused at checkout as "No longer available", skipped in related/upsell; manual orders opt in with includeParts; replacement picker untouched. |
| SHOP-088 | Canonical-query provider throw can break product metadata | FIXED | throwing canonical-query provider logged and skipped; bare URL fallback. |
| SHOP-089 | Product-page resolver throw can 404 a valid alias URL | FIXED | throwing page resolver counts as declining; next module still asked. |
| SHOP-092 | Public checkout pricing routes accept unbounded cart line arrays | FIXED | lib/checkout-lines.ts CheckoutLinesSchema caps lines at 200 with a plain 400; session, apply-coupon, payment-note, payment-intent, cart validate. |
| SHOP-093 | Payment-intent accepts unbounded per-line meta JSON | FIXED | same schema caps line meta at 4000 bytes. |
| SHOP-100 | `shop.access` can answer, re-open, and delete product questions | FIXED | product-question POST/PATCH/DELETE require shop.products; listing still allows shop.access. |
| SHOP-106 | Replacement orders skip fulfilment side effects (stock never decrements) | FIXED | lib/replacements.ts settleReplacement takes the part through takeStockForPaidOrder (stock ledger), so a refund before dispatch puts it back; a shortfall is noted on the replacement. |
| SHOP-107 | Charged replacement orders marked PAID without collecting money | NOT A BUG | Deliberate, documented model (lib/replacements.ts createReplacementOrder): a replacement is born settled so the parcel never waits on money, and a charged part is billed between the owner and the customer. Changing that is a product decision, not a defect. The concrete harm it caused (SHOP-119) is fixed. |
| SHOP-108 | Member cart PUT is not rate limited | FIXED | member cart PUT 120/min per member; cart-sync keeps the basket pending on 429. |
| SHOP-112 | Replacement orders never mint digital download tokens | FIXED | settleReplacement mints download links for DIGITAL replacement lines (same expiry rule as paid orders). |
| SHOP-118 | Damage reports accept arbitrary media-library image ids | FIXED | damage photos attached only if the Media row's folder is this order's Orders/<no>/issues folder (findFolderByPath, creates nothing). |
| SHOP-119 | Charged replacements marked PAID without a payment reference | FIXED | New lib/payments/order-refund-route.ts: a replacement's refund is recorded (like bank transfer and cash) rather than sent to the parent's card provider, which never took the money and refused it for want of a reference. Used by the refund route, the admin order view's refund wording, and the stale-refund reconciler. |
| SHOP-122 | Refund paths update lifecycle status but not payment_status | FIXED | settleRefund moves payment_status to PARTIALLY_REFUNDED / REFUNDED (from PAID/PARTIALLY_REFUNDED only); recordProviderRefund does the same for webhook refunds; every "was it paid" reader uses the three-state set (lib/payment-taken.ts); prepareRefund refuses never-paid orders. Review follow-up: re-payment after a chargeback no longer re-runs fulfilment (paid_at marks a first payment); confirmation page labels part refunded / refunded. |
| SHOP-127 | Manual admin orders accept unbounded line arrays | FIXED | manual order lines max MEMBER_CART_MAX_LINES (200). |
| SHOP-128 | Product CSV import buffers entire upload in memory | FIXED | import route refuses files over core MAX_UPLOAD_BYTES with a plain-English 413 before reading; ImportModal checks size first and uses core uploadErrorMessage. |
| SHOP-129 | Import jobs can remain PROCESSING after abort or throw | FIXED | after() catches a throw -> failImportJobIfUnfinished; PENDING/PROCESSING older than 10 minutes reads as FAILED (lib/import-job-status.ts). Review follow-up: the engine always writes its final tally, so a Sheet pull chunk ending on a skipped row no longer double-counts. |
| SHOP-133 | Admin digital file upload buffers entire file in memory | FIXED | digital upload limit is core MAX_UPLOAD_BYTES (the platform's real 4.5 MB ceiling made the 200 MB claim fiction); 413 before buffering; panel states the limit and reads errors properly. |
| SHOP-137 | CSV import job stores unbounded error arrays on every progress tick | FIXED | updateImportJobProgress stores at most the first 200 errors; skipped count keeps the full total. |
| SHOP-138 | Partially refunded orders can still auto-complete | FIXED | Review found the first fix stranded part-refunded orders on "Part refunded" for good (no completion email, no invoice-on-completion). Final fix: part-refunded orders complete when the rest arrives; ON_HOLD never auto-completes; and a part refund on a COMPLETED order no longer moves its status (settleRefund, recordProviderRefund), which is what caused the re-completion loop. |
| SHOP-139 | Orders CSV export runs due-date extension work for 5000 rows | FIXED | getOrderRowMetrics opts.dueDates; export passes false (no open-lines query, no due-date providers). |
| SHOP-142 | Post-purchase order access blocked when shop is CLOSED | FIXED | closed-shop gate removed from track, receipt proof, status, live delivery, notification preferences, downloads, account order pages, orders list, track-order pages and confirmation; catalogue, basket and checkout stay closed; policy at lib/access.ts. |

### Low

| ID | Finding | Verdict | What was found / done |
|---|---|---|---|
| SHOP-010 | Stripe initialises with empty secret when env missing | FIXED | getStripe throws "Stripe is not set up on this site: the Stripe secret key is missing." instead of the SDK error. |
| SHOP-011 | Invoice document style injects owner-controlled CSS into `<style>` | FIXED | invoice <style> colour/font values now pass through safeCssValue (core cssValue: strips < > { } ; : @ \ and url( / expression( ); cssLength already strict; tests added. |
| SHOP-012 | Duplicate migration sequence prefix `002_*` | NOT A BUG | core runner sorts and records by full filename (scripts/run-module-migrations.mjs:221-224,262); renaming would re-run on installs. |
| SHOP-025 | Sitemap may list category URLs with no active catalogue products | FIXED | sitemap lists a category only with an ACTIVE, not hidden, not parts-only product passing the out-of-stock rule; same fix for collections. |
| SHOP-026 | Bulk delete has no server-side confirmation beyond permission | NOT A BUG | shop.products permission is the boundary; a confirm payload adds nothing a script could not send; UI confirms (ProductsScreen.tsx:212-219) and selection is page-scoped. |
| SHOP-031 | Unmatched postcodes may get zero shipping when zones are misconfigured | FIXED | decideShippingZone returns `uncovered` (zones exist, none matches, no catch-all, not excluded); refusesDelivery refuses an uncovered postcode only when the basket holds a PHYSICAL product; both checkout routes; admin warning when no catch-all zone exists. |
| SHOP-033 | Low-stock cron can duplicate alert emails on overlap | FIXED | claimLowStockAlert before send, releaseLowStockAlert on failure; prune runs regardless; job answers 500 with an error on failure. |
| SHOP-042 | Unpaid invoice tax point is “today”, not despatch date | FIXED | new lib/invoice-tax-point.ts (UK 14-day rule from first shipment's shipped_at): invoices raised more than 14 days after despatch now take the despatch date; reissue keeps the original tax point; 10 tests. Review follow-up: a reissue dates its credit note and replacement invoice the same day, so they net off in one return. |
| SHOP-046 | Product gallery has no broken-image fallback | FIXED | stage image falls back resized -> original -> plain tile; thumbs 300px -> original -> empty; mount-time check for pre-hydration failures; zoom off on placeholder. |
| SHOP-050 | Order-size deduction report uses `shop.products` not `shop.reports` | FIXED | order-size-deduction report requires shop.reports, matching the Reports page gate. |
| SHOP-052 | Shop minimum order value ignores post-discount subtotal | NOT A BUG (rule now stated) | Measuring after discount was tried and locked shoppers out (a coupon could take the basket under the floor and cannot be removed), so the minimum/maximum stay on goods before discount and before delivery - now one shared, penny-exact gate (lib/order-value-gate.ts) for session and payment-intent, with the rule spelled out to the shopper and in the admin hint. |
| SHOP-055 | Review step totals skip `formatMoney` thousands grouping | FIXED | review totals use formatMoney. |
| SHOP-060 | Coupon start/expiry windows use server UTC, not site timezone | FIXED | real cause: admin date input went through new Date('YYYY-MM-DD') (midnight UTC, 01:00 BST); form now sends the date and the server makes it midnight in the site timezone (lib/discount-window.ts, four routes); list API returns startsOn/expiresOn so saving does not drift. Review follow-up: rows written by the old form (midnight UTC) read back as their own day on sites west of UTC. |
| SHOP-063 | Payment failure messages lack alert semantics on review step | FIXED | payment and summary errors carry role="alert". |
| SHOP-072 | Public shop config can stay stale at the edge after settings change | NOT A BUG | documented trade-off (config/route.ts): 5s in-process + s-maxage 15 / swr 30, payment-intent re-enforces every rule; worst case a clear refusal within a minute. |
| SHOP-073 | Checkout review Puck editor omits wallet button preview | NOT A BUG | in the editor the review block is always in its "working out your total" state, which never draws wallet buttons, and the editor bundle cannot import the server-only registry; both paths produce identical markup. |
| SHOP-075 | Delivery tracking poll capped at 25 parcels per hour | NOT A BUG | deliberate courier courtesy; out-for-delivery parcels go first, backlog rotates oldest-checked first; live-delivery page completes orders too. |
| SHOP-076 | Module teardown does not drop order-number sequences | NOT A BUG | keeping sequences means a reinstall never reuses order/invoice/credit-note numbers (UK invoice numbering); core teardown runs DROP TABLE per entry so sequences cannot be listed anyway. |
| SHOP-081 | PayPal OAuth token cached in module memory across invocations | FIXED | paypalFetch drops the cached token and retries once on 401. |
| SHOP-085 | Order lines snapshot catalogue SKU, not sale SKU | NOT A BUG | sale SKU is owner-only (migration 018, admin hint); product_sku prints on customer receipts/invoices so snapshotting a supplier code there would leak it. |
| SHOP-090 | Rating provider ignores manifest install order | FIXED | rating providers walked in installed-modules manifest order. |
| SHOP-091 | Checkout UI extension maps skip manifest gating | NOT A BUG | payment methods themselves come from the same ungated registry (lib/payments/registry.ts:29); gating only wallet/field maps would show a method without its buttons; comment added. |
| SHOP-094 | Back-in-stock subscribe ignores storefront visibility | FIXED | back-in-stock subscribe requires storefront reachability. |
| SHOP-095 | Product questions accept non-storefront products | FIXED | product questions require storefront reachability. |
| SHOP-096 | Abandoned-order prune ignores failed and awaiting-payment rows | NOT A BUG | AWAITING_CONFIRMATION are real bank-transfer orders; FAILED can still turn PAID and is the owner's record of the attempt; pruning them would lose real orders. |
| SHOP-097 | Admin customer lookup enables email existence oracle | NOT A BUG | same role can already search every customer by email fragment (app/api/admin/customers/route.ts:14); 404 reveals nothing new and needs staff sign-in. |
| SHOP-098 | Checkout session/intent block staff during CLOSED shop | FIXED | checkoutClosedResponse(): shoppers blocked when CLOSED/BROWSE_ONLY, staff with shop access let through; session and payment-intent. |
| SHOP-101 | Product CSV export holds entire catalogue in memory | NOT A BUG | pages through the catalogue with four queries; memory is small for a realistic catalogue and the Sheet mirror needs the full list; 60s bites first. |
| SHOP-104 | Thumb-top-up cron swallows backfill failures | FIXED | thumb-top-up no longer swallows failures; answers 500 with error and progress so far. |
| SHOP-109 | Guest cart store ignores closed-shop gate | NOT A BUG | storing a basket sells nothing; checkout stays gated; ensureCartSync runs on every page so a gate would put 503s everywhere. |
| SHOP-110 | Dashboard widget revenue uses float conversion | FIXED | lib/dashboard-revenue.ts summariseRevenue in Prisma.Decimal; widget uses formatMoney. |
| SHOP-111 | Member GDPR export fans out order items without bound | FIXED | getOrderItemsForOrders fetches all lines in one query for the GDPR export. |
| SHOP-113 | Collection Browser prints extension links without scheme filter | FIXED | provider collection card href must be a site path or http(s); otherwise the card is dropped. |
| SHOP-114 | Charged replacements skip PAID-trigger auto-invoice | FIXED | settleReplacement issues the PAID-trigger invoice for charged replacements when the shop invoices on payment. |
| SHOP-116 | Dispatch modal does not warn about pending cancel/return units | FIXED | pendingRequestUnits(); dispatch GET adds pendingCancelQty/pendingReturnQty; DispatchModal banner + per-line note. |
| SHOP-117 | Puck promo and footer links accept arbitrary URL schemes | FIXED | core sanitizeHref on promo banner CTA and collection links (http(s), mailto, tel, site-relative). |
| SHOP-120 | Requests queue pre-ticks refund from order total, not payment state | FIXED | refund box pre-ticked only when payment is held; hint for unpaid/fully refunded orders. |
| SHOP-123 | Dashboard 30-day revenue includes priced replacement orders | FIXED | RSC widget counted every paid row; now counts sales only; average order value = sales money / sales count in widget and JSON route. Revenue headline keeps charged spares per the documented 052 rule (money follows payment_status, counts follow kind). |
| SHOP-124 | Admin order notes and manual emails accept unbounded bodies | FIXED | lib/admin-input-limits.ts; notes max 20,000; email subject 250 / body 100,000; route returns Zod message; OrderDetailScreen shows it. |
| SHOP-126 | Purchase reference editable on partially refunded orders | NOT A BUG | a part-refunded order is still live; the paperwork rule is the invoice lock (customer-reference.ts:62-65); a reference added later is filled onto invoice and credit note. |
| SHOP-130 | Admin payment-status filters miss lifecycle-refunded orders | FIXED | payment filters recognise new rows and legacy rows (PAID + lifecycle refunded); "Paid" means money still held; tile and list agree. |
| SHOP-131 | Stranded payments banner lacks recovery pointers | FIXED | stranded banner shows checkout reference, last attempt time, and recovery steps. |
| SHOP-132 | Requests queue accepts non-numeric `limit` and breaks pagination | FIXED | wholeNumberOr() sanitises limit before LIMIT. |
| SHOP-134 | Requests queue accepts non-numeric `offset` and breaks pagination | FIXED | same helper for offset. |
| SHOP-135 | Bulk product mutations silently drop ids beyond 200 | FIXED | products/bulk route: ids max BULK_PRODUCT_MAX_IDS (200) with 400 + message instead of silent slice(0,200). |
| SHOP-136 | Revenue report chart sums replacement PAID totals | NOT A BUG | report shows revenue and count side by side, never an average; revenue including charged spares follows the documented 052 rule. |
| SHOP-140 | Damage-photo upload buffers entire image in memory | FIXED | photos route refuses on Content-Length and file.size before buffering, plain 413 (4 MB ceiling). |
| SHOP-141 | Settled-order metrics SQL omits partially refunded status | NOT A BUG | a part-refunded order often still has lines to send; nextDueDate already skips lines with nothing outstanding; comment added. |
| SHOP-143 | Apply-coupon runs without shop OPEN/CLOSED gate | FIXED | apply-coupon uses checkoutClosedResponse plus quote-mode refusal. |
| SHOP-144 | Billing identity editable on partially refunded orders | NOT A BUG | address edits on a live part-refunded order are legitimate; company reissue already refused once a credit note exists (invoice-reissue.ts:147-158). |
| SHOP-145 | Dispatch shipment notes accept unbounded text | FIXED | dispatch notes max 2000 on POST and PATCH. |
| SHOP-146 | Checkout and manual orders accept uncapped purchase references | FIXED (admin part) | manual order customerReference max CUSTOMER_REFERENCE_MAX_LENGTH. |
| SHOP-147 | Dispatch tracking numbers accept unbounded text | FIXED | trackingNumber max 200, trackingUrl/short code max 2000. |
| SHOP-148 | Payment-intent contact and address fields lack max lengths | FIXED (admin part) | manual order uses BoundedAddressSchema / customerNameField / phoneField, organisation max BILLING_COMPANY_MAX_LENGTH. |
| SHOP-149 | Cancel and return requests allowed on partially refunded orders | FIXED (per line) | blanket block would be wrong; real defect was returnable = dispatched - refunded, wrongly refusing returns once an undispatched unit was refunded; heldUnits() = min(dispatched, qty - refunded). Review follow-up: approved returns now come off dispatched units and pending ones off what is left, so a returned-and-refunded unit is not counted twice. |
| SHOP-150 | Dispatch POST accepts unbounded line item batches | FIXED | dispatch items max 200 (lib/order-line-limits.ts). |
| SHOP-151 | Admin can set lifecycle REFUNDED without processing a refund | FIXED | UI never offered these statuses but the API accepted them; REFUNDED refused unless everything is refunded on record, PARTIALLY_REFUNDED unless some refund is. |
| SHOP-152 | Admin refund POST accepts unbounded item batches | FIXED | refund items max 200, reason max 2000. |
| SHOP-153 | Shipping zone postcode lists are uncapped | FIXED | lib/zone-postcode-list.ts: max 20,000 lines, 32 chars each; TaxShippingScreen no longer says "Zone saved." on a refused save. |
| SHOP-154 | Collection membership writes accept unbounded product id lists | FIXED | collection productIds max 10,000 (PUT sends whole collection). |
| SHOP-155 | Member saved addresses lack field length caps | FIXED | member address routes use BoundedAddressSchema. |
| SHOP-156 | Member billing PATCH address lines lack max lengths | FIXED | billing PATCH address uses addressFields. |
| SHOP-157 | Damage reports still offered on refunded orders | FIXED (REFUNDED) / NOT A BUG (PARTIALLY_REFUNDED) | fully refunded orders no longer offer damage; part-refunded stay open (goodwill refund does not spend the unit). |
| SHOP-158 | Manual payment instruction settings are unbounded | FIXED (write side) | PAYMENT_INSTRUCTIONS_MAX_LENGTH 10,000 checked in settings PUT only when the value changes; not in ShpConfigSchema because a parse failure resets the whole config on read. |
| SHOP-159 | Product related and upsell id arrays are uncapped | FIXED | related/upsell picks max 200, exclusions max 1,000. Review follow-up: related/upsell "how many to show" capped at 200 in the API and the editor. |
| SHOP-160 | Catalogue reorder endpoints accept unbounded id lists | FIXED | reorder orderedIds max 5,000 (category/collection/tag). |
| SHOP-161 | Checkout phone field has no maximum length | FIXED | customerPhone phoneField (32). |
| SHOP-162 | Tax report period keys off order created_at only | FIXED | tax report filters collected tax on paid_at (fallback created_at) and refunded tax on the refund's own date; rates with refunds only still get a row. Also fixed: refunded tax overstated on tax-exclusive shops (divisor now gross). Review follow-ups: refunded-tax divisor now uses the discounted line value; date filters are midnight in the site timezone. |
| SHOP-163 | Member cancel/return requests accept unbounded line selections | FIXED | member request items max 200. |
| SHOP-164 | Pay-online banner ignores partially refunded lifecycle | FIXED | paymentOutstanding treats PARTIALLY_REFUNDED as closed; tests added. |
| SHOP-166 | Admin product PUT accepts unbounded relation arrays | FIXED | product PUT media max 500, category/tag/collection ids max 1,000 each. |

### Info

| ID | Finding | Verdict | What was found / done |
|---|---|---|---|
| SHOP-013 | No TODO/FIXME/HACK markers in shop source | NOT A BUG | observation. |
| SHOP-014 | Stranded-payment handling for draft materialisation | NOT A BUG | positive observation. |
| SHOP-015 | Module dependencies | NOT A BUG | observation; requiresModules [] accurate. |
| SHOP-016 | Core version gate | NOT A BUG | requiresCoreVersion is the safeguard. |
| SHOP-017 | Cross-module import pattern (Google Sheet) | NOT A BUG | info; underlying 60s risk fixed under SHOP-007. |
| SHOP-018 | Test coverage shape | NOT A BUG | observation on test shape. |
| SHOP-024 | No abandoned-cart recovery emails | NOT A BUG | feature not offered. |
| SHOP-028 | Refund pipeline hardening | NOT A BUG | positive observation; two holes found and closed (double-settle race; duplicate lines in one refund each passing per-line caps - now combined before checking). |
| SHOP-034 | No gift cards, store credit, or account balance | NOT A BUG | feature not offered. |
| SHOP-037 | No loyalty, referral, or repeat-purchase programmes | NOT A BUG | feature not offered. |
| SHOP-038 | Stranded payments have no cron sweeper | NOT A BUG | missing feature; stranded payments already show as an orders-screen banner. |
| SHOP-039 | Digital download streaming hardening | NOT A BUG | positive observation; still holds after SHOP-030. |
| SHOP-056 | No scheduled sale windows or compare-at scheduling | NOT A BUG | missing feature (scheduled sale windows need new columns). |
| SHOP-057 | Trade price is recorded but never charged | NOT A BUG | trade price deliberately admin-only (lib/pricing.ts:26; wiki Shop.md). |
| SHOP-058 | Quote-only commerce is extension-owned | NOT A BUG | positive observation verified. |
| SHOP-059 | Single currency, en-GB display, UK-shaped checkout | NOT A BUG | scope note; coupon-window part closed by SHOP-060. |
| SHOP-061 | Payment handover dialog accessibility | NOT A BUG | positive observation confirmed. |
| SHOP-065 | No in-module GDPR export/erase hooks | DEBUNKED | shop does plug into core member data export (memberExtensions.dataExportPath -> app/api/member/gdpr-export/route.ts); core defines no erase hook. |
| SHOP-066 | Consent and cookies | NOT A BUG | scope note matches manifest. |
| SHOP-077 | Product reviews via extension only | NOT A BUG | scope note; ordering fixed under SHOP-090. |
| SHOP-078 | No wishlist; member cart sync only | NOT A BUG | missing feature. |
| SHOP-079 | Seller VAT on invoices; no buyer VAT-exempt checkout | NOT A BUG | scope note; buyer VAT exemption is a missing feature. |
| SHOP-080 | Manual payment checkout path | NOT A BUG | positive observation, still true. |
| SHOP-082 | No subscription or recurring billing | NOT A BUG | feature not offered. |
| SHOP-083 | No multi-warehouse or pickup-location fulfilment | NOT A BUG | feature not offered. |
| SHOP-086 | Slug uniqueness uses `$queryRawUnsafe` with fixed table names | NOT A BUG | table name from fixed TS union; slug bound as $1. |
| SHOP-087 | No fraud velocity rules or blocklists | NOT A BUG | missing feature. |
| SHOP-099 | BROWSE_ONLY is a settings label with minimal surface enforcement | NOT A BUG | checkout already refuses BROWSE_ONLY for shoppers; a storefront banner would be a new feature. |
| SHOP-105 | Popularity recompute failure is silent in the daily cron | FIXED | popularity refresh failure logged and reported (500 + error on Schedules), after low-stock emails and prune. |
| SHOP-115 | Replacement orders skip `shop.order-paid` observers | NOT A BUG | shop.order-paid means "money has landed"; its only listener (purchase-orders) reads it as "buy the goods in", so firing it for shelf spares would raise unwanted supplier POs. |
| SHOP-121 | Admin currency symbol hook defaults to £ before config loads | NOT A BUG | '£' fallback matches schema default; non-GBP flash is first paint only; failed fetch retried. |
| SHOP-125 | SMS milestones never appear in order communications log | FIXED | each SMS sent/failed recorded as a system note; a failed email no longer prevents the text going. |
