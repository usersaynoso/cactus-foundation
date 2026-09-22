# Shop module bug audit

**Combined report:** 2026-09-21 · audit passes **1–1094** · single canonical file. Pass logs 55–1094 are embedded below; no separate supplement files.

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449 (`cactus.module.json`, pin `v0.1.449` in core `modules.json`)  
**Location audited:** `/Users/chris/Git Local/Cactus/modules/shop` (checked out under primary Cactus checkout; nested `cactus-foundation/` path not present on disk)  
**Auditor note:** Static analysis only (grep, file reads, call-chain tracing). No local dev server, no live database, no production build.

---

## Executive summary

The shop module is mature, heavily commented, and shows deliberate hardening on payments (provider re-validation, idempotent `markOrderPaid`, draft + `FOR UPDATE` materialisation, stranded-payment alarms), guest order access (postcode proof, per-order DB lockout, uniform error copy), and catalogue import (batched lookups, compare-before-write). No Critical defects were found that would trivially compromise all installs without specific attack conditions.

The main residual risks cluster around **commerce races** (stock and pre-order caps checked at checkout but decremented only on payment, with clamp-to-zero rather than hard failure), **unauthenticated checkout endpoints** (confirm payment can mark another shopper’s pending order as failed if an attacker learns a UUID), **serverless rate limiting** (in-memory buckets), and **long-running `after()` work** (CSV import and media moves vs the 60s module route ceiling). Payment webhooks and Stripe confirm paths are in good shape relative to common failure modes.

**Finding counts:** Critical 0 · High 7 · Medium 67 · Low 57 · Info 32 (**163 documented findings**; ID slots **SHOP-102**, **SHOP-103**, and **SHOP-165** unused; **SHOP-086** assigned in passes 55–154)

**Passes 13–17 (2026-09-21):** Refunds and partial fulfilment are strongly serialised (advisory locks, PENDING reservations, provider idempotency keys, stale reconcile cron). Gaps remain around **inventory put-back** after refund/cancel for normal tracked lines, **request-approval refund amounts** on tax-exclusive orders, and **back-in-stock / customer email failure visibility**. SEO surfaces mostly respect ACTIVE/hidden rules; category sitemap and root-slug claiming still expose a few soft URLs. Admin bulk delete and CSV import remain permission-gated but light on audit trail.

**Passes 18–22 (2026-09-21):** Digital downloads are well gated against redirect bypass (stream-through, count on flush) but **do not honour refunds** or payment state on the token route. **Hosted-checkout drafts** freeze shipping and totals at draft time with no re-quote at settlement. There is **no gift-card or store-credit** subsystem (Info). Public catalogue search is parameterised and sort-safe, yet **unrate-limited ILIKE** queries can stress large catalogues. Cron routes enforce `CRON_SECRET`, but **refund reconcile runs once daily** whilst code and stale thresholds imply hourly attention, and **low-stock alerting** can duplicate emails on overlapping runs.

**Passes 23–27 (2026-09-21):** Invoice and credit-note pipelines are thoughtfully centralised (`lib/invoices.ts`, `lib/credit-notes.ts`, extension sinks) with race-safe uniqueness, yet **netted-refund marking** and **credit-note tax points** can drift from settlement reality. Customer **order requests** serialise well under advisory locks, but **pending cancellations do not hold dispatch** and **approval refunds omit delivery**. Cart **line resolvers** run **in parallel per line**, which is fine for pure functions but risky for stateful providers. Storefront **gallery images** lack broken-URL fallbacks; **thumb_url** remains a plain column dependent on rewrite jobs. Admin **accounting POST routes** treat `shop.access` like `shop.orders`, and several **invoice/credit-note actions ignore the order id in the URL**.

**Passes 33–47 (2026-09-21):** Puck blocks split editor/RSC deliberately on grids and product detail; checkout review omits wallet buttons in the editor only. **Paid orders can be marked cancelled** without a refund path. **Stripe and PayPal webhooks** mark orders paid without re-checking amount/currency (confirm paths do). Automatic discount **windows use DB UTC**; **coupon minimums** disagree with automatic minimums on post-coupon subtotals. **Orders CSV export** silently stops at 5,000 rows. **Public config** is CDN-cacheable for tens of seconds after settings change. No in-module **reviews** or **wishlist** (extension point and member carts only). **Seller VAT** on invoices only; no buyer VAT-exempt checkout. Tracking cron is **capped at 25 parcels/hour**; teardown drops tables but **not order-number sequences**.

**Passes 48–54 (2026-09-21):** No **subscription or recurring billing**, **multi-warehouse/pickup**, or **fraud blocklist** subsystems (Info). **Sale SKU** and **compare-at scheduling** are absent or unused on the money path; **`parts_only` spares** stay off lists but remain buyable by direct URL. Member **order history and address book** are solid where email is verified; extension hooks mostly follow manifest order and swallow errors, but **`shop.product-canonical-query`** and **`shop.product-page-resolver`** can still take a product page down on a provider throw.

**Passes 155–654 (2026-09-21):** Five hundred systematic one-file passes (see [Passes 155–654](#passes-155-654-full-log)): every API route, then `lib/db`, remaining `lib`, components, migrations, tests, and admin/public pages. New gaps include **replacement orders born PAID without `fulfillPaidOrder`** (tracked stock never decrements; charged lines still marked settled), **member cart PUT without IP rate limiting** (guest cart store is throttled), and **dashboard revenue cast through JS `Number()`**. Guest cart persistence whilst the shop is CLOSED and GDPR export item fan-out are Low housekeeping. Most passes reconfirmed earlier themes (checkout caps, webhook amounts, permissions) without new IDs.

**Passes 655–704 (2026-09-21):** Fifty gap-filling passes (see [Passes 655–704](#passes-655-704-full-log)): remaining Puck blocks after `ShopCollectionBrowser.rsc.tsx`, detail/card/invoice Puck parts, storefront page shells, migration clusters, test clusters, and replacement–dispatch–document cross-checks. New gaps include **digital lines on replacement orders never minting download tokens**, **collection-index extension links without http(s) filtering**, **charged replacements skipping PAID-trigger auto-invoice**, and **dispatch UI not surfacing pending cancel quantities**. Promo/footer Puck links still accept arbitrary URL schemes (owner trust boundary).

**Passes 705–754 (2026-09-21):** Fifty admin-screen, member-request, template-key, storefront-shell, and replacement-refund cross-check passes (see [Passes 705–754](#passes-705-754-full-log)). New gaps include **damage reports accepting arbitrary media-library image ids**, **charged replacements marked PAID with a copied payment method but no provider reference**, **requests queue pre-ticking refund from order total rather than payment state**, and **admin currency symbol defaulting to £ before config loads**.

**Passes 755–804 (2026-09-21):** Fifty thematic passes on checkout/cart Puck clusters, checkout-draft and document-print cross-checks, order notes and manual email, dashboard metrics, SMS notify paths, purchase-order portal, and provider refund webhooks (see [Passes 755–804](#passes-755-804-full-log)). New gaps include **refunds updating lifecycle status without syncing `payment_status` or shop refund rows** (admin settle and Stripe/PayPal webhooks), **30-day dashboard revenue summing priced replacement orders whilst order counts exclude them**, **unbounded admin note and manual email bodies**, **SMS milestones leaving no communications-tab history even when sends succeed**, and **post-order purchase references still editable on partially refunded orders**.

**Passes 805–854 (2026-09-21):** Fifty gap-filling passes (see [Passes 805–854](#passes-805-854-full-log)): remaining category/collection Puck pairs, invoice Puck parts, admin modals and hooks, import job and manual-order cross-checks, document PDF and track-order access, public tags and order-size APIs, reconcile-refund cron parity, member pay-online confirm, stranded-list admin UX, and requests-queue pagination. New gaps include **manual admin orders and CSV import uploads without line/size caps**, **import jobs stuck in PROCESSING when `after()` dies**, **admin payment-status filters missing SHOP-122 refunded rows**, **stranded-payment banners without recovery pointers**, and **invalid `limit` on the requests queue yielding NaN SQL**.

**Passes 855–904 (2026-09-21):** Fifty passes (see [Passes 855–904](#passes-855-904-full-log)): individual product-detail and card Puck part-blocks, remaining invoice Puck parts, admin digital upload and bulk mutation edges, reports revenue cross-checks, import error persistence, and second-order passes on SHOP-122/127/128/129 themes. New gaps include **admin digital uploads buffering up to 200 MB in one request**, **import jobs storing an unbounded error list on every progress tick**, **bulk product mutations silently dropping ids beyond 200**, **requests queue `offset` NaN parity with SHOP-132**, and **revenue report charts mixing replacement PAID totals with SALE-only order counts**.

**Passes 905–954 (2026-09-21):** Fifty passes (see [Passes 905–954](#passes-905-954-full-log)): order-line due-date extension seam and admin list metrics, auto-complete versus partially refunded orders, payment-state preview/apply, FAQ search and render pipeline, product details bare view, grid pager scroll hold, tax-view client, damage-photo upload ingress, and export/list metrics cross-checks. New gaps include **partially refunded orders still eligible for auto-complete**, **orders CSV export fanning extension due-date work across up to 5000 rows**, **damage-photo uploads buffering whole images in the request**, and **`PARTIALLY_REFUNDED` omitted from settled-order metrics SQL**.

**Passes 955–974 (2026-09-21):** Twenty passes (see [Passes 955–974](#passes-955-974-full-log)): post-purchase order APIs versus document-access CLOSED-shop policy, checkout apply-coupon gate parity, customer billing eligibility on part-refunded orders, admin dispatch note bounds, cart basket charge aggregation, category FAQ chain SQL, signature capture ingress, and live-delivery client polling. New gaps include **track, receipt, status, live-delivery, and account order pages blocked when the shop is CLOSED whilst invoice/credit-note access stays open**, **apply-coupon running full discount resolution without an OPEN/CLOSED gate**, **billing identity edits still allowed on `PARTIALLY_REFUNDED` orders**, and **unbounded dispatch shipment notes**.

**Passes 975–994 (2026-09-21):** Twenty passes (see [Passes 975–994](#passes-975-994-full-log)): checkout and manual-order ingress caps versus post-order reference limits, dispatch tracking-number and line-batch bounds, cancel/return eligibility on partially refunded orders, and checkout contact/address Zod parity with billing panels. New gaps include **payment-intent and admin manual orders accepting purchase references longer than the member PATCH allows**, **dispatch tracking numbers with no max length**, **cancel/return requests still offered when lifecycle is `PARTIALLY_REFUNDED`**, **unbounded checkout name/organisation/address fields on payment-intent**, and **dispatch POST accepting unbounded `items` arrays**.

**Passes 995–1094 (2026-09-21):** One hundred passes (see [Passes 995–1044](#passes-995-1044-full-log) and [Passes 1045–1094](#passes-1045-1094-full-log)): admin lifecycle status versus `processRefund` parity, refund and request ingress batch caps, shipping-zone and collection membership Zod bounds, member address book versus billing PATCH length parity, damage-report eligibility on refunded lifecycle, tax-report date semantics, pay-online `paymentOutstanding` matrices, product recommendation and editor relation arrays, and cross-checks against SHOP-122/067 themes. New gaps include **staff setting lifecycle `REFUNDED` from the status dropdown without moving money**, **admin refund POST accepting unbounded line batches**, **damage reports still offered on fully refunded orders**, and **several admin catalogue writes lacking array or field ceilings**.

**Passes 55–154 (2026-09-21):** One hundred narrow static passes (see [Passes 55–154](#passes-55-154-full-log)) across public checkout APIs, admin mutations, storefront clients, `lib/db`, payments, email, SEO, cron, extensions, and migrations/tests. New gaps include **unbounded cart line arrays and line meta on checkout mutators** (guest/member carts cap at 200 lines and 4KB meta; payment-intent does not), **back-in-stock and product-questions accepting non-storefront products**, **`shop.access` answering or deleting product questions**, **staff closed-shop preview missing on session/payment-intent**, **abandoned-order prune skipping failed/awaiting-payment rows**, **admin customer email oracle**, **full-catalogue CSV export memory**, and **silent thumb-backfill / popularity failures in the daily cron**. **SHOP-086** documents the lone `$queryRawUnsafe` in slug uniqueness (table name is an internal enum). **BROWSE_ONLY** remains a settings label with checkout blocked via `shopStatus !== 'OPEN'` only (Info).

**Passes 28–32 (2026-09-21):** No **loyalty or referral** subsystem (coupons and automatic discounts only). **Coupon stacking** is mostly coherent but **free-shipping thresholds** on automatic discounts ignore post-coupon subtotals. **Trade price** is admin-only; **quote-only** commerce is extension-driven. **Locale** is single-currency with **en-GB** formatting pinned; checkout is **UK postcode / UK phone** shaped with no OSS helpers. **Accessibility** on checkout is thoughtful in places (blocked-order links, handover dialog), yet **live totals** are silent to screen readers and **payment errors** are easy to miss. **Confirmation** can render **blank** without a published layout. **GDPR** hooks are absent in-module; **teardown** drops all order PII tables on uninstall.

---

## Findings by severity

### Critical

*(none)*

### High

#### SHOP-001 — Concurrent checkout can oversell tracked stock (silent clamp)

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Cart / checkout / inventory |
| **Files** | `lib/checkout.ts` (~169–181), `lib/db/products.ts` (~818–836), `lib/order-fulfillment.ts` (~55–56), `app/api/public/checkout/payment-intent/route.ts` (~70–72) |
| **Symptom** | Two shoppers can both pass checkout validation for the last unit, both pay, and both receive confirmations; catalogue `stock_count` may reach 0 while two paid orders exist for one physical unit. |
| **Root cause hypothesis** | Availability is computed at `resolveCartLines` time with no row lock or reservation. Stock is reduced in `decrementStockOnShip` only after payment, using `GREATEST(..., 0)` so the UPDATE never fails when oversold. |
| **Reproduction (inferable)** | Product with `track_inventory=true`, `out_of_stock_behaviour=BLOCK`, `stock_count=1`. Two browsers complete payment-intent + pay within seconds before either fulfilment runs. |
| **Fix direction** | Optional stock reservation at order creation with TTL, or conditional decrement at fulfilment that fails loudly (and triggers refund/hold workflow) when `stock_count < ordered_qty`; at minimum surface oversell to admin when clamp occurs. |

#### SHOP-002 — Unauthenticated checkout confirm can DoS pending orders

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Payment / checkout |
| **Files** | `app/api/public/checkout/confirm/route.ts` (~16–21, ~59–72), `lib/db/orders.ts` (~444–447) |
| **Symptom** | A stranger who knows (or guesses) a pending order UUID can POST invalid payloads and flip `payment_status` to `FAILED` for orders they do not own. |
| **Root cause hypothesis** | Route is intentionally unauthenticated; protection is rate limit + provider validation. On failed `confirmPayment`, `markOrderPaymentFailed` runs for any matching pending order id. UUID entropy makes guessing impractical, but ids leak via client networks, logs, referrer chains, or shared devices. |
| **Reproduction (inferable)** | Obtain pending order id (e.g. from browser devtools during legitimate checkout). POST `{ orderId, payload: {} }` repeatedly until rate limit; order becomes `PAYMENT_FAILED`. |
| **Fix direction** | Require a checkout-scoped secret (receipt token, draft HMAC, or payment-intent client secret binding) before mutating payment state; or only mark failed when provider confirms intent belongs to this session. |

#### SHOP-019 — Refunds and cancellations do not restore tracked stock (normal lines)

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Refunds / inventory |
| **Files** | `lib/order-fulfillment.ts` (~55–56), `lib/db/refunds.ts` (~319–355), `lib/order-status.ts` (~248–252), `lib/db/shipments.ts` (~345–372) |
| **Symptom** | After a paid order, `stock_count` falls at payment for normal lines (and at dispatch for pre-order lines). Refunding units or cancelling the order releases pre-order allocation but **never increments** `stock_count` for ordinary tracked products, so catalogue stock stays understated until someone edits it by hand. |
| **Root cause hypothesis** | Stock moves in two places only (payment vs pre-order dispatch). Refund/cancel paths update `refunded_qty`, pre-order counters, and order status, but there is no symmetric restore for lines already decremented at payment. |
| **Reproduction (inferable)** | Product with `track_inventory=true`, `stock_count=10`. Sell one unit (paid); stock becomes 9. Refund the line in admin; stock remains 9 while the unit is physically back. |
| **Fix direction** | On successful refund settlement (and on cancel where units were never dispatched), restore stock for applicable lines; guard against double-restore when goods were never returned. |

#### SHOP-029 — Refunded or unpaid orders still serve digital downloads

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Digital downloads / refunds |
| **Files** | `app/api/public/downloads/[token]/route.ts` (~16–27), `app/public/shop/downloads/[token]/page.tsx` (~17–30), `lib/db/digital.ts` (~40–43) |
| **Symptom** | Anyone holding a download token can fetch the file after the line or order has been fully refunded, or potentially while payment never settled, because access checks stop at token validity, expiry, and per-product download limits. |
| **Root cause hypothesis** | Route loads the download row and order item only; it never joins `shp_orders.payment_status` / order status, nor `shp_order_items.refunded_qty`. Tokens are minted at payment in `fulfillPaidOrder` but never invalidated on refund. |
| **Reproduction (inferable)** | Buy a digital product, copy the download link from the confirmation email, refund the line in admin; GET the same token URL still streams the file. |
| **Fix direction** | Deny when order is not `PAID` (or allowed partial states), or when `refunded_qty >= quantity` for the bound order item; optionally rotate or delete download rows on refund settlement. |

#### SHOP-003 — Per-customer coupon limit is TOCTOU under concurrent checkout

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Discounts / checkout |
| **Files** | `lib/checkout.ts` (~456–461), `lib/db/orders.ts` (~934–940), `lib/order-fulfillment.ts` (~68–69), `lib/db/discounts.ts` (~124–137) |
| **Symptom** | Customer with `per_customer_limit=1` may complete two paid orders with the same coupon if both checkouts resolve the discount before either is `PAID`. |
| **Root cause hypothesis** | `countPriorCouponOrdersByEmail` counts only `payment_status = 'PAID'`. Two in-flight checkouts both see `priorUses=0`. Global `usage_limit` is enforced atomically on increment, but per-customer limit is not re-checked at increment time. |
| **Reproduction (inferable)** | Two parallel payment-intent requests from same email with same coupon code; complete payment on both within a short window. |
| **Fix direction** | Enforce per-customer limit in a single transactional step at payment (e.g. conditional insert into a redemption ledger, or increment only when subquery count `< limit`). |

#### SHOP-062 — Confirmation page is blank without a published layout

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Storefront UX / checkout |
| **Files** | `app/public/shop/checkout/confirmation/page.tsx` (~14–15), contrast `app/public/shop/cart/page.tsx` (~14–17), `components/puck/ShopOrderConfirmation.tsx` |
| **Symptom** | After paying, the shopper is redirected to `/shop/checkout/confirmation?…` but sees an empty page when no `shopConfirmation` Puck layout is published. Cart and checkout pages fall back to hardcoded clients; confirmation does not. |
| **Root cause hypothesis** | Server page returns `null` when `layout?.builderData` is absent; the real receipt UI lives only inside the Puck block (`OrderConfirmationClient`). |
| **Reproduction (inferable)** | Fresh install or site that never published Shop > Confirmation layout; complete any payment path that navigates to the confirmation URL. |
| **Fix direction** | Mirror cart/checkout: render `OrderConfirmationClient` when no layout is published; keep Puck layout as override. |

#### SHOP-067 — Admin can cancel a paid order without recording a refund

| Field | Detail |
|--------|--------|
| **Severity** | High |
| **Area** | Admin order mutation / refunds |
| **Files** | `app/api/admin/orders/[id]/status/route.ts`, `app/api/admin/orders/bulk/route.ts`, `lib/order-status.ts` (~208), `lib/db/orders.ts` (~326–329) |
| **Symptom** | Staff can set `status` to `CANCELLED` on an order that is still `payment_status = 'PAID'`. The customer may receive a cancellation email whilst money remains captured; stock and coupon side-effects from payment are not reversed unless someone refunds separately (and tracked stock is not restored anyway - SHOP-019). |
| **Root cause hypothesis** | `updateOrderStatus` changes lifecycle status only; there is no guard tying `CANCELLED` to `payment_status` or an automatic refund workflow. |
| **Reproduction (inferable)** | Open a paid bank-transfer or card order in admin; change status to Cancelled with email enabled; order shows cancelled with payment still paid. |
| **Fix direction** | Refuse `CANCELLED` when `payment_status` is PAID unless a refund (full or partial) is recorded or an explicit "cancel without refund" override exists; or auto-route through `processRefund` for the remaining balance. |

### Medium

#### SHOP-122 — Refund paths update lifecycle status but not payment_status

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Refunds / webhooks / admin |
| **Files** | `lib/db/refunds.ts` (~362–365), `app/api/webhooks/stripe/route.ts` (~20–21), `app/api/webhooks/paypal/route.ts` (~19–20), `lib/db/orders.ts` (`updateOrderStatus` ~327–332) |
| **Symptom** | After a **full refund through admin** (`settleRefund`) or a **provider-initiated refund webhook**, the order **`status`** becomes `REFUNDED` or `PARTIALLY_REFUNDED`, but **`payment_status` often stays `PAID`**. Admin badges then disagree (lifecycle "Refunded" vs payment "Paid"); filters on `paymentStatus=PAID` still include fully refunded orders; downstream code that keys off `payment_status` (manual-payment queues, dashboard revenue SQL, digital download gates) sees stale money state. Webhook refunds also **skip** `shp_refunds` / `refund_items`, stock restore, and digital revocation. |
| **Root cause hypothesis** | `settleRefund` only updates the lifecycle `status` column; Stripe/PayPal webhook handlers call `updateOrderStatus` for refund events rather than routing through `processRefund` / `payment_status` helpers. Schema defines `payment_status` values `REFUNDED` and `PARTIALLY_REFUNDED`, but those columns are not kept in step. |
| **Reproduction (inferable)** | Refund an order fully in admin; observe `status=REFUNDED` with `payment_status=PAID`. Alternatively issue a full refund in the Stripe dashboard; webhook fires `charge.refunded` and the shop order shows the same split without a refund row. |
| **Fix direction** | On settled admin refunds, set `payment_status` to match remaining balance (mirror item `refunded_qty`). For webhooks, either ingest provider refund events into `processRefund` / reconcile, or at minimum update `payment_status` and run the same post-refund side-effects as admin settlement. |

#### SHOP-127 — Manual admin orders accept unbounded line arrays

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/orders/route.ts` (~45–47, ~67–71) |
| **Symptom** | Staff POSTing a phone/mail order can send **unlimited** `{ productId, quantity }` rows. Each call runs full `resolveCartLines` and `resolveOrderTotals` with no `.max()` on the array, unlike guest/member cart routes (200 lines) and overlapping checkout mutators (SHOP-092). A mistaken paste or script can spike CPU and DB on an authenticated route. |
| **Root cause hypothesis** | Manual order schema mirrors checkout flexibility; caps were added to persisted carts and public checkout later but not to admin creation. |
| **Fix direction** | Reuse `MEMBER_CART_MAX_LINES` (or a dedicated admin cap) on `lines`; return 400 when exceeded. |

#### SHOP-128 — Product CSV import buffers entire upload in memory

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/products/import/route.ts` (~53–60), `lib/csv.ts` |
| **Symptom** | Import POST calls `file.text()` on the whole upload **before** spawning `after()`, with **no max file size or row count**. A multi-megabyte or gigabyte CSV can exhaust serverless memory in the request that accepts the upload, separate from the 60s background ceiling (SHOP-007). |
| **Root cause hypothesis** | Simplicity for moderate catalogues; export-side memory risk is documented separately (SHOP-101) but import ingress was not capped symmetrically. |
| **Fix direction** | Reject uploads over a sane byte/row ceiling with 413; stream-parse or chunk to object storage for large jobs. |

#### SHOP-129 — Import jobs can remain PROCESSING after abort or throw

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / import jobs |
| **Files** | `app/api/admin/products/import/route.ts` (~58–60), `lib/import-engine.ts` (~449–460), `lib/db/import-jobs.ts` |
| **Symptom** | If `processImportJob` **throws** before `markImportJobCompleted`, or the **`after()`** invocation is **killed at the module 60s ceiling**, the job row stays **`PROCESSING`** forever. The ImportModal poll never reaches a terminal state; operators may assume an import is still running. |
| **Root cause hypothesis** | No top-level try/finally around the import loop; completion is only written on the happy path (extends SHOP-007). |
| **Fix direction** | Wrap `processImportJob` in try/finally marking `FAILED` on throw; add a stale-PROCESSING reconcile (cron or TTL) that marks jobs failed when `started_at` is old with no progress. |

#### SHOP-133 — Admin digital file upload buffers entire file in memory

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / digital products / perf |
| **Files** | `app/api/admin/digital-files/route.ts` (~38–43), `lib/media/upload.ts` |
| **Symptom** | Uploading a digital product asset reads the whole **`File` into a `Buffer`** in the API request (allowed up to **200 MB** by validation) before streaming to media storage. A large PDF or video can exhaust serverless memory on a single staff upload, separate from the shopper download path. |
| **Root cause hypothesis** | Core `uploadMedia` expects a buffer; the route mirrors image upload patterns without chunked ingress. |
| **Fix direction** | Stream upload to object storage (or cap lower with explicit 413), matching documented limits in admin copy. |

#### SHOP-137 — CSV import job stores unbounded error arrays on every progress tick

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / import jobs / storage |
| **Files** | `lib/import-engine.ts` (~449–457), `lib/db/import-jobs.ts` (`updateImportJobProgress` ~58) |
| **Symptom** | Each failed row appends to an in-memory **`errors`** array; every 25 rows the **entire array** is serialised into the job row's **`errors` jsonb**. A sheet with thousands of bad lines produces multi-megabyte job rows, repeated writes, and growing poll payloads in **ImportModal** (extends SHOP-128 ingress risk on the way out). |
| **Root cause hypothesis** | Progress reporting prioritises a full audit trail in one column; no cap or external error log. |
| **Fix direction** | Cap stored errors (e.g. first 100 plus count), spill overflow to object storage, or write per-row failures to a separate table. |

#### SHOP-138 — Partially refunded orders can still auto-complete

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Fulfilment / refunds / cron |
| **Files** | `lib/order-auto-complete.ts` (~18), `lib/db/shipments.ts` (`listOrdersAwaitingCompletion` ~832–836), `app/api/public/orders/[id]/live-delivery/route.ts` (~108–110), `app/api/cron/delivery-tracking/route.ts` |
| **Symptom** | When every parcel is marked delivered, **`completeOrderIfEveryParcelArrived`** and the hourly **completion sweep** can flip an order to **`COMPLETED`** and send the completion email even when lifecycle **`status`** is **`PARTIALLY_REFUNDED`**. Comments say refunded orders are excluded, but **`NOT_COMPLETABLE` / SQL exclusions list `REFUNDED` only**, not partial refunds. |
| **Root cause hypothesis** | Partial refund was added as a lifecycle status later; auto-complete paths were not updated to treat it as non-completable. |
| **Reproduction (inferable)** | Part-refund a dispatched order; deliver the last parcel while a customer watches live tracking, or wait for the cron leftovers sweep; order becomes **Completed** with a completion email despite an open partial refund. |
| **Fix direction** | Add **`PARTIALLY_REFUNDED`** (and consider **`ON_HOLD`**) to **`NOT_COMPLETABLE`** and **`listOrdersAwaitingCompletion`** filters; optionally require **`payment_status`** still **`PAID`** before auto-complete. |

#### SHOP-139 — Orders CSV export runs due-date extension work for 5000 rows

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin export / perf / extensions |
| **Files** | `app/api/admin/orders/export/route.ts` (~45–46), `lib/db/orders.ts` (`getOrderRowMetrics` ~739–814) |
| **Symptom** | Export loads up to **5000** orders then calls **`getOrderRowMetrics`**, which gathers **every open line** across those orders and invokes **`resolveOrderLineDueDates`** (all installed **`shop.order-line-due-date`** providers). The CSV columns include unit counts only — **`nextDeliveryDate` is not exported** — so the extension fan-out is pure overhead and can **timeout or exhaust memory** on busy shops (extends SHOP-071 truncation theme). |
| **Root cause hypothesis** | Delivery-due was added to the admin list UI via shared metrics helper; export reused the helper without a lighter path. |
| **Fix direction** | Split metrics: export uses counts-only SQL without extension calls; or cap export batch size lower; or skip due-date resolution when callers do not need **`nextDeliveryDate`**. |

#### SHOP-142 — Post-purchase order access blocked when shop is CLOSED

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Ops / closed shop / guest order access |
| **Files** | `lib/document-access.ts` (~23–27), `app/api/public/orders/track/route.ts` (~56–57), `app/api/public/orders/status/route.ts` (~45–46), `app/api/public/orders/receipt-access/route.ts` (~79), `app/api/public/orders/[id]/live-delivery/route.ts` (~46), `app/public/shop/account/orders/[id]/page.tsx` (~156–157) |
| **Symptom** | When **`shopStatus = 'CLOSED'`**, **`shopClosedResponse`** / **`getShopGate`** return the owner's closed message on **guest track**, **receipt proof**, **order status JSON**, **live-delivery polling**, and **account order pages** (including guests who already proved postcode access). **`documents/access`** and document PDF routes are **deliberately exempt** so paperwork still opens after a shutdown. Existing customers can reach invoices but not tracking, bank-transfer instructions, pay-online buttons, or the order hub they used before closure. |
| **Root cause hypothesis** | Public storefront gating was applied uniformly to order surfaces; document access was carved out later without the same carve-out for post-purchase order APIs and pages. |
| **Reproduction (inferable)** | Place an order while OPEN; set shop to CLOSED; follow the tracking email or confirmation link; see closed-shop copy instead of parcel status or receipt challenge (staff with **`shop.access`** still preview via **`canPreviewClosedShop`**). |
| **Fix direction** | Exempt post-purchase order routes and account order shells from CLOSED blocking (mirror document policy), or add an explicit **`allowPostPurchaseAccessWhenClosed`** setting with plain-English owner copy. |

#### SHOP-118 — Damage reports accept arbitrary media-library image ids

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / privacy |
| **Files** | `app/api/member/orders/[id]/requests/route.ts` (~57–63), `lib/db/order-requests.ts` (photo insert), contrast `app/api/member/orders/[id]/photos/route.ts` (~70–86) |
| **Symptom** | When submitting a **DAMAGE** request, any `photoMediaIds` that resolve to an `image/*` row in core **`Media`** are attached, with **no check** that the upload came from this order's damage-photo endpoint or lives under the order's `Orders/<orderNumber>/issues` folder. A guest or member with legitimate order access can attach **another customer's damage photo**, catalogue imagery, or staff uploads; admins open full-size URLs from the requests queue. |
| **Root cause hypothesis** | Comments require ids-only (not trusted URLs), but lookup is global `findMany({ id: { in: ids } })` without scoping to uploader session, order folder, or a short-lived upload grant. |
| **Reproduction (inferable)** | Obtain order access for order A. Upload a photo on order B (or copy a media id from admin). POST a damage request on order A with B's `mediaId` in `photoMediaIds`; staff queue shows B's image on A's report. |
| **Fix direction** | Record order id (or folder path) on upload and require `media_id` match at submit; or mint single-use upload tokens bound to the order id. |

#### SHOP-119 — Charged replacements marked PAID without a payment reference

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Replacements / payments |
| **Files** | `lib/replacements.ts` (~235–262), contrast `lib/db/refunds.ts` `issueRefund` paymentReference guard |
| **Symptom** | Priced replacement lines create an order with **`payment_status = 'PAID'`**, **`paid_at` set**, and **`payment_method` copied from the parent** (e.g. `STRIPE`) but **no `payment_reference`** and no provider capture. Admin and automation that treat PAID + card method as settled may assume money moved on the replacement row; **provider refunds against that order fail** the reference check even though the UI shows a paid card order (extends SHOP-107). |
| **Root cause hypothesis** | Intentional "born settled" workflow for warranty parts; charged lines reuse parent method for labelling without a separate billing path. |
| **Fix direction** | Use `AWAITING_CONFIRMATION` + manual confirm for priced replacements, or a dedicated method code; store `parent_order_id` billing notes; block auto-refund until reference or manual settlement is recorded. |

#### SHOP-004 — In-memory rate limits weak on multi-instance deployments

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Auth / abuse |
| **Files** | `lib/rate-limit.ts` (~1–41), callers e.g. `app/api/public/orders/track/route.ts` (~64–66), `app/api/public/checkout/confirm/route.ts` (~22–25) |
| **Symptom** | Brute-force or enumeration attacks can exceed intended thresholds by spreading requests across Vercel instances; IP limiter resets on cold start. |
| **Root cause hypothesis** | Documented trade-off: Map-based limiter is per-instance. Per-order DB lockout on track-order partially compensates for order tracking only. |
| **Fix direction** | Table- or Redis-backed limits for high-risk public mutators (confirm, track, payment-intent), mirroring contact-form pattern where justified. |

#### SHOP-005 — Pre-order cap not enforced atomically at fulfilment

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Cart / pre-order |
| **Files** | `lib/checkout.ts` (~183–190), `lib/db/products.ts` (~766–775), `lib/order-fulfillment.ts` (~58–59) |
| **Symptom** | More pre-orders sold than `pre_order_max_quantity` if concurrent checkouts pass validation; `pre_order_count` can exceed cap until auto-flip disables pre-order. |
| **Root cause hypothesis** | Cap checked against stale `preOrderCount` at resolve time; `incrementPreOrderCount` adds unconditionally. |
| **Fix direction** | Conditional UPDATE at increment: `WHERE pre_order_count + qty <= pre_order_max_quantity` (or NULL cap), fail fulfilment or refund if race lost. |

#### SHOP-006 — Coupon global limit: paid order may retain discount if increment loses race

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Discounts |
| **Files** | `lib/order-fulfillment.ts` (~68–69), `lib/db/discounts.ts` (~129–137) |
| **Symptom** | Edge case at exact `usage_limit`: order marked paid with `coupon_id` set but `incrementCouponUsage` returns false; usage under-counted vs orders granted discount. |
| **Root cause hypothesis** | `fulfillPaidOrder` does not inspect boolean return from `incrementCouponUsage`. |
| **Fix direction** | On false return, alert admin, claw back discount, or block confirm when increment would fail (prefer enforcing at order write time). |

#### SHOP-007 — Product CSV import in `after()` may exceed 60s module ceiling

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Concurrency / admin |
| **Files** | `app/api/admin/products/import/route.ts` (~60), `lib/import-engine.ts` (~153–469) |
| **Symptom** | Large imports may stop mid-file; job row may remain non-terminal if the invocation is killed without reaching `markImportJobCompleted`. |
| **Root cause hypothesis** | Whole import runs inside one `after()` on a module API route (core dispatcher `maxDuration = 60`). Progress updates every 25 rows but no top-level try/finally on abort. |
| **Fix direction** | Chunk import with self-scheduling continuation (cron or polled job step), or move to a durable worker; wrap job in try/finally to mark FAILED on throw. |

#### SHOP-008 — Floating-point money on Stripe confirm path

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | TypeScript / payments |
| **Files** | `app/api/public/checkout/confirm/route.ts` (~63–64, ~115–116), `lib/payments/stripe.ts` (~21–48) |
| **Symptom** | Rare payment confirmation failures (“amount does not match”) when DB NUMERIC rounds differently from JS float passed to `toMinorUnits`. |
| **Root cause hypothesis** | `Number(order.total)` / `Number(draft.total)` before compare to Stripe integer minor units; checkout uses `round2` but storage/retrieval path may introduce drift. |
| **Fix direction** | Compare using decimal strings or Prisma.Decimal end-to-end; derive minor units from stored NUMERIC text, not float. |

#### SHOP-009 — Repeated payment-intent POST creates orphan PENDING orders

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Checkout |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~80–87, ~246+), `app/api/cron/low-stock-alerts/route.ts` (~41) |
| **Symptom** | Shopper retries checkout → multiple PENDING rows and consumed order numbers; pruned after 24h by cron but clutters admin and sequences in the meantime. |
| **Root cause hypothesis** | Each POST mints new `generateOrderNumber()` and creates order/draft; no idempotency key from client session. |
| **Fix direction** | Idempotency-Key header storing single in-flight checkout per cart fingerprint; or reuse pending order for same cart hash within TTL. |

#### SHOP-020 — Stranded PENDING refunds block and consume caps

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Refunds / ops |
| **Files** | `lib/db/refunds.ts` (~173–224, ~403–509), `app/api/cron/reconcile-refunds/route.ts` |
| **Symptom** | A refund request that dies after the provider call but before `settleRefund` leaves a **PENDING** row. Live PENDING blocks another refund (409); after five minutes the amount still counts toward the order cap while outcome is unknown. Manual-payment methods without `getRefundStatus` stay unresolved forever unless an operator intervenes. |
| **Root cause hypothesis** | Deliberate “never guess about money” policy; stranded amounts included in cap prevents over-refund but can freeze partial refunds on busy orders. |
| **Fix direction** | Admin surfacing of stranded rows; optional operator “mark failed” after provider check; document manual-refund workflow for non-reconcilable providers. |

#### SHOP-021 — Request-approval auto-refund may under-refund on EXCLUSIVE tax shops

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Refunds / tax |
| **Files** | `lib/order-request-actions.ts` (~113–131, ~256–277), `lib/db/refunds.ts` (~242–254) |
| **Symptom** | When approving a cancel/return with “refund now”, amounts are `unitPrice × quantity` from the order snapshot. On shops with `tax_mode = EXCLUSIVE`, line `unit_price` is net; the customer paid net plus VAT. Refund caps allow gross, but the computed amount may refund **less than the VAT-inclusive value** unless staff adjust amounts in the manual refund UI. |
| **Root cause hypothesis** | Shared `refundLines()` helper predates tax-inclusive cap logic in `prepareRefund`. |
| **Fix direction** | Compute approval refunds using the same gross line basis as `processRefund` validation (or persist tax-inclusive unit totals on items). |

#### SHOP-022 — Back-in-stock dispatch is all-or-nothing on send failure

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Email / notifications |
| **Files** | `lib/back-in-stock-trigger.ts` (~13–34, ~48–56) |
| **Symptom** | Subscribers are marked notified only after every `sendShopEmail` succeeds. A failure mid-loop leaves earlier recipients emailed but **all** subscribers still “unnotified”; the next stock edit can email the first batch again. Large lists use `after()` and share the same 60s module ceiling as other jobs. |
| **Root cause hypothesis** | No per-subscriber try/mark; `markSubscribersNotified` runs only after the full loop. |
| **Fix direction** | Per-recipient send with individual `notified_at`, or claim rows like shipment slot notifications; chunk large lists with continuation. |

#### SHOP-023 — Customer email failures leave no order comms record

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Email / admin UX |
| **Files** | `lib/order-request-actions.ts` (~34–39), `lib/order-notify.ts` (~96–143), `lib/email.ts` (~37–57) |
| **Symptom** | `notifyOrderCustomer` and request emails swallow transport errors (`console.error` only). The order status change or refund still succeeds, but **`shp_order_emails` is not written** when send fails, so the Communications tab shows a false “nothing sent” history. |
| **Root cause hypothesis** | Intentional non-throwing notifications; logging is stderr-only. |
| **Fix direction** | Log failed attempts to `shp_order_emails` (or an internal failure table) with trigger and error summary; optional admin alert when provider is down. |

#### SHOP-030 — Per-product download limit is check-then-act under concurrency

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Digital downloads |
| **Files** | `app/api/public/downloads/[token]/route.ts` (~20–24, ~39–44), `lib/db/digital.ts` (~45–47) |
| **Symptom** | A shopper can exceed `download_limit` by opening several parallel downloads when one attempt remains; each request passes the count check before any `incrementDownloadCount` runs at stream end. |
| **Root cause hypothesis** | Limit enforced by reading `download_count` then incrementing in `TransformStream.flush` with no row lock or conditional `UPDATE … WHERE download_count < limit`. |
| **Fix direction** | Reserve a download slot atomically at request start (`UPDATE … WHERE download_count < limit RETURNING`), or use advisory lock per download id; decrement on failed upstream fetch. |

#### SHOP-032 — Hosted-checkout drafts settle stale shipping and totals

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Shipping / checkout |
| **Files** | `lib/checkout-draft.ts` (~125–157, ~180–194), `app/api/public/checkout/confirm/route.ts` (~97–147), `app/api/public/checkout/payment-intent/route.ts` (~181–187) |
| **Symptom** | For methods that draft the order, the shopper can pay days later against totals, shipping rate, weight bands, and extension-point delivery charges frozen at draft creation, even if zones, rates, cart-line resolver output, or free-shipping thresholds changed in between. |
| **Root cause hypothesis** | `materialiseDraftOrder` replays the JSON payload via `insertOrderRows` without re-running `resolveCartLines` / `resolveOrderTotals`; confirm compares provider amount to `draft.total` only. |
| **Fix direction** | Re-quote immediately before materialisation and refuse settlement when the recomputed total differs; or shorten draft TTL and force a fresh payment-intent when shipping inputs change. |

#### SHOP-035 — Public product search is unrate-limited and ILIKE-heavy

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Catalogue / search |
| **Files** | `app/api/public/products/route.ts`, `lib/product-search.ts` (~63–85), `lib/db/products.ts` (~453–465, ~524–526) |
| **Symptom** | An anonymous client can hammer `GET /public/products?search=…` with multi-term queries; each hit runs `ILIKE '%term%'` predicates (plus provider OR branches) and a full `COUNT(*)` over the same filter, which does not scale on large catalogues. |
| **Root cause hypothesis** | Deliberate flexibility (extension-point search, capped eight terms) without IP rate limiting unlike checkout mutators; leading wildcards prevent index use on name/SKU. |
| **Fix direction** | Light rate limit on public list/search; minimum term length; consider trigram/GiST index on name+sku if search stays ILIKE-based. |

#### SHOP-036 — Stale refund reconcile runs once daily, not hourly

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Cron / refunds |
| **Files** | `cactus.module.json` (~105–117), `app/api/cron/reconcile-refunds/route.ts` (~9–11), `lib/db/refunds.ts` (~180, ~447–448) |
| **Symptom** | PENDING refunds become eligible five minutes after creation (`PENDING_REFUND_STALE_SECONDS`) but the reconcile job is scheduled **`30 6 * * *` (daily)** whilst route comments describe an hourly job. Stranded PENDING rows can block further refunds for most of a day (extends SHOP-020). |
| **Root cause hypothesis** | Schedule drift between manifest and comments; stale threshold assumes frequent reconciliation. |
| **Fix direction** | Align cron to hourly (or tighten stale messaging in admin); until then document that auto-reconcile is daily. |

#### SHOP-027 — Bulk product delete lacks redirect and audit trail

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin bulk ops |
| **Files** | `app/api/admin/products/bulk/route.ts`, `lib/db/products.ts` (~839–848), `app/api/admin/products/[id]/route.ts` (~195–248) |
| **Symptom** | Single-product DELETE supports optional slug redirect and FK-aware errors; **bulk delete** removes up to 200 rows with no redirect, no job log, and no note on affected orders. Order lines survive (`ON DELETE SET NULL`) but storefront URLs may 404 without the single-delete redirect path. |
| **Root cause hypothesis** | Bulk endpoint optimised for speed; parity with single delete never added. |
| **Fix direction** | Optional redirect target for bulk; import-style job row; warn when deleting products with recent sales. |

#### SHOP-040 — Invoice issued but netted-refund marks may fail silently

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Invoices / credit notes |
| **Files** | `lib/invoices.ts` (~369–376), `lib/db/refunds.ts` (netted-off columns), `lib/credit-notes.ts` (~161–172) |
| **Symptom** | After a successful `insertInvoice`, `markRefundsNettedOff` runs in a `.catch` that only logs. If it fails, refunds already taken off the invoice face may still look “uncredited” in admin, and staff may attempt a credit note that correctly 409s, whilst bookkeeping sinks saw the net invoice and refunds sit ambiguously in the database. |
| **Root cause hypothesis** | Deliberate “invoice must not roll back” policy; netting is best-effort after insert. |
| **Fix direction** | Retry netting in a reconcile job; surface unmarked netted refunds on the order invoice panel; or wrap insert + mark in one transaction where safe. |

#### SHOP-041 — Credit note tax point uses refund creation time, not settlement

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Invoices / tax |
| **Files** | `lib/credit-notes.ts` (~215–218), `lib/db/refunds.ts` (status lifecycle) |
| **Symptom** | `taxPointDate` for a credit note is derived from `refund.createdAt` (PENDING reservation time), not from when the refund **completed** at the provider. A refund that sat PENDING for hours or days files VAT credit in the wrong quarter relative to when money actually moved. |
| **Root cause hypothesis** | `createdAt` is always present; settled timestamp not wired into credit-note builder. |
| **Fix direction** | Use `refund.completedAt` / provider settlement time (or `updatedAt` when status flips to COMPLETED) for tax point, mirroring invoice `paidAt` handling. |

#### SHOP-043 — Pending customer cancellation does not block dispatch

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / fulfilment |
| **Files** | `lib/db/shipments.ts` (~156–172), `lib/db/order-requests.ts` (~310–336), `lib/order-request-actions.ts` |
| **Symptom** | While a customer’s cancel or return request is **PENDING**, dispatch caps still treat those units as dispatchable (`cancelled_qty` counts **APPROVED** cancellations only). Staff can ship goods the customer has already asked to call off, then approve the request and refund, leaving the shop out of pocket on carriage and handling. |
| **Root cause hypothesis** | Intentional: owner may decline the request; holding dispatch on every ask would stop fulfilment on disputed orders. |
| **Fix direction** | Admin warning when dispatching lines with pending request quantities; optional shop setting to treat PENDING cancel quantities like soft holds; or show pending units on the dispatch modal. |

#### SHOP-044 — Request-approval auto-refund omits delivery and order-level charges

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / refunds |
| **Files** | `lib/order-request-actions.ts` (~113–133, ~256–277), `lib/credit-notes.ts` (~241–244) |
| **Symptom** | Approving a cancel/return with “refund now” builds lines from `unitPrice × quantity` only. **Shipping**, extension-point delivery charges, and other order-level amounts paid at checkout are not included, so a whole-order cancellation approval can refund goods but leave the customer short of the delivery they paid for unless staff manually refund the remainder (distinct from SHOP-021 EXCLUSIVE tax basis). |
| **Root cause hypothesis** | `refundLines()` mirrors the manual per-line refund modal shape; order-level totals never enter the helper. |
| **Fix direction** | For whole-order cancels (empty item list or all lines covered), include remaining refundable shipping/tax-inclusive total within `processRefund` caps; or document and UI-warn that delivery must be refunded separately. |

#### SHOP-045 — Cart line resolvers run concurrently per basket line

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Cart / variations |
| **Files** | `lib/checkout.ts` (~163–196), `lib/line-meta.ts` (~356–397) |
| **Symptom** | `resolveCartLines` maps the cart with `Promise.all`, so every installed `shop.cart-line-resolver` runs **in parallel** across lines. Resolvers that mutate request-scoped caches unsafely, hit rate limits, or perform non-idempotent reads can return inconsistent prices or validation for multi-line baskets (extends pass 10 note on deduction ordering). |
| **Root cause hypothesis** | Performance fix for O(n) sequential latency on large carts. |
| **Fix direction** | Document resolver contract as parallel-safe; serialise resolver calls where modules cannot guarantee isolation; or batch per-module resolves after prefetch. |

#### SHOP-047 — `shop.access` can raise invoices and credit notes via POST

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Permissions / accounting |
| **Files** | `lib/access.ts` (~17–25, ~88–97), `app/api/admin/orders/[id]/invoice/route.ts` (~97–99), `app/api/admin/orders/[id]/credit-note/route.ts` (~81–83) |
| **Symptom** | Invoice and credit-note **POST** handlers call `requireShopUser('shop.orders', { allowAccess: true })`, which also passes users with only **`shop.access`**. Those staff can manually issue invoices and credit notes even though void correctly requires `shop.manage`, and refund POST uses `shop.orders` without `allowAccess`. |
| **Root cause hypothesis** | `allowAccess` copied from GET panels so read-only roles can open order paperwork; applied to mutating actions by mistake. |
| **Fix direction** | Drop `{ allowAccess: true }` on POST; keep it on GET only; or require `shop.orders` strictly for issue/resend/issue credit note. |

#### SHOP-048 — Invoice void/resend does not verify invoice belongs to order route

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin IDOR / invoices |
| **Files** | `app/api/admin/orders/[id]/invoice/route.ts` (~112–130), `lib/invoices.ts` (`voidInvoiceAndTellSinks`, `resendInvoiceToSinks`) |
| **Symptom** | POST `{ action: 'void' | 'resend', invoiceId }` on `/admin/orders/{orderA}/invoice` accepts an `invoiceId` belonging to **orderB**. A staff member with order access can void or re-send sinks for another order’s invoice if they know or guess the UUID. |
| **Root cause hypothesis** | `voidInvoice` / `getInvoiceById` key only on invoice id; route param `id` used for issue/list only. |
| **Fix direction** | Load invoice by id and assert `invoice.orderId === params.id` before void/resend; return 404 on mismatch. |

#### SHOP-049 — Credit note issue/resend ignores order id in URL

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin IDOR / credit notes |
| **Files** | `app/api/admin/orders/[id]/credit-note/route.ts` (~81–103), `lib/credit-notes.ts` |
| **Symptom** | POST `{ refundId }` or `{ creditNoteId }` does not check that the refund or credit note belongs to the `id` order segment (params are awaited but unused for authorisation). Staff can trigger credit-note issue or sink resend against arbitrary refunds/notes from the wrong order screen URL. |
| **Root cause hypothesis** | Handlers delegate to global ids; UI always sends matching pairs. |
| **Fix direction** | Verify `refund.orderId === params.id` and `note.orderId === params.id` before acting. |

#### SHOP-051 — Automatic free-shipping threshold ignores post-coupon subtotal

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Discounts / stacking |
| **Files** | `lib/checkout.ts` (~470–484) |
| **Symptom** | A coupon can reduce the basket below an automatic discount's `freeShippingThreshold`, yet free shipping still applies because the threshold is compared against the pre-coupon `subtotal`, whilst percentage/fixed automatic amounts use the post-coupon `remainingSubtotal`. |
| **Root cause hypothesis** | Inconsistent bases in `resolveDiscounts`: line 483 uses `subtotal`, lines 473–482 use `remainingSubtotal` for monetary auto discounts. |
| **Reproduction (inferable)** | Automatic discount with `freeShippingThreshold=100`; coupon removes £30 from a £110 basket; shopper still gets free shipping despite £80 post-coupon goods value. |
| **Fix direction** | Compare `freeShippingThreshold` against the same post-coupon base as other automatic discounts, or document and test the intentional pre-coupon rule. |

#### SHOP-053 — Checkout total updates are not announced to screen readers

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Accessibility / checkout |
| **Files** | `components/public/CheckoutReviewClient.tsx` (~418–439, ~342–348) |
| **Symptom** | When postcode, coupon, or shipping changes, the order summary `<dl>` updates silently. Blocked-checkout messaging uses `role="status"`, but the total row does not. |
| **Root cause hypothesis** | Dynamic totals are visual-only; no `aria-live` region wraps the summary or total. |
| **Fix direction** | Add a polite `aria-live="polite"` region for total changes (debounced), or expose total updates via an visually hidden status node. |

#### SHOP-054 — Declined payment may reuse a failed order without a fresh intent

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Checkout / payment recovery |
| **Files** | `components/public/CheckoutPaymentClient.tsx` (~616–638, ~283–286), `app/api/public/checkout/confirm/route.ts` (~70–72), `lib/db/orders.ts` (~444–447) |
| **Symptom** | A declined card calls confirm, which marks the order `PAYMENT_FAILED`, but `preparedRef` is not cleared on failure. The shopper's next "Place order" press reuses the same `orderId` and payload instead of minting a new payment-intent row. |
| **Root cause hypothesis** | Error path dispatches `cactus-shop-order-error` only; prepared payment is cleared when switching method, not when confirm fails. |
| **Reproduction (inferable)** | Stripe test card decline; retry with another card without changing payment method; observe repeated confirm against the same order id. |
| **Fix direction** | On confirm failure, clear `preparedRef` / `attemptedForRef` and force `prepareIntent` to run again, or treat `PAYMENT_FAILED` as requiring a new payment-intent. |

#### SHOP-064 — Module teardown drops all order PII with no export or anonymise hook

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | GDPR / data retention |
| **Files** | `cactus.module.json` (`teardown` ~59–103) |
| **Symptom** | Disabling or removing the shop module deletes `shp_orders`, addresses, emails log, downloads, and related tables wholesale. There is no shop manifest hook for GDPR export/erase/anonymise before teardown. |
| **Root cause hypothesis** | Teardown list is table-oriented for clean uninstall, not retention-aware; erasure is left to core/site operators. |
| **Fix direction** | Document retention expectations in wiki; optional core extension for module PII export; consider soft-delete or anonymise orders instead of hard drop on teardown. |

#### SHOP-068 — Provider webhooks mark orders paid without amount verification

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Payment / webhooks |
| **Files** | `lib/payments/stripe.ts` (~124–128), `lib/payments/paypal.ts` (~138–141), `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/paypal/route.ts` |
| **Symptom** | A replayed or misconfigured webhook that passes signature checks can mark an order `PAID` without comparing the provider's settled amount or currency to `shp_orders.total`. The browser confirm path validates (PayPal capture, Stripe intent), but webhook-only settlement does not. |
| **Root cause hypothesis** | Webhook handlers trust metadata/custom_id mapping and provider authenticity only; amount checks were implemented on `confirmPayment`, not on async settlement events. |
| **Fix direction** | Load the order (or draft total at settlement) in webhook handlers and refuse PAID when minor units or currency disagree; log and alert on mismatch. |

#### SHOP-069 — Automatic discount windows use database UTC, not site timezone

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Discounts / locale |
| **Files** | `lib/db/discounts.ts` (~140–145), contrast `lib/checkout.ts` (~449–451) and SHOP-060 |
| **Symptom** | Active automatic discounts are filtered with `starts_at` / `expires_at` against SQL `NOW()` (host UTC on typical hosting), whilst coupon validity in checkout uses JavaScript `new Date()`. Campaign cutoffs can disagree between coupon codes and automatic rules, and both can disagree with invoice tax timezone. |
| **Root cause hypothesis** | `listAutomaticDiscounts(true)` applies date windows in SQL; coupons are evaluated in application code without shared timezone helper. |
| **Fix direction** | Evaluate automatic discount windows in site timezone (or store instants with documented UTC semantics in admin copy), aligned with SHOP-060 fix. |

#### SHOP-070 — Coupon minimum order value ignores post-coupon subtotal (automatic rules do not)

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Discounts / rules engine |
| **Files** | `lib/checkout.ts` (~453–455, ~475–476) |
| **Symptom** | A coupon's `minimumOrderValue` is compared to the pre-coupon goods subtotal, whilst each automatic discount's `minimumOrderValue` is compared to the post-coupon `remainingSubtotal`. A basket can fail a coupon minimum despite a large automatic discount having already reduced the payable goods value (or pass a coupon whilst automatic thresholds see a lower base). |
| **Root cause hypothesis** | Historical coupon rule predates stacked automatic discounts; automatic branch was written against remainder only. |
| **Fix direction** | Pick one basis (pre- or post-coupon) for all minimum thresholds, document in admin, and test stacking scenarios alongside SHOP-051. |

#### SHOP-071 — Orders CSV export silently truncates at 5,000 rows

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin exports / ops |
| **Files** | `app/api/admin/orders/export/route.ts` (~42–45) |
| **Symptom** | Export uses the list filter but forces `page: 1, perPage: 5000` with no warning in the response or filename. An owner exporting "all orders" for a busy shop gets an incomplete spreadsheet that still looks authoritative. |
| **Root cause hypothesis** | Deliberate cap to avoid unbounded streams; UI does not surface the ceiling. |
| **Fix direction** | Return a header or JSON warning when `total > 5000`, paginate exports, or require narrowed filters with explicit count preview. |

#### SHOP-074 — Pre-order hold check N+1s product lookups per line

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin list performance / fulfilment |
| **Files** | `lib/db/orders.ts` (~353–365), `lib/order-status.ts` (~203–205) |
| **Symptom** | `outstandingPreOrderItems` calls `getProductById` inside a loop for lines with no dispatch date. Marking a large mixed pre-order order as SHIPPED under HOLD_ALL policy triggers one query per ambiguous line before refusing dispatch. |
| **Root cause hypothesis** | Fallback to live `is_pre_order` on the product row when the line snapshot lacks a date; not batched. |
| **Fix direction** | Prefetch distinct `product_id` values in one query (or join in the initial items load) before evaluating hold rules. |

#### SHOP-084 — `parts_only` spares remain buyable off-catalogue

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Catalogue / bundles & parts |
| **Files** | `lib/db/products.ts` (~443–447), `lib/product-page-gate.ts`, `lib/checkout.ts` (~163–165), `lib/sitemap.ts` (~26–28) |
| **Symptom** | Spare parts flagged **parts only** disappear from grids, search, and the sitemap, but anyone with the slug can still open the product page and add the line to the cart if the row is ACTIVE. Replacement admin pickers are the intended surface, not public merchandise. |
| **Root cause hypothesis** | `storefront: true` list queries filter `parts_only = false`, yet product-page reachability and cart resolution only require `status === 'ACTIVE'`. |
| **Reproduction (inferable)** | Mark a gas lift `parts_only=true`, keep ACTIVE, visit `/shop/products/{slug}` directly, complete checkout. |
| **Fix direction** | Treat `parts_only` like catalogue-hidden at the product page and checkout validation layers, or expose parts only through signed admin/replacement flows. |

#### SHOP-088 — Canonical-query provider throw can break product metadata

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Extension points / SEO |
| **Files** | `lib/product-canonical.ts` (~38–55), `app/public/shop/products/[slug]/page.tsx` |
| **Symptom** | A misbehaving `shop.product-canonical-query` provider can 500 `generateMetadata` (and the page) because failures are not caught. Other variation seams (`shop.product-selected-variation`) skip throwing providers. |
| **Root cause hypothesis** | `resolveProductCanonicalQuery` awaits `provider.resolve` with no try/catch. |
| **Fix direction** | Match selected-variation: log, skip provider, fall back to bare product URL canonical. |

#### SHOP-089 — Product-page resolver throw can 404 a valid alias URL

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Extension points / product pages |
| **Files** | `lib/product-page-resolver.ts` (~43–60), `lib/product-page-gate.ts` (~24–37) |
| **Symptom** | Variation deep links that rely on `shop.product-page-resolver` fail entirely when the provider throws, instead of declining and falling back to shop's own row. |
| **Root cause hypothesis** | `resolveAliasedProduct` propagates provider exceptions; no per-provider guard. |
| **Fix direction** | try/catch per provider; treat throw as decline (null), same as canonical-query fix. |

#### SHOP-092 — Public checkout pricing routes accept unbounded cart line arrays

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Public API / perf |
| **Files** | `app/api/public/checkout/payment-intent/route.ts`, `session/route.ts`, `apply-coupon/route.ts`, `payment-note/route.ts`, `app/api/public/cart/validate/route.ts` |
| **Symptom** | An anonymous client can POST thousands of cart lines to session, validate, apply-coupon, or payment-note. Each call runs full `resolveCartLines` (batched product fetch plus parallel extension resolvers) with no `.max()` on the array, unlike guest/member cart routes (200 lines). |
| **Root cause hypothesis** | Checkout schemas trust the browser; caps exist on persisted cart storage only. |
| **Reproduction (inferable)** | Script POSTing `{ lines: [ …10 000 identical lines… ] }` to `/public/cart/validate` within the per-IP rate limit. |
| **Fix direction** | Reuse `GUEST_CART_MAX_LINES` / `MEMBER_CART_MAX_LINES` on all public pricing mutators; reject oversize payloads with 400. |

#### SHOP-093 — Payment-intent accepts unbounded per-line meta JSON

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Public API / storage |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~44–48), contrast `app/api/public/cart/store/route.ts` (~39–46) |
| **Symptom** | Line `meta` is `z.record(z.unknown())` with no byte cap at order creation. A client can attach multi-megabyte JSON per line, which is stored on the order/draft payload and stresses Postgres JSONB and logs. |
| **Root cause hypothesis** | Guest/member cart routes gained a 4000-byte meta cap; payment-intent never picked up the same guard. |
| **Fix direction** | Apply the same `MAX_META_BYTES` refine as cart store; reject before `createPendingOrder` / draft insert. |

#### SHOP-100 — `shop.access` can answer, re-open, and delete product questions

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Permissions / admin |
| **Files** | `app/api/admin/product-questions/[id]/route.ts` (~30–32, ~96–98, ~121–123) |
| **Symptom** | POST (publish FAQ answer + customer email), PATCH (status), and DELETE call `requireShopUser('shop.products', { allowAccess: true })`. Users with only **`shop.access`** can publish customer-facing FAQ content and erase PII, whilst creating suppliers/coupons correctly requires the specialist keys. |
| **Root cause hypothesis** | `allowAccess` copied from read-only catalogue screens onto mutating question workflows. |
| **Fix direction** | Drop `{ allowAccess: true }` on POST/PATCH/DELETE; keep it on list/GET if needed. |

#### SHOP-106 — Replacement orders skip fulfilment side effects (stock never decrements)

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Replacements / inventory |
| **Files** | `lib/replacements.ts` (~229–265), `app/api/admin/orders/[id]/replacement/route.ts`, contrast `lib/order-fulfillment.ts` (~35–56), `lib/db/shipments.ts` (~345–349) |
| **Symptom** | Warranty or damage **replacement** orders are inserted as **`PROCESSING` / `PAID`** via `insertOrderRows` but never call `fulfillPaidOrder`. Tracked catalogue parts on those lines therefore **never hit `decrementStockOnShip`**, whilst dispatch treats normal lines as already decremented at payment. Stock stays overstated; busy spares desks can oversell the same gas lift repeatedly. |
| **Root cause hypothesis** | Replacements deliberately skip checkout and payment providers; the author treated them as fulfilment-only orders without wiring the paid-order side-effect pipeline. |
| **Reproduction (inferable)** | Product with `track_inventory=true`, `stock_count=5`. Raise a free replacement line for one unit from admin; stock remains 5 after the replacement is marked dispatched. |
| **Fix direction** | Call a narrowed fulfilment helper after insert (stock + digital tokens only, no duplicate customer email), or decrement on first dispatch for `kind = 'REPLACEMENT'` lines only. |

#### SHOP-107 — Charged replacement orders marked PAID without collecting money

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Replacements / payments |
| **Files** | `lib/replacements.ts` (~117–117, ~235–236, ~262–262) |
| **Symptom** | When staff enter a **non-zero `unitPrice`** on a replacement line, the child order is still created with **`payment_status = 'PAID'`** and `paidAt` set immediately. No payment intent, invoice request, or `AWAITING_CONFIRMATION` path runs; finance reports show settled revenue that was never collected unless handled off-system. |
| **Root cause hypothesis** | Commentary assumes charged parts are "between shop and customer" off-order; the schema nonetheless records them as paid sales. |
| **Fix direction** | Use `AWAITING_CONFIRMATION` + manual confirm for priced replacements, or a dedicated `payment_status` / `kind` flag excluded from revenue dashboards until confirmed. |

#### SHOP-108 — Member cart PUT is not rate limited

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Auth / abuse |
| **Files** | `app/api/member/cart/route.ts` (~46–61), contrast `app/api/public/cart/store/route.ts` (~96–101) |
| **Symptom** | Signed-in shoppers can PUT unbounded cart saves (only schema caps: 200 lines, meta bytes). A stolen session or script can hammer `shp_member_carts` writes without the guest cart's **120/min IP limit**, increasing DB load and noisy `updated_at` churn. |
| **Root cause hypothesis** | Member routes trust session auth; rate limiting was added on the guest path only. |
| **Fix direction** | Mirror guest limits per member id (and optional IP backstop); return 429 with the same copy as guest cart store. |

#### SHOP-112 — Replacement orders never mint digital download tokens

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Replacements / digital downloads |
| **Files** | `lib/replacements.ts` (~199–214, ~229–265), contrast `lib/order-fulfillment.ts` (~72–78), `lib/db/digital.ts` |
| **Symptom** | A replacement line for a **DIGITAL** catalogue product is inserted as `PAID` but **`fulfillPaidOrder` never runs**, so no `shp_digital_downloads` row is created. Staff may dispatch or complete the replacement whilst the customer has no tokenised link (distinct from SHOP-029 refund revocation on existing tokens). |
| **Root cause hypothesis** | Replacements bypass the paid checkout pipeline entirely; digital side-effects live only in `fulfillPaidOrder`. |
| **Reproduction (inferable)** | Raise a replacement for a digital SKU from admin; order detail shows no download row; customer cannot self-serve the file. |
| **Fix direction** | Call a narrowed fulfilment helper after replacement insert (downloads + stock only), or explicitly refuse digital product types on replacement lines with a clear admin error. |

### Low

#### SHOP-010 — Stripe initialises with empty secret when env missing

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Payments / ops |
| **Files** | `lib/payments/stripe.ts` (~12–18) |
| **Symptom** | Cryptic Stripe API errors at checkout rather than clear “not configured”. |
| **Fix direction** | Fail fast in provider registry when `STRIPE_SECRET_KEY` absent and method enabled. |

#### SHOP-011 — Invoice document style injects owner-controlled CSS into `<style>`

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Input / XSS (admin trust) |
| **Files** | `components/puck/invoice-chrome.tsx` (~105–146) |
| **Symptom** | Malicious shop admin could break out of CSS block via crafted font or length fields (admin-only surface). |
| **Fix direction** | Stricter `cssLength` / font whitelist; sanitise `}` in user strings. |

#### SHOP-012 — Duplicate migration sequence prefix `002_*`

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | SQL / migrations |
| **Files** | `migrations/002_master_category.sql`, `migrations/002_pluggable_payment_methods.sql` |
| **Symptom** | Operator confusion; reliance on lexicographic run order (`master` before `pluggable`). Both files are idempotent today. |
| **Fix direction** | Renumber for clarity on next touch (no urgency if runner sorts by full filename). |

#### SHOP-025 — Sitemap may list category URLs with no active catalogue products

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | SEO / feeds |
| **Files** | `lib/sitemap.ts` (~30–33) |
| **Symptom** | Category entries require only **some** linked product in `shp_product_categories`, not an ACTIVE, visible product. A category attached only to DRAFT or `catalogue_hidden` rows can appear in the sitemap while the category page is empty or thin for shoppers. |
| **Fix direction** | Mirror product visibility predicates in the EXISTS subquery (ACTIVE, not hidden, parts_only, optional in-stock rule). |

#### SHOP-031 — Unmatched postcodes may get zero shipping when zones are misconfigured

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Shipping / address validation |
| **Files** | `lib/db/tax-shipping.ts` (~161–178), `lib/checkout.ts` (~604–606), `app/api/public/checkout/payment-intent/route.ts` (~177–187) |
| **Symptom** | Postcodes are only required to be non-empty strings; if no zone matches and no catch-all zone exists, checkout proceeds with `zoneId = null` and **£0 shipping**, rather than refusing delivery. |
| **Root cause hypothesis** | `decideShippingZone` returns `{ zone: null, excluded: false }` when nothing matches and no empty-postcode catch-all is configured; payment-intent treats that as valid and `resolveOrderTotals` skips shipping charges. |
| **Fix direction** | Fail closed when physical goods need delivery but no zone resolves; admin warning when no catch-all zone exists. |

#### SHOP-033 — Low-stock cron can duplicate alert emails on overlap

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Cron / email |
| **Files** | `app/api/cron/low-stock-alerts/route.ts` (~26–37), `lib/db/products.ts` (~751–763) |
| **Symptom** | Two overlapping invocations (manual trigger plus scheduled run, or double fire from the platform) can both read `low_stock_alerted_at IS NULL`, send duplicate LOW_STOCK emails, then both call `markLowStockAlerted`. |
| **Root cause hypothesis** | No claim/lock per product between select and update; dedupe relies on single-threaded daily schedule. |
| **Fix direction** | `UPDATE … SET low_stock_alerted_at = now() WHERE id IN (…) AND low_stock_alerted_at IS NULL RETURNING id` before sending, or advisory lock for the job. |

#### SHOP-026 — Bulk delete has no server-side confirmation beyond permission

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin bulk ops |
| **Files** | `app/api/admin/products/bulk/route.ts` (~19–25) |
| **Symptom** | Any caller with `shop.products` can POST up to 200 ids to delete with no second-factor token or typed confirm string; safety relies entirely on admin UI. |
| **Fix direction** | Optional confirm payload (`deleteCount`, slug list hash) or separate “destructive” permission. |

#### SHOP-042 — Unpaid invoice tax point is “today”, not despatch date

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Invoices / tax |
| **Files** | `lib/invoices.ts` (~241–279, ~279), comments vs `buildInvoiceInsertInput` |
| **Symptom** | For orders without `paidAt`, `taxPointDate` uses `dateInZone(new Date(), timezone)` at issue time. Auto-issue on the SHIPPED transition is usually same-day, but a **manual** invoice raised days later on a pay-later order gets a tax point of the manual issue day, not the despatch or completion event the settings describe. |
| **Root cause hypothesis** | No persisted “tax point source” date on the order; `paidAt` is the only special case. |
| **Fix direction** | When `invoiceIssueOn` is DISPATCHED/COMPLETED, derive tax point from first shipment timestamp or status-change time stored on the order. |

#### SHOP-046 — Product gallery has no broken-image fallback

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Media / storefront |
| **Files** | `components/public/ProductDetailIslands.tsx` (~132–200), `lib/thumb-renditions.ts` |
| **Symptom** | Stage and thumbnail `<img>` tags have no `onError` handler or placeholder. A stale `thumb_url`, deleted media object, or blocked CDN URL shows the browser’s broken-image icon on the product page with no graceful fallback to the primary `url` or a neutral placeholder. |
| **Root cause hypothesis** | Happy-path assumption that rewriter + backfill keep URLs valid. |
| **Fix direction** | On thumb error, retry `url`; on stage error, show placeholder tile; admin drift report already partially covered by media-drift route. |

#### SHOP-050 — Order-size deduction report uses `shop.products` not `shop.reports`

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Permissions / reports |
| **Files** | `app/api/admin/reports/order-size-deduction/route.ts` (~13–15), `app/api/admin/reports/revenue/route.ts` (contrast) |
| **Symptom** | The order-size deduction catalogue report lives under Reports in the UI but gates on **`shop.products`**, whilst revenue/tax reports require **`shop.reports`**. A reports-only role sees some reports but not this one; a products-only role sees supplier deduction diagnostics without other financial reports. |
| **Fix direction** | Align with `shop.reports` (or document the split in admin role help text). |

#### SHOP-052 — Shop minimum order value ignores post-discount subtotal

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Discounts / B2B gates |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~193–195), `app/api/public/checkout/session/route.ts` (~71–73) |
| **Symptom** | `minimumOrderValue` / `maximumOrderValue` compare against pre-discount goods `subtotal`, so a large coupon can leave the charged total below the configured minimum whilst checkout still proceeds. |
| **Root cause hypothesis** | Gate uses `totals.subtotal` before discount, not post-coupon payable subtotal. |
| **Fix direction** | Compare against post-discount subtotal (or document that minimums are pre-coupon only). |

#### SHOP-055 — Review step totals skip `formatMoney` thousands grouping

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Accessibility / i18n display |
| **Files** | `components/public/CheckoutReviewClient.tsx` (~398, ~418–438), `lib/money.ts` |
| **Symptom** | Order review prints `currencySymbol + n.toFixed(2)` whilst the rest of the shop uses `formatMoney` with en-GB grouping. High-value baskets show `£1600.00` on the pay button line. |
| **Fix direction** | Route review totals through `formatMoney` for consistency with cart and admin. |

#### SHOP-060 — Coupon start/expiry windows use server UTC, not site timezone

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Discounts / locale |
| **Files** | `lib/checkout.ts` (~449–451), `lib/db/discounts.ts` (~112–115) |
| **Symptom** | Coupon validity compares `startsAt` / `expiresAt` to `new Date()` on the server (UTC on typical hosting), not `siteTimezone()` used for invoice tax points. A "starts midnight Monday" campaign can flip an hour early or late for UK shops. |
| **Fix direction** | Evaluate coupon windows in site timezone, or store instants with documented UTC semantics in admin copy. |

#### SHOP-063 — Payment failure messages lack alert semantics on review step

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Accessibility / checkout |
| **Files** | `components/public/CheckoutReviewClient.tsx` (~479), `components/public/CheckoutPaymentClient.tsx` (~724) |
| **Symptom** | Declined-card errors render as plain `<p style={{ color: danger }}>` without `role="alert"`, unlike shipping field errors. Screen-reader users may not hear the failure when focus remains on the pay button. |
| **Fix direction** | Use `role="alert"` (or link errors with `aria-describedby` on the place-order button) for payment failures. |

#### SHOP-072 — Public shop config can stay stale at the edge after settings change

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Caching / storefront |
| **Files** | `app/api/public/config/route.ts` (~32–68), `lib/config.ts` (~851–861) |
| **Symptom** | Checkout clients read payment methods, shop open/closed, and commerce mode from `/public/config`, cached in-process for 5s and at the CDN for `s-maxage=15` plus `stale-while-revalidate=30`. Disabling a method or closing the shop can leave some shoppers seeing the old config for up to ~45s; server-side payment-intent still enforces, but UI may offer a method that will 400. |
| **Fix direction** | Shorten CDN TTL for config, add cache bust on settings save, or mark config `private, no-store` if edge staleness is unacceptable. |

#### SHOP-073 — Checkout review Puck editor omits wallet button preview

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Puck / editor parity |
| **Files** | `components/puck/ShopCheckoutReview.tsx` (~16–17), `components/puck/ShopCheckoutReview.rsc.tsx` (~12–19) |
| **Symptom** | Storefront RSC path passes `walletButtons={resolveCheckoutWalletButtons()}`; editor path renders `CheckoutReviewClient` with `preview` only. Apple Pay / Google Pay rows never appear in the layout editor, so owners cannot judge spacing or copy around wallet CTAs. |
| **Fix direction** | Optional static wallet placeholders in preview mode, or document that wallet buttons are storefront-only. |

#### SHOP-075 — Delivery tracking poll capped at 25 parcels per hour

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Parcel tracking / cron |
| **Files** | `app/api/cron/delivery-tracking/route.ts` (~40–43, ~75–76) |
| **Symptom** | With many live parcels, each hour only the oldest 25 (by check time) are polled. Completion emails and auto-COMPLETE can lag days on a sudden backlog; design is intentional politeness to couriers but operationally easy to miss. |
| **Fix direction** | Surface backlog depth in admin; allow raising PARCEL_LIMIT via config; or prioritise out-for-delivery parcels. |

#### SHOP-076 — Module teardown does not drop order-number sequences

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Uninstall / lifecycle |
| **Files** | `cactus.module.json` (`teardown` ~59–103), `migrations/001_initial.sql` (~494) |
| **Symptom** | Uninstall removes `shp_*` tables but leaves `shp_order_number_seq` (and invoice/credit sequences) in Postgres. Reinstalling the module on the same database resumes numbering from the old sequence, which may surprise owners expecting a fresh counter. |
| **Fix direction** | Document sequence behaviour on reinstall; optional teardown hook to drop shop sequences when explicitly requested. |

#### SHOP-081 — PayPal OAuth token cached in module memory across invocations

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | PayPal / serverless |
| **Files** | `lib/payments/paypal.ts` (~10–27) |
| **Symptom** | Client-credentials token is held in a module-level variable until expiry. Rotating `PAYPAL_CLIENT_SECRET` mid-flight can leave one warm instance using a revoked token until TTL expires (errors at capture/refund until refresh). |
| **Fix direction** | Invalidate cached token on 401 from PayPal; or fetch per invocation for low-volume shops. |

#### SHOP-085 — Order lines snapshot catalogue SKU, not sale SKU

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Bundles / pricing / ops |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~290–294), `migrations/018_sale_sku.sql`, `lib/types.ts` (`saleSku`) |
| **Symptom** | When a product is on offer, admin may set a separate **sale code** for supplier ordering, but checkout always writes `product_sku` from `product.sku`. Invoices, exports, and PO integrations see the ordinary SKU whilst the clearance code sits unused on the row. |
| **Root cause hypothesis** | `sale_sku` is import/admin metadata only; no branch in order materialisation selects it when `isOnSale` is true. |
| **Fix direction** | Snapshot `saleSku ?? sku` on lines when the charged price used the sale figure; document in admin that sale code is display-only until then. |

#### SHOP-090 — Rating provider ignores manifest install order

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Extension points / reviews |
| **Files** | `lib/detail-rating.ts` (~49–55) |
| **Symptom** | `shop.product-rating-summary` picks the first function in the generated registry via `Object.values`, not the installed-modules manifest order used elsewhere. With two providers present in a broken pin state, JSON-LD could flip between modules. |
| **Root cause hypothesis** | Shortcut resolver predates manifest-gated pattern in `lib/card-price.ts`. |
| **Fix direction** | Resolve through `getInstalledManifests()` + entry id, first valid rating wins. |

#### SHOP-091 — Checkout UI extension maps skip manifest gating

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Extension points / checkout |
| **Files** | `lib/checkout-wallet-buttons.ts` (~20–23), `lib/checkout-payment-fields.ts` (~21–24), contrast `lib/line-meta.ts` `gatherPoint` |
| **Symptom** | Wallet button and on-page payment field components are taken from the whole generated registry map, whilst cart resolvers and card prices filter through installed manifest entries. Normally identical at build time, but the two patterns disagree on contract documentation and on what happens if registry and DB module list diverge during local dev. |
| **Root cause hypothesis** | Client component maps keyed by method id; authors assumed registry equals installed set. |
| **Fix direction** | Filter contributed keys through manifest entries (or document that only build pins matter and add a lint). |

#### SHOP-094 — Back-in-stock subscribe ignores storefront visibility

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Public API / notifications |
| **Files** | `app/api/public/back-in-stock/route.ts` (~26–30) |
| **Symptom** | Subscribe only checks that the product row exists. Shoppers can register emails against **DRAFT**, **catalogue_hidden**, or **parts_only** products that never appear in browse surfaces, cluttering admin lists and sending alerts if stock moves on a non-public SKU. |
| **Fix direction** | Require `status === 'ACTIVE'` and the same visibility predicates as storefront list queries (or explicit allow for hidden variation children). |

#### SHOP-095 — Product questions accept non-storefront products

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Public API / product questions |
| **Files** | `app/api/public/product-questions/route.ts` (~56–57) |
| **Symptom** | Same as back-in-stock: any existing product id passes, including drafts and catalogue-hidden rows, so the public form can queue questions against pages shoppers cannot reach (unless staff preview). |
| **Fix direction** | Gate on `getProductStorefrontReachability` or equivalent before `createProductQuestion`. |

#### SHOP-096 — Abandoned-order prune ignores failed and awaiting-payment rows

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Cron / orders hygiene |
| **Files** | `lib/db/orders.ts` (~565–569), `app/api/cron/low-stock-alerts/route.ts` (~41) |
| **Symptom** | Daily prune deletes only `status = 'PENDING' AND payment_status = 'PENDING'`. **`PAYMENT_FAILED`**, **`AWAITING_CONFIRMATION`**, and other unpaid lifecycle rows persist indefinitely, extending SHOP-009 clutter beyond 24 hours. |
| **Fix direction** | Extend prune predicates (with safeguards for bank-transfer drafts) or document retention; optionally tie to checkout-draft expiry. |

#### SHOP-097 — Admin customer lookup enables email existence oracle

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Privacy / admin |
| **Files** | `app/api/admin/customers/[id]/route.ts` (~17–18) |
| **Symptom** | GET returns **404 Customer not found** when no orders exist for the decoded email segment, and **200** with order history when one does. Any staff role with **`shop.customers`** (including `allowAccess` readers) can probe whether an address has ever ordered. |
| **Fix direction** | Uniform response shape, or restrict lookup to roles that already see full PII and audit log access. |

#### SHOP-098 — Checkout session/intent block staff during CLOSED shop

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Public API / ops UX |
| **Files** | `app/api/public/checkout/session/route.ts` (~35), `payment-intent/route.ts` (~94), contrast `shopClosedResponse()` on `payment-note/route.ts` |
| **Symptom** | While the shop is **CLOSED**, staff with **`shop.access`** can browse the storefront via `getShopGate`, but checkout session and payment-intent return 503 for **`shopStatus !== 'OPEN'`** without the staff preview exception. Owners cannot walk through totals or payment setup before reopening unless they flip the shop to OPEN. |
| **Fix direction** | Use `shopClosedResponse()` (or shared gate) on session/intent, matching cart validate and payment-note. |

#### SHOP-101 — Product CSV export holds entire catalogue in memory

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin exports / perf |
| **Files** | `lib/csv-rows.ts` (~27–37), `app/api/admin/products/export/route.ts` |
| **Symptom** | Export paginates at 100 rows but **`collectPaged` accumulates every product** into one array before serialising CSV. Very large catalogues can exhaust serverless memory on a single export click. |
| **Fix direction** | Stream CSV rows page-by-page, or cap export with the same warning pattern as orders export (SHOP-071). |

#### SHOP-104 — Thumb-top-up cron swallows backfill failures

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Cron / media |
| **Files** | `app/api/cron/thumb-top-up/route.ts` (~44–46) |
| **Symptom** | Each `backfillProductThumbs` pass is wrapped in `.catch(() => null)`. Storage or network errors end the loop silently; the JSON response still reports `ok: true` with partial counts, so operators cannot tell thumbs are stuck without re-checking pending counts. |
| **Fix direction** | Log structured failure, surface `errors` in cron JSON, or fail the run when a pass returns null after pending > 0. |

#### SHOP-109 — Guest cart store ignores closed-shop gate

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Public API / ops UX |
| **Files** | `app/api/public/cart/store/route.ts` (GET/PUT/DELETE), contrast `app/api/public/cart/validate/route.ts` |
| **Symptom** | Whilst the shop is **CLOSED**, shoppers (including non-staff) can still read and write guest basket rows because the route never calls `shopClosedResponse()`. Checkout remains blocked later, but baskets persist and sync across devices during maintenance. |
| **Fix direction** | Optional: allow staff preview via shared gate; otherwise reject PUT when closed like validate. |

#### SHOP-110 — Dashboard widget revenue uses float conversion

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / money display |
| **Files** | `app/api/admin/dashboard-widget/route.ts` (~36–42) |
| **Symptom** | Thirty-day revenue applies `Number()` to `SUM("total")` from Postgres NUMERIC. Large totals or many decimal places can show **off-by-penny** averages in the widget compared to reports that keep decimal strings. |
| **Fix direction** | Parse via `Prisma.Decimal` or string fixed-point before dividing for AOV. |

#### SHOP-111 — Member GDPR export fans out order items without bound

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Privacy / perf |
| **Files** | `app/api/member/gdpr-export/route.ts` (~17–18) |
| **Symptom** | Export loads every order for a member then `Promise.all` fetches items per order. Heavy buyers can make a single internal export spike memory and query count (mitigated by bearer auth, still worth bounding). |
| **Fix direction** | Batch item fetch by order id list in one query, or stream export in pages. |

#### SHOP-113 — Collection Browser prints extension links without scheme filter

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Storefront / extension trust |
| **Files** | `components/puck/ShopCollectionBrowser.rsc.tsx` (~34–44, ~67), contrast `app/api/admin/orders/[id]/dispatch/route.ts` (`TrackingUrl` http/https only) |
| **Symptom** | Extra collection cards from `shop.collection-index-sources` render `<a href={item.href}>` with **no http/https validation**. A compromised or buggy provider module could inject `javascript:` or other schemes into the storefront index (core dispatch routes already refuse non-http tracking URLs). |
| **Fix direction** | Normalise provider hrefs through the same http/https guard used for parcel tracking, or document that providers must only return same-site paths and enforce with `URL` parsing in core shop. |

#### SHOP-114 — Charged replacements skip PAID-trigger auto-invoice

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Replacements / invoices |
| **Files** | `lib/replacements.ts`, contrast `lib/order-fulfillment.ts` (~133–136), `lib/invoices.ts` |
| **Symptom** | Shops with **`invoiceIssueOn = PAID`** auto-invoice normal orders inside `fulfillPaidOrder`. Replacement orders are born **`payment_status = PAID`** but never call that path, so **priced spare lines do not auto-raise paperwork** unless staff press issue manually (extends SHOP-107 money-not-collected theme). |
| **Fix direction** | After replacement insert, call `issueInvoiceForOrder` when `shouldIssueOn(config, 'PAID')` and `total > 0`, or route priced replacements through `AWAITING_CONFIRMATION` until manually confirmed. |

#### SHOP-116 — Dispatch modal does not warn about pending cancel/return units

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin UX / order requests |
| **Files** | `components/admin/DispatchModal.tsx`, contrast `lib/db/shipments.ts` (~156–172), `lib/db/order-requests.ts` (`cancel_requested_qty`) |
| **Symptom** | Server caps ignore **PENDING** request quantities by design (SHOP-043), but the dispatch modal only shows bought/dispatched/refunded/outstanding with **no banner** when lines have open cancel/return requests. Staff can ship goods the customer has already asked to call off, then approve and refund. |
| **Fix direction** | Include pending request quantities in the dispatch GET payload and surface a warning row per affected line; optional shop setting to hard-block dispatch on pending cancels. |

#### SHOP-117 — Puck promo and footer links accept arbitrary URL schemes

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Puck / admin trust |
| **Files** | `components/puck/ShopPromoBanner.tsx` (~38–40), `components/puck/ShopCollectionLinks.rsc.tsx` (~30, ~45) |
| **Symptom** | Owner-editable **`ctaHref`** and **`allHref`** render straight into `<a href>` without restricting to http/https or site-relative paths. A mistyped or pasted `javascript:` URL in the layout editor becomes executable on the live storefront (admin-only surface, same class as SHOP-011 invoice CSS). |
| **Fix direction** | Validate hrefs in Puck field transforms (allow `/…` and http(s) only); strip or reject dangerous schemes at render time. |

#### SHOP-120 — Requests queue pre-ticks refund from order total, not payment state

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin UX / order requests |
| **Files** | `components/admin/RequestsScreen.tsx` (~127–130), contrast `lib/order-request-actions.ts` `issueRefund` |
| **Symptom** | Opening the decide panel sets **`refund` true whenever `Number(orderTotal) > 0`**, including **unpaid bank-transfer or cash orders** still at `AWAITING_CONFIRMATION`. Staff who leave the box ticked hit a confusing provider error on approve rather than a disabled refund offer. |
| **Fix direction** | Pre-tick only when `payment_status === 'PAID'` (and optionally when a refundable provider exists); show helper text when total is non-zero but nothing was captured. |

#### SHOP-123 — Dashboard 30-day revenue includes priced replacement orders

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / reports |
| **Files** | `app/api/admin/dashboard-widget/route.ts` (~12–18), `components/admin/ShopDashboardWidget.tsx` (~12–16), migration 052 comments on `kind` |
| **Symptom** | Thirty-day **revenue** uses `SUM("total")` over all **`payment_status = 'PAID'`** rows, including **`kind = 'REPLACEMENT'`** spare orders that were never a separate checkout sale. The JSON widget API filters **`order_count`** to `kind = 'SALE'` only, so **average order value** divides mismatched numerator and denominator; the RSC dashboard widget counts **every** paid row in both revenue and order count. Priced warranty parts inflate revenue and AOV even when they were never captured separately (extends SHOP-107, SHOP-110). |
| **Fix direction** | Apply `kind = 'SALE'` (or exclude zero-total replacements) to the revenue SUM as well as the count, matching reports SQL; keep decimal-safe parsing from SHOP-110. |

#### SHOP-124 — Admin order notes and manual emails accept unbounded bodies

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / abuse / storage |
| **Files** | `app/api/admin/orders/[id]/notes/route.ts` (~6), `app/api/admin/orders/[id]/email/route.ts` (~7), `lib/db/orders.ts` (`addOrderNote` ~1014–1017) |
| **Symptom** | Staff can POST **multi-megabyte** note text or manual email HTML because Zod only enforces `min(1)` with **no max length**. Notes land in `shp_order_emails`-sized rows and bloat order payloads on every admin GET; a compromised staff session or pasted accident can degrade DB and UI performance. |
| **Fix direction** | Cap content (e.g. 8–32 KiB) consistently with customer reference limits; reject oversize with 400 before insert. |

#### SHOP-126 — Purchase reference editable on partially refunded orders

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | B2B / purchase-order portal |
| **Files** | `lib/customer-reference.ts` (~32–66), `app/api/member/orders/[id]/route.ts` (~58–63) |
| **Symptom** | Post-order **purchase order / job reference** edits are blocked for `CANCELLED` and **`REFUNDED`** lifecycle statuses, but **not** for **`PARTIALLY_REFUNDED`**. A customer can add or change a PO number whilst part of the order is already refunded, then expect it on paperwork that may have gone out earlier. |
| **Fix direction** | Treat `PARTIALLY_REFUNDED` like other closed paperwork states, or allow only while no invoice has been issued (same rule as invoice reference lock). |

#### SHOP-130 — Admin payment-status filters miss lifecycle-refunded orders

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin orders list |
| **Files** | `lib/order-filters.ts` (~10, ~29), `lib/db/orders.ts` (~674), `lib/db/refunds.ts` (`settleRefund`) |
| **Symptom** | List/export filters on **`paymentStatus=REFUNDED`** or **`PARTIALLY_REFUNDED`** query the **`payment_status`** column only. Refunds that update **`status`** via admin settle or webhooks but leave **`payment_status = 'PAID'`** (SHOP-122) **do not appear** under payment refunded filters and **still match** `paymentStatus=PAID`, confusing finance triage. |
| **Fix direction** | When fixing SHOP-122, filters align automatically; until then, document that payment filters follow `payment_status`, or add a composite "money state" filter. |

#### SHOP-131 — Stranded payments banner lacks recovery pointers

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin UX / stranded payments |
| **Files** | `components/admin/OrdersScreen.tsx` (~362–388), `app/api/admin/orders/route.ts` (~28–31), `lib/stranded-payments.ts` |
| **Symptom** | When **`stats=1`**, the orders screen shows stranded-payment **order numbers, totals, and errors**, but **not `draftId`**, provider references, or a **recovery/deep-link** action. Operators must grep logs or drafts manually despite copy promising recovery (extends SHOP-038). |
| **Fix direction** | Surface draft id (copy button), link to internal runbook, or a "mark resolved" admin action once materialised. |

#### SHOP-132 — Requests queue accepts non-numeric `limit` and breaks pagination

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin API / requests |
| **Files** | `app/api/admin/requests/route.ts` (~21–22), `lib/db/order-requests.ts` (~584–585) |
| **Symptom** | `?limit=abc` becomes **`Number('abc')` → NaN**, which is truthy and passed through. `Math.min(Math.max(NaN, 1), 200)` stays **NaN**, so **`LIMIT NaN`** in SQL can **500 the queue** or behave unpredictably. |
| **Fix direction** | Parse with `Number.isFinite` and fall back to default (50), same as order list date parsing. |

#### SHOP-134 — Requests queue accepts non-numeric `offset` and breaks pagination

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin API / requests |
| **Files** | `app/api/admin/requests/route.ts` (~21–22), `lib/db/order-requests.ts` (~584–585) |
| **Symptom** | `?offset=abc` becomes **`Number('abc')` → NaN**, passed through to **`Math.max(NaN, 0)`**, which stays **NaN**, so **`OFFSET NaN`** in SQL can **500 the queue** or return unpredictable pages (same class as SHOP-132 on `limit`). |
| **Fix direction** | Parse offset with `Number.isFinite` and default to 0; validate limit the same way in one helper. |

#### SHOP-135 — Bulk product mutations silently drop ids beyond 200

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin bulk ops |
| **Files** | `app/api/admin/products/bulk/route.ts` (~19–20), contrast `app/api/admin/orders/bulk/route.ts` (~8) |
| **Symptom** | POST **`ids`** arrays longer than **200** are **`slice(0, 200)`** without telling the client how many were ignored. Staff selecting "all on this page" plus shift-click extras may believe the whole selection deleted or archived whilst tail ids remain unchanged. Order bulk status uses **`z.max(200)`** and rejects oversize payloads instead. |
| **Fix direction** | Return `{ applied: n, ignored: m }` or 400 when `ids.length > 200`, matching order bulk behaviour. |

#### SHOP-136 — Revenue report chart sums replacement PAID totals

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin reports |
| **Files** | `app/api/admin/reports/revenue/route.ts` (~9–14), migration 052 comments |
| **Symptom** | The 90-day revenue series **`SUM("total")`** over **`payment_status = 'PAID'`** includes **`kind = 'REPLACEMENT'`** spare orders, whilst **`order_count`** uses **`FILTER (WHERE kind = 'SALE')`**. Charts imply average sale value from mismatched numerator and denominator (extends SHOP-123 dashboard theme on a different screen). |
| **Fix direction** | Apply the same `kind = 'SALE'` filter to revenue SUM, or document and label the series as "settled money" vs "checkout sales". |

#### SHOP-140 — Damage-photo upload buffers entire image in memory

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Member/guest uploads / perf |
| **Files** | `app/api/member/orders/[id]/photos/route.ts` (~59–60), `lib/media/upload.ts` |
| **Symptom** | Each damage-report photograph is read into a **`Buffer`** in the API request before validation and upload to media storage. A large phone photo (within **`validateUpload`** limits) can spike serverless memory on a route already reachable by guests with postcode proof (distinct from admin digital **`SHOP-133`** path but same ingress pattern). |
| **Fix direction** | Stream to object storage where the media helper allows; or enforce a lower byte ceiling with a plain-English 413. |

#### SHOP-141 — Settled-order metrics SQL omits partially refunded status

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin orders list / metrics |
| **Files** | `lib/db/orders.ts` (`SETTLED_ORDER_STATUSES` ~737, open-lines query ~805) |
| **Symptom** | **`getOrderRowMetrics`** treats **`COMPLETED`**, **`CANCELLED`**, and **`REFUNDED`** as settled, but **`PARTIALLY_REFUNDED`** orders still load open lines and run **`resolveOrderLineDueDates`**. Comments say finished orders are dateless; part-refunded orders keep showing **Delivery due** work and extension calls even when finance considers them closed. |
| **Fix direction** | Include **`PARTIALLY_REFUNDED`** in **`SETTLED_ORDER_STATUSES`** (or a dedicated "no due date" set aligned with **`order-auto-complete`** once SHOP-138 is fixed). |

#### SHOP-143 — Apply-coupon runs without shop OPEN/CLOSED gate

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Discounts / closed shop |
| **Files** | `app/api/public/checkout/apply-coupon/route.ts`, contrast `app/api/public/checkout/session/route.ts` (~35), `app/api/public/cart/validate/route.ts` (~27–28) |
| **Symptom** | **`POST /checkout/apply-coupon`** rate-limits and resolves cart lines but never calls **`shopClosedResponse`** or checks **`shopStatus !== 'OPEN'`**. While the shop is **CLOSED** or **BROWSE_ONLY**, anonymous clients can still probe coupon codes and receive **valid/invalid** discount responses (and run **`resolveCartLines`** on unbounded line arrays per SHOP-092). |
| **Fix direction** | Match session/validate: refuse when the shop is not accepting orders, or allow staff preview only via **`canPreviewClosedShop`**. |

#### SHOP-144 — Billing identity editable on partially refunded orders

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | B2B / customer billing |
| **Files** | `lib/customer-billing.ts` (~43–116), `app/api/member/orders/[id]/billing/route.ts` (~80–82), contrast `lib/customer-reference.ts` (~32–66) and SHOP-126 |
| **Symptom** | **`customerCanEditBilling`** blocks **`CANCELLED`** and **`REFUNDED`** only. On **`PARTIALLY_REFUNDED`** orders, customers can still amend company or billing address (including confirmed **reissue** when no credit note yet exists on the invoice), whilst finance may already be mid-refund on the same sale. |
| **Fix direction** | Add **`PARTIALLY_REFUNDED`** to **`CLOSED_STATUSES`**, or allow address-only amend while blocking company reissue once any refund row exists. |

#### SHOP-145 — Dispatch shipment notes accept unbounded text

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / dispatch / storage |
| **Files** | `app/api/admin/orders/[id]/dispatch/route.ts` (~79–86, ~85), `lib/db/shipments.ts` (~322–329) |
| **Symptom** | Dispatch **`notes`** is **`z.string().nullable().optional()`** with **no max length**. A pasted blob is stored on **`shp_shipments.notes`** and returned on every order/shipment read, similar to unbounded admin order notes (SHOP-124) but on the fulfilment path staff use from handheld scanners. |
| **Fix direction** | Cap notes (e.g. 2–4 KiB) with 400 on oversize; mirror customer-visible dispatch copy limits elsewhere if any. |

#### SHOP-146 — Checkout and manual orders accept uncapped purchase references

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | B2B / checkout validation |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~53), `app/api/admin/orders/route.ts` (~50), contrast `app/api/member/orders/[id]/route.ts` (~26), `lib/customer-reference.ts` (~81) |
| **Symptom** | **`customerReference`** on payment-intent and admin manual order POST is **`z.string().optional()`** with **no `.max()`**, whilst post-order edits enforce **`CUSTOMER_REFERENCE_MAX_LENGTH` (120)**. A crafted checkout can persist multi-megabyte reference text on **`shp_orders`**, bloating exports, invoice rows, and admin list payloads. |
| **Root cause hypothesis** | The cap was added on the member PATCH path and UI but not backported to the routes that first write the column. |
| **Reproduction (inferable)** | POST payment-intent with a 50 000-character `customerReference`; order saves; member PATCH later rejects the same value if the customer tries to shorten it. |
| **Fix direction** | Apply **`CUSTOMER_REFERENCE_MAX_LENGTH`** on payment-intent and admin manual order schemas; return 400 with the same copy as the order hub. |

#### SHOP-147 — Dispatch tracking numbers accept unbounded text

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / dispatch / storage |
| **Files** | `app/api/admin/orders/[id]/dispatch/route.ts` (~81–82, ~246), `lib/db/shipments.ts` |
| **Symptom** | **`trackingNumber`** on dispatch POST and PATCH is **`z.string().nullable().optional()`** without a max. A pasted blob is stored on **`shp_shipments.tracking_number`** and echoed on customer tracking emails and order JSON (extends SHOP-145 notes theme on adjacent columns). |
| **Root cause hypothesis** | Carrier numbers are usually short; validation focused on URL and slot formats, not scalar length. |
| **Fix direction** | Cap tracking numbers (e.g. 64–128 chars) with 400; align with courier field **`carrier` max 80** where sensible. |

#### SHOP-148 — Payment-intent contact and address fields lack max lengths

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Checkout / storage / deliverability |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~28–32, ~50–55), contrast `app/api/member/orders/[id]/billing/route.ts` (~46–55) and `BILLING_COMPANY_MAX_LENGTH` |
| **Symptom** | **`customerName`**, **`customerOrganisation`**, and **`AddressSchema`** lines (`firstName`, `lastName`, `line1`, `city`, etc.) accept **unbounded strings** at order creation. Values land in **`shp_orders`** and signed addresses, risking label overflow, email header issues, and oversized JSON on every order read (admin manual order POST reuses the same address shape). |
| **Root cause hypothesis** | Checkout prioritised required-field validation; post-order billing edits gained caps later without mirroring on the create path. |
| **Fix direction** | Reuse sensible maxima (company **`BILLING_COMPANY_MAX_LENGTH`**, name/line caps matching member address book or carrier label limits) on payment-intent and admin manual order **`AddressSchema`**. |

#### SHOP-149 — Cancel and return requests allowed on partially refunded orders

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / refunds |
| **Files** | `lib/order-requests.ts` (~199, ~289–291, ~334–336), `app/api/member/orders/[id]/requests/route.ts` (~48–52) |
| **Symptom** | **`CLOSED_STATUSES`** for cancel/return eligibility lists **`CANCELLED`** and **`REFUNDED`** only. Orders in lifecycle **`PARTIALLY_REFUNDED`** still pass **`canRequestCancel`** / **`canRequestReturn`**, so customers can open **new** cancel/return queues whilst finance is already mid-refund (parallel to SHOP-126/144 on references and billing, but on the request pipeline). |
| **Root cause hypothesis** | Partial refund status was added after request rules; closed paperwork was not extended consistently. |
| **Reproduction (inferable)** | Part-refund an order in admin; customer hub still offers cancel or return; submit succeeds and staff see a second pending request. |
| **Fix direction** | Add **`PARTIALLY_REFUNDED`** to **`CLOSED_STATUSES`**, or allow only for lines with **`outstandingQty > 0`** and no conflicting open refund. |

#### SHOP-150 — Dispatch POST accepts unbounded line item batches

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/orders/[id]/dispatch/route.ts` (~79–80), `lib/db/shipments.ts` (`createShipment`) |
| **Symptom** | Dispatch **`items`** is **`z.array(...).min(1)`** with **no `.max()`**. A authenticated staff session (or compromised browser) can POST thousands of `{ orderItemId, quantity }` rows; each fails or merges inside **`createShipment`**, but Zod parsing and the merge loop run first, spiking CPU on an order-scoped route (same class as SHOP-127 manual order lines). |
| **Root cause hypothesis** | Normal dispatch picks a handful of lines; caps were not copied from bulk mutation patterns elsewhere. |
| **Fix direction** | Cap items (e.g. 200) to match order line count ceiling; return 400 when exceeded. |

#### SHOP-151 — Admin can set lifecycle REFUNDED without processing a refund

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin order mutation / refunds |
| **Files** | `app/api/admin/orders/[id]/status/route.ts` (~6–8), `lib/db/orders.ts` (`updateOrderStatus` ~327–332), contrast `app/api/admin/orders/[id]/refund/route.ts`, `lib/db/refunds.ts` (`processRefund`) |
| **Symptom** | Staff can choose **`REFUNDED`** or **`PARTIALLY_REFUNDED`** from the single-order status dropdown. That calls **`updateOrderStatus` only** - no provider call, no **`shp_refunds`** row, no stock restore, no digital revocation, and no **`payment_status`** sync (extends SHOP-067's cancel-without-money theme to lifecycle refunds). |
| **Root cause hypothesis** | Status enum mirrors database values; refund paperwork and money movement live on a separate route that the dropdown bypasses. |
| **Reproduction (inferable)** | Open a paid card order; set status to Refunded without using Refund; order shows refunded lifecycle with money still captured and downloads still valid. |
| **Fix direction** | Remove refund statuses from the manual dropdown, or refuse them unless `payment_status` is already settled via `processRefund` / webhook ingest. |

#### SHOP-152 — Admin refund POST accepts unbounded item batches

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/orders/[id]/refund/route.ts` (~9–12, ~38) |
| **Symptom** | Refund body allows **`items: z.array(...).min(1)`** with **no `.max()`**. A script can POST thousands of `{ orderItemId, quantity, amount }` rows; **`prepareRefund`** and cap checks run per row before the advisory lock short-circuits, spiking CPU on an authenticated route (parallel to SHOP-127 / SHOP-150). |
| **Root cause hypothesis** | Normal refunds touch a handful of lines; batch caps were added elsewhere but not here. |
| **Fix direction** | Cap items to order line count (e.g. 200); reject with 400 when exceeded. |

#### SHOP-154 — Collection membership writes accept unbounded product id lists

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/collections/[id]/products/route.ts` (~21–39), `lib/db/collections.ts` |
| **Symptom** | **`POST`** and **`PUT`** use **`productIds: z.array(z.string())`** with no length ceiling. Replacing or appending tens of thousands of ids in one request can hold a large JSON body in memory and issue wide junction-table writes from a single staff click or script. |
| **Root cause hypothesis** | Collections are usually modest; caps on bulk product routes were not mirrored on membership endpoints. |
| **Fix direction** | Reuse the bulk mutation cap (200) or paginate membership changes. |

#### SHOP-155 — Member saved addresses lack field length caps

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Member account / storage |
| **Files** | `app/api/member/addresses/route.ts` (~12–17), `app/api/member/addresses/[id]/route.ts` (same schema), contrast `app/api/member/orders/[id]/billing/route.ts` (~46–50) |
| **Symptom** | **`AddressSchema`** requires **`min(1)`** on names and lines but sets **no `.max()`** on **`firstName`**, **`line1`**, **`postcode`**, etc. A member (or stolen session) can persist multi-megabyte strings in **`shp_saved_addresses`**, unlike billing PATCH which caps organisation at 160 characters. |
| **Root cause hypothesis** | Checkout address caps were added on payment-intent later (SHOP-148); the address book predates them. |
| **Fix direction** | Share one bounded address schema across checkout, billing PATCH, and saved addresses. |

#### SHOP-156 — Member billing PATCH address lines lack max lengths

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / billing |
| **Files** | `app/api/member/orders/[id]/billing/route.ts` (~46–50), `lib/customer-billing.ts` (`BILLING_COMPANY_MAX_LENGTH` only on organisation) |
| **Symptom** | Billing **`AddressSchema`** bounds **`organisation`** but not **`line1`**, **`city`**, or **`postcode`**. Invoice reissue can persist unbounded address text on the order row whilst company name is capped. |
| **Root cause hypothesis** | Company length was added for Companies House; street fields were assumed short. |
| **Fix direction** | Apply the same maxima as checkout billing panels to every customer-editable address write. |

#### SHOP-157 — Damage reports still offered on refunded orders

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests |
| **Files** | `lib/order-requests.ts` (`canReportDamage` ~382–396), contrast `canRequestCancel` (`CLOSED_STATUSES` ~199) |
| **Symptom** | **`canReportDamage`** blocks **`CANCELLED`** only. Orders in lifecycle **`REFUNDED`** or **`PARTIALLY_REFUNDED`** with dispatched goods still show the damage button; submits succeed and land in the admin queue even though money is already returning. |
| **Root cause hypothesis** | Damage flow was widened to ignore returnability and open requests; closed paperwork sets were not aligned with cancel/return. |
| **Reproduction (inferable)** | Fully refund a dispatched order; customer hub still offers "Report damage"; staff receive a new DAMAGE request. |
| **Fix direction** | Extend closed statuses (or require **`outstandingQty > 0`** on unrefunded lines) before offering damage. |

#### SHOP-159 — Product related and upsell id arrays are uncapped

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/products/[id]/related/route.ts` (~7–12), `app/api/admin/products/[id]/upsells/route.ts` (same shape) |
| **Symptom** | **`relatedIds`** / **`upsellIds`** are **`z.array(z.string())`** with no **`.max()`**. Manual recommendation mode can POST an entire catalogue of ids in one PUT, triggering wide delete/insert work on junction tables. |
| **Root cause hypothesis** | UI picks a handful; API trusts the client count. |
| **Fix direction** | Cap manual lists (e.g. 50) to match editor UX; return 400 above the ceiling. |

#### SHOP-163 — Member cancel/return requests accept unbounded line selections

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Order requests / perf |
| **Files** | `app/api/member/orders/[id]/requests/route.ts` (~12–16), `lib/order-request-actions.ts` |
| **Symptom** | Optional **`items`** array has **no `.max()`**. A hand-rolled POST can list every **`orderItemId`** on a large order repeatedly; eligibility runs per line before submit rejects impossible quantities. |
| **Root cause hypothesis** | Normal requests select a few lines; caps exist on photo ids but not line batches. |
| **Fix direction** | Cap **`items`** to order line count; mirror dispatch batch limits. |

#### SHOP-166 — Admin product PUT accepts unbounded relation arrays

| Field | Detail |
|--------|--------|
| **Severity** | Medium |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/products/[id]/route.ts` (~114–118) |
| **Symptom** | Product update schema allows unbounded **`media`**, **`categoryIds`**, **`tagIds`**, and **`collectionIds`** arrays in one PUT. A single save can attach thousands of relations or media rows, stressing validation and follow-on media moves (within the route's **`maxDuration`** ceiling). |
| **Root cause hypothesis** | Editor UI is bounded; API accepts arbitrary array lengths from scripts. |
| **Fix direction** | Cap each array to editor limits (e.g. media 24, categories/tags to practical max). |

#### SHOP-153 — Shipping zone postcode lists are uncapped

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / shipping |
| **Files** | `app/api/admin/shipping-zones/route.ts` (~13–17), `app/api/admin/shipping-zones/[id]/route.ts` |
| **Symptom** | **`postcodes`** and **`excludedPostcodes`** default to **`[]`** but accept unbounded arrays on create/update. Mis-pasted national lists inflate JSON storage and slow zone resolution at checkout. |
| **Fix direction** | Cap postcode entries per zone (e.g. 5000) with a clear 400 message. |

#### SHOP-158 — Manual payment instruction settings are unbounded

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin settings / storefront |
| **Files** | `lib/config.ts` (`ShpConfigSchema` ~292–293), `lib/payment-instructions.ts` |
| **Symptom** | **`bankTransferInstructions`** and **`cashInstructions`** are plain **`z.string()`** with no max length. Owners can store very large HTML blobs shown on checkout, proformas, and emails, increasing render cost and email size. |
| **Fix direction** | Cap instruction length (e.g. 8k) in schema; truncate with warning in admin UI. |

#### SHOP-160 — Catalogue reorder endpoints accept unbounded id lists

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin / perf |
| **Files** | `app/api/admin/categories/reorder/route.ts` (~14–16), `app/api/admin/collections/reorder/route.ts`, `app/api/admin/tags/reorder/route.ts` |
| **Symptom** | **`orderedIds: z.array(z.string()).min(1)`** has no **`.max()`** on category, collection, or tag reorder routes. One POST can reorder an entire table in a single transaction. |
| **Fix direction** | Cap to sibling count or a fixed ceiling (e.g. 500). |

#### SHOP-161 — Checkout phone field has no maximum length

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Checkout / storage |
| **Files** | `app/api/public/checkout/payment-intent/route.ts` (~54, ~126–134) |
| **Symptom** | **`customerPhone`** is optional **`z.string()`** without **`.max()`**. Validation only runs **`isValidUkPhone`** when non-empty; a long garbage string can be stored on **`shp_orders.customer_phone`**. |
| **Fix direction** | Add a modest max (e.g. 32) before UK format validation. |

#### SHOP-162 — Tax report period keys off order created_at only

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Admin reports / tax |
| **Files** | `app/api/admin/reports/tax/route.ts` (~39–42, ~48, ~69) |
| **Symptom** | Optional **`from`/`to`** filters apply to **`o.created_at`**, not invoice issue date or refund settlement time. A VAT quarter filter can include tax on orders placed earlier but invoiced or refunded inside the period (and omits orders created in-period but invoiced later). |
| **Root cause hypothesis** | Created-at was the only column available when the report was first built; refund netting still keys off the same date. |
| **Fix direction** | Document the semantics in admin copy, or offer alternate cut-offs (invoice `issued_at`, refund `settled_at`). |

#### SHOP-164 — Pay-online banner ignores partially refunded lifecycle

| Field | Detail |
|--------|--------|
| **Severity** | Low |
| **Area** | Pay online / UX |
| **Files** | `lib/payment-instructions.ts` (`paymentOutstanding` ~39–44), `lib/order-pay-online.ts` |
| **Symptom** | **`paymentOutstanding`** treats only **`CANCELLED`** and **`REFUNDED`** lifecycle as closed. An order in **`PARTIALLY_REFUNDED`** with **`payment_status`** still **`PENDING`** on bank transfer (rare but possible after status edits) may still show "how to pay" for the **full** **`order.total`**, not the remaining balance. |
| **Root cause hypothesis** | Partial refund lifecycle was not added to the closed set; pay-online amounts always use **`Number(order.total)`**. |
| **Fix direction** | Close pay-online when lifecycle is **`PARTIALLY_REFUNDED`**, or compute outstanding from refund rows. |

### Info

#### SHOP-125 — SMS milestones never appear in order communications log

| Field | Detail |
|--------|--------|
| **Severity** | Info |
| **Area** | SMS / admin UX |
| **Files** | `lib/order-notify.ts` (~137–142), `lib/email.ts` (`logOrderEmail`), `lib/sms-templates.ts` |
| **Symptom** | Successful **text messages** sent via `sendSmsTemplate` are **not recorded** in `shp_order_emails` (or any parallel table). The admin Communications tab shows email history only, so staff cannot tell whether a customer opted into SMS and actually received dispatch texts (distinct from SHOP-023, which covers failed emails). |
| **Fix direction** | Optional SMS log table or extend comms log with channel column; at minimum document that SMS is invisible in admin history. |

#### SHOP-121 — Admin currency symbol hook defaults to £ before config loads

| Field | Detail |
|--------|--------|
| **Severity** | Info |
| **Area** | Admin UX / locale |
| **Files** | `components/admin/use-currency-symbol.ts` (~11–14, ~26) |
| **Symptom** | Trading admin screens initialise **`useState(cached ?? '£')`** and only then fetch `currencySymbol` from public config. Non-GBP shops briefly show **£** on first paint (and permanently if the fetch fails silently), until cache warms on a later screen. |
| **Fix direction** | Default empty or a neutral placeholder; surface fetch failure once; optionally pass symbol from server props on first admin paint. |

#### SHOP-086 — Slug uniqueness uses `$queryRawUnsafe` with fixed table names (pass 85)

| Field | Detail |
|--------|--------|
| **Severity** | Info |
| **Area** | SQL / lib/db |
| **Files** | `lib/slug.ts` (~16–18) |
| **Symptom** | The only `$queryRawUnsafe` in the module: table name is interpolated from a TypeScript union (`shp_products` \| categories \| …), slug value is parameterised. No user-controlled table name; risk is style/consistency with the rest of shop raw SQL, not injection. |
| **Fix direction** | Optional refactor to `$queryRaw` with `Prisma.sql` identifier quoting for parity with pass 2 baseline. |

#### SHOP-099 — BROWSE_ONLY is a settings label with minimal surface enforcement (pass 123)

Shop config allows **`BROWSE_ONLY`** (admin select in `ShopSettingsTab.tsx`). Checkout mutators refuse when `shopStatus !== 'OPEN'`, which includes browse-only, but there is **no** dedicated storefront banner, robots hint, or cart-disable message beyond generic "not accepting orders". Catalogue GET routes remain available; behaviour relies on UI not calling payment-intent.

#### SHOP-105 — Popularity recompute failure is silent in the daily cron (passes 125/129)

`recomputePopularity()` runs inside `low-stock-alerts` cron inside an empty `catch`. A failed ranking refresh leaves yesterday's **`popularity`** sort until the next successful day, with no admin signal (distinct from low-stock email still sending).

#### SHOP-056 — No scheduled sale windows or compare-at scheduling (pass 51)

Sale pricing is a manual **`price` + `sale_price`** pair on the product row (`lib/pricing.ts`, migration `005_price_types.sql` retired `compare_at_price`). There are **no** `sale_starts_at` / `sale_ends_at` columns, cron jobs, or automatic revert when a campaign ends. Automatic **discounts** have SQL date windows (see SHOP-069), but product-level offers stay live until someone clears the sale figure. **Retail price (RRP)** is optional display-only; it never drives checkout.

#### SHOP-082 — No subscription or recurring billing (pass 48)

Payment providers cover one-off capture (Stripe, PayPal, manual methods) and **`shop.order-paid`** observers for downstream automation. There is **no** subscription product type, billing agreement storage, dunning, or Stripe Billing / PayPal billing-plan integration in shop migrations or checkout.

#### SHOP-083 — No multi-warehouse or pickup-location fulfilment (pass 49)

Inventory is a single **`stock_count`** per product (plus pre-order counters). Shipping is **postcode zones and rates** only; there are no warehouse ids, store pickup selectors, or split fulfilment by location in schema or checkout.

#### SHOP-087 — No fraud velocity rules or blocklists (pass 53)

Abuse controls are **in-memory IP rate limits** on selected public routes (`lib/rate-limit.ts`, SHOP-004) plus checkout validation. There is **no** email/card fingerprint blocklist, velocity cap per customer, or risk score hook before payment-intent creation.

#### SHOP-037 — No loyalty, referral, or repeat-purchase programmes (pass 28)

Coupons (explicit codes) and automatic discounts (priority stack on post-coupon remainder) cover promotional pricing. There are **no** loyalty points, referral codes, earn-burn wallets, or "second order" entitlements. Per-customer coupon limits and global usage caps are enforced separately (see SHOP-003, SHOP-006). Stacking of coupon plus multiple automatic discounts is intentional; SHOP-051 covers the free-shipping threshold inconsistency only.

#### SHOP-013 — No TODO/FIXME/HACK markers in shop source

Static scan of `lib/`, `app/`, `migrations/` returned no matches. Maintenance relies on inline “PROTECTED” comments instead.

#### SHOP-014 — Stranded-payment handling for draft materialisation

`lib/stranded-payments.ts` + `lib/checkout-draft.ts` record paid-but-no-order failures; good regression defence for hosted-payment flows.

#### SHOP-015 — Module dependencies

`requiresModules: []` — shop is self-contained at manifest level; integrations via extension points (`shop.product-listability`, `shop.product-sales-rollup`, cart line resolvers, payment providers).

#### SHOP-016 — Core version gate

`requiresCoreVersion: "0.5.1642"` — installs on older core may fail build if they import newer helpers.

#### SHOP-017 — Cross-module import pattern (Google Sheet)

Shop’s own `import-engine.ts` is batched and runs from admin CSV `after()`. The separate **google-sheet-products-for-shop** module (not audited here) historically shared the “slow import after cheap delete” failure mode on core; shop CSV path does not delete catalogue rows but still shares the **60s `after()`** risk (see SHOP-007).

#### SHOP-018 — Test coverage shape

~90 unit/live-test files under `modules/shop` covering money, tax, tracking, invoices, guest access, stranded payments, import update-only, etc. Gaps: no automated end-to-end test of payment-intent → confirm → fulfilment chain; webhook routes rely on provider unit logic.

#### SHOP-024 — No abandoned-cart recovery emails

Only **pending-order pruning** after 24 hours (`app/api/cron/low-stock-alerts/route.ts`, `pruneAbandonedPendingOrders`). There is no marketing or reminder email for abandoned baskets; behaviour is intentional scope, not a defect, but worth noting for owners expecting Klaviyo-style recovery.

#### SHOP-028 — Refund pipeline hardening (pass 13 positive)

`processRefund` three-phase flow, shared advisory lock with dispatch (`lib/db/shipments.ts`), provider idempotency keys, stale reconcile cron, and credit-note uniqueness are in good shape relative to common double-refund and TOCTOU failure modes (distinct from SHOP-019 inventory restore gap).

#### SHOP-034 — No gift cards, store credit, or account balance (pass 20)

The module supports payment wallets (Apple Pay / Google Pay via `shop.checkout-wallet-buttons`), replacement orders with `kind = 'GIFT'`, and supplier order-size deductions, but there is **no** gift-card product type, stored-value ledger, or customer account balance applied at checkout. Pass 20 scope is Info only.

#### SHOP-038 — Stranded payments have no cron sweeper (pass 22)

`shp_stranded_payments` and `recordStrandedPayment` cover paid-but-not-materialised hosted checkouts; recovery depends on provider webhook retries and admin noticing the alarm. No shop cron lists or nags on aged stranded rows (distinct from daily low-stock / refund reconcile jobs).

#### SHOP-039 — Digital download streaming hardening (pass 18 positive)

Download delivery streams through the gated route (no redirect to the permanent media URL), increments count only after the body completes (`TransformStream.flush`), and sanitises filenames via `lib/download-name.ts` tests. Guest and member shoppers share the same token link model by design once paid.

#### SHOP-057 — Trade price is recorded but never charged (pass 29)

`enabledPriceTypes` may include `trade`, and `tradePrice` is editable in admin (`lib/pricing.ts`), but `effectivePrice` never selects it for storefront or checkout. There are **no** customer groups, tier price lists, tax-exempt flags, or quote-only SKUs in core shop (quote-only **commerce mode** is extension-driven via `shop.commerce-mode`). Product-level **minimum order quantity** and shop-wide **minimum/maximum order value** gates exist; organisation / purchase-order fields support trade buyers without wholesale pricing logic.

#### SHOP-058 — Quote-only commerce is extension-owned (pass 29 positive)

`resolveShopCommerceMode()` delegates to `shop.commerce-mode` providers; default is pay-and-checkout. Checkout page and payment-intent refuse when mode is `quote` (`app/public/shop/checkout/page.tsx`, payment-intent route). B2B paperwork (proforma, PO reference, separate billing) is config-driven, not a separate price engine.

#### SHOP-059 — Single currency, en-GB display, UK-shaped checkout (pass 30)

One `currency` / `currencySymbol` per shop (`ShpConfigSchema`); no multi-currency checkout or FX. `formatMoney` pins `en-GB` locale for hydration safety (`lib/money.ts`). Shipping zones are **postcode**-based; checkout phone validation is **UK-only** (`lib/phone.ts`) with no country selector on the address form (country defaults to `GB` in state). No EU OSS / IOSS admin hints or RTL storefront work (N/A). Invoice/credit tax points use `siteTimezone()`; coupon windows do not (see SHOP-060). Cron schedules in `cactus.module.json` are UTC wall-clock on the host, not site-local cutoffs.

#### SHOP-061 — Payment handover dialog accessibility (pass 31 positive)

`HandoverDarkModeNotice` uses `role="alertdialog"`, `aria-modal`, labelled title/body, initial focus on continue, and a reduced-motion-friendly spinner. Checkout blocked-order copy links to fields via `focusCheckoutField` and `data-shop-field`. Empty-basket states on checkout items are explicit (`CheckoutItemsClient`); other steps return null when depopulated.

#### SHOP-065 — No in-module GDPR export/erase hooks (pass 32)

Shop stores order PII in `shp_orders`, addresses, `shp_order_emails`, back-in-stock emails, etc. Customer emails are passed to payment providers on confirm (`confirm/route.ts`) and logged deliberately in `shp_order_emails` (`lib/email.ts`). There is no shop-specific integration with core privacy export/erase beyond ordinary DB retention; see SHOP-064 for teardown. Backup/restore coverage for `shp_*` column types is enforced by core `lib/backup/schema-coverage.test.ts` parsing module migrations (static gate, not round-trip proof).

#### SHOP-066 — Consent and cookies (pass 32)

`cactus.module.json` declares `cookieCategories: []` (no module-specific consent category). `cacheBypassCookies` includes `cactus_shop_order_access` for guest order pages. Checkout agreement tickboxes are enforced server-side on payment-intent (`resolveCheckoutAgreements`); agreements reset between orders in session state (`clearOrderSpecificState`).

#### SHOP-077 — Product reviews via extension only (pass 40)

There is no `shp_reviews` table or storefront review UI in core shop. Aggregate ratings for structured data come from `lib/detail-rating.ts` and the `shop.product-rating-summary` extension point; `lib/product-jsonld.ts` refuses zero-count ratings. A site without a reviews module behaves as before.

#### SHOP-078 — No wishlist; member cart sync only (pass 41)

No wishlist or saved-for-later tables or routes. Signed-in members persist baskets in `shp_member_carts` via `app/api/member/cart/route.ts` (merge on login, 200-line cap). Guest baskets remain browser `localStorage` only (`migrations/026_guest_carts.sql` documents scope).

#### SHOP-079 — Seller VAT on invoices; no buyer VAT-exempt checkout (pass 44)

`invoiceVatNumber` and tax labels in shop config feed invoice PDFs only (`lib/invoices.ts`, `components/puck/invoice-parts.tsx`). Checkout and `shp_orders` carry no customer VAT registration, reverse-charge flag, or tax-exempt certificate flow; B2B is organisation name and PO reference only (see SHOP-057).

#### SHOP-080 — Manual payment checkout path (pass 36 positive)

Bank transfer and cash use `confirmMode: 'manual'`. The public confirm route parks orders at `AWAITING_CONFIRMATION`, sends payment-request email (`announceOrderAwaitingPayment`), and never calls provider `confirmPayment` (so it cannot mark FAILED). Admin `POST .../confirm-payment` atomically marks paid and runs `fulfillPaidOrder` with optional `PAYMENT_RECEIVED` email.

#### SHOP-115 — Replacement orders skip `shop.order-paid` observers (pass 704)

Replacement insert paths never call `notifyOrderPaid` / `fulfillPaidOrder`, so dependent modules listening on **`shop.order-paid`** (warehouse feeds, analytics) **do not see spare-part orders**. Intentional for zero-total warranty parts, but surprising when a priced replacement is recorded as PAID (SHOP-107). Document or emit a narrower hook (e.g. `shop.replacement-raised`).

---

## Findings by area

| Area | IDs |
|------|-----|
| Cart / checkout | SHOP-001, SHOP-005, SHOP-009, SHOP-032, SHOP-045, SHOP-053, SHOP-054, SHOP-062, SHOP-063, SHOP-073, SHOP-146, SHOP-148 |
| Payment / webhooks | SHOP-002, SHOP-008, SHOP-010, SHOP-014, SHOP-038, SHOP-054, SHOP-068, SHOP-081, SHOP-122, SHOP-130 |
| Digital downloads | SHOP-029, SHOP-030, SHOP-039, SHOP-112 |
| Discounts | SHOP-003, SHOP-006, SHOP-051, SHOP-052, SHOP-060, SHOP-037, SHOP-069, SHOP-070, SHOP-143 |
| Refunds / fulfilment | SHOP-019, SHOP-020, SHOP-021, SHOP-028, SHOP-036, SHOP-043, SHOP-044, SHOP-067, SHOP-074, SHOP-106, SHOP-107, SHOP-112, SHOP-116, SHOP-119, SHOP-138, SHOP-145, SHOP-147, SHOP-150, SHOP-151, SHOP-152 |
| Order requests | SHOP-043, SHOP-044, SHOP-118, SHOP-120, SHOP-132, SHOP-140, SHOP-149, SHOP-157, SHOP-163 |
| Invoices / credit notes | SHOP-040, SHOP-041, SHOP-042, SHOP-048, SHOP-049, SHOP-114 |
| Email / notifications | SHOP-022, SHOP-023, SHOP-024, SHOP-033 |
| Tax / money | SHOP-008, SHOP-021, SHOP-041, SHOP-042, SHOP-162 |
| Shipping / address | SHOP-031, SHOP-032, SHOP-044, SHOP-153 |
| SEO / catalogue | SHOP-025, SHOP-035 |
| Auth / abuse | SHOP-004, SHOP-035, SHOP-092, SHOP-093, SHOP-108, SHOP-127, SHOP-128, SHOP-154, SHOP-159, SHOP-166 |
| Public API / perf | SHOP-092, SHOP-093, SHOP-094, SHOP-095 |
| Product questions | SHOP-095, SHOP-100 |
| Notifications / subscribe | SHOP-094 |
| Admin privacy | SHOP-097 |
| Ops / closed shop | SHOP-098, SHOP-131, SHOP-142, SHOP-143 |
| Admin exports | SHOP-071, SHOP-101, SHOP-129, SHOP-139 |
| Admin dashboard | SHOP-110 |
| Member carts / GDPR | SHOP-108, SHOP-111 |
| Guest cart / closed shop | SHOP-109 |
| Cron / media | SHOP-104, SHOP-105, SHOP-096 |
| SQL style | SHOP-086 |
| Shop modes | SHOP-099 |
| Permissions / admin IDOR | SHOP-047, SHOP-048, SHOP-049, SHOP-050, SHOP-100 |
| Concurrency / 60s | SHOP-007, SHOP-022, SHOP-030, SHOP-045 |
| Cron / background | SHOP-033, SHOP-036, SHOP-038, SHOP-075 |
| SQL / migrations | SHOP-012 |
| Media / storefront | SHOP-046 |
| Admin / UX | SHOP-011, SHOP-026, SHOP-027, SHOP-120, SHOP-121, SHOP-123, SHOP-124, SHOP-125 |
| Stored value / gifts | SHOP-034, SHOP-037 |
| Integration / tests | SHOP-015, SHOP-016, SHOP-017, SHOP-018 |
| Loyalty / referrals | SHOP-037 |
| B2B / trade / quote | SHOP-057, SHOP-058, SHOP-052, SHOP-126, SHOP-144, SHOP-146 |
| Locale / currency | SHOP-055, SHOP-059, SHOP-060 |
| Accessibility / UX | SHOP-053, SHOP-055, SHOP-061, SHOP-063, SHOP-062 |
| GDPR / PII / retention | SHOP-064, SHOP-065, SHOP-066, SHOP-076 |
| Reviews / ratings | SHOP-077 |
| Wishlist / saved carts | SHOP-078 |
| VAT / B2B buyer tax | SHOP-079, SHOP-057 |
| Caching / config staleness | SHOP-072 |
| Admin exports | SHOP-071 |
| Puck / editor parity | SHOP-073, SHOP-117 |
| Manual payments | SHOP-080, SHOP-158, SHOP-164 |
| Subscriptions / recurring | SHOP-082 |
| Warehouses / pickup | SHOP-083 |
| Parts / composite SKUs | SHOP-084, SHOP-085 |
| Sale pricing / scheduling | SHOP-056, SHOP-085 |
| Member account / addresses | SHOP-155, SHOP-156, SHOP-161 |
| Fraud / abuse | SHOP-004, SHOP-087 |
| Extension point contracts | SHOP-045, SHOP-088, SHOP-089, SHOP-090, SHOP-091, SHOP-113, SHOP-115 |

---

## Cross-cutting themes

1. **Check-then-act commerce** — Validation at session/payment-intent time is thorough but not transactional with inventory or coupon per-customer limits.
2. **Guest-checkout security model** — Strong on track-order and receipt gating; confirm route trades UX for a known pending-order mutation risk (documented in source).
3. **Serverless constraints** — `after()` used for import, back-in-stock dispatch, media copy finish; all compete with 60s module ceiling on OVH latency.
4. **Inventory symmetry** — Stock decrements at payment (and pre-order at dispatch) without automatic restore on refund/cancel for normal tracked lines (SHOP-019).
5. **Defensive SQL** — Widespread parameterised `$queryRaw`; dynamic updates use `Prisma.sql`/`Prisma.join`; no `$queryRawUnsafe` observed in shop module.
6. **Signed media** — Media rewriter tests match on plain keys/URLs (`lib/media-reference-rewriter.test.ts`); thumb URLs stored as plain `thumb_url` column (migration 058).
7. **Digital licence lifecycle** — Tokens are minted on payment but not tied to refund or payment-status revocation (SHOP-029); limits are enforced without atomic reservation (SHOP-030).
8. **Quote freshness** — Instant checkout freezes totals at payment-intent; hosted drafts additionally freeze shipping/extension-point charges until settlement with no re-quote (SHOP-032).
9. **Cron schedule truth** — Route comments and stale thresholds sometimes assume hourly work whilst `cactus.module.json` schedules daily or hourly jobs differently (SHOP-036).
10. **Paperwork vs money timing** — Invoices and credit notes snapshot tax points and netting flags; when marking or settlement timestamps lag, VAT reporting and admin panels disagree (SHOP-040, SHOP-041, SHOP-042).
11. **Admin route trust boundaries** — Order-scoped URLs should bind child ids (invoice, refund, credit note); several POST handlers accept bare UUIDs (SHOP-048, SHOP-049). `allowAccess` widens write paths beyond intended roles (SHOP-047).
12. **Parallel resolver fold** — Checkout resolves every line concurrently for latency; extension modules must treat `shop.cart-line-resolver` as parallel-safe (SHOP-045).
13. **Discount stacking bases** — Coupon plus automatic discounts stack by design, but free-shipping thresholds and shop minimum-order gates can disagree on whether pre- or post-coupon subtotals count (SHOP-051, SHOP-052).
14. **UK-first commerce surface** — Postcode zones, UK phone validation, and en-GB money formatting suit domestic shops; international VAT/OSS and multi-currency are out of scope (SHOP-059, SHOP-060).
15. **Layout fallbacks uneven** — Cart and checkout hardcode client fallbacks; confirmation does not, so a missing Puck layout is a paid blank page (SHOP-062).
16. **Privacy lifecycle** — Rich order PII in SQL with module teardown deletes and no first-class export/erase story in shop itself (SHOP-064, SHOP-065).
17. **Webhook vs confirm parity** — Browser confirm validates provider amounts; webhook PAID paths do not (SHOP-068), overlapping float risk on PayPal create (SHOP-008).
18. **Admin status vs money** — Lifecycle status can diverge from payment state (SHOP-067); exports and cron caps need operator awareness (SHOP-071, SHOP-075).
19. **Discount time and bases** — Coupon, automatic, and free-shipping rules mix UTC windows, pre-coupon floors, and post-coupon remainders (SHOP-060, SHOP-069, SHOP-070, SHOP-051).
20. **Optional commerce features** — Reviews and wishlists are extension-driven or absent by design (SHOP-077, SHOP-078); buyer VAT-exempt flows are out of scope (SHOP-079).
21. **Scope boundaries** — Subscriptions, multi-warehouse, scheduled product sales, and fraud blocklists are out of module scope (SHOP-082, SHOP-083, SHOP-056, SHOP-087); automatic discounts still carry SQL date windows (SHOP-069).
22. **Parts vs bundles** — Related/upsell links and replacement orders exist, but there is no composite SKU explosion; `parts_only` hides spares from lists yet not from direct purchase (SHOP-084, SHOP-085).
23. **Extension hook robustness** — Most multi-provider seams skip throwing providers; canonical URL and page-alias resolvers still propagate errors (SHOP-088, SHOP-089); a few registry shortcuts bypass manifest order (SHOP-090, SHOP-091).
24. **Cart caps uneven** — Persisted guest/member carts cap lines and meta size; checkout pricing mutators do not (SHOP-092, SHOP-093).
25. **Admin read vs write on questions** — Product Q&A mutations widen `shop.access` further than other catalogue writes (SHOP-100).
26. **Cron silence** — Thumb backfill and popularity refresh can fail quietly whilst the daily job still reports success (SHOP-104, SHOP-105).
27. **Replacement lifecycle** — Admin-raised replacement orders skip the paid checkout pipeline, so inventory and payment state can disagree with warehouse reality (SHOP-106, SHOP-107).
28. **Replacement side-effects** — Skipping `fulfillPaidOrder` also skips digital tokens, PAID-trigger invoices, and `shop.order-paid` observers unless separately wired (SHOP-112, SHOP-114, SHOP-115).
29. **Puck link hygiene** — Promo and collection link blocks trust owner-entered hrefs; extension collection cards trust provider hrefs (SHOP-117, SHOP-113).
30. **Request evidence binding** — Damage photos are uploaded per order but attached by global media id at submit time (SHOP-118).
31. **Replacement payment fiction** — Charged spares can look like captured card payments without a provider reference (SHOP-119, SHOP-107).
32. **Refund status split** — Lifecycle `status` can read refunded whilst `payment_status` stays PAID when refunds arrive via webhooks or admin settle (SHOP-122).
33. **Dashboard metric mixing** — Thirty-day revenue sums priced replacement rows whilst order counts may exclude them (SHOP-123).
34. **Admin ingress caps** — Manual orders and CSV import accept unbounded lines/upload size (SHOP-127, SHOP-128); import jobs can zombie in PROCESSING (SHOP-129); dispatch line batches and tracking numbers lack Zod maxima (SHOP-147, SHOP-150).
35. **Partial-refund paperwork drift** — Lifecycle **`PARTIALLY_REFUNDED`** is omitted from several "closed order" sets (references SHOP-126, billing SHOP-144, cancel/return SHOP-149, metrics SHOP-141, auto-complete SHOP-138).
36. **Checkout create vs edit caps** — Payment-intent writes reference, name, and address fields without the maxima enforced on member PATCH routes (SHOP-146, SHOP-148).
37. **Admin filter drift** — Payment-status filters disagree with lifecycle refunds when `payment_status` is stale (SHOP-130).
38. **Admin ingress and job rows** — Digital uploads, import error jsonb, and bulk id caps (SHOP-133, SHOP-137, SHOP-135); requests pagination parsing (SHOP-134, SHOP-132).
39. **Auto-complete vs partial refund** — Delivered parcels can still complete part-refunded orders (SHOP-138).
40. **List/export metrics cost** — Due-date extension providers run for export and part-refunded rows (SHOP-139, SHOP-141).
41. **Closed shop vs post-purchase access** — Document paperwork stays reachable when CLOSED; track, receipt, and account order hubs do not (SHOP-142); apply-coupon still resolves discounts (SHOP-143).
42. **Admin lifecycle vs money** — Status dropdown can mark orders refunded without `processRefund` (SHOP-151); refund and dispatch ingress caps remain uneven (SHOP-152, SHOP-150).
43. **Customer paperwork eligibility** — Damage reports ignore refunded lifecycle (SHOP-157); saved addresses and billing PATCH lack checkout field caps (SHOP-155, SHOP-156).

---

## Recommended fix order

1. **SHOP-001** (oversell) — highest customer impact on busy SKUs.  
2. **SHOP-062** (blank confirmation) — every paid order should land on a receipt; publish layout or add fallback.  
3. **SHOP-067** (cancel paid without refund) — prevents cancelled-yet-paid orders and angry finance teams.  
4. **SHOP-019** / **SHOP-106** / **SHOP-112** (stock not restored; replacements skip decrement and digital tokens) — catalogue drift and missing download rows alongside SHOP-001.  
5. **SHOP-029** (digital downloads after refund) — licence abuse and revenue leakage on digital SKUs.  
6. **SHOP-002** (confirm DoS) — low effort binding secret vs pending order.  
7. **SHOP-003** / **SHOP-005** — coupon and pre-order caps at fulfilment.  
8. **SHOP-068** — webhook amount verification alongside confirm path hardening (SHOP-008).  
9. **SHOP-054** — clear prepared payment after confirm failure so retries mint fresh intents.  
10. **SHOP-036** / **SHOP-020** — align refund reconcile cadence with stale PENDING policy.  
11. **SHOP-021** / **SHOP-044** — approval refunds (tax basis and delivery charges).  
12. **SHOP-047** / **SHOP-048** / **SHOP-049** — tighten accounting permissions and order-scoped id checks.  
13. **SHOP-040** / **SHOP-041** — invoice netting and credit-note tax points.  
14. **SHOP-032** — re-quote hosted drafts before settlement when shipping matters.  
15. **SHOP-051** / **SHOP-052** / **SHOP-070** / **SHOP-069** — align discount stacking, minimums, and campaign windows.  
16. **SHOP-043** — surface pending cancel/return on dispatch UI.  
17. **SHOP-007** — import job durability under 60s.  
18. **SHOP-022** / **SHOP-023** — notification reliability and comms log.  
19. **SHOP-035** / **SHOP-004** — search and shared rate limits if abuse observed.  
20. **SHOP-045** / **SHOP-074** — resolver parallelism and batched pre-order checks.  
21. **SHOP-071** — export cap visibility for accountants.  
22. **SHOP-053** / **SHOP-063** / **SHOP-055** — checkout accessibility and money formatting polish.  
23. **SHOP-064** / **SHOP-076** — document/teardown, sequences, and GDPR expectations before module removal.  
24. **SHOP-084** / **SHOP-088** / **SHOP-089** — parts-only leakage and extension throws on product URLs.
25. **SHOP-085** — sale SKU on order lines if supplier integrations depend on it.
26. **SHOP-092** / **SHOP-093** — align checkout mutators with cart line/meta caps.
27. **SHOP-100** — tighten product-question mutations to `shop.products`.
28. **SHOP-094** / **SHOP-095** — storefront visibility on subscribe/question public POSTs.
29. **SHOP-096** — extend or document unpaid order retention beyond PENDING/PENDING.
30. **SHOP-107** / **SHOP-114** — priced replacements: payment state, invoices, and reports should match how money is actually collected.
31. **SHOP-108** — member cart write rate limits.
32. **SHOP-116** — dispatch UI warning for pending cancel/return quantities (mitigates SHOP-043).
33. **SHOP-113** / **SHOP-117** — href scheme validation on Puck and collection-index surfaces.
34. **SHOP-118** — bind damage-report photos to the order that uploaded them.
35. **SHOP-119** — align charged replacement payment state with how money is actually collected.
36. **SHOP-122** — keep `payment_status` and refund rows aligned for admin and webhook refunds.
37. **SHOP-123** / **SHOP-124** / **SHOP-126** — dashboard revenue filter, admin body caps, PO reference on partial refunds.
38. **SHOP-127** / **SHOP-128** / **SHOP-129** — cap admin order lines and import uploads; terminal import job states on failure.
39. **SHOP-130** / **SHOP-131** / **SHOP-132** / **SHOP-134** — payment filter honesty, stranded recovery UX, requests queue limit/offset parsing.
40. **SHOP-133** / **SHOP-137** / **SHOP-135** / **SHOP-136** — cap digital upload ingress, trim import job error storage, honest bulk product counts, align revenue report SUM with SALE filter.
41. **SHOP-138** / **SHOP-139** / **SHOP-141** — exclude part-refunded orders from auto-complete; lighter export metrics without extension due-date fan-out; align settled-status SQL.
42. **SHOP-140** — stream or cap guest damage-photo uploads.
43. **SHOP-142** / **SHOP-143** — keep post-purchase order access and coupon probes aligned with document-access CLOSED policy.
44. **SHOP-144** / **SHOP-145** — block billing edits on part-refunded orders where appropriate; cap dispatch notes.
45. **SHOP-146** / **SHOP-148** — align checkout and manual-order ingress caps with post-order reference and billing limits.
46. **SHOP-147** / **SHOP-150** — cap dispatch tracking numbers and dispatch line batches.
47. **SHOP-149** — extend cancel/return closed paperwork to partially refunded orders.
48. Remaining Low/Info as housekeeping.

---

## Appendix: audit pass log

Full pass-by-pass scope tables for passes **1–974**. Passes **1–54** are below; passes **55–974** (920 rows) are embedded in this appendix with no external file dependency.

### Passes 1–54 (thematic passes)

| Pass | Scope (summary) | Findings logged |
|------|-----------------|-----------------|
| **1. Checkout & inventory** | `cactus.module.json`, 114 API routes, 61 migrations, admin/public app trees, `lib/{db,payments,tracking,media}` | SHOP-015, SHOP-016; inventory baseline for SHOP-001 |
| **2. SQL & migrations** | All `migrations/*.sql`, raw SQL in `lib/db/*` | SHOP-012; no reserved-word alias bugs found (contrast uk-bookkeeping `both` incident); sequences present for order/invoice/credit-note |
| **3. Cart & checkout flow** | `lib/checkout.ts`, payment-intent, session, cart store/validate | SHOP-001, SHOP-005, SHOP-009 |
| **4. Payment & webhooks** | `app/api/webhooks/{stripe,paypal}/route.ts`, `lib/payments/stripe.ts`, confirm route | SHOP-002, SHOP-008, SHOP-010, SHOP-014; webhooks idempotent PAID path OK |
| **5. Auth & permissions** | `lib/access.ts`, `requireShopUser` on admin routes, `requireOrderAccess`, track/status | SHOP-004; admin routes gated; guest order access well layered |
| **6. Input validation & injection** | Zod on public mutators, `dangerouslySetInnerHTML` usage, download route | SHOP-011; product HTML via Puck/RSC; downloads stream gated |
| **7. Concurrency & 60s** | `after()` in import, back-in-stock, product PUT media | SHOP-007; delivery-tracking cron explicitly capped (25 parcels) |
| **8. Error handling & UX** | confirm/import/stranded paths | SHOP-006, SHOP-007; stranded payments avoid silent money loss |
| **9. TypeScript & edge types** | Decimal/jsonb mapping in `mapProduct`, Stripe amounts | SHOP-008 |
| **10. Core & sibling modules** | Extension points, `requiresCoreVersion`, popularity rollup | SHOP-016, SHOP-017; cart line resolvers documented non-idempotent deduction pass |
| **11. Tests & coverage** | `*.test.ts` inventory (~90 files) | SHOP-018 |
| **12. Historical / regression** | TODO/FIXME scan, order_number seq, cart meta, import ordering | SHOP-013; seq in `001_initial.sql` + `lib/order-number.ts`; no FIXME debt |
| **13. Refunds, cancellations & partial fulfilment** | `lib/db/refunds.ts`, `processRefund`, credit notes, `lib/db/shipments.ts`, cancel approval, pre-order release | SHOP-019, SHOP-020, SHOP-021, SHOP-028; partial dispatch caps and shared order lock OK |
| **14. Email & notifications** | `lib/order-notify.ts`, `lib/email.ts`, back-in-stock trigger, cron low-stock, order email log | SHOP-022, SHOP-023, SHOP-024; duplicate slot/tracking claims on shipments OK |
| **15. Tax, currency & rounding** | `lib/checkout.ts` `resolveOrderTotals`, EXCLUSIVE shipping tax, refund line amounts | SHOP-021; overlaps SHOP-008 on Stripe float; single shop currency from config |
| **16. SEO, feeds & public catalogue** | `lib/sitemap.ts`, product page gate, public products API, root slug claim | SHOP-025; ACTIVE/hidden enforced on product URLs and API; draft preview uses `noindex` |
| **17. Admin bulk ops & destructive actions** | bulk product delete, CSV import, bulk order status, single delete redirect | SHOP-026, SHOP-027; import compare-before-write (SHOP-007 concurrency separate) |
| **18. Digital downloads & licence abuse** | `app/api/public/downloads/[token]/route.ts`, `lib/db/digital.ts`, `lib/order-fulfillment.ts`, download page wrapper | SHOP-029, SHOP-030, SHOP-039; token UUID; stream-not-redirect; no payment/refund gate on GET |
| **19. Shipping quotes & address validation** | `resolveOrderTotals`, `resolveShipping`, `checkout-draft` materialisation, `decideShippingZone`, payment-intent/session routes | SHOP-032, SHOP-031; zone mismatch guard in `resolveShipping`; extension-point weight/charges frozen in drafts |
| **20. Gift cards, store credit & balance** | migrations, checkout, discounts, wallet extension point | SHOP-034 (Info: feature absent) |
| **21. Search, filters & catalogue performance** | `app/api/public/products/route.ts`, `listProducts`, `product-search.ts`, admin products GET | SHOP-035; sort whitelist `SORT_SQL`; pagination clamp `HARD_MAX_PER_PAGE`; search terms capped at 8 |
| **22. Webhooks, cron & background jobs** | three `app/api/cron/*` routes, `recomputePopularity`, `stranded-payments`, manifest `cronJobs` | SHOP-036, SHOP-033, SHOP-038; CRON_SECRET Bearer auth on all crons; delivery-tracking capped at 25 parcels/hour |
| **23. Invoices, credit notes & accounting hooks** | `lib/invoices.ts`, `lib/credit-notes.ts`, `lib/invoice-sinks.ts`, `lib/invoice-tax.ts`, admin invoice/credit routes, `issueInvoiceForOrder` / void / reissue | SHOP-040, SHOP-041, SHOP-042; partial unique index and sink payloads OK (SHOP-028); void requires `shop.manage` |
| **24. Order requests & self-service** | `lib/db/order-requests.ts`, `lib/order-request-actions.ts`, member requests API, dispatch caps vs cancel state | SHOP-043, SHOP-044; advisory lock + one open cancel/return; damage reports unlimited; overlaps SHOP-021 on line amounts |
| **25. Variations, options & cart line resolver** | `lib/checkout.ts`, `lib/line-meta.ts`, `setLineMeta`, extension `control`, cart validate | SHOP-045; prefetch + fold; payment-intent re-resolves prices; first control wins per line |
| **26. Media, images & product gallery** | `ProductDetailIslands`, `thumb_url`, `lib/thumb-renditions.ts`, `lib/gallery-media.ts`, media-drift admin | SHOP-046; plain thumb keys; stage `fetchPriority="high"`; thumbs `loading="lazy"` |
| **27. Permissions, multi-user admin & audit** | `requireShopUser` on all admin routes, invoice/credit POST, reports permissions, order-scoped IDs | SHOP-047, SHOP-048, SHOP-049, SHOP-050; refund route correctly omits `allowAccess`; no cross-tenant surface |
| **28. Loyalty, referrals & repeat purchase** | `resolveDiscounts`, coupons, automatic discounts, `incrementCouponUsage`, abandoned-cart cron | SHOP-037, SHOP-051; no points/referral tables; stacking otherwise intentional |
| **29. B2B / trade / wholesale** | `lib/pricing.ts`, `commerce-mode`, min order qty/value, org/PO fields, proforma | SHOP-057, SHOP-058, SHOP-052; trade price admin-only |
| **30. Internationalisation & locale** | `formatMoney`, `ShpConfigSchema` currency, phone/postcode, `siteTimezone`, cron schedules | SHOP-059, SHOP-060, SHOP-055; UK-first checkout |
| **31. Accessibility & storefront UX** | checkout clients, handover dialog, confirmation page, payment error paths | SHOP-053, SHOP-054, SHOP-062, SHOP-063, SHOP-061; focus/alert patterns partial |
| **32. Data retention, GDPR & PII** | `cactus.module.json` teardown/cookies, order email log, backup schema coverage | SHOP-064, SHOP-065, SHOP-066; no erase/export hook |
| **33. Puck blocks & editor/RSC parity** | `cactus.module.json` puckBlocks, `ShopProductGrid`/`ShopProductDetail` split, checkout review editor vs `.rsc`, inline card parts | SHOP-073; grids use `connection()` + Suspense on RSC; product detail editor placeholder by design |
| **34. Mobile & responsive checkout** | `CheckoutItemsClient` sticky/collapse breakpoints, `CheckoutReviewClient` maxWidth, PayPal handover dialog | *(no new defect IDs; SHOP-053/055/063 cover a11y gaps)* |
| **35. PayPal & alternate providers** | `lib/payments/paypal.ts`, webhooks, `registry.ts` extension merge, OAuth token cache | SHOP-068, SHOP-081; PayPal capture amount checked on confirm only |
| **36. Manual offline payments** | `bank-transfer.ts`, `cash.ts`, confirm-payment route, confirm route manual branch | SHOP-080 (Info positive); manual confirm avoids SHOP-002 failure path |
| **37. Order numbers & sequences** | `lib/order-number.ts`, `shp_order_number_seq`, export/bulk orphan pending (SHOP-009) | SHOP-076; prefix change does not reset seq (documented in code comments) |
| **38. Automatic discounts & rules** | `resolveDiscounts`, `listAutomaticDiscounts`, priority stack | SHOP-069, SHOP-070; overlaps SHOP-051 free-shipping base |
| **39. Categories, collections, browse** | `lib/db/catalogue.ts` collections index, `listGridProducts`, category display modes | *(no new IDs; SHOP-025 sitemap; empty collections omitted from index by design)* |
| **40. Reviews & ratings** | `lib/detail-rating.ts`, `product-jsonld.ts` | SHOP-077 (Info: extension-only) |
| **41. Wishlist & saved carts** | `shp_member_carts`, `app/api/member/cart/route.ts`, guest localStorage | SHOP-078 (Info: no wishlist) |
| **42. Admin order mutation after payment** | status/bulk routes, PATCH customer reference only, billing via invoice reissue | SHOP-067; PATCH narrow by design |
| **43. Parcel tracking & delivery notifications** | delivery-tracking cron, `store-reading.ts`, delivery-slot email | SHOP-075; slot email claimed per parcel (`claimSlotNotification`) |
| **44. VAT numbers & tax-exempt buyers** | invoice seller VAT, checkout tax mode | SHOP-079 (Info: no buyer VAT-exempt flow) |
| **45. Admin list performance, exports, indexes** | `listOrders` batched metrics, export route, `outstandingPreOrderItems` | SHOP-071, SHOP-074; admin products list batches images/subscribers |
| **46. Caching & stale storefront** | `getShopConfigCached`, public config CDN headers, grid `connection()` | SHOP-072; product grids opt out of static cache |
| **47. Uninstall & module lifecycle** | `teardown` table list, sequences, cron job registration | SHOP-076; overlaps SHOP-064 PII drop |
| **48. Subscription / recurring billing** | payments registry, webhooks, migrations, `shop.order-paid` | SHOP-082 (Info: absent) |
| **49. Multi-warehouse / pickup** | stock columns, shipping zones, checkout address | SHOP-083 (Info: absent) |
| **50. Bundles & composite SKUs** | `parts_only`, related/upsell, replacements, `sale_sku`, cart validate | SHOP-084, SHOP-085; no bundle explosion type |
| **51. Compare-at & sale scheduling** | `lib/pricing.ts`, migrations 005/018, automatic discounts | SHOP-056 (Info: no product schedule); RRP display-only |
| **52. Member order history & address book** | `lib/member-orders.ts`, `order-address-book.ts`, member APIs, GDPR export | *(no new defect IDs; guest claim gated on verified email by design)* |
| **53. Fraud / velocity / blocklists** | `lib/rate-limit.ts`, checkout mutators vs catalogue reads | SHOP-087 (Info: no blocklist); overlaps SHOP-004 |
| **54. Extension point contracts** | canonical query, page resolver, rating, wallet/payment field maps, cart resolver docs | SHOP-088, SHOP-089, SHOP-090, SHOP-091; overlaps SHOP-045 |

**Pass finding counts:** Pass 1: 2 · Pass 2: 1 · Pass 3: 3 · Pass 4: 4 · Pass 5: 1 · Pass 6: 1 · Pass 7: 1 · Pass 8: 2 · Pass 9: 1 · Pass 10: 2 · Pass 11: 1 · Pass 12: 1 · Pass 13: 4 · Pass 14: 3 · Pass 15: 1 · Pass 16: 1 · Pass 17: 2 · Pass 18: 3 · Pass 19: 2 · Pass 20: 1 · Pass 21: 1 · Pass 22: 3 · Pass 23: 3 · Pass 24: 2 · Pass 25: 1 · Pass 26: 1 · Pass 27: 4 · Pass 28: 2 · Pass 29: 3 · Pass 30: 3 · Pass 31: 5 · Pass 32: 3 · Pass 33: 1 · Pass 34: 0 · Pass 35: 2 · Pass 36: 1 · Pass 37: 1 · Pass 38: 2 · Pass 39: 0 · Pass 40: 1 · Pass 41: 1 · Pass 42: 1 · Pass 43: 1 · Pass 44: 1 · Pass 45: 2 · Pass 46: 1 · Pass 47: 1 · Pass 48: 1 · Pass 49: 1 · Pass 50: 2 · Pass 51: 1 · Pass 52: 0 · Pass 53: 1 · Pass 54: 4 *(Info items counted where noted)*

---


## Passes 13–17 (2026-09-21)

Static-only follow-up passes; no dev server, live database, or production build. New finding IDs **SHOP-019** through **SHOP-028** (after **SHOP-018**). Detail is in **Findings by severity** above; pass scope is in the appendix table.

---

## Passes 18–22 (2026-09-21)

Static-only passes on digital downloads, shipping quote freshness, stored-value scope, catalogue search performance, and shop cron jobs. New finding IDs **SHOP-029** through **SHOP-039**. Detail is in **Findings by severity** above; pass scope is in the appendix table.

---

## Passes 23–27 (2026-09-21)

Static-only passes on invoices/credit notes and bookkeeping sinks, customer order requests, cart line resolvers and options, product gallery media, and admin permissions/IDOR. New finding IDs **SHOP-040** through **SHOP-050** (SHOP-037 assigned later in pass 28). Detail is in **Findings by severity** above; pass scope is in the appendix table.

---

## Passes 28–32 (2026-09-21)

Static-only passes on loyalty/referrals and coupon stacking, B2B/trade/quote commerce, locale and currency, checkout accessibility, and GDPR/PII retention. New finding IDs **SHOP-037** (Info, loyalty absent), **SHOP-051** through **SHOP-066** (no SHOP-056). Detail is in **Findings by severity** above; pass scope is in the appendix table.

---

## Passes 33–47 (2026-09-21)

Static-only passes on Puck shop blocks, mobile checkout, PayPal and manual payments, order numbers, automatic discounts, catalogue browse surfaces, reviews/wishlist scope, admin mutations after payment, parcel tracking, VAT buyer flows, admin export performance, config caching, and module teardown. New finding IDs **SHOP-067** through **SHOP-081** (**SHOP-056** still unused). Detail is in **Findings by severity** above; pass scope is in the appendix table.

---

## Passes 48–54 (2026-09-21)

Static-only passes on subscriptions, warehouses, bundles/parts SKUs, sale scheduling, member account history, fraud controls, and extension-point contracts for dependent modules. New finding IDs **SHOP-056**, **SHOP-082** through **SHOP-085**, **SHOP-087** through **SHOP-091** (no **SHOP-086**; pass 52 logged no new defect). Detail is in **Findings by severity** above; pass scope is in the appendix table.

---


<a id="passes-55-154-full-log"></a>

### Passes 55–154 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 55–154). Passes 1–54 are logged in the main report.

Ten blocks of ten passes, rotating focus: public API · admin API · storefront clients · lib/db · payments · email · SEO · cron · extensions · migrations/a11y/perf.

| Pass | Scope (summary) | Findings logged |
|------|-----------------|-----------------|
| **55. Public cart validate line ceiling** | `app/api/public/cart/validate/route.ts` vs guest/member cart caps | SHOP-092 |
| **56. Public checkout session closed-shop gate** | `session/route.ts` `shopStatus !== 'OPEN'` vs `shopClosedResponse` elsewhere | SHOP-098 |
| **57. Public payment-intent line meta bounds** | `payment-intent/route.ts` `meta: z.record` without `MAX_META_BYTES` | SHOP-093 |
| **58. Public apply-coupon cart shape** | `apply-coupon/route.ts` unbounded `lines` array | SHOP-092 (same theme) |
| **59. Public payment-note resolver load** | `payment-note/route.ts` full `resolveCartLines` per method change | *(no new IDs; perf note only)* |
| **60. Public guest cart store parity** | `cart/store/route.ts` 200-line cap vs checkout routes | SHOP-092 (parity gap) |
| **61. Public back-in-stock product gate** | `back-in-stock/route.ts` `getProductById` without ACTIVE/hidden checks | SHOP-094 |
| **62. Public product-questions product gate** | `product-questions/route.ts` accepts DRAFT/archived rows | SHOP-095 |
| **63. Public order-size-deduction cache** | `order-size-deduction/route.ts` shared-cache headers, ACTIVE-only | *(no new IDs; positive)* |
| **64. Public config CDN staleness** | `config/route.ts` s-maxage + stale-while-revalidate | *(overlaps SHOP-072)* |
| **65. Admin product-questions answer POST** | `product-questions/[id]/route.ts` `{ allowAccess: true }` on POST | SHOP-100 |
| **66. Admin product-questions PATCH/DELETE** | same route: status changes and erasure with `allowAccess` | SHOP-100 |
| **67. Admin customer GET by email** | `customers/[id]/route.ts` 404 vs 200 on unknown email | SHOP-097 |
| **68. Admin dispatch permission split** | `dispatch/route.ts` GET allowAccess vs POST strict `shop.orders` | *(no new IDs; positive)* |
| **69. Admin refund order-item binding** | `refunds.ts` `oi.order_id !== input.orderId` guard | *(no new IDs; positive)* |
| **70. Admin confirm-payment idempotency** | `confirm-payment/route.ts` `confirmManualPayment` gate | *(no new IDs; positive)* |
| **71. Admin bulk order partial success** | `orders/bulk/route.ts` per-order failures array | *(no new IDs; positive)* |
| **72. Admin products CSV export memory** | `lib/csv-rows.ts` `collectPaged` loads full catalogue | SHOP-101 |
| **73. Admin settings PUT partial Zod** | `settings/route.ts` `ShpConfigSchema.partial()` | *(no new IDs)* |
| **74. Admin reports order-size permission** | `reports/order-size-deduction/route.ts` vs revenue route | *(overlaps SHOP-050)* |
| **75. CheckoutReviewClient live totals a11y** | `CheckoutReviewClient.tsx` aria-live on totals | *(overlaps SHOP-053)* |
| **76. CartFullClient validate churn** | client cart sync + validate rate limits | *(no new IDs)* |
| **77. OrderConfirmationClient layout fallback** | confirmation page null without Puck layout | *(overlaps SHOP-062)* |
| **78. CartDrawerClient line CSS scope** | scoped CSS via `dangerouslySetInnerHTML` static strings | *(no new IDs)* |
| **79. AskProductQuestion honeypot** | fake success on filled honeypot | *(no new IDs; positive)* |
| **80. OrderAccessGate track-order UX** | uniform copy, focus helpers | *(no new IDs; positive)* |
| **81. CheckoutPaymentClient preparedRef** | failed confirm retains prepared payment | *(overlaps SHOP-054)* |
| **82. UpsellClient scoped CSS** | static CSS injection surface | *(no new IDs)* |
| **83. ProductDetailIslands image errors** | missing thumb fallback | *(overlaps SHOP-046)* |
| **84. Member cart PUT conflict semantics** | 409 when signed-in hits guest cart route | *(no new IDs; positive)* |
| **85. Slug uniqueness queryRawUnsafe** | `lib/slug.ts` dynamic table name in raw SQL | SHOP-086 |
| **86. Prune abandoned pending orders** | `pruneAbandonedPendingOrders` PENDING/PENDING only | SHOP-096 |
| **87. Checkout draft expiry sweep** | `checkout-draft.ts` delete on read + 30d TTL | *(no new IDs; positive)* |
| **88. Member cart JSONB trust boundary** | `member-cart.ts` stores client lines verbatim | *(no new IDs)* |
| **89. Guest cart retention sweep** | `guest-cart.ts` probabilistic DELETE | *(no new IDs; positive)* |
| **90. Stock movements audit trail** | `stock-movements.ts` insert on adjust | *(no new IDs; positive)* |
| **91. Refund prepareRefund caps** | EXCLUSIVE gross caps, stranded PENDING | *(no new IDs; positive)* |
| **92. Slug redirect chain flatten** | `slug-redirects.ts` chain update on rename | *(no new IDs; positive)* |
| **93. Import job retention prune** | `low-stock-alerts` cron `pruneOldImportJobs` | *(no new IDs)* |
| **94. Back-in-stock idempotent subscribe** | `ON CONFLICT DO NOTHING` | *(no new IDs; positive)* |
| **95. PayPal module-level OAuth cache** | `paypal.ts` cached token across invocations | *(overlaps SHOP-081)* |
| **96. PayPal createIntent float amount** | `order.amount.toFixed(2)` in JSON body | *(overlaps SHOP-008)* |
| **97. Stripe missing secret ergonomics** | empty key at init | *(overlaps SHOP-010)* |
| **98. Webhook amount verification gap** | stripe/paypal webhook handlers | *(overlaps SHOP-068)* |
| **99. Manual payment confirm branch** | confirm route AWAITING_CONFIRMATION path | *(overlaps SHOP-080)* |
| **100. Stranded payments alarm** | `stranded-payments.ts` + draft join | *(overlaps SHOP-038)* |
| **101. Payment registry extension merge** | `registry.ts` module providers | *(no new IDs)* |
| **102. Order-value limits double enforcement** | config slice + payment-intent replay | *(no new IDs; positive)* |
| **103. Checkout wallet registry gating** | `checkout-wallet-buttons.ts` map vs manifest | *(overlaps SHOP-091)* |
| **104. restoreOriginalPaymentMethod before manual paid** | `confirm-payment/route.ts` | *(no new IDs; positive)* |
| **105. Dispatch email non-throwing** | `dispatch/route.ts` try/catch on customer email | *(no new IDs; positive)* |
| **106. Product question send-first ordering** | `product-questions/[id]/route.ts` email before DB | *(no new IDs; positive)* |
| **107. Back-in-stock all-or-nothing notify** | `back-in-stock-trigger.ts` loop | *(overlaps SHOP-022)* |
| **108. Order email log on transport fail** | `order-notify.ts` / `email.ts` swallow | *(overlaps SHOP-023)* |
| **109. Shipment slot notification claim** | `claimSlotNotification` | *(no new IDs; positive)* |
| **110. Low-stock alert duplicate window** | cron select-then-mark race | *(overlaps SHOP-033)* |
| **111. Product question notice catch** | public POST swallows notify errors | *(no new IDs; positive)* |
| **112. Refund customer notify paths** | refund settlement emails | *(no new IDs)* |
| **113. Credit note sink resend** | admin credit-note POST | *(overlaps SHOP-049)* |
| **114. Delivery slot email once claim** | patch dispatch slot email | *(no new IDs; positive)* |
| **115. Category sitemap visibility** | `lib/sitemap.ts` EXISTS clause | *(overlaps SHOP-025)* |
| **116. Product slug redirect 308** | `product-slug-redirect.ts` permanentRedirect | *(no new IDs; positive)* |
| **117. Product JSON-LD zero rating guard** | `product-jsonld.ts` | *(overlaps SHOP-077)* |
| **118. Canonical query provider throw** | `product-canonical.ts` | *(overlaps SHOP-088)* |
| **119. Root slug vs redirect table** | `hasProductSlugRedirect` for claims | *(no new IDs)* |
| **120. Collection/category FAQ duplication** | Puck FAQ blocks vs product FAQs | *(no new IDs)* |
| **121. Draft product preview noindex** | product page draftPreview flag | *(no new IDs; positive)* |
| **122. JSON-LD script escape** | `ShopProductDetail.rsc.tsx` `\u003c` replace | *(no new IDs; positive)* |
| **123. BROWSE_ONLY enforcement surface** | config enum vs checkout `!== 'OPEN'` | SHOP-099 |
| **124. Hidden out-of-stock staff preview** | `canSeeHiddenOutOfStock` | *(no new IDs; positive)* |
| **125. Low-stock cron job bundling** | popularity + prune + alerts one route | SHOP-105 |
| **126. Thumb-top-up cron budget** | `thumb-top-up/route.ts` 40s budget | SHOP-104 |
| **127. Delivery-tracking parcel cap** | `PARCEL_LIMIT = 25` | *(overlaps SHOP-075)* |
| **128. Refund reconcile schedule drift** | manifest vs route comment | *(overlaps SHOP-036)* |
| **129. Popularity recompute catch** | low-stock cron swallows ranking errors | SHOP-105 |
| **130. Import job 30-day prune** | `pruneOldImportJobs` | *(no new IDs)* |
| **131. Cron CRON_SECRET 503 pattern** | all four cron routes | *(no new IDs; positive)* |
| **132. Abandoned order 24h definition** | only unpaid PENDING rows deleted | SHOP-096 |
| **133. Guest cart probabilistic sweep** | `SWEEP_ODDS` on write | *(no new IDs; positive)* |
| **134. Product PUT media after() budget** | `finishProductMediaMove` in after | *(overlaps SHOP-007)* |
| **135. Cart line resolver Promise.all** | `lib/checkout.ts` parallel resolve | *(overlaps SHOP-045)* |
| **136. Commerce mode quote gate** | `resolveShopCommerceMode` on payment-intent | *(overlaps SHOP-058)* |
| **137. Sales rollup provider try/catch** | `popularity.ts` skip throwing provider | *(no new IDs; positive)* |
| **138. Product card price registry order** | `lib/card-price.ts` manifest walk | *(no new IDs; positive)* |
| **139. Cart summary notes provider** | `getCartSummaryNotes` after validate | *(no new IDs)* |
| **140. Rating summary extension-only** | `detail-rating.ts` | *(overlaps SHOP-077)* |
| **141. Checkout wallet editor omission** | Puck review editor path | *(overlaps SHOP-073)* |
| **142. Invoice sink extension hooks** | `lib/invoice-sinks.ts` | *(no new IDs)* |
| **143. shop.order-paid observer errors** | fulfilment extension swallow | *(no new IDs)* |
| **144. core.inventory-adjuster entry** | `lib/stock.ts` external stock moves | *(no new IDs; positive)* |
| **145. Migration 059 slug redirects** | `shp_product_slug_redirects` CHECK constraint | *(no new IDs; positive)* |
| **146. Migration 056 product questions** | FAQ + question tables | *(no new IDs)* |
| **147. Duplicate migration 002 prefix** | `002_master_category` vs `002_pluggable` | *(overlaps SHOP-012)* |
| **148. migrationCatchups 043_returnable** | `cactus.module.json` catchup map | *(no new IDs; positive)* |
| **149. Tests order-receipt-token** | HMAC receipt links | *(no new IDs; positive)* |
| **150. Tests schema coverage backstop** | core backup test parses migrations | *(overlaps SHOP-018)* |
| **151. Tests media rewriter plain keys** | signed URL trap regression | *(no new IDs; positive)* |
| **152. FaqAccordion keyboard focus** | category/product FAQ Puck blocks | *(no new IDs)* |
| **153. Admin listOrders batched metrics** | dispatch summary SQL | *(overlaps SHOP-074 positive)* |
| **154. Public search COUNT(\*) cost** | `listProducts` + ILIKE filters | *(overlaps SHOP-035)* |

**Pass finding counts (55–154):** 13 passes logged new IDs · 87 passes logged none or overlaps only · **100 passes total**

New IDs in this tranche: **SHOP-086**, **SHOP-092**–**SHOP-101**, **SHOP-104**, **SHOP-105** (SHOP-087 and SHOP-091 unchanged; SHOP-050 already covers order-size report permissions).

<a id="passes-155-654-full-log"></a>

### Passes 155–654 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 155–654). Passes 1–154 are in the main report and full log in this document.

Systematic one-pass-per-surface coverage: every `app/api/**/route.ts`, then `lib/db/*`, remaining `lib/*`, `components/*`, `migrations/*`, tests, and storefront/admin pages. Many passes confirm existing findings or record positive controls only.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **155** | `app/api/admin/automatic-discounts/[id]/route.ts` | HTTP handlers in app/api/admin/automatic-discounts/[id]/route.ts | *(none)* |
| **156** | `app/api/admin/automatic-discounts/route.ts` | HTTP handlers in app/api/admin/automatic-discounts/route.ts | *(none)* |
| **157** | `app/api/admin/back-in-stock/route.ts` | HTTP handlers in app/api/admin/back-in-stock/route.ts | *(none)* |
| **158** | `app/api/admin/categories/[id]/media-folder/route.ts` | HTTP handlers in app/api/admin/categories/[id]/media-folder/route.ts | *(none)* |
| **159** | `app/api/admin/categories/[id]/route.ts` | HTTP handlers in app/api/admin/categories/[id]/route.ts | *(none)* |
| **160** | `app/api/admin/categories/reorder/route.ts` | HTTP handlers in app/api/admin/categories/reorder/route.ts | *(none)* |
| **161** | `app/api/admin/categories/route.ts` | HTTP handlers in app/api/admin/categories/route.ts | *(none)* |
| **162** | `app/api/admin/collections/[id]/duplicate/route.ts` | HTTP handlers in app/api/admin/collections/[id]/duplicate/route.ts | *(none)* |
| **163** | `app/api/admin/collections/[id]/products/route.ts` | HTTP handlers in app/api/admin/collections/[id]/products/route.ts | *(none)* |
| **164** | `app/api/admin/collections/[id]/route.ts` | HTTP handlers in app/api/admin/collections/[id]/route.ts | *(none)* |
| **165** | `app/api/admin/collections/reorder/route.ts` | HTTP handlers in app/api/admin/collections/reorder/route.ts | *(none)* |
| **166** | `app/api/admin/collections/route.ts` | HTTP handlers in app/api/admin/collections/route.ts | *(none)* |
| **167** | `app/api/admin/coupons/[id]/route.ts` | HTTP handlers in app/api/admin/coupons/[id]/route.ts | *(none)* |
| **168** | `app/api/admin/coupons/route.ts` | HTTP handlers in app/api/admin/coupons/route.ts | *(none)* |
| **169** | `app/api/admin/customers/[id]/route.ts` | HTTP handlers in app/api/admin/customers/[id]/route.ts | overlaps SHOP-097 |
| **170** | `app/api/admin/customers/route.ts` | HTTP handlers in app/api/admin/customers/route.ts | *(none)* |
| **171** | `app/api/admin/dashboard-widget/route.ts` | HTTP handlers in app/api/admin/dashboard-widget/route.ts | SHOP-110 |
| **172** | `app/api/admin/digital-files/route.ts` | HTTP handlers in app/api/admin/digital-files/route.ts | *(none)* |
| **173** | `app/api/admin/orders/[id]/confirm-payment/route.ts` | HTTP handlers in app/api/admin/orders/[id]/confirm-payment/route.ts | none (positive) |
| **174** | `app/api/admin/orders/[id]/credit-note/route.ts` | HTTP handlers in app/api/admin/orders/[id]/credit-note/route.ts | overlaps SHOP-049 |
| **175** | `app/api/admin/orders/[id]/dispatch/route.ts` | HTTP handlers in app/api/admin/orders/[id]/dispatch/route.ts | none (positive) |
| **176** | `app/api/admin/orders/[id]/email/route.ts` | HTTP handlers in app/api/admin/orders/[id]/email/route.ts | *(none)* |
| **177** | `app/api/admin/orders/[id]/invoice/route.ts` | HTTP handlers in app/api/admin/orders/[id]/invoice/route.ts | overlaps SHOP-047, SHOP-048 |
| **178** | `app/api/admin/orders/[id]/notes/route.ts` | HTTP handlers in app/api/admin/orders/[id]/notes/route.ts | *(none)* |
| **179** | `app/api/admin/orders/[id]/refund/route.ts` | HTTP handlers in app/api/admin/orders/[id]/refund/route.ts | none (positive) |
| **180** | `app/api/admin/orders/[id]/replacement/route.ts` | HTTP handlers in app/api/admin/orders/[id]/replacement/route.ts | SHOP-106, SHOP-107 |
| **181** | `app/api/admin/orders/[id]/route.ts` | HTTP handlers in app/api/admin/orders/[id]/route.ts | *(none)* |
| **182** | `app/api/admin/orders/[id]/status/route.ts` | HTTP handlers in app/api/admin/orders/[id]/status/route.ts | overlaps SHOP-067 |
| **183** | `app/api/admin/orders/bulk/route.ts` | HTTP handlers in app/api/admin/orders/bulk/route.ts | *(none)* |
| **184** | `app/api/admin/orders/export/route.ts` | HTTP handlers in app/api/admin/orders/export/route.ts | overlaps SHOP-071 |
| **185** | `app/api/admin/orders/route.ts` | HTTP handlers in app/api/admin/orders/route.ts | *(none)* |
| **186** | `app/api/admin/product-questions/[id]/route.ts` | HTTP handlers in app/api/admin/product-questions/[id]/route.ts | overlaps SHOP-100 |
| **187** | `app/api/admin/product-questions/route.ts` | HTTP handlers in app/api/admin/product-questions/route.ts | *(none)* |
| **188** | `app/api/admin/products/[id]/duplicate/route.ts` | HTTP handlers in app/api/admin/products/[id]/duplicate/route.ts | *(none)* |
| **189** | `app/api/admin/products/[id]/media-folder/route.ts` | HTTP handlers in app/api/admin/products/[id]/media-folder/route.ts | *(none)* |
| **190** | `app/api/admin/products/[id]/related/route.ts` | HTTP handlers in app/api/admin/products/[id]/related/route.ts | *(none)* |
| **191** | `app/api/admin/products/[id]/route.ts` | HTTP handlers in app/api/admin/products/[id]/route.ts | *(none)* |
| **192** | `app/api/admin/products/[id]/upsells/route.ts` | HTTP handlers in app/api/admin/products/[id]/upsells/route.ts | *(none)* |
| **193** | `app/api/admin/products/bulk/route.ts` | HTTP handlers in app/api/admin/products/bulk/route.ts | overlaps SHOP-027 |
| **194** | `app/api/admin/products/export/route.ts` | HTTP handlers in app/api/admin/products/export/route.ts | *(none)* |
| **195** | `app/api/admin/products/import-template/route.ts` | HTTP handlers in app/api/admin/products/import-template/route.ts | *(none)* |
| **196** | `app/api/admin/products/import/[id]/route.ts` | HTTP handlers in app/api/admin/products/import/[id]/route.ts | *(none)* |
| **197** | `app/api/admin/products/import/route.ts` | HTTP handlers in app/api/admin/products/import/route.ts | overlaps SHOP-007 |
| **198** | `app/api/admin/products/media-drift/route.ts` | HTTP handlers in app/api/admin/products/media-drift/route.ts | *(none)* |
| **199** | `app/api/admin/products/route.ts` | HTTP handlers in app/api/admin/products/route.ts | *(none)* |
| **200** | `app/api/admin/reports/order-size-deduction/route.ts` | HTTP handlers in app/api/admin/reports/order-size-deduction/route.ts | *(none)* |
| **201** | `app/api/admin/reports/revenue/route.ts` | HTTP handlers in app/api/admin/reports/revenue/route.ts | *(none)* |
| **202** | `app/api/admin/reports/tax/route.ts` | HTTP handlers in app/api/admin/reports/tax/route.ts | *(none)* |
| **203** | `app/api/admin/requests/[id]/route.ts` | HTTP handlers in app/api/admin/requests/[id]/route.ts | *(none)* |
| **204** | `app/api/admin/requests/route.ts` | HTTP handlers in app/api/admin/requests/route.ts | *(none)* |
| **205** | `app/api/admin/settings/route.ts` | HTTP handlers in app/api/admin/settings/route.ts | *(none)* |
| **206** | `app/api/admin/shipping-rates/[id]/route.ts` | HTTP handlers in app/api/admin/shipping-rates/[id]/route.ts | *(none)* |
| **207** | `app/api/admin/shipping-rates/route.ts` | HTTP handlers in app/api/admin/shipping-rates/route.ts | *(none)* |
| **208** | `app/api/admin/shipping-zones/[id]/route.ts` | HTTP handlers in app/api/admin/shipping-zones/[id]/route.ts | *(none)* |
| **209** | `app/api/admin/shipping-zones/route.ts` | HTTP handlers in app/api/admin/shipping-zones/route.ts | *(none)* |
| **210** | `app/api/admin/suppliers/[id]/route.ts` | HTTP handlers in app/api/admin/suppliers/[id]/route.ts | *(none)* |
| **211** | `app/api/admin/suppliers/route.ts` | HTTP handlers in app/api/admin/suppliers/route.ts | *(none)* |
| **212** | `app/api/admin/tags/[id]/route.ts` | HTTP handlers in app/api/admin/tags/[id]/route.ts | *(none)* |
| **213** | `app/api/admin/tags/reorder/route.ts` | HTTP handlers in app/api/admin/tags/reorder/route.ts | *(none)* |
| **214** | `app/api/admin/tags/route.ts` | HTTP handlers in app/api/admin/tags/route.ts | *(none)* |
| **215** | `app/api/admin/tax-classes/[id]/route.ts` | HTTP handlers in app/api/admin/tax-classes/[id]/route.ts | *(none)* |
| **216** | `app/api/admin/tax-classes/route.ts` | HTTP handlers in app/api/admin/tax-classes/route.ts | *(none)* |
| **217** | `app/api/admin/tax-zone-rates/[id]/route.ts` | HTTP handlers in app/api/admin/tax-zone-rates/[id]/route.ts | *(none)* |
| **218** | `app/api/admin/tax-zone-rates/route.ts` | HTTP handlers in app/api/admin/tax-zone-rates/route.ts | *(none)* |
| **219** | `app/api/cron/delivery-tracking/route.ts` | HTTP handlers in app/api/cron/delivery-tracking/route.ts | overlaps SHOP-075 |
| **220** | `app/api/cron/low-stock-alerts/route.ts` | HTTP handlers in app/api/cron/low-stock-alerts/route.ts | overlaps SHOP-104, SHOP-105, SHOP-096 |
| **221** | `app/api/cron/reconcile-refunds/route.ts` | HTTP handlers in app/api/cron/reconcile-refunds/route.ts | overlaps SHOP-036 |
| **222** | `app/api/cron/thumb-top-up/route.ts` | HTTP handlers in app/api/cron/thumb-top-up/route.ts | overlaps SHOP-104 |
| **223** | `app/api/member/addresses/[id]/route.ts` | HTTP handlers in app/api/member/addresses/[id]/route.ts | *(none)* |
| **224** | `app/api/member/addresses/route.ts` | HTTP handlers in app/api/member/addresses/route.ts | *(none)* |
| **225** | `app/api/member/cart/route.ts` | HTTP handlers in app/api/member/cart/route.ts | SHOP-108 |
| **226** | `app/api/member/gdpr-export/route.ts` | HTTP handlers in app/api/member/gdpr-export/route.ts | SHOP-111 |
| **227** | `app/api/member/orders/[id]/billing/route.ts` | HTTP handlers in app/api/member/orders/[id]/billing/route.ts | *(none)* |
| **228** | `app/api/member/orders/[id]/pay/confirm/route.ts` | HTTP handlers in app/api/member/orders/[id]/pay/confirm/route.ts | *(none)* |
| **229** | `app/api/member/orders/[id]/pay/route.ts` | HTTP handlers in app/api/member/orders/[id]/pay/route.ts | overlaps SHOP-008 |
| **230** | `app/api/member/orders/[id]/photos/route.ts` | HTTP handlers in app/api/member/orders/[id]/photos/route.ts | *(none)* |
| **231** | `app/api/member/orders/[id]/requests/route.ts` | HTTP handlers in app/api/member/orders/[id]/requests/route.ts | *(none)* |
| **232** | `app/api/member/orders/[id]/route.ts` | HTTP handlers in app/api/member/orders/[id]/route.ts | *(none)* |
| **233** | `app/api/member/orders/route.ts` | HTTP handlers in app/api/member/orders/route.ts | *(none)* |
| **234** | `app/api/member/requests/[id]/route.ts` | HTTP handlers in app/api/member/requests/[id]/route.ts | *(none)* |
| **235** | `app/api/public/back-in-stock/route.ts` | HTTP handlers in app/api/public/back-in-stock/route.ts | overlaps SHOP-094 |
| **236** | `app/api/public/cart/store/route.ts` | HTTP handlers in app/api/public/cart/store/route.ts | SHOP-109 |
| **237** | `app/api/public/cart/upsells/route.ts` | HTTP handlers in app/api/public/cart/upsells/route.ts | *(none)* |
| **238** | `app/api/public/cart/validate/route.ts` | HTTP handlers in app/api/public/cart/validate/route.ts | overlaps SHOP-092 |
| **239** | `app/api/public/categories/[slug]/route.ts` | HTTP handlers in app/api/public/categories/[slug]/route.ts | *(none)* |
| **240** | `app/api/public/categories/route.ts` | HTTP handlers in app/api/public/categories/route.ts | *(none)* |
| **241** | `app/api/public/checkout/apply-coupon/route.ts` | HTTP handlers in app/api/public/checkout/apply-coupon/route.ts | overlaps SHOP-092 |
| **242** | `app/api/public/checkout/confirm/route.ts` | HTTP handlers in app/api/public/checkout/confirm/route.ts | overlaps SHOP-002 |
| **243** | `app/api/public/checkout/payment-intent/route.ts` | HTTP handlers in app/api/public/checkout/payment-intent/route.ts | overlaps SHOP-092, SHOP-093, SHOP-098 |
| **244** | `app/api/public/checkout/payment-note/route.ts` | HTTP handlers in app/api/public/checkout/payment-note/route.ts | overlaps SHOP-092 |
| **245** | `app/api/public/checkout/session/route.ts` | HTTP handlers in app/api/public/checkout/session/route.ts | overlaps SHOP-092, SHOP-093, SHOP-098 |
| **246** | `app/api/public/collection-index-sources/route.ts` | HTTP handlers in app/api/public/collection-index-sources/route.ts | none (Info: intentional public probe) |
| **247** | `app/api/public/collections/[slug]/route.ts` | HTTP handlers in app/api/public/collections/[slug]/route.ts | *(none)* |
| **248** | `app/api/public/collections/route.ts` | HTTP handlers in app/api/public/collections/route.ts | *(none)* |
| **249** | `app/api/public/config/route.ts` | HTTP handlers in app/api/public/config/route.ts | overlaps SHOP-072 |
| **250** | `app/api/public/credit-notes/[number]/pdf/route.ts` | HTTP handlers in app/api/public/credit-notes/[number]/pdf/route.ts | *(none)* |
| **251** | `app/api/public/documents/access/route.ts` | HTTP handlers in app/api/public/documents/access/route.ts | none (positive) |
| **252** | `app/api/public/downloads/[token]/route.ts` | HTTP handlers in app/api/public/downloads/[token]/route.ts | overlaps SHOP-029, SHOP-030 |
| **253** | `app/api/public/invoices/[number]/pdf/route.ts` | HTTP handlers in app/api/public/invoices/[number]/pdf/route.ts | none (positive rate limit) |
| **254** | `app/api/public/order-size-deduction/route.ts` | HTTP handlers in app/api/public/order-size-deduction/route.ts | *(none)* |
| **255** | `app/api/public/orders/[id]/live-delivery/route.ts` | HTTP handlers in app/api/public/orders/[id]/live-delivery/route.ts | *(none)* |
| **256** | `app/api/public/orders/notifications/route.ts` | HTTP handlers in app/api/public/orders/notifications/route.ts | *(none)* |
| **257** | `app/api/public/orders/receipt-access/route.ts` | HTTP handlers in app/api/public/orders/receipt-access/route.ts | *(none)* |
| **258** | `app/api/public/orders/status/route.ts` | HTTP handlers in app/api/public/orders/status/route.ts | *(none)* |
| **259** | `app/api/public/orders/track/route.ts` | HTTP handlers in app/api/public/orders/track/route.ts | none (positive) |
| **260** | `app/api/public/product-questions/route.ts` | HTTP handlers in app/api/public/product-questions/route.ts | overlaps SHOP-095 |
| **261** | `app/api/public/products/[slug]/related/route.ts` | HTTP handlers in app/api/public/products/[slug]/related/route.ts | *(none)* |
| **262** | `app/api/public/products/[slug]/route.ts` | HTTP handlers in app/api/public/products/[slug]/route.ts | *(none)* |
| **263** | `app/api/public/products/[slug]/upsells/route.ts` | HTTP handlers in app/api/public/products/[slug]/upsells/route.ts | *(none)* |
| **264** | `app/api/public/products/route.ts` | HTTP handlers in app/api/public/products/route.ts | overlaps SHOP-035 |
| **265** | `app/api/public/proformas/[number]/pdf/route.ts` | HTTP handlers in app/api/public/proformas/[number]/pdf/route.ts | *(none)* |
| **266** | `app/api/public/tags/route.ts` | HTTP handlers in app/api/public/tags/route.ts | *(none)* |
| **267** | `app/api/webhooks/paypal/route.ts` | HTTP handlers in app/api/webhooks/paypal/route.ts | overlaps SHOP-068 |
| **268** | `app/api/webhooks/stripe/route.ts` | HTTP handlers in app/api/webhooks/stripe/route.ts | overlaps SHOP-068 |
| **269** | `lib/db/addresses.ts` | DB layer addresses.ts | *(none)* |
| **270** | `lib/db/back-in-stock.ts` | DB layer back-in-stock.ts | *(none)* |
| **271** | `lib/db/catalogue.ts` | DB layer catalogue.ts | *(none)* |
| **272** | `lib/db/credit-notes.ts` | DB layer credit-notes.ts | *(none)* |
| **273** | `lib/db/digital.ts` | DB layer digital.ts | *(none)* |
| **274** | `lib/db/discounts.ts` | DB layer discounts.ts | *(none)* |
| **275** | `lib/db/guest-cart.ts` | DB layer guest-cart.ts | *(none)* |
| **276** | `lib/db/import-jobs.ts` | DB layer import-jobs.ts | *(none)* |
| **277** | `lib/db/invoices.ts` | DB layer invoices.ts | *(none)* |
| **278** | `lib/db/member-cart.ts` | DB layer member-cart.ts | *(none)* |
| **279** | `lib/db/order-access.ts` | DB layer order-access.ts | *(none)* |
| **280** | `lib/db/order-requests.ts` | DB layer order-requests.ts | *(none)* |
| **281** | `lib/db/orders.ts` | DB layer orders.ts | overlaps SHOP-096 |
| **282** | `lib/db/product-questions.ts` | DB layer product-questions.ts | *(none)* |
| **283** | `lib/db/products.ts` | DB layer products.ts | *(none)* |
| **284** | `lib/db/recommendations.ts` | DB layer recommendations.ts | *(none)* |
| **285** | `lib/db/refunds.ts` | DB layer refunds.ts | overlaps SHOP-020 (positive) |
| **286** | `lib/db/shipments.ts` | DB layer shipments.ts | *(none)* |
| **287** | `lib/db/slug-redirects.ts` | DB layer slug-redirects.ts | *(none)* |
| **288** | `lib/db/stock-movements.ts` | DB layer stock-movements.ts | *(none)* |
| **289** | `lib/db/suppliers.ts` | DB layer suppliers.ts | *(none)* |
| **290** | `lib/db/tax-shipping.ts` | DB layer tax-shipping.ts | *(none)* |
| **291** | `lib/access.ts` | Lib access.ts | overlaps SHOP-098 (positive) |
| **292** | `lib/admin-codes.ts` | Lib admin-codes.ts | *(none)* |
| **293** | `lib/admin-edit.ts` | Lib admin-edit.ts | *(none)* |
| **294** | `lib/admin-nav.ts` | Lib admin-nav.ts | *(none)* |
| **295** | `lib/admin-returns.ts` | Lib admin-returns.ts | *(none)* |
| **296** | `lib/admin-stock.ts` | Lib admin-stock.ts | *(none)* |
| **297** | `lib/admin/tab-url.ts` | Lib admin/tab-url.ts | *(none)* |
| **298** | `lib/back-in-stock-trigger.ts` | Lib back-in-stock-trigger.ts | overlaps SHOP-022 |
| **299** | `lib/breakpoints-shared.ts` | Lib breakpoints-shared.ts | *(none)* |
| **300** | `lib/breakpoints.ts` | Lib breakpoints.ts | *(none)* |
| **301** | `lib/card-image-order.ts` | Lib card-image-order.ts | *(none)* |
| **302** | `lib/card-media-pack.ts` | Lib card-media-pack.ts | *(none)* |
| **303** | `lib/card-media.ts` | Lib card-media.ts | *(none)* |
| **304** | `lib/card-price.ts` | Lib card-price.ts | *(none)* |
| **305** | `lib/cart-basket-totals.ts` | Lib cart-basket-totals.ts | *(none)* |
| **306** | `lib/cart-group.ts` | Lib cart-group.ts | *(none)* |
| **307** | `lib/cart-header-actions.ts` | Lib cart-header-actions.ts | *(none)* |
| **308** | `lib/cart-summary.ts` | Lib cart-summary.ts | *(none)* |
| **309** | `lib/catalogue-social-image.ts` | Lib catalogue-social-image.ts | *(none)* |
| **310** | `lib/category-description.ts` | Lib category-description.ts | *(none)* |
| **311** | `lib/checkout-address-lookup.ts` | Lib checkout-address-lookup.ts | *(none)* |
| **312** | `lib/checkout-contact-extras.ts` | Lib checkout-contact-extras.ts | *(none)* |
| **313** | `lib/checkout-draft.ts` | Lib checkout-draft.ts | *(none)* |
| **314** | `lib/checkout-payment-fields.ts` | Lib checkout-payment-fields.ts | *(none)* |
| **315** | `lib/checkout-wallet-buttons.ts` | Lib checkout-wallet-buttons.ts | *(none)* |
| **316** | `lib/checkout.ts` | Lib checkout.ts | overlaps SHOP-045, SHOP-051 |
| **317** | `lib/collection-description.ts` | Lib collection-description.ts | *(none)* |
| **318** | `lib/collection-index-sources-shared.ts` | Lib collection-index-sources-shared.ts | *(none)* |
| **319** | `lib/collection-index-sources.ts` | Lib collection-index-sources.ts | *(none)* |
| **320** | `lib/commerce-mode-shared.ts` | Lib commerce-mode-shared.ts | *(none)* |
| **321** | `lib/commerce-mode.ts` | Lib commerce-mode.ts | *(none)* |
| **322** | `lib/compact-id.ts` | Lib compact-id.ts | *(none)* |
| **323** | `lib/config.ts` | Lib config.ts | *(none)* |
| **324** | `lib/contrast.ts` | Lib contrast.ts | *(none)* |
| **325** | `lib/courier-faqs.ts` | Lib courier-faqs.ts | *(none)* |
| **326** | `lib/credit-note-number.ts` | Lib credit-note-number.ts | *(none)* |
| **327** | `lib/credit-note-tax.ts` | Lib credit-note-tax.ts | *(none)* |
| **328** | `lib/credit-notes.ts` | Lib credit-notes.ts | *(none)* |
| **329** | `lib/csv-rows.ts` | Lib csv-rows.ts | overlaps SHOP-101 |
| **330** | `lib/csv.ts` | Lib csv.ts | *(none)* |
| **331** | `lib/customer-billing.ts` | Lib customer-billing.ts | *(none)* |
| **332** | `lib/customer-reference.ts` | Lib customer-reference.ts | *(none)* |
| **333** | `lib/db.ts` | Lib db.ts | *(none)* |
| **334** | `lib/delivery-instructions.ts` | Lib delivery-instructions.ts | *(none)* |
| **335** | `lib/delivery-slot-email.ts` | Lib delivery-slot-email.ts | *(none)* |
| **336** | `lib/delivery-slot.ts` | Lib delivery-slot.ts | *(none)* |
| **337** | `lib/detail-delivery.ts` | Lib detail-delivery.ts | *(none)* |
| **338** | `lib/detail-images.ts` | Lib detail-images.ts | *(none)* |
| **339** | `lib/detail-rating.ts` | Lib detail-rating.ts | *(none)* |
| **340** | `lib/detail-slot.ts` | Lib detail-slot.ts | *(none)* |
| **341** | `lib/detail-spec.ts` | Lib detail-spec.ts | *(none)* |
| **342** | `lib/detail-tabs.ts` | Lib detail-tabs.ts | *(none)* |
| **343** | `lib/document-access.ts` | Lib document-access.ts | *(none)* |
| **344** | `lib/document-print-token.ts` | Lib document-print-token.ts | *(none)* |
| **345** | `lib/download-name.ts` | Lib download-name.ts | *(none)* |
| **346** | `lib/email-templates.ts` | Lib email-templates.ts | *(none)* |
| **347** | `lib/email.ts` | Lib email.ts | *(none)* |
| **348** | `lib/env.ts` | Lib env.ts | *(none)* |
| **349** | `lib/excluded-postcode.ts` | Lib excluded-postcode.ts | *(none)* |
| **350** | `lib/faq-render.ts` | Lib faq-render.ts | *(none)* |
| **351** | `lib/faq.ts` | Lib faq.ts | *(none)* |
| **352** | `lib/gallery-media.ts` | Lib gallery-media.ts | *(none)* |
| **353** | `lib/grid-page-types.ts` | Lib grid-page-types.ts | *(none)* |
| **354** | `lib/grid-page.ts` | Lib grid-page.ts | *(none)* |
| **355** | `lib/grid-window.ts` | Lib grid-window.ts | *(none)* |
| **356** | `lib/guest-cart-cookie.ts` | Lib guest-cart-cookie.ts | *(none)* |
| **357** | `lib/guest-order-access.ts` | Lib guest-order-access.ts | *(none)* |
| **358** | `lib/head.ts` | Lib head.ts | *(none)* |
| **359** | `lib/hold-scroll-position.ts` | Lib hold-scroll-position.ts | *(none)* |
| **360** | `lib/import-engine.ts` | Lib import-engine.ts | overlaps SHOP-007 |
| **361** | `lib/inject-category-context.ts` | Lib inject-category-context.ts | *(none)* |
| **362** | `lib/inject-collection-context.ts` | Lib inject-collection-context.ts | *(none)* |
| **363** | `lib/inject-embed-context.ts` | Lib inject-embed-context.ts | *(none)* |
| **364** | `lib/inject-part-context.ts` | Lib inject-part-context.ts | *(none)* |
| **365** | `lib/inject-product-context.ts` | Lib inject-product-context.ts | *(none)* |
| **366** | `lib/inject-supplier-context.ts` | Lib inject-supplier-context.ts | *(none)* |
| **367** | `lib/inject-tag-context.ts` | Lib inject-tag-context.ts | *(none)* |
| **368** | `lib/invoice-attachment.ts` | Lib invoice-attachment.ts | *(none)* |
| **369** | `lib/invoice-doc-context.ts` | Lib invoice-doc-context.ts | *(none)* |
| **370** | `lib/invoice-net-of-refunds.ts` | Lib invoice-net-of-refunds.ts | *(none)* |
| **371** | `lib/invoice-number.ts` | Lib invoice-number.ts | *(none)* |
| **372** | `lib/invoice-pdf.ts` | Lib invoice-pdf.ts | *(none)* |
| **373** | `lib/invoice-reissue.ts` | Lib invoice-reissue.ts | *(none)* |
| **374** | `lib/invoice-sinks.ts` | Lib invoice-sinks.ts | *(none)* |
| **375** | `lib/invoice-tax.ts` | Lib invoice-tax.ts | *(none)* |
| **376** | `lib/invoice-token.ts` | Lib invoice-token.ts | *(none)* |
| **377** | `lib/invoices.ts` | Lib invoices.ts | *(none)* |
| **378** | `lib/line-meta.ts` | Lib line-meta.ts | *(none)* |
| **379** | `lib/listability.ts` | Lib listability.ts | *(none)* |
| **380** | `lib/media-reference-detacher.ts` | Lib media-reference-detacher.ts | *(none)* |
| **381** | `lib/media-reference-rewriter.ts` | Lib media-reference-rewriter.ts | *(none)* |
| **382** | `lib/media-usage-provider.ts` | Lib media-usage-provider.ts | *(none)* |
| **383** | `lib/media/category-media.ts` | Lib media/category-media.ts | *(none)* |
| **384** | `lib/media/listing-folders.ts` | Lib media/listing-folders.ts | *(none)* |
| **385** | `lib/media/product-media.ts` | Lib media/product-media.ts | *(none)* |
| **386** | `lib/media/refile.ts` | Lib media/refile.ts | *(none)* |
| **387** | `lib/member-account-nav.ts` | Lib member-account-nav.ts | *(none)* |
| **388** | `lib/member-order-panels.ts` | Lib member-order-panels.ts | *(none)* |
| **389** | `lib/member-orders.ts` | Lib member-orders.ts | *(none)* |
| **390** | `lib/menu-entity-provider.ts` | Lib menu-entity-provider.ts | *(none)* |
| **391** | `lib/merchant-facts.ts` | Lib merchant-facts.ts | *(none)* |
| **392** | `lib/min-order.ts` | Lib min-order.ts | *(none)* |
| **393** | `lib/money.ts` | Lib money.ts | *(none)* |
| **394** | `lib/order-address-book.ts` | Lib order-address-book.ts | *(none)* |
| **395** | `lib/order-auto-complete.ts` | Lib order-auto-complete.ts | *(none)* |
| **396** | `lib/order-delivery.ts` | Lib order-delivery.ts | *(none)* |
| **397** | `lib/order-display.ts` | Lib order-display.ts | *(none)* |
| **398** | `lib/order-filters.ts` | Lib order-filters.ts | *(none)* |
| **399** | `lib/order-fulfillment.ts` | Lib order-fulfillment.ts | overlaps SHOP-001, SHOP-006 (positive baseline) |
| **400** | `lib/order-items-email.ts` | Lib order-items-email.ts | *(none)* |
| **401** | `lib/order-link-intent.ts` | Lib order-link-intent.ts | *(none)* |
| **402** | `lib/order-lookup.ts` | Lib order-lookup.ts | *(none)* |
| **403** | `lib/order-notify.ts` | Lib order-notify.ts | *(none)* |
| **404** | `lib/order-number.ts` | Lib order-number.ts | *(none)* |
| **405** | `lib/order-paid-hooks.ts` | Lib order-paid-hooks.ts | *(none)* |
| **406** | `lib/order-pay-online.ts` | Lib order-pay-online.ts | *(none)* |
| **407** | `lib/order-payment-state.ts` | Lib order-payment-state.ts | *(none)* |
| **408** | `lib/order-placed-email.ts` | Lib order-placed-email.ts | *(none)* |
| **409** | `lib/order-progress.ts` | Lib order-progress.ts | *(none)* |
| **410** | `lib/order-receipt-challenge.ts` | Lib order-receipt-challenge.ts | *(none)* |
| **411** | `lib/order-receipt-token.ts` | Lib order-receipt-token.ts | *(none)* |
| **412** | `lib/order-request-actions.ts` | Lib order-request-actions.ts | *(none)* |
| **413** | `lib/order-requests.ts` | Lib order-requests.ts | *(none)* |
| **414** | `lib/order-route-access.ts` | Lib order-route-access.ts | *(none)* |
| **415** | `lib/order-size-deduction-view.ts` | Lib order-size-deduction-view.ts | *(none)* |
| **416** | `lib/order-size-deduction.ts` | Lib order-size-deduction.ts | *(none)* |
| **417** | `lib/order-status.ts` | Lib order-status.ts | *(none)* |
| **418** | `lib/order-tracking.ts` | Lib order-tracking.ts | *(none)* |
| **419** | `lib/order-viewer.ts` | Lib order-viewer.ts | *(none)* |
| **420** | `lib/page-href.ts` | Lib page-href.ts | *(none)* |
| **421** | `lib/payment-instructions.ts` | Lib payment-instructions.ts | *(none)* |
| **422** | `lib/payments/admin-methods.ts` | Lib payments/admin-methods.ts | *(none)* |
| **423** | `lib/payments/bank-transfer.ts` | Lib payments/bank-transfer.ts | *(none)* |
| **424** | `lib/payments/cash.ts` | Lib payments/cash.ts | *(none)* |
| **425** | `lib/payments/logos.ts` | Lib payments/logos.ts | *(none)* |
| **426** | `lib/payments/order-value-limits.ts` | Lib payments/order-value-limits.ts | *(none)* |
| **427** | `lib/payments/paypal.ts` | Lib payments/paypal.ts | *(none)* |
| **428** | `lib/payments/provider.ts` | Lib payments/provider.ts | *(none)* |
| **429** | `lib/payments/refund-notice.ts` | Lib payments/refund-notice.ts | *(none)* |
| **430** | `lib/payments/registry.ts` | Lib payments/registry.ts | *(none)* |
| **431** | `lib/payments/stripe.ts` | Lib payments/stripe.ts | *(none)* |
| **432** | `lib/phone.ts` | Lib phone.ts | *(none)* |
| **433** | `lib/popularity.ts` | Lib popularity.ts | *(none)* |
| **434** | `lib/postcode-patterns.ts` | Lib postcode-patterns.ts | *(none)* |
| **435** | `lib/pricing.ts` | Lib pricing.ts | *(none)* |
| **436** | `lib/product-canonical.ts` | Lib product-canonical.ts | *(none)* |
| **437** | `lib/product-field-providers.ts` | Lib product-field-providers.ts | *(none)* |
| **438** | `lib/product-jsonld.ts` | Lib product-jsonld.ts | *(none)* |
| **439** | `lib/product-page-gate.ts` | Lib product-page-gate.ts | *(none)* |
| **440** | `lib/product-page-params.ts` | Lib product-page-params.ts | *(none)* |
| **441** | `lib/product-page-resolver.ts` | Lib product-page-resolver.ts | *(none)* |
| **442** | `lib/product-question-emails.ts` | Lib product-question-emails.ts | *(none)* |
| **443** | `lib/product-question-notify.ts` | Lib product-question-notify.ts | *(none)* |
| **444** | `lib/product-sale.ts` | Lib product-sale.ts | *(none)* |
| **445** | `lib/product-saved.ts` | Lib product-saved.ts | *(none)* |
| **446** | `lib/product-search.ts` | Lib product-search.ts | *(none)* |
| **447** | `lib/product-selected-variation.ts` | Lib product-selected-variation.ts | *(none)* |
| **448** | `lib/product-slug-redirect.ts` | Lib product-slug-redirect.ts | *(none)* |
| **449** | `lib/product-social-image.ts` | Lib product-social-image.ts | *(none)* |
| **450** | `lib/product-url-server.ts` | Lib product-url-server.ts | *(none)* |
| **451** | `lib/product-url.ts` | Lib product-url.ts | *(none)* |
| **452** | `lib/proforma-pdf.ts` | Lib proforma-pdf.ts | *(none)* |
| **453** | `lib/proforma.ts` | Lib proforma.ts | *(none)* |
| **454** | `lib/public-config-client.ts` | Lib public-config-client.ts | *(none)* |
| **455** | `lib/public-product-gate.ts` | Lib public-product-gate.ts | *(none)* |
| **456** | `lib/rate-limit.ts` | Lib rate-limit.ts | overlaps SHOP-004 |
| **457** | `lib/receipt-access-cookie.ts` | Lib receipt-access-cookie.ts | *(none)* |
| **458** | `lib/replacement-emails.ts` | Lib replacement-emails.ts | *(none)* |
| **459** | `lib/replacements.ts` | Lib replacements.ts | SHOP-106, SHOP-107 |
| **460** | `lib/return-charge.ts` | Lib return-charge.ts | *(none)* |
| **461** | `lib/returnable.ts` | Lib returnable.ts | *(none)* |
| **462** | `lib/robots.ts` | Lib robots.ts | *(none)* |
| **463** | `lib/root-slug.ts` | Lib root-slug.ts | *(none)* |
| **464** | `lib/shipment-email.ts` | Lib shipment-email.ts | *(none)* |
| **465** | `lib/signed-list-cookie.ts` | Lib signed-list-cookie.ts | *(none)* |
| **466** | `lib/sitemap.ts` | Lib sitemap.ts | *(none)* |
| **467** | `lib/slug.ts` | Lib slug.ts | overlaps SHOP-086 |
| **468** | `lib/sms-templates.ts` | Lib sms-templates.ts | *(none)* |
| **469** | `lib/starterLayouts.ts` | Lib starterLayouts.ts | *(none)* |
| **470** | `lib/stock-visibility.ts` | Lib stock-visibility.ts | *(none)* |
| **471** | `lib/stock.ts` | Lib stock.ts | *(none)* |
| **472** | `lib/stranded-payments.ts` | Lib stranded-payments.ts | *(none)* |
| **473** | `lib/strip-css-comments.ts` | Lib strip-css-comments.ts | *(none)* |
| **474** | `lib/strip-html.ts` | Lib strip-html.ts | *(none)* |
| **475** | `lib/supplier-description.ts` | Lib supplier-description.ts | *(none)* |
| **476** | `lib/supplier-schema.ts` | Lib supplier-schema.ts | *(none)* |
| **477** | `lib/supplier-url.ts` | Lib supplier-url.ts | *(none)* |
| **478** | `lib/tag-badges.ts` | Lib tag-badges.ts | *(none)* |
| **479** | `lib/tax-display-shared.ts` | Lib tax-display-shared.ts | *(none)* |
| **480** | `lib/tax-display.ts` | Lib tax-display.ts | *(none)* |
| **481** | `lib/tax-view-client.ts` | Lib tax-view-client.ts | *(none)* |
| **482** | `lib/tax-view-shared.ts` | Lib tax-view-shared.ts | *(none)* |
| **483** | `lib/thumb-backfill.ts` | Lib thumb-backfill.ts | *(none)* |
| **484** | `lib/thumb-renditions.ts` | Lib thumb-renditions.ts | *(none)* |
| **485** | `lib/tracking-added-email.ts` | Lib tracking-added-email.ts | *(none)* |
| **486** | `lib/tracking-url.ts` | Lib tracking-url.ts | *(none)* |
| **487** | `lib/tracking/courier-clock.ts` | Lib tracking/courier-clock.ts | *(none)* |
| **488** | `lib/tracking/dpd-session.ts` | Lib tracking/dpd-session.ts | *(none)* |
| **489** | `lib/tracking/dpd.ts` | Lib tracking/dpd.ts | *(none)* |
| **490** | `lib/tracking/gfs.ts` | Lib tracking/gfs.ts | *(none)* |
| **491** | `lib/tracking/html-text.ts` | Lib tracking/html-text.ts | *(none)* |
| **492** | `lib/tracking/live-delivery.ts` | Lib tracking/live-delivery.ts | *(none)* |
| **493** | `lib/tracking/live-line.ts` | Lib tracking/live-line.ts | *(none)* |
| **494** | `lib/tracking/multidrop-page.ts` | Lib tracking/multidrop-page.ts | *(none)* |
| **495** | `lib/tracking/multidrop-position.ts` | Lib tracking/multidrop-position.ts | *(none)* |
| **496** | `lib/tracking/multidrop.ts` | Lib tracking/multidrop.ts | *(none)* |
| **497** | `lib/tracking/position-cache.ts` | Lib tracking/position-cache.ts | *(none)* |
| **498** | `lib/tracking/read-parcel.ts` | Lib tracking/read-parcel.ts | *(none)* |
| **499** | `lib/tracking/reading.ts` | Lib tracking/reading.ts | *(none)* |
| **500** | `lib/tracking/signature-capture.ts` | Lib tracking/signature-capture.ts | *(none)* |
| **501** | `lib/tracking/stage-meaning.ts` | Lib tracking/stage-meaning.ts | *(none)* |
| **502** | `lib/tracking/store-reading.ts` | Lib tracking/store-reading.ts | *(none)* |
| **503** | `lib/types.ts` | Lib types.ts | *(none)* |
| **504** | `lib/unsubscribe-token.ts` | Lib unsubscribe-token.ts | *(none)* |
| **505** | `components/admin/BackInStockScreen.tsx` | Component BackInStockScreen.tsx | *(none)* |
| **506** | `components/admin/CategoriesScreen.tsx` | Component CategoriesScreen.tsx | *(none)* |
| **507** | `components/admin/CollectionProductsPanel.tsx` | Component CollectionProductsPanel.tsx | *(none)* |
| **508** | `components/admin/CollectionsScreen.tsx` | Component CollectionsScreen.tsx | *(none)* |
| **509** | `components/admin/CourierSettings.tsx` | Component CourierSettings.tsx | *(none)* |
| **510** | `components/admin/CourierSettingsPanel.tsx` | Component CourierSettingsPanel.tsx | *(none)* |
| **511** | `components/admin/CustomerDetailScreen.tsx` | Component CustomerDetailScreen.tsx | *(none)* |
| **512** | `components/admin/CustomersScreen.tsx` | Component CustomersScreen.tsx | *(none)* |
| **513** | `components/admin/DiscountsScreen.tsx` | Component DiscountsScreen.tsx | *(none)* |
| **514** | `components/admin/DispatchModal.tsx` | Component DispatchModal.tsx | *(none)* |
| **515** | `components/admin/EditParcelModal.tsx` | Component EditParcelModal.tsx | *(none)* |
| **516** | `components/admin/EmailCustomerModal.tsx` | Component EmailCustomerModal.tsx | *(none)* |
| **517** | `components/admin/ExportColumnsModal.tsx` | Component ExportColumnsModal.tsx | *(none)* |
| **518** | `components/admin/FaqListEditor.tsx` | Component FaqListEditor.tsx | *(none)* |
| **519** | `components/admin/ImportModal.tsx` | Component ImportModal.tsx | *(none)* |
| **520** | `components/admin/MediaPickerModal.tsx` | Component MediaPickerModal.tsx | *(none)* |
| **521** | `components/admin/OrderDetailScreen.tsx` | Component OrderDetailScreen.tsx | *(none)* |
| **522** | `components/admin/OrdersScreen.tsx` | Component OrdersScreen.tsx | *(none)* |
| **523** | `components/admin/ParcelDetailsFields.tsx` | Component ParcelDetailsFields.tsx | *(none)* |
| **524** | `components/admin/PaymentsSettings.tsx` | Component PaymentsSettings.tsx | *(none)* |
| **525** | `components/admin/ProductEditor.tsx` | Component ProductEditor.tsx | *(none)* |
| **526** | `components/admin/ProductPicker.tsx` | Component ProductPicker.tsx | *(none)* |
| **527** | `components/admin/ProductQuestionsScreen.tsx` | Component ProductQuestionsScreen.tsx | *(none)* |
| **528** | `components/admin/ProductsScreen.tsx` | Component ProductsScreen.tsx | *(none)* |
| **529** | `components/admin/RefundModal.tsx` | Component RefundModal.tsx | *(none)* |
| **530** | `components/admin/ReplacementModal.tsx` | Component ReplacementModal.tsx | *(none)* |
| **531** | `components/admin/ReportsScreen.tsx` | Component ReportsScreen.tsx | *(none)* |
| **532** | `components/admin/RequestsScreen.tsx` | Component RequestsScreen.tsx | *(none)* |
| **533** | `components/admin/ShopDashboardWidget.tsx` | Component ShopDashboardWidget.tsx | *(none)* |
| **534** | `components/admin/ShopSectionNav.tsx` | Component ShopSectionNav.tsx | *(none)* |
| **535** | `components/admin/ShopSettingsTab.tsx` | Component ShopSettingsTab.tsx | *(none)* |
| **536** | `components/admin/SuppliersScreen.tsx` | Component SuppliersScreen.tsx | *(none)* |
| **537** | `components/admin/TagsScreen.tsx` | Component TagsScreen.tsx | *(none)* |
| **538** | `components/admin/TaxShippingScreen.tsx` | Component TaxShippingScreen.tsx | *(none)* |
| **539** | `components/admin/categories/StandaloneCategoryDescriptionEditor.tsx` | Component StandaloneCategoryDescriptionEditor.tsx | *(none)* |
| **540** | `components/admin/collections/StandaloneCollectionDescriptionEditor.tsx` | Component StandaloneCollectionDescriptionEditor.tsx | *(none)* |
| **541** | `components/admin/description-builder/StandaloneDescriptionBuilder.tsx` | Component StandaloneDescriptionBuilder.tsx | *(none)* |
| **542** | `components/admin/dialogs.tsx` | Component dialogs.tsx | *(none)* |
| **543** | `components/admin/product-editor/StandaloneDescriptionEditor.tsx` | Component StandaloneDescriptionEditor.tsx | *(none)* |
| **544** | `components/admin/product-editor/context.tsx` | Component context.tsx | *(none)* |
| **545** | `components/admin/product-editor/fields.tsx` | Component fields.tsx | *(none)* |
| **546** | `components/admin/product-editor/gallery-extras.tsx` | Component gallery-extras.tsx | *(none)* |
| **547** | `components/admin/product-editor/panels/details.tsx` | Component details.tsx | *(none)* |
| **548** | `components/admin/product-editor/panels/digital.tsx` | Component digital.tsx | *(none)* |
| **549** | `components/admin/product-editor/panels/faq.tsx` | Component faq.tsx | *(none)* |
| **550** | `components/admin/product-editor/panels/media.tsx` | Component media.tsx | *(none)* |
| **551** | `components/admin/product-editor/panels/organisation.tsx` | Component organisation.tsx | *(none)* |
| **552** | `components/admin/product-editor/panels/pricing.tsx` | Component pricing.tsx | *(none)* |
| **553** | `components/admin/product-editor/panels/recommendations.tsx` | Component recommendations.tsx | *(none)* |
| **554** | `components/admin/product-editor/panels/seo.tsx` | Component seo.tsx | *(none)* |
| **555** | `components/admin/product-editor/panels/stock.tsx` | Component stock.tsx | *(none)* |
| **556** | `components/admin/suppliers/StandaloneSupplierDescriptionEditor.tsx` | Component StandaloneSupplierDescriptionEditor.tsx | *(none)* |
| **557** | `components/public/AddToCartButton.tsx` | Component AddToCartButton.tsx | *(none)* |
| **558** | `components/public/AddressesClient.tsx` | Component AddressesClient.tsx | *(none)* |
| **559** | `components/public/AskProductQuestion.tsx` | Component AskProductQuestion.tsx | *(none)* |
| **560** | `components/public/BackInStockClient.tsx` | Component BackInStockClient.tsx | *(none)* |
| **561** | `components/public/BuyAgainButton.tsx` | Component BuyAgainButton.tsx | *(none)* |
| **562** | `components/public/CartChrome.tsx` | Component CartChrome.tsx | *(none)* |
| **563** | `components/public/CartDeductionNote.tsx` | Component CartDeductionNote.tsx | *(none)* |
| **564** | `components/public/CartDrawerClient.tsx` | Component CartDrawerClient.tsx | *(none)* |
| **565** | `components/public/CartFullClient.tsx` | Component CartFullClient.tsx | *(none)* |
| **566** | `components/public/CartLineControlView.tsx` | Component CartLineControlView.tsx | *(none)* |
| **567** | `components/public/CartMobileBarItem.tsx` | Component CartMobileBarItem.tsx | *(none)* |
| **568** | `components/public/CartNotes.tsx` | Component CartNotes.tsx | *(none)* |
| **569** | `components/public/CartPageClient.tsx` | Component CartPageClient.tsx | *(none)* |
| **570** | `components/public/CartSummaryClient.tsx` | Component CartSummaryClient.tsx | *(none)* |
| **571** | `components/public/CheckoutContactClient.tsx` | Component CheckoutContactClient.tsx | *(none)* |
| **572** | `components/public/CheckoutItemsClient.tsx` | Component CheckoutItemsClient.tsx | *(none)* |
| **573** | `components/public/CheckoutPaymentClient.tsx` | Component CheckoutPaymentClient.tsx | *(none)* |
| **574** | `components/public/CheckoutReviewClient.tsx` | Component CheckoutReviewClient.tsx | *(none)* |
| **575** | `components/public/CheckoutShippingClient.tsx` | Component CheckoutShippingClient.tsx | *(none)* |
| **576** | `components/public/CourierFaqModal.tsx` | Component CourierFaqModal.tsx | *(none)* |
| **577** | `components/public/DeliveryLiveMap.tsx` | Component DeliveryLiveMap.tsx | *(none)* |
| **578** | `components/public/DeliveryVanDot.tsx` | Component DeliveryVanDot.tsx | *(none)* |
| **579** | `components/public/DocumentAccessGate.tsx` | Component DocumentAccessGate.tsx | *(none)* |
| **580** | `components/public/FaqAccordion.tsx` | Component FaqAccordion.tsx | *(none)* |
| **581** | `components/public/GalleryThumbStrip.tsx` | Component GalleryThumbStrip.tsx | *(none)* |
| **582** | `components/public/GalleryViewportFit.tsx` | Component GalleryViewportFit.tsx | *(none)* |
| **583** | `components/public/GuestOrderAccountOffer.tsx` | Component GuestOrderAccountOffer.tsx | *(none)* |
| **584** | `components/public/HandoverDarkModeNotice.tsx` | Component HandoverDarkModeNotice.tsx | *(none)* |
| **585** | `components/public/OrderAccessForm.tsx` | Component OrderAccessForm.tsx | *(none)* |
| **586** | `components/public/OrderAccessGate.tsx` | Component OrderAccessGate.tsx | *(none)* |
| **587** | `components/public/OrderBillingPanel.tsx` | Component OrderBillingPanel.tsx | *(none)* |
| **588** | `components/public/OrderConfirmationClient.tsx` | Component OrderConfirmationClient.tsx | *(none)* |
| **589** | `components/public/OrderDetailChrome.tsx` | Component OrderDetailChrome.tsx | *(none)* |
| **590** | `components/public/OrderDocuments.tsx` | Component OrderDocuments.tsx | *(none)* |
| **591** | `components/public/OrderItemList.tsx` | Component OrderItemList.tsx | *(none)* |
| **592** | `components/public/OrderLookupClient.tsx` | Component OrderLookupClient.tsx | *(none)* |
| **593** | `components/public/OrderPayOnlinePanel.tsx` | Component OrderPayOnlinePanel.tsx | *(none)* |
| **594** | `components/public/OrderProgressRail.tsx` | Component OrderProgressRail.tsx | *(none)* |
| **595** | `components/public/OrderReferencePanel.tsx` | Component OrderReferencePanel.tsx | *(none)* |
| **596** | `components/public/OrderRequestPanel.tsx` | Component OrderRequestPanel.tsx | *(none)* |
| **597** | `components/public/OrderSizeDeductionClient.tsx` | Component OrderSizeDeductionClient.tsx | *(none)* |
| **598** | `components/public/OrderSummaryCard.tsx` | Component OrderSummaryCard.tsx | *(none)* |
| **599** | `components/public/OrdersFilterList.tsx` | Component OrdersFilterList.tsx | *(none)* |
| **600** | `components/public/ParcelTracking.tsx` | Component ParcelTracking.tsx | *(none)* |
| **601** | `components/public/PaymentMethodLogo.tsx` | Component PaymentMethodLogo.tsx | *(none)* |
| **602** | `components/public/PrintButton.tsx` | Component PrintButton.tsx | *(none)* |
| **603** | `components/public/ProductDetailIslands.tsx` | Component ProductDetailIslands.tsx | *(none)* |
| **604** | `components/public/ProductFaqSearch.test.tsx` | Component ProductFaqSearch.test.tsx | *(none)* |
| **605** | `components/public/ProductFaqSearch.tsx` | Component ProductFaqSearch.tsx | *(none)* |
| **606** | `components/public/ShopAccountSection.tsx` | Component ShopAccountSection.tsx | *(none)* |
| **607** | `components/public/ShopAddressesSection.tsx` | Component ShopAddressesSection.tsx | *(none)* |
| **608** | `components/public/ShopCardFillBlurb.tsx` | Component ShopCardFillBlurb.tsx | *(none)* |
| **609** | `components/public/ShopCardMedia.tsx` | Component ShopCardMedia.tsx | *(none)* |
| **610** | `components/public/ShopCategoryCards.tsx` | Component ShopCategoryCards.tsx | *(none)* |
| **611** | `components/public/ShopCategoryDescriptionBody.tsx` | Component ShopCategoryDescriptionBody.tsx | *(none)* |
| **612** | `components/public/ShopCategoryDescriptionFold.test.tsx` | Component ShopCategoryDescriptionFold.test.tsx | *(none)* |
| **613** | `components/public/ShopCategoryDescriptionFold.tsx` | Component ShopCategoryDescriptionFold.tsx | *(none)* |
| **614** | `components/public/ShopCategoryPills.tsx` | Component ShopCategoryPills.tsx | *(none)* |
| **615** | `components/public/ShopCategoryPillsScroller.test.tsx` | Component ShopCategoryPillsScroller.test.tsx | *(none)* |
| **616** | `components/public/ShopCategoryPillsScroller.tsx` | Component ShopCategoryPillsScroller.tsx | *(none)* |
| **617** | `components/public/ShopClosedNotice.tsx` | Component ShopClosedNotice.tsx | *(none)* |
| **618** | `components/public/ShopCollectionCards.tsx` | Component ShopCollectionCards.tsx | *(none)* |
| **619** | `components/public/ShopCollectionDescriptionBody.tsx` | Component ShopCollectionDescriptionBody.tsx | *(none)* |
| **620** | `components/public/ShopDesignedDescriptionBody.test.tsx` | Component ShopDesignedDescriptionBody.test.tsx | *(none)* |
| **621** | `components/public/ShopDesignedDescriptionBody.tsx` | Component ShopDesignedDescriptionBody.tsx | *(none)* |
| **622** | `components/public/ShopGridPager.tsx` | Component ShopGridPager.tsx | *(none)* |
| **623** | `components/public/ShopLayoutPicker.tsx` | Component ShopLayoutPicker.tsx | *(none)* |
| **624** | `components/public/ShopOrdersSection.tsx` | Component ShopOrdersSection.tsx | *(none)* |
| **625** | `components/public/ShopSupplierDescriptionBody.tsx` | Component ShopSupplierDescriptionBody.tsx | *(none)* |
| **626** | `components/public/StickyStripHeight.tsx` | Component StickyStripHeight.tsx | *(none)* |
| **627** | `components/public/TaxViewText.tsx` | Component TaxViewText.tsx | *(none)* |
| **628** | `components/public/TaxViewToggle.tsx` | Component TaxViewToggle.tsx | *(none)* |
| **629** | `components/public/UpsellClient.tsx` | Component UpsellClient.tsx | *(none)* |
| **630** | `components/public/WithdrawRequestButton.tsx` | Component WithdrawRequestButton.tsx | *(none)* |
| **631** | `components/puck/ShopBackInStockForm.tsx` | Component ShopBackInStockForm.tsx | *(none)* |
| **632** | `components/puck/ShopCartFull.tsx` | Component ShopCartFull.tsx | *(none)* |
| **633** | `components/puck/ShopCartItems.tsx` | Component ShopCartItems.tsx | *(none)* |
| **634** | `components/puck/ShopCartSummary.rsc.tsx` | Component ShopCartSummary.rsc.tsx | *(none)* |
| **635** | `components/puck/ShopCartSummary.tsx` | Component ShopCartSummary.tsx | *(none)* |
| **636** | `components/puck/ShopCartTotals.tsx` | Component ShopCartTotals.tsx | *(none)* |
| **637** | `components/puck/ShopCategoryBrowser.rsc.tsx` | Component ShopCategoryBrowser.rsc.tsx | *(none)* |
| **638** | `components/puck/ShopCategoryBrowser.tsx` | Component ShopCategoryBrowser.tsx | *(none)* |
| **639** | `components/puck/ShopCategoryDescription.rsc.tsx` | Component ShopCategoryDescription.rsc.tsx | *(none)* |
| **640** | `components/puck/ShopCategoryDescription.tsx` | Component ShopCategoryDescription.tsx | *(none)* |
| **641** | `components/puck/ShopCategoryFaqs.rsc.tsx` | Component ShopCategoryFaqs.rsc.tsx | *(none)* |
| **642** | `components/puck/ShopCategoryFaqs.tsx` | Component ShopCategoryFaqs.tsx | *(none)* |
| **643** | `components/puck/ShopCategoryHeader.rsc.tsx` | Component ShopCategoryHeader.rsc.tsx | *(none)* |
| **644** | `components/puck/ShopCategoryHeader.tsx` | Component ShopCategoryHeader.tsx | *(none)* |
| **645** | `components/puck/ShopCheckoutContact.rsc.tsx` | Component ShopCheckoutContact.rsc.tsx | *(none)* |
| **646** | `components/puck/ShopCheckoutContact.tsx` | Component ShopCheckoutContact.tsx | *(none)* |
| **647** | `components/puck/ShopCheckoutItems.tsx` | Component ShopCheckoutItems.tsx | *(none)* |
| **648** | `components/puck/ShopCheckoutPayment.rsc.tsx` | Component ShopCheckoutPayment.rsc.tsx | *(none)* |
| **649** | `components/puck/ShopCheckoutPayment.tsx` | Component ShopCheckoutPayment.tsx | *(none)* |
| **650** | `components/puck/ShopCheckoutReview.rsc.tsx` | Component ShopCheckoutReview.rsc.tsx | *(none)* |
| **651** | `components/puck/ShopCheckoutReview.tsx` | Component ShopCheckoutReview.tsx | *(none)* |
| **652** | `components/puck/ShopCheckoutShipping.rsc.tsx` | Component ShopCheckoutShipping.rsc.tsx | *(none)* |
| **653** | `components/puck/ShopCheckoutShipping.tsx` | Component ShopCheckoutShipping.tsx | *(none)* |
| **654** | `components/puck/ShopCollectionBrowser.rsc.tsx` | Component ShopCollectionBrowser.rsc.tsx | *(none)* |

**Pass finding counts (155–654):** 6 passes logged new IDs · 36 passes logged overlaps only · 451 passes logged none · **500 passes total**

New IDs in this tranche: **SHOP-106**, **SHOP-107**, **SHOP-108**, **SHOP-109**, **SHOP-110**, **SHOP-111**.

<a id="passes-655-704-full-log"></a>

### Passes 655–704 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 655–704). Prior passes are in this combined report (passes 1–654 above).

Fifty distinct passes closing gaps after pass **654** (`ShopCollectionBrowser.rsc.tsx`): remaining Puck surfaces, storefront page shells not given a dedicated pass, migration design notes, test clusters, and second-order security / replacement–dispatch cross-checks. No passes 1–654 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **655** | `components/puck/ShopCollectionBrowser.tsx` | Editor half of Collection Browser (RSC covered in pass 654) | *(none)* |
| **656** | `components/puck/ShopCollectionDescription.tsx` | Editor half of collection description block | *(none)* |
| **657** | `components/puck/ShopCollectionDescription.rsc.tsx` | RSC collection description body | *(none)* |
| **658** | `components/puck/ShopCollectionHeader.tsx` | Editor half of collection header | *(none)* |
| **659** | `components/puck/ShopCollectionHeader.rsc.tsx` | RSC collection header + breadcrumbs | *(none)* |
| **660** | `components/puck/ShopCollectionLinks.tsx` | Editor half of footer collection links | *(none)* |
| **661** | `components/puck/ShopCollectionLinks.rsc.tsx` | RSC random collection links + `allHref` | overlaps SHOP-117 |
| **662** | `components/puck/ShopFeaturedCollection.tsx` | Editor half of featured collection strip | *(none)* |
| **663** | `components/puck/ShopFeaturedCollection.rsc.tsx` | RSC featured collection query + Suspense | *(none)* |
| **664** | `components/puck/ShopOrderConfirmation.tsx` | Puck confirmation block (server wrapper) | overlaps SHOP-062 |
| **665** | `components/puck/ShopProductCard.tsx` | Editor half of single product card | *(none)* |
| **666** | `components/puck/ShopProductCard.rsc.tsx` | RSC single card + Suspense | *(none)* |
| **667** | `components/puck/ShopProductDetail.tsx` | Editor placeholder for product detail layout | overlaps SHOP-073 |
| **668** | `components/puck/ShopProductDetail.rsc.tsx` | RSC product detail orchestration + JSON-LD | none (positive JSON-LD escape) |
| **669** | `components/puck/ShopProductGrid.tsx` | Editor half of product grid (paging fields) | *(none)* |
| **670** | `components/puck/ShopProductGrid.rsc.tsx` | RSC grid paging / on-demand window | none (positive `listGridProducts` gate) |
| **671** | `components/puck/ShopPromoBanner.tsx` | Static promo banner (editor = RSC) | SHOP-117 |
| **672** | `components/puck/ShopRelatedProducts.tsx` | Editor half of related products | *(none)* |
| **673** | `components/puck/ShopRelatedProducts.rsc.tsx` | RSC related products + Suspense | *(none)* |
| **674** | `components/puck/ShopSupplierDescription.tsx` | Editor half of supplier description | *(none)* |
| **675** | `components/puck/ShopSupplierDescription.rsc.tsx` | RSC supplier description body | *(none)* |
| **676** | `components/puck/ShopSupplierHeader.tsx` | Editor half of supplier header | *(none)* |
| **677** | `components/puck/ShopSupplierHeader.rsc.tsx` | RSC supplier header + visibility gate | *(none)* |
| **678** | `components/puck/ShopTagHeader.tsx` | Editor half of tag header | *(none)* |
| **679** | `components/puck/ShopTagHeader.rsc.tsx` | RSC tag header + `storefrontVisible` guard | *(none)* |
| **680** | `components/puck/ShopUpsellProducts.tsx` | Server Puck wrapper for cart upsell island | *(none)* |
| **681** | `components/puck/parts/detail-parts.tsx` | Product detail part-blocks cluster (gallery, price, ATC) | overlaps SHOP-046, SHOP-084 |
| **682** | `components/puck/parts/card-parts.tsx` | Shared product card CSS + inline card parts | *(none)* |
| **683** | `components/puck/invoice-chrome.tsx` | Invoice/credit-note Puck chrome + owner CSS fields | overlaps SHOP-011 |
| **684** | `components/puck/parts/section-head-css.ts` | Shared section heading stylesheet token | *(none)* |
| **685** | `components/puck/ShopCollectionLinks.shared.tsx` | Collection links field defaults + CSS builder | *(none)* |
| **686** | `app/public/shop/cart/page.tsx` | Storefront cart page shell + layout fallback | *(none)* |
| **687** | `app/public/shop/checkout/confirmation/page.tsx` | Confirmation page shell (no layout fallback) | overlaps SHOP-062 |
| **688** | `app/public/shop/checkout/page.tsx` | Checkout page shell + commerce-mode gate | overlaps SHOP-058 |
| **689** | `app/public/shop/products/[slug]/page.tsx` | Product page shell + metadata/canonical | overlaps SHOP-088, SHOP-089 |
| **690** | Storefront guest-order pages cluster | `app/public/shop/orders/*` lookup, track, receipt flows | none (positive layered access) |
| **691** | `migrations/052_replacement_orders.sql` | Replacement kind / revenue-count design comments | overlaps SHOP-107 (intentional SUM vs COUNT split) |
| **692** | Migrations 043–047 returns cluster | Returnable columns + `047_order_item_return_note_catchup` | none (positive catchup for edited 043) |
| **693** | Migrations 053–061 tracking cluster | Parcel tracking + notification columns | *(none)* |
| **694** | Media rewriter test cluster | `lib/media-reference-rewriter.test.ts`, detacher tests | none (positive plain-key matching) |
| **695** | Guest receipt access test cluster | `lib/order-receipt-challenge*.test.ts`, access cookie tests | none (positive uniform errors) |
| **696** | Checkout money/tax test cluster | `lib/*money*.test.ts`, tax display tests | overlaps SHOP-008 (documented float paths) |
| **697** | Tracking parse test cluster | `lib/tracking/reading.test.ts`, stage-meaning tests | *(none)* |
| **698** | Storefront component test cluster | `ProductFaqSearch.test.tsx`, category pills/fold tests | *(none)* |
| **699** | Replacement × dispatch × stock cross-check | `lib/replacements.ts` vs `fulfillPaidOrder` vs `createShipment` | SHOP-106, SHOP-112 |
| **700** | Replacement × invoice × revenue cross-check | PAID replacements vs `issueInvoiceForOrder` vs reports SQL | SHOP-107, SHOP-114 |
| **701** | Collection-index href security | `ShopCollectionBrowser.rsc.tsx` + `shop.collection-index-sources` | SHOP-113 |
| **702** | Dispatch UI × pending-request cross-check | `DispatchModal.tsx` vs `readDispatchRows` cancel caps | SHOP-116, overlaps SHOP-043 |
| **703** | Document access second-order review | `lib/document-access.ts` vs print tokens vs PDF routes | none (positive receipt-cookie split) |
| **704** | Grid on-demand × upsells parity | `grid-page.ts` server paging vs `UpsellClient` + closed shop | overlaps SHOP-109 (upsells gated) |

**Pass finding counts (655–704):** 6 passes logged new IDs · 18 passes logged overlaps only · 26 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-112**, **SHOP-113**, **SHOP-114**, **SHOP-115**, **SHOP-116**, **SHOP-117**.

<a id="passes-705-754-full-log"></a>

### Passes 705–754 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 705–754). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), and [passes 655–704](#passes-655-704-full-log).

Fifty distinct passes on surfaces not named in passes 1–704: admin trading/catalogue screens and modals, member order-request and pay-online APIs, individual email/SMS template keys, storefront page shells still without a dedicated pass, admin hooks, and second-order replacement/refund/dispatch cross-checks. No passes 1–704 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **705** | Admin `ProductsScreen` list + bulk entry | Product list filters, import/export entry, permission gates | *(none)* |
| **706** | Admin `CategoriesScreen` + standalone description editor | Category CRUD UI, description builder | *(none)* |
| **707** | Admin `CollectionsScreen` + `CollectionProductsPanel` | Collection membership UI, duplicate flow | *(none)* |
| **708** | Admin `TagsScreen` reorder + visibility | Tag admin surface | *(none)* |
| **709** | Admin `SuppliersScreen` + catalogue editor | Supplier admin + description | *(none)* |
| **710** | Admin product editor `gallery-extras` + `media` panels | Gallery upload, media folder wiring | *(none)* |
| **711** | Admin `BackInStockScreen` | Subscription list admin | *(none)* |
| **712** | Admin `CustomersScreen` + `CustomerDetailScreen` | Customer list and order history drill-down | overlaps SHOP-097 |
| **713** | Admin `DiscountsScreen` | Coupons + automatic discounts UI | *(none)* |
| **714** | Admin `OrdersScreen` filters + export | Order list query params, CSV export trigger | overlaps SHOP-071 |
| **715** | Admin `OrderDetailScreen` status + notes UI | Settable statuses, cancel-without-refund path | overlaps SHOP-067 |
| **716** | Admin `OrderDetailScreen` replacement affordances | Raise replacement from order + request link | overlaps SHOP-106 |
| **717** | Admin `RequestsScreen` decide/refund panel | Approve/decline, refund tick, return charge | SHOP-120 |
| **718** | Admin `RefundModal` gross line math | EXCLUSIVE gross per unit, provider notice | none (positive grossPerUnit) |
| **719** | Admin `DispatchModal` line caps display | Outstanding qty vs server caps | overlaps SHOP-116, SHOP-043 |
| **720** | Admin `EditParcelModal` slot/tracking emails | First-save notification flags | none (positive claim* helpers) |
| **721** | Admin `ReplacementModal` charged line POST | Client unitPrice parsing, empty = free | overlaps SHOP-107 |
| **722** | Admin `ReportsScreen` revenue/tax views | Report tabs vs API permissions | overlaps SHOP-050 |
| **723** | Admin `TaxShippingScreen` + `CourierSettings` | Zones, rates, courier list UI | *(none)* |
| **724** | Admin `ShopSettingsTab` shop status modes | OPEN/CLOSED/BROWSE_ONLY select | overlaps SHOP-099 |
| **725** | Admin `PaymentsSettings` + `PaymentMethodLogo` usage | Enabled methods, env hints | *(none)* |
| **726** | Admin `ImportModal` + `MediaPickerModal` | CSV import UX vs 60s `after()` | overlaps SHOP-007 |
| **727** | Admin `EmailCustomerModal` | Ad-hoc customer email from order | *(none)* |
| **728** | Admin `ProductQuestionsScreen` | Q&A queue, answer workflow | overlaps SHOP-100 |
| **729** | Admin `ExportColumnsModal` | Orders CSV column picker | overlaps SHOP-071 |
| **730** | Admin `ShopSectionNav` + `admin-nav.ts` tabs | Catalogue vs Trading tab resolution | none (positive permission filter) |
| **731** | `app/api/member/orders/[id]/photos/route.ts` | Damage photo upload, raster-only, rate limit | none (positive validateUpload) |
| **732** | Member request POST × photo id binding | `requests/route.ts` media lookup vs upload folder | SHOP-118 |
| **733** | `app/api/member/orders/[id]/pay/confirm/route.ts` | Pay-online confirm, no FAILED on decline | overlaps SHOP-008 (`Number(order.total)`) |
| **734** | `app/api/member/orders/[id]/pay/route.ts` | Pay-online intent creation | overlaps SHOP-008 |
| **735** | `app/api/member/orders/[id]/billing/route.ts` | Member billing address patch | *(none)* |
| **736** | `app/api/member/requests/[id]/route.ts` | Withdraw pending request | *(none)* |
| **737** | `app/api/member/addresses/*` default flag | Saved address book mutations | *(none)* |
| **738** | `app/api/member/gdpr-export/route.ts` second look | Internal bearer, item fan-out | overlaps SHOP-111 |
| **739** | Email template `shop.order-confirmed` | Defaults + rawTags for orderItems | *(none)* |
| **740** | Email template `shop.order-dispatched` | Shipment notification copy | *(none)* |
| **741** | Email template `shop.delivery-slot` | Window notification wording | *(none)* |
| **742** | Email template `shop.request-decision` | Cancel/return outcome copy | *(none)* |
| **743** | Email template `shop.admin-new-damage` | Staff alert for damage reports | *(none)* |
| **744** | SMS templates `shop.order-shipped` cluster | Single-segment defaults, orderUrl optional | *(none)* |
| **745** | Hook `components/admin/use-currency-symbol.ts` | Admin money symbol fetch + cache | SHOP-121 |
| **746** | Admin `dialogs.tsx` confirm/prompt helpers | Shared modal primitives for trading UI | *(none)* |
| **747** | `app/public/shop/page.tsx` shop index | Puck layout + closed/staff preview gate | *(none)* |
| **748** | `app/public/shop/categories/[slug]/page.tsx` | Undesigned category fallback grid | overlaps SHOP-025 |
| **749** | `app/public/shop/collections/[slug]/page.tsx` | Collection shell + paging | *(none)* |
| **750** | `app/public/shop/suppliers/[slug]/page.tsx` | Supplier catalogue shell | *(none)* |
| **751** | `app/public/shop/track-order/page.tsx` | Guest tracker entry + account redirect | none (positive dynamic gate) |
| **752** | `app/root/[slug]/page.tsx` root slug router | Product vs track-order claim ordering | overlaps SHOP-025 |
| **753** | `app/public/shop/downloads/[token]/page.tsx` | Download wrapper before API stream | overlaps SHOP-029 |
| **754** | Replacement bundle 106–115 × refunds cross-check | Charged replacement PAID row vs `processRefund` provider lookup | SHOP-119, overlaps SHOP-107, SHOP-115 |

**Pass finding counts (705–754):** 4 passes logged new IDs · 19 passes logged overlaps only · 27 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-118**, **SHOP-119**, **SHOP-120**, **SHOP-121**.

<a id="passes-755-804-full-log"></a>

### Passes 755–804 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 755–804). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), and [passes 705–754](#passes-705-754-full-log).

Fifty distinct thematic passes on surfaces not yet named in passes 1–754: remaining Puck checkout/cart blocks, `lib` cross-checks (checkout-draft, order-notify, document print, stranded payments), admin order notes and manual email, settings and dashboard APIs, print/PDF and proforma routes, member/guest order detail and purchase-order portal, SMS send paths, and provider webhook refund edge cases. No passes 1–754 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **755** | Puck `ShopBackInStockForm` + `BackInStockClient` parity | Editor block vs public subscribe island, honeypot | *(none)* |
| **756** | Puck cart cluster editor/RSC cross-check | `ShopCartFull`, `ShopCartItems`, `ShopCartTotals`, `ShopCartSummary` | overlaps SHOP-073 |
| **757** | Puck `ShopCategoryBrowser` pair | Category grid browser editor vs RSC paging | *(none)* |
| **758** | Puck checkout contact/items cluster | `ShopCheckoutContact*` + `ShopCheckoutItems` wiring | *(none)* |
| **759** | Puck checkout payment/review/shipping cluster | Wallet omission on review editor vs RSC | overlaps SHOP-073, SHOP-091 |
| **760** | `lib/checkout-draft.ts` × confirm draft path | Materialise idempotency, stranded alarm, no amount re-quote at settle | overlaps SHOP-032, SHOP-038 |
| **761** | `lib/stranded-payments.ts` × dashboard visibility | List/count helpers vs no admin widget chip | overlaps SHOP-038 |
| **762** | `lib/document-print-token.ts` × PDF fetch | Print HMAC TTL, ENCRYPTION_KEY gate | none (positive short-lived print token) |
| **763** | `lib/document-access.ts` × receipt cookie split | Page vs PDF `allowReceiptCookie` rationale | none (positive cache-bypass design) |
| **764** | Public invoice PDF route second look | Rate limit, access resolver, print token mint | none (positive) |
| **765** | Public credit-note PDF route | Same access stack as invoice | *(none)* |
| **766** | Public proforma PDF route | Order-number keyed proforma access | *(none)* |
| **767** | `components/public/PrintButton.tsx` + receipt print CSS | Browser print only, no server token | *(none)* |
| **768** | `components/public/OrderDocuments.tsx` link hygiene | Internal vs signed href, prefetch off | *(none)* |
| **769** | Guest/member order detail `loadOrderDetail` | No internal notes exposed; replacements parent link | none (positive) |
| **770** | Member order GET + PATCH purchase-order portal | `customer-reference.ts` eligibility vs route | SHOP-126 |
| **771** | `OrderReferencePanel.tsx` client save path | PATCH to member API, refresh after save | overlaps SHOP-126 |
| **772** | `app/api/public/orders/notifications/route.ts` | Post-checkout SMS/email preference mutator | none (positive receipt gate) |
| **773** | `lib/order-notify.ts` SMS branch | `sendSmsTemplate` without comms log | SHOP-125 |
| **774** | SMS template `shop.partial-dispatch` cluster | Merge tags vs shipment email vars | *(none)* |
| **775** | SMS template `shop.replacement-sent` / `replacement-dispatched` | Parent order number wording | *(none)* |
| **776** | `lib/sms-templates.ts` `SHOP_TRIGGER_TO_SMS_KEY` map | Trigger coverage vs email triggers | *(none)* |
| **777** | `app/api/admin/orders/[id]/notes/route.ts` | POST permission, Zod min only | SHOP-124 |
| **778** | Admin order timeline notes rendering | `isInternal` notes on staff screen only | none (positive) |
| **779** | `app/api/admin/orders/[id]/email/route.ts` | Manual HTML email + log row | overlaps SHOP-124 |
| **780** | Admin `EmailCustomerModal` × email route | Client subject/body bounds | overlaps SHOP-124 |
| **781** | `app/api/admin/settings/route.ts` GET prefill | Store email display-only from first admin | *(none)* |
| **782** | `app/api/admin/settings/route.ts` PUT partial config | `ShpConfigSchema.partial()` mass assignment surface | *(none)* |
| **783** | `app/api/admin/dashboard-widget/route.ts` × RSC widget | SQL kind filter on count not on revenue SUM | SHOP-123 |
| **784** | `components/admin/ShopDashboardWidget.tsx` revenue SQL | Includes replacement PAID totals in 30d revenue | SHOP-123, overlaps SHOP-110 |
| **785** | Stripe webhook `charge.refunded` handler | Lifecycle status only via shared webhook route | SHOP-122, overlaps SHOP-068 |
| **786** | PayPal webhook `PAYMENT.CAPTURE.REFUNDED` handler | Partial vs full refund amount compare | none (positive cumulative compare) |
| **787** | Webhook refund × `settleRefund` parity | Neither path updates `payment_status` | SHOP-122 |
| **788** | Webhook refund × inventory/digital side-effects | No `refund_items`, stock restore, token revoke | overlaps SHOP-019, SHOP-029 |
| **789** | `app/api/webhooks/stripe/route.ts` failed intent branch | `markOrderPaymentFailed` pending guard | none (positive AWAITING_CONFIRMATION) |
| **790** | `confirm/route.ts` draft branch amount check | Provider confirm uses frozen draft total | overlaps SHOP-032, SHOP-008 |
| **791** | `lib/order-payment-state.ts` × materialise | Extension restate after draft order exists | *(none)* |
| **792** | `components/public/BuyAgainButton.tsx` closed shop | Client add-to-cart without shop status gate | overlaps SHOP-109 |
| **793** | `components/public/OrderPayOnlinePanel.tsx` | Pay-online from order page, method restore | overlaps SHOP-008 |
| **794** | `components/public/OrderRequestPanel.tsx` | Cancel/return/damage affordances vs server caps | overlaps SHOP-043 |
| **795** | `components/public/DeliveryLiveMap.tsx` + tracking poll | Map tile CSP, live position cache | *(none)* |
| **796** | `lib/tracking/live-delivery.ts` × public live-delivery API | Order access before parcel coordinates | *(none)* |
| **797** | `lib/import-engine.ts` chunk × cron absence | No continuation job after 60s kill | overlaps SHOP-007 |
| **798** | Admin orders export × notes/emails columns | Export does not include comms bodies | *(none)* |
| **799** | `lib/proforma.ts` × customer reference merge | PO number on unpaid proforma PDF | none (positive `customerReferenceVars`) |
| **800** | `lib/receipt-access-cookie.ts` × document pages | Receipt cookie not a cache bypass | none (positive SHOP-703 theme) |
| **801** | `app/public/shop/account/orders` page shell | Member order list + claim on read | *(none)* |
| **802** | Guest order receipt page shell cluster | Receipt access challenge, notification prefs UI | overlaps SHOP-072 |
| **803** | `lib/order-request-actions.ts` quiet email sends | Swallowed notify on request decide | overlaps SHOP-023 |
| **804** | Replacement refund webhook × admin refund cross-check | Provider-initiated refund vs `processRefund` rows | SHOP-122, overlaps SHOP-119 |

**Pass finding counts (755–804):** 6 passes logged new IDs · 22 passes logged overlaps only · 22 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-122**, **SHOP-123**, **SHOP-124**, **SHOP-125**, **SHOP-126**.

<a id="passes-805-854-full-log"></a>

### Passes 805–854 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 805–854). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), [passes 705–754](#passes-705-754-full-log), and [passes 755–804](#passes-755-804-full-log).

Fifty distinct slices not named in passes 1–804: remaining category/collection Puck pairs, invoice Puck parts, admin modals and standalone editors, admin hooks, cart/guest cookie helpers, import job and manual-order cross-checks, document PDF and track-order access, tags and order-size public APIs, reconcile-refund cron parity, member pay-online confirm, stranded-list UX, and requests-queue pagination. No passes 1–804 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **805** | Puck `ShopCategoryDescription` editor/RSC pair | Designed category body vs plain fallback | *(none)* |
| **806** | Puck `ShopCategoryFaqs` pair | Category FAQ block editor vs RSC | *(none)* |
| **807** | Puck `ShopCategoryHeader` pair | Category title chrome + visibility | *(none)* |
| **808** | Puck `ShopCollectionDescription` pair | Collection designed description | *(none)* |
| **809** | Puck `ShopCollectionHeader` pair | Collection header + storefront gate | *(none)* |
| **810** | Puck `ShopFeaturedCollection` pair | Featured collection grid wiring | *(none)* |
| **811** | Puck `ShopPromoBanner` href schemes | Owner-entered promo links | overlaps SHOP-117 |
| **812** | Puck `ShopRelatedProducts` RSC cluster | Related grid Suspense + connection | *(none)* |
| **813** | Puck `cart-fields.tsx` shared cart block fields | Field defs shared across cart blocks | *(none)* |
| **814** | Puck `invoice-chrome` + `invoice-parts` cluster | Document block chrome, void badge on VOID | none (positive void label) |
| **815** | Puck `grid-stream.test.tsx` streaming guard | Grid stream test harness | *(none)* |
| **816** | Admin `RefundModal` gross line maths | EXCLUSIVE gross per-unit refund UI | overlaps SHOP-021 |
| **817** | Admin `ReplacementModal` charged workflow | Priced spare order creation | overlaps SHOP-106, SHOP-119 |
| **818** | Admin `DispatchModal` × pending request caps | Client caps vs server lock | overlaps SHOP-043, SHOP-116 |
| **819** | Admin `ExportColumnsModal` column picker | Export column subset vs full fallback | *(none)* |
| **820** | Admin `ProductPicker` modal | Product search pick for relations | *(none)* |
| **821** | Admin `FaqListEditor` catalogue FAQs | Inline FAQ editor on product screen | *(none)* |
| **822** | Admin `CourierSettingsPanel` + `CourierSettings` | Courier list admin surface | *(none)* |
| **823** | Admin `TaxShippingScreen` zones/rates | Tax and shipping admin tab | *(none)* |
| **824** | Admin `ReportsScreen` tiles | Reports hub navigation | overlaps SHOP-050 |
| **825** | Admin `RequestsScreen` refund pre-tick | Queue UI default refund amount | overlaps SHOP-120 |
| **826** | Admin `CustomersScreen` list | Customer list + search | *(none)* |
| **827** | Admin `CustomerDetailScreen` | Single customer + orders | *(none)* |
| **828** | Admin `ProductQuestionsScreen` mutations | Q&A admin vs `shop.products` | overlaps SHOP-100 |
| **829** | Admin `CollectionProductsPanel` | Collection membership editor | *(none)* |
| **830** | Standalone description editor cluster | Category/collection/supplier/description-builder | *(none)* |
| **831** | Hook `use-product-url-style.ts` | Product URL style client cache | *(none)* |
| **832** | `product-editor/` panels cluster | Pricing/stock/media/SEO panels | *(none)* |
| **833** | `lib/checkout-address-lookup.ts` × contact step | Address finder wiring | *(none)* |
| **834** | `lib/cart-summary.ts` × validate notes | Summary notes on cart validate | *(none)* |
| **835** | `lib/guest-cart-cookie.ts` × cart store | Guest cart cookie persistence | overlaps SHOP-108 theme |
| **836** | `lib/signed-list-cookie.ts` | Signed product-list view prefs | *(none)* |
| **837** | `lib/unsubscribe-token.ts` × back-in-stock | Unsubscribe HMAC for alerts | *(none)* |
| **838** | `lib/thumb-backfill.ts` × low-stock cron | Thumb job errors swallowed | overlaps SHOP-104 |
| **839** | `lib/media-reference-rewriter.ts` × drift POST | Refile batch copy budget | none (positive 10-product cap) |
| **840** | `import/[id]` job poll × `processImportJob` | GET status for ImportModal | SHOP-129 |
| **841** | `products/import` POST × `file.text()` | Whole CSV buffered before `after()` | SHOP-128 |
| **842** | Admin `orders` POST manual phone order | `resolveCartLines` without line cap | SHOP-127 |
| **843** | Admin `orders` GET stranded banner UX | `listStrandedPayments` on stats=1 | SHOP-131 |
| **844** | Admin `requests` GET `limit` query | NaN limit when param non-numeric | SHOP-132 |
| **845** | Admin `reports/revenue` route SQL | Paid revenue vs replacement kind | overlaps SHOP-110, SHOP-123 |
| **846** | `documents/access` × `orders/track` lockout | Shared per-order access attempts | none (positive) |
| **847** | Public invoice PDF × VOID invoice read | Access + void document still printable | none (positive void stamp) |
| **848** | Public credit-note PDF second pass | Same document-access stack as invoice | *(none)* |
| **849** | Public `order-size-deduction` GET cache | Shared-cache product island API | none (positive) |
| **850** | Public `tags` GET × `listVisibleTags` | Hidden tags omitted from JSON | none (positive) |
| **851** | Cron `reconcile-refunds` × `settleRefund` | Auto-reconcile uses settle path | overlaps SHOP-122, SHOP-036 |
| **852** | Member pay intent + confirm pair | `Number(order.total)` on pay-online | overlaps SHOP-008 |
| **853** | Order list `paymentStatus` filter cross-check | Filter column vs lifecycle refund status | SHOP-130 |
| **854** | Import job PROCESSING zombie × UI poll | No terminal status on throw/timeout | SHOP-129, overlaps SHOP-007 |

**Pass finding counts (805–854):** 6 passes logged new IDs · 19 passes logged overlaps only · 25 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-127**, **SHOP-128**, **SHOP-129**, **SHOP-130**, **SHOP-131**, **SHOP-132**.

<a id="passes-855-904-full-log"></a>

### Passes 855–904 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 855–904). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), [passes 705–754](#passes-705-754-full-log), [passes 755–804](#passes-755-804-full-log), and [passes 805–854](#passes-805-854-full-log).

Fifty distinct slices not named in passes 1–854: individual product-detail and card Puck part-blocks, remaining invoice Puck parts, admin digital upload and bulk mutation edges, reports and overview revenue cross-checks, import job error persistence and modal polling, and second-order security or parity passes linking SHOP-122, SHOP-127, SHOP-128, and SHOP-129 themes. No passes 1–854 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **855** | Puck part `ShopDetailGallery` | Main image stage + thumb strip in detail layout | *(none)* |
| **856** | Puck part `ShopDetailBadges` | Sale/pre-order badge row on product detail | *(none)* |
| **857** | Puck part `ShopDetailTitle` | Product name heading part-block | *(none)* |
| **858** | Puck part `ShopDetailSku` | SKU line on designed product pages | *(none)* |
| **859** | Puck part `ShopDetailPrice` | Price + tax view toggle part | overlaps SHOP-055 |
| **860** | Puck part `ShopDetailOrderSizeDeduction` | Order-size deduction island wiring | *(none)* |
| **861** | Puck part `ShopDetailBlurb` | Short description part on detail layout | *(none)* |
| **862** | Puck part `ShopDetailPreorder` | Pre-order messaging part-block | *(none)* |
| **863** | Puck part `ShopDetailAddToCart` | Stepper + add button part | overlaps SHOP-084 (parts_only still reachable) |
| **864** | Puck part `ShopDetailReassure` | Returns/reassurance copy part | *(none)* |
| **865** | Puck part `ShopDetailTabs` | Section tabs + sticky nav interaction | *(none)* |
| **866** | Puck part `ShopDetailSections` | Long-form sections container | *(none)* |
| **867** | Puck part `ShopDetailSectionNav` | In-page section jump links | *(none)* |
| **868** | Puck part `ShopCardImage` | Card image + lazy thumb behaviour | overlaps SHOP-046 |
| **869** | Puck part `ShopCardBadge` | Grid card badge overlay | *(none)* |
| **870** | Puck part `ShopCardName` | Card title typography part | *(none)* |
| **871** | Puck part `ShopCardPrice` | Card price + extension card-price hook | *(none)* |
| **872** | Puck part `ShopCardBlurb` | Card short text part | *(none)* |
| **873** | Puck part `ShopCardCta` | Card call-to-action link part | *(none)* |
| **874** | Puck part `ShopInvoiceHeader` | Invoice/proforma header block | *(none)* |
| **875** | Puck part `ShopInvoiceParties` | Bill-to / ship-to parties block | *(none)* |
| **876** | Puck part `ShopInvoiceFrom` + `ShopInvoiceTo` | Seller and buyer address parts | *(none)* |
| **877** | Puck part `ShopInvoiceLines` | Line table on document layouts | *(none)* |
| **878** | Puck part `ShopInvoiceTotals` | Totals stack on invoice Puck | *(none)* |
| **879** | Puck part `ShopInvoiceTaxSummary` | VAT summary rows on documents | *(none)* |
| **880** | Puck part `ShopInvoicePayment` + `ShopInvoiceNotice` | Payment terms + notice chrome | overlaps SHOP-011 |
| **881** | Puck part `ShopInvoiceFooter` + `ShopInvoiceDivider` | Footer chrome on printable layouts | *(none)* |
| **882** | Puck part `ShopInvoicePageNumber` | Document footer page number | *(none)* |
| **883** | Admin `digital-files` POST upload path | Full-file Buffer up to 200 MB before B2 upload | SHOP-133 |
| **884** | Admin `products/bulk` POST id batching | `slice(0, 200)` without partial-count response | SHOP-135 |
| **885** | Admin `requests` GET `offset` query | NaN offset when param non-numeric | SHOP-134 |
| **886** | Reports `revenue` GET 90-day series | SUM all PAID kinds vs SALE-only order_count | SHOP-136 |
| **887** | `getOrdersOverview` revenue SUM × kind filter | Same SALE vs all-PAID split as dashboard | overlaps SHOP-123 |
| **888** | `import-engine` progress `errors` jsonb | Full error array rewritten every 25 rows | SHOP-137 |
| **889** | `ImportModal` poll loop × PROCESSING TTL | No client timeout on stuck job status | overlaps SHOP-129 |
| **890** | `reconcile-refunds` cron × `settleRefund` | Auto-reconcile inherits payment_status gap | overlaps SHOP-122, SHOP-851 |
| **891** | Orders CSV export × `parseOrderListFilter` | Export uses stale `payment_status` column | overlaps SHOP-130 |
| **892** | Dashboard widget API × overview SQL | JSON widget vs `getOrdersOverview` parity | overlaps SHOP-123, SHOP-110 |
| **893** | Manual admin `orders` POST × cart caps | Unbounded lines vs guest/member carts | SHOP-127 |
| **894** | `products/import` POST × `parseCsv` memory | Whole upload parsed before `after()` | SHOP-128 |
| **895** | `processImportJob` throw × job row status | No FAILED on uncaught throw | SHOP-129 |
| **896** | Member `cart` PUT × guest store rate limit | Write throttle asymmetry | overlaps SHOP-108 |
| **897** | Webhook refund × digital token revoke | Provider refund skips download invalidation | overlaps SHOP-029, SHOP-122 |
| **898** | `settleRefund` × tracked stock restore | Refund settle does not increment stock | overlaps SHOP-019, SHOP-122 |
| **899** | Order list search ILIKE × export search | Shared `%search%` on six columns | none (positive shared parser) |
| **900** | Admin `confirm-payment` × card methods | Rejects STRIPE/PAYPAL manual confirm | none (positive settlementMethod gate) |
| **901** | Public download GET × order payment join | Token route omits refund/payment gate | overlaps SHOP-029 |
| **902** | `ImportModal` client `file.text()` preview | Browser reads whole CSV twice (map step) | *(none)* |
| **903** | Test cluster `checkout-draft` + payment state | Draft materialise idempotency tests | none (positive) |
| **904** | `lib/inject-part-context.ts` × detail parts | `_ctx` injection for part-blocks | *(none)* |

**Pass finding counts (855–904):** 5 passes logged new IDs · 21 passes logged overlaps only · 24 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-133**, **SHOP-134**, **SHOP-135**, **SHOP-136**, **SHOP-137**.

<a id="passes-905-954-full-log"></a>

### Passes 905–954 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 905–954). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), [passes 705–754](#passes-705-754-full-log), [passes 755–804](#passes-755-804-full-log), [passes 805–854](#passes-805-854-full-log), and [passes 855–904](#passes-855-904-full-log).

Fifty distinct slices not named in passes 1–904: order-line due-date extension seam and admin list metrics, order auto-complete versus partially refunded lifecycle, payment-state preview/apply paths, FAQ search and render pipeline, product details bare iframe view, grid pager scroll hold, tax-view client boot, damage-photo upload ingress, cart upsells rate limits, live-delivery completion side-effects, and cross-checks linking export fan-out to extension providers. No passes 1–904 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **905** | `lib/order-line-due-date.ts` merge rule | Soonest provider day wins per item id | *(none)* |
| **906** | `order-line-due-date.test.ts` calendar maths | `nextDueDate` parcel vs promise precedence | *(none)* |
| **907** | Admin orders GET × `getOrderRowMetrics` | One metrics batch per list page | overlaps SHOP-141 |
| **908** | `SETTLED_ORDER_STATUSES` × open-lines SQL | Omits `PARTIALLY_REFUNDED` from settled set | SHOP-141 |
| **909** | `resolveOrderLineDueDates` × list metrics | All open lines on page fed to every provider | overlaps SHOP-141 |
| **910** | Orders CSV export × `getOrderRowMetrics` | Up to 5000 orders trigger due-date extension fan-out | SHOP-139 |
| **911** | Export columns × `nextDeliveryDate` omission | CSV never prints delivery-due column | overlaps SHOP-139 |
| **912** | `lib/order-auto-complete.ts` NOT_COMPLETABLE set | `PARTIALLY_REFUNDED` not excluded | SHOP-138 |
| **913** | `listOrdersAwaitingCompletion` cron sweep | Same partial-refund gap as auto-complete | SHOP-138 |
| **914** | Live-delivery GET × `completeOrderIfEveryParcelArrived` | Customer poll can finish order on delivery | overlaps SHOP-138 |
| **915** | Delivery-tracking cron × completion leftovers | Hourly sweep inherits status exclusions | overlaps SHOP-138 |
| **916** | `applyOrderPaymentState` persist path | Raw jsonb UPDATE per changed line meta | *(none)* |
| **917** | `previewOrderPaymentNotes` × checkout preview | Drops line restatements when `preview: true` | none (positive) |
| **918** | Public `checkout/payment-note` POST | Early payment-method notes + rate limit | overlaps SHOP-092 |
| **919** | Payment-intent × `applyOrderPaymentState` after create | Restates lines once order exists | *(none)* |
| **920** | Admin manual order POST × payment-state apply | Phone orders restate before customer pays | *(none)* |
| **921** | `lib/faq.ts` body caps vs stored parse | 100 items / 12k answer on write only | *(none)* |
| **922** | `lib/faq-render.ts` sanitise-on-read | HTML answers through core sanitiser | none (positive) |
| **923** | `ProductFaqSearch` SEO + noscript | Full FAQ DOM always in HTML | *(none)* |
| **924** | `FaqAccordion` hidden vs crawler copy | `hidden` attribute not conditional fetch | *(none)* |
| **925** | `appendProductFaq` publish caps | Rejects over-long Q&A from question queue | none (positive) |
| **926** | `AskProductQuestion` modal wiring | Product-scoped public question POST | overlaps SHOP-095 |
| **927** | Product `details` bare page iframe view | noindex + same gates as main product URL | *(none)* |
| **928** | `resolveShopDetailImages` × MAX_IMAGES 24 | Modal strip caps companion thumbnails | *(none)* |
| **929** | `hold-scroll-position.ts` × `ShopGridPager` | Scroll anchoring guard on load-more | *(none)* |
| **930** | `ShopGridPager` `loadMore` server flight | On-demand card pages without client DB import | *(none)* |
| **931** | `lib/tax-view-shared.ts` boot stylesheet | Tax side via injected style tag | *(none)* |
| **932** | `TaxViewToggle` + `useTaxViewSide` hydration | Defaults until client reads storage | *(none)* |
| **933** | `lib/public-product-gate.ts` slug load | Storefront reachability before product return | *(none)* |
| **934** | `lib/product-page-gate.ts` alias resolution | Extension page resolver + ACTIVE gate | overlaps SHOP-089 |
| **935** | Member/guest `orders/.../photos` POST | Full image buffered before validate/upload | SHOP-140 |
| **936** | Damage report × `photoMediaIds` at submit | Global media id attach (SHOP-118 theme) | overlaps SHOP-118 |
| **937** | Public `orders/notifications` POST | Receipt proof before SMS/email redirect | none (positive) |
| **938** | Public `cart/upsells` POST rate limit | 120/min IP + max 50 product ids | *(none)* |
| **939** | Public `cart/store` × new rate limit | Guest cart write throttle vs member PUT | overlaps SHOP-108 |
| **940** | `lib/rate-limit.ts` bucket sweep | Amortised expiry on in-memory map | overlaps SHOP-004 |
| **941** | `OrdersScreen` delivery-due column | Formats `nextDeliveryDate` from metrics | *(none)* |
| **942** | `lib/delivery-slot.ts` `isDeliveryDate` guard | Invalid provider dates dropped | *(none)* |
| **943** | `lib/courier-faqs.ts` modal copy | Courier-specific FAQ snippets | *(none)* |
| **944** | Live poll × `readParcelTracking` cost | Courier read on each watching client tick | *(none)* |
| **945** | `cachedVehiclePosition` shared van key | One fetch per route id per cache window | none (positive) |
| **946** | `order-payment-state.test.ts` merge | Label-level field replacement | *(none)* |
| **947** | Due-date provider `paid` flag contract | Unpaid lines may still receive dates | *(none)* |
| **948** | Admin list `perPage` 200 × metrics SQL | Three batched queries plus extension pass | overlaps SHOP-141 |
| **949** | Export 5000-row cap × 60s ceiling | Same metrics helper as UI list | overlaps SHOP-139, SHOP-071 |
| **950** | Webhook `PARTIALLY_REFUNDED` lifecycle only | Does not touch `payment_status` | overlaps SHOP-122 |
| **951** | `lib/order-progress.ts` partial refund UX | Progress copy for part-refunded orders | *(none)* |
| **952** | `order-display.ts` partial refund badges | Admin/customer label parity | *(none)* |
| **953** | Test cluster `order-auto-complete` + shipments | Completion when fully dispatched | none (positive) |
| **954** | Pass tranche 905–954 cross-check | 50 unique names vs passes 1–904 registry | *(none)* |

**Pass finding counts (905–954):** 4 passes logged new IDs · 18 passes logged overlaps only · 28 passes logged none · **50 passes total**

New IDs in this tranche: **SHOP-138**, **SHOP-139**, **SHOP-140**, **SHOP-141**.

<a id="passes-955-974-full-log"></a>

### Passes 955–974 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 955–974). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), [passes 705–754](#passes-705-754-full-log), [passes 755–804](#passes-755-804-full-log), [passes 805–854](#passes-805-854-full-log), [passes 855–904](#passes-855-904-full-log), and [passes 905–954](#passes-905-954-full-log).

Twenty distinct slices not named in passes 1–954: post-purchase order API CLOSED gate versus document-access exemption, account order page `getShopGate`, apply-coupon shop-status parity, customer billing `CLOSED_STATUSES` on partial refunds, invoice reissue credit-note guard, cart basket charge-row merge, category FAQ recursive chain, admin dispatch note Zod bounds, courier signature capture ingress, and live-delivery client poll ceiling cross-checks. No passes 1–954 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **955** | `documents/access` × order track CLOSED policy | Paperwork POST exempt; track POST uses `shopClosedResponse` | SHOP-142 |
| **956** | Account order detail `getShopGate` | Guest/member order hub blocked when CLOSED | SHOP-142 |
| **957** | `orders/status` GET × closed shop | Confirmation JSON 503 whilst documents stay open | SHOP-142 |
| **958** | `orders/receipt-access` POST × closed shop | Postcode proof blocked during closure | SHOP-142 |
| **959** | `live-delivery` GET × `shopClosedResponse` | Van map poll refused when shop CLOSED | SHOP-142 |
| **960** | `checkout/apply-coupon` × shop gate absent | No OPEN/CLOSED check before `resolveDiscounts` | SHOP-143 |
| **961** | Apply-coupon × session route parity | Session refuses non-OPEN; coupon route does not | overlaps SHOP-143 |
| **962** | `customer-billing` CLOSED_STATUSES set | Omits `PARTIALLY_REFUNDED` like SHOP-126 on references | SHOP-144 |
| **963** | Member billing PATCH × `customerCanEditBilling` | Reissue path reachable on part-refunded rows | overlaps SHOP-144 |
| **964** | `invoice-reissue` × existing credit notes | Blocks company reissue when CN already on invoice | none (positive) |
| **965** | `cart-basket-totals` charge label fold | Same label sums amounts across lines | *(none)* |
| **966** | `getCategoryFaqChainBySlug` recursive CTE | Parent walk for inherited category FAQs | *(none)* |
| **967** | `ShopCategoryFaqs.rsc` inherited scope | Merges chain + shop-wide when `scope=inherited` | *(none)* |
| **968** | Admin dispatch POST `notes` Zod | Nullable string without max length | SHOP-145 |
| **969** | `signature-capture` fetch timeout + sniff | 8s cap, magic-byte type, 5 MB ceiling | none (positive) |
| **970** | `DeliveryLiveMap` × `MAX_LIVE_SESSION_MS` | Client stops polling after one hour | *(none)* |
| **971** | `paymentOutstanding` × lifecycle statuses | Unpaid only; ignores `PARTIALLY_REFUNDED` lifecycle | *(none)* |
| **972** | `orders/notifications` POST × closed gate | SMS/email prefs mutator behind CLOSED | overlaps SHOP-142 |
| **973** | Member pay-online × `Number(order.total)` | Charges full total on unpaid orders only | overlaps SHOP-008 |
| **974** | Pass tranche 955–974 cross-check | 20 unique names vs passes 1–954 registry | *(none)* |

**Pass finding counts (955–974):** 4 passes logged new IDs · 6 passes logged overlaps only · 10 passes logged none · **20 passes total**

New IDs in this tranche: **SHOP-142**, **SHOP-143**, **SHOP-144**, **SHOP-145**.

<a id="passes-975-994-full-log"></a>

### Passes 975–994 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 975–994). Prior passes are in the [main report](#shop-module-bug-audit), [passes 55–154](#passes-55-154-full-log), [passes 155–654](#passes-155-654-full-log), [passes 655–704](#passes-655-704-full-log), [passes 705–754](#passes-705-754-full-log), [passes 755–804](#passes-755-804-full-log), [passes 805–854](#passes-805-854-full-log), [passes 855–904](#passes-855-904-full-log), [passes 905–954](#passes-905-954-full-log), and [passes 955–974](#passes-955-974-full-log).

Twenty distinct slices not named in passes 1–974: checkout and manual-order purchase-reference ingress versus member PATCH caps, dispatch tracking-number and items-batch Zod bounds, cancel/return eligibility on partially refunded lifecycle, payment-intent contact/address length parity with billing panels, and cross-checks against SHOP-068 webhook amount themes. No passes 1–974 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **975** | `payment-intent` × `CUSTOMER_REFERENCE_MAX_LENGTH` | Reference optional string with no `.max()` at order create | SHOP-146 |
| **976** | Admin manual `orders` POST reference cap | Same uncapped `customerReference` on phone orders | overlaps SHOP-146 |
| **977** | Dispatch POST `trackingNumber` Zod | Nullable string without max beside capped `carrier` | SHOP-147 |
| **978** | Dispatch PATCH `trackingNumber` Zod | Same unbounded tracking on parcel edits | overlaps SHOP-147 |
| **979** | `canRequestCancel` × `CLOSED_STATUSES` | Omits `PARTIALLY_REFUNDED` from closed paperwork | SHOP-149 |
| **980** | `canRequestReturn` × `CLOSED_STATUSES` | Return eligibility shares same gap | overlaps SHOP-149 |
| **981** | Member `requests` POST × eligibility fns | Route defers to `detail.cancel`/`return` rules above | overlaps SHOP-149 |
| **982** | Payment-intent `AddressSchema` length caps | Name/line fields unbounded vs billing PATCH | SHOP-148 |
| **983** | `customerOrganisation` checkout ingress | Optional org string with no max at create | overlaps SHOP-148 |
| **984** | `customerName` payment-intent Zod | Single unbounded contact name on order row | overlaps SHOP-148 |
| **985** | Dispatch POST `items` array ceiling | `min(1)` only; no `.max()` before `createShipment` | SHOP-150 |
| **986** | `createOrderRequest` reason code validation | `isValidReason` rejects free-text reason codes | none (positive) |
| **987** | Order request `customerNote` 2000 cap | Enforced in DB layer after Zod max on route | none (positive) |
| **988** | Public `cart/upsells` × `shopClosedResponse` | Upsell batch gated when shop CLOSED | *(none)* |
| **989** | Member `cart` PUT × closed-shop gate | Persisted basket writes ignore CLOSED | overlaps SHOP-109 |
| **990** | Checkout session × reference field absent | Session quote route has no reference field | *(none)* |
| **991** | `lib/customer-reference.ts` constant drift | 120-char constant unused on create routes | overlaps SHOP-146 |
| **992** | Admin dispatch GET summary payload | Read-only dispatch block; no new ingress | *(none)* |
| **993** | Stripe webhook PI succeeded amount check | Webhook marks PAID without amount compare | overlaps SHOP-068 |
| **994** | Pass tranche 975–994 cross-check | 20 unique names vs passes 1–974 registry | *(none)* |

**Pass finding counts (975–994):** 5 passes logged new IDs · 8 passes logged overlaps only · 7 passes logged none · **20 passes total**

New IDs in this tranche: **SHOP-146**, **SHOP-147**, **SHOP-148**, **SHOP-149**, **SHOP-150**.

<a id="passes-995-1044-full-log"></a>

### Passes 995–1044 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 995–1044). Prior passes are in the [main report](#shop-module-bug-audit) through [passes 975–994](#passes-975-994-full-log).

Fifty distinct slices not named in passes 1–994: admin lifecycle status versus `processRefund`, refund and member-request ingress caps, shipping-zone and collection membership arrays, member address book versus billing PATCH bounds, damage eligibility on refunded orders, tax-report date semantics, pay-online `paymentOutstanding`, and product relation-array writes. No passes 1–994 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **995** | Admin status PUT × `REFUNDED` enum | Dropdown calls `updateOrderStatus` only | SHOP-151 |
| **996** | `applyOrderStatusChange` × refund statuses | No `processRefund` / stock / digital hooks | overlaps SHOP-151 |
| **997** | Bulk status enum ⊆ single-order enum | Bulk bar cannot set REFUNDED; single route can | overlaps SHOP-151 |
| **998** | `confirm-payment` × lifecycle guards | Blocks only `paymentStatus === 'PAID'` | *(none)* |
| **999** | Admin refund POST `items` Zod | `min(1)` without `.max()` | SHOP-152 |
| **1000** | `processRefund` advisory `$executeRaw` | Void return type trap documented in source | none (positive) |
| **1001** | `prepareRefund` PENDING reservation | Blocks concurrent refunds with 409 | none (positive) |
| **1002** | `settleRefund` × `payment_status` column | Lifecycle only on admin settle | overlaps SHOP-122 |
| **1003** | Stripe webhook PI succeeded amount | Marks PAID from metadata id alone | overlaps SHOP-068 |
| **1004** | PayPal webhook capture amount parity | Same webhook amount gap as Stripe | overlaps SHOP-068 |
| **1005** | Member `pay` POST `Number(order.total)` | Full total on existing-order intent | overlaps SHOP-008 |
| **1006** | Member `pay/confirm` confirmPayment amount | Passes order total to provider confirm | overlaps SHOP-008 |
| **1007** | `paymentOutstanding` × `CANCELLED`/`REFUNDED` | Closes bank-instruction banner | *(none)* |
| **1008** | `paymentOutstanding` × `PARTIALLY_REFUNDED` | Lifecycle partial refund not closed | SHOP-164 |
| **1009** | `orderAcceptsOnline` × `confirmMode manual` | Blocks double charge on in-flight card | none (positive) |
| **1010** | `payOnlineMethodsForOrder` settlement filter | Excludes placed method from offer list | *(none)* |
| **1011** | `requireOrderAccess` uniform 404 copy | Guest/member gate on pay and requests | none (positive) |
| **1012** | `orderViewerFor` replacement parent guest | Child order inherits parent postcode proof | none (positive) |
| **1013** | Member `addresses` POST `AddressSchema` | Name/line fields lack `.max()` | SHOP-155 |
| **1014** | Member `addresses/[id]` PUT schema parity | Same unbounded address shape on edit | overlaps SHOP-155 |
| **1015** | Billing PATCH `AddressSchema` lines | Organisation capped; street fields not | SHOP-156 |
| **1016** | `BILLING_COMPANY_MAX_LENGTH` constant | 160-char company cap on billing only | overlaps SHOP-156 |
| **1017** | Member order PATCH reference `.max(120)` | `CUSTOMER_REFERENCE_MAX_LENGTH` enforced | none (positive) |
| **1018** | Shipping-zones POST `postcodes` array | Default `[]`, no max on create | SHOP-153 |
| **1019** | Shipping-zones PATCH postcode lists | Same unbounded arrays on update | overlaps SHOP-153 |
| **1020** | Shipping-rates `weightRates` array | Per-tier objects; count uncapped | *(none)* |
| **1021** | Collection `products` POST `productIds` | Append membership without length cap | SHOP-154 |
| **1022** | Collection `products` PUT replace-all | Whole membership in one unbounded array | overlaps SHOP-154 |
| **1023** | Categories `reorder` `orderedIds` | `min(1)` only on sibling reorder | SHOP-160 |
| **1024** | Tags `reorder` `orderedIds` ceiling | Same pattern as categories | overlaps SHOP-160 |
| **1025** | Collections `reorder` `orderedIds` | Third reorder route shares gap | overlaps SHOP-160 |
| **1026** | Product `related` PUT `relatedIds` | Manual mode list uncapped | SHOP-159 |
| **1027** | Product `upsells` PUT `upsellIds` | Parallel recommendation ingress | overlaps SHOP-159 |
| **1028** | Product PUT `media` array | Editor caps UI; Zod does not | SHOP-166 |
| **1029** | Product PUT `categoryIds`/`tagIds` | Junction writes uncapped per save | overlaps SHOP-166 |
| **1030** | Refund POST `reason` nullable string | No max on free-text reason | *(none)* |
| **1031** | Member `requests` POST `items` batch | Optional array without `.max()` | SHOP-163 |
| **1032** | Member `requests` `photoMediaIds` cap | `MAX_DAMAGE_PHOTOS` enforced | none (positive) |
| **1033** | `canReportDamage` × `REFUNDED` status | Only `CANCELLED` blocked | SHOP-157 |
| **1034** | `canReportDamage` × `PARTIALLY_REFUNDED` | Damage still offered mid-refund | overlaps SHOP-157 |
| **1035** | `canRequestCancel` × `ON_HOLD` orders | Hold does not close cancel eligibility | *(none)* |
| **1036** | Tax report `dateWhere` on `created_at` | Quarter filter is placement date | SHOP-162 |
| **1037** | Tax report refund SQL × `payment_status` | Netting only for still-PAID rows | overlaps SHOP-122 |
| **1038** | Revenue report 90-day PAID filter | Dashboard SQL theme cross-check | overlaps SHOP-123 |
| **1039** | Tax report CSV column shape | Exports net tax per rate | *(none)* |
| **1040** | `ShpConfig` bank/cash instruction strings | Unbounded `z.string()` defaults | SHOP-158 |
| **1041** | `manualPaymentInstructions` render surfaces | Shared map for proforma/email/checkout | overlaps SHOP-158 |
| **1042** | Payment-intent `customerPhone` Zod | Optional string without max | SHOP-161 |
| **1043** | Payment-intent `isValidUkPhone` gate | Format check when non-empty | none (positive) |
| **1044** | Pass tranche 995–1044 cross-check | 50 unique names vs passes 1–994 registry | *(none)* |

**Pass finding counts (995–1044):** 15 passes logged new IDs · 19 passes logged overlaps only · 16 passes logged none or positive · **50 passes total**

New IDs in this tranche: **SHOP-151**, **SHOP-152**, **SHOP-153**, **SHOP-154**, **SHOP-155**, **SHOP-156**, **SHOP-157**, **SHOP-158**, **SHOP-159**, **SHOP-160**, **SHOP-161**, **SHOP-162**, **SHOP-163**, **SHOP-164**, **SHOP-166**.

<a id="passes-1045-1094-full-log"></a>

### Passes 1045–1094 (full log)

**Date:** 2026-09-21  
**Module:** `shop` v0.1.449  
**Scope:** Static analysis only (passes 1045–1094). Continues from [passes 995–1044](#passes-995-1044-full-log); earlier passes unchanged.

Fifty distinct slices: checkout/cart line-cap parity cross-checks, public catalogue pagination clamps, document and PDF access paths, pay-online closed-shop policy, admin bulk and cron edges, webhook verification positives, and second-order passes on SHOP-092/109/142 themes. No passes 1–1044 were re-run.

| Pass | Unique name | One-line scope | Findings |
|------|-------------|----------------|----------|
| **1045** | `cart/validate` lines array ceiling | Unbounded lines vs guest cart 200 | overlaps SHOP-092 |
| **1046** | Checkout `session` lines array ceiling | Same gap on quote route | overlaps SHOP-092 |
| **1047** | Checkout `payment-note` lines batch | Early notes path uncapped | overlaps SHOP-092 |
| **1048** | Guest cart `MAX_META_BYTES` refine | 4KB meta enforced on store PUT | none (positive) |
| **1049** | Member cart meta byte refine | Mirrors guest cart cap | none (positive) |
| **1050** | `listProducts` `HARD_MAX_PER_PAGE` clamp | Public list cannot request unbounded page size | *(none)* |
| **1051** | Public `products` GET `page` NaN | Falls through to clamped pagination | *(none)* |
| **1052** | Public `tags` GET × `shopClosedResponse` | Tag list hidden when CLOSED | *(none)* |
| **1053** | Public `products/[slug]` closed gate | Single product JSON behind closed shop | *(none)* |
| **1054** | Document PDF `allowReceiptCookie` | Proforma PDF honours receipt cookie | none (positive) |
| **1055** | Document page × receipt cookie deny | RSC pages exclude receipt cookie by design | none (positive) |
| **1056** | Proforma PDF 5/min IP throttle | Headless render rate limit | *(none)* |
| **1057** | Invoice PDF throttle parity | Same limiter pattern as proforma | *(none)* |
| **1058** | Download token route order join | Payment/refund state not checked at stream | overlaps SHOP-029 |
| **1059** | `fulfillPaidOrder` digital insert | Tokens minted only on paid fulfilment | none (positive) |
| **1060** | `confirm-payment` `settlementMethod` | Manual confirm respects original method | *(none)* |
| **1061** | `confirm-payment` idempotent PAID return | Second click no-ops when already paid | none (positive) |
| **1062** | `markOrderPaymentFailed` → `ON_HOLD` | Failed confirm parks order on hold | *(none)* |
| **1063** | Dispatch auto-status × `ON_HOLD` skip | Parcel record does not override hold | none (positive) |
| **1064** | Implicit shipment on admin SHIPPED | `createShipment` for undispatched lines | *(none)* |
| **1065** | `NOT_COMPLETABLE` × partial refund | Still omits `PARTIALLY_REFUNDED` | overlaps SHOP-138 |
| **1066** | Auto-complete cron SQL exclusions | Same status set as library helper | overlaps SHOP-138 |
| **1067** | Media-drift POST max 10 products | Hard cap on refile batch | none (positive) |
| **1068** | Media-drift GET unbounded drift list | Returns all drifted products in one JSON | *(none)* |
| **1069** | Products bulk POST ids slice 200 | Silent drop beyond cap | overlaps SHOP-135 |
| **1070** | Orders bulk status enum subset | Cannot bulk-set REFUNDED lifecycle | overlaps SHOP-151 |
| **1071** | Orders bulk per-order failure array | Failures named by order number | none (positive) |
| **1072** | Admin settings `ShpConfigSchema.partial` | Partial PUT validates known keys | *(none)* |
| **1073** | Settings GET storeEmail prefill | Display-only default from first admin | *(none)* |
| **1074** | GDPR export bearer `verifyInternalExportBearer` | Member export not browser-callable | none (positive) |
| **1075** | GDPR export order item fan-out | Unbounded per-member order map | overlaps SHOP-111 |
| **1076** | `reconcile-refunds` cron schedule | Daily job vs hourly stale comment | overlaps SHOP-036 |
| **1077** | `low-stock-alerts` overlap emails | Duplicate mail on overlapping runs | overlaps SHOP-033 |
| **1078** | `delivery-tracking` 25 parcel cap | Hourly courier poll ceiling | overlaps SHOP-075 |
| **1079** | `thumb-top-up` swallowed errors | Silent backfill in daily cron | overlaps SHOP-104 |
| **1080** | Stripe webhook signature construct | Rejects bad signatures before handler | none (positive) |
| **1081** | PayPal webhook verify path | Same signature-first pattern | none (positive) |
| **1082** | Member cart PUT × closed shop absent | Persisted basket when CLOSED | overlaps SHOP-109 |
| **1083** | Member pay routes × closed shop absent | Unpaid bank orders may still pay online | none (positive) |
| **1084** | Track-order POST × `shopClosedResponse` | Post-purchase track blocked when CLOSED | overlaps SHOP-142 |
| **1085** | Apply-coupon × closed shop gap | Coupon still resolves when CLOSED | overlaps SHOP-143 |
| **1086** | Automatic discount POST `name` string | Title field uncapped in Zod | *(none)* |
| **1087** | Coupons admin route body spot-check | Standard scalar fields only | *(none)* |
| **1088** | Due-date provider `paid` flag on lines | Unpaid lines may still get dates | *(none)* |
| **1089** | Signature capture 5MB/8s ingress | Courier POD fetch bounded | none (positive) |
| **1090** | `DeliveryLiveMap` client poll ceiling | One-hour client stop constant | none (positive) |
| **1091** | Pay-online rate limits on pay routes | 10/15m intent, 20/15m confirm | none (positive) |
| **1092** | Pass registry 995–1094 uniqueness | 100 new names vs passes 1–994 | *(none)* |
| **1093** | SHOP-151 × SHOP-067 status-money split | Cancel vs refund dropdown fiction | overlaps SHOP-151 |
| **1094** | Pass tranche 1045–1094 cross-check | 50 unique names vs passes 1–1044 | *(none)* |

**Pass finding counts (1045–1094):** 0 passes logged new IDs · 22 passes logged overlaps only · 28 passes logged none · **50 passes total**

**Pass finding counts (995–1094 combined):** 15 passes logged new IDs · 41 passes logged overlaps only · 44 passes logged none or positive · **100 passes total**

---

*End of report.*
