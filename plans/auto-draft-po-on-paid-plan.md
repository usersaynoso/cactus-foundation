# Auto-draft purchase orders when a customer order is paid

Scope only. Nothing here is built yet.

**Modules touched:** `shop` (one new extension point, ~40 lines), `purchase-orders` (the provider, a setting, a sweep, reporting).
**Core:** nothing but the two pins and a FIELD_NOTES entry.

---

## What happens today

A customer pays. The order sits there. Somebody opens it in the admin, opens the
**Purchasing** panel, presses Raise, reads the drafts, presses Send on each.

`raisePurchaseOrdersFromShopOrder` (`modules/purchase-orders/lib/from-order-run.ts:52`)
has exactly one caller: `app/api/admin/orders/from-shop-order/route.ts`, which is
that button. Nothing watches payment. The daily reorder cron works off stock
levels and never looks at orders.

What the button already gets right, and what this proposal must not lose:

- **Drafts only.** One DRAFT per supplier, drop-shipped to the customer, nothing
  emailed to anybody. A person still presses Send.
- **Idempotent.** A second press is refused by name - it lists the POs already
  raised against that order. A *cancelled* PO does not lock the order out.
- **Refuses a dead order.** `CLOSED_SHOP_ORDER_STATUSES` (`CANCELLED`, `REFUNDED`)
  are turned away inside the run, not just hidden in the panel.
- **Says what it could not buy.** `plan.skipped` carries a sentence per line.
- **Approval still applies.** `needsApproval(total, config)` marks the draft.

## What changes

The same run, started by the money landing instead of by a click. **Still drafts
only.** The thing being automated is the typing, not the buying.

---

## 1. The seam: `shop.order-paid`

Every payment path in the platform funnels through one function -
`fulfillPaidOrder` in `modules/shop/lib/order-fulfillment.ts`, gated by
`markOrderPaid()` returning true, so it runs **exactly once per order**:

| Path | Caller |
| --- | --- |
| Card (Stripe) | `app/api/webhooks/stripe/route.ts` |
| PayPal | `app/api/webhooks/paypal/route.ts` |
| Checkout confirm (incl. zero-total and bank transfer) | `app/api/public/checkout/confirm/route.ts` (two call sites) |
| Marked paid by hand | `app/api/admin/orders/[id]/confirm-payment/route.ts` |
| Square | `square-payment-for-shop/lib/settle.ts` |
| GoCardless | `gocardless-instant-bank-pay-for-shop/lib/settle.ts` |

One hook site covers all six. No payment module changes.

**New file `modules/shop/lib/order-paid-hooks.ts`**, modelled on
`lib/order-payment-state.ts` - the seam that already exists for "the money has
landed, say the true thing now":

```ts
// shop.order-paid - a module gets told, once, that an order has been paid for.
//
// Observers, not contributors: nothing they return is stored and nothing they
// do is waited on for correctness. Shop stays generic - it knows nothing about
// purchasing, and a site with no purchasing module gathers nothing and does
// nothing.
export type OrderPaidEvent = {
  orderId: string
  orderNumber: string
  /** How the money arrived, for an observer that cares. */
  paymentMethod: string
  /** True where the owner cleared the payment by hand rather than a provider
   *  settling it. Bank transfer cleared days after the order was placed is a
   *  different situation from a card authorised thirty seconds ago. */
  clearedManually: boolean
}
export type OrderPaidObserver = (event: OrderPaidEvent) => Promise<void> | void

export async function notifyOrderPaid(event: OrderPaidEvent): Promise<void>
```

**The payload is deliberately primitives, not `ShpOrder`.** An observer typing
its argument against shop's types would be importing `@/modules/shop`, which
purchase-orders must never do (module-to-module isolation, `requiresModules: []`).
`orderId` is all purchase-orders needs - `readShopOrder` already reads
`shp_orders` by raw SQL behind `hasCatalogue`.

Called from the **end** of `fulfillPaidOrder`, after stock, downloads, the
invoice and both emails, wrapped exactly as the invoice trigger already is:

```ts
// The money has landed and the customer has been told. Anything a module wants
// to do about that is its own business and must not fail a payment webhook.
try {
  await notifyOrderPaid({ ... })
} catch (err) {
  console.error('[shop] order-paid observers failed', order.id, err)
}
```

`notifyOrderPaid` swallows and logs per observer as well, so one bad module does
not stop the next - the rule `applyOrderPaymentState` already follows.

**Shop version:** 0.1.357. On its own it changes nothing observable.

---

## 2. The setting

`modules/purchase-orders/lib/config.ts`, beside `reorderAutomatic` and
`supplierCatalogues`, and off for the same reason both of those are:

```ts
// Whether a paid customer order drafts its purchase orders by itself.
//
// OFF by default. Everything this does can already be done by pressing the
// button on the order, and an update that quietly starts drafting purchase
// orders on a live site is not an update anybody would thank us for. It drafts
// and stops - nothing is approved, nothing is sent, nothing reaches a supplier
// without somebody reading it first.
autoDraftFromPaidOrders: z.boolean().default(false),
```

Settings → Purchase Orders, under the reorder block. Checkbox plus the paragraph
saying in plain words: drafts appear, nothing is sent, and here is where they
turn up.

**No second knob.** Considered and rejected for now: per-supplier opt-in (the
plan already skips anything it cannot match to a supplier), a value threshold
(approvals already do that), and "only for drop-ship lines" (every line raised
this way is drop-ship by construction).

---

## 3. The provider

**New `modules/purchase-orders/lib/order-paid-provider.ts`**, registered in
`cactus.module.json` alongside the panel that is already there:

```json
{
  "point": "shop.order-paid",
  "id": "purchase-orders-draft-on-paid",
  "import": "./lib/order-paid-provider",
  "component": "purchaseOrdersOrderPaidObserver"
}
```

What it does, in order, cheapest check first:

1. `getPoConfigCached()` - `autoDraftFromPaidOrders` off → return immediately.
   This is the common case on every site that never switches it on, and it costs
   one cached read.
2. `raisePurchaseOrdersFromShopOrder({ orderId, userId: null })`.
3. Log the outcome. Never throw.

**`FromOrderRunOptions.userId` becomes `string | null`.** `createOrder` and
`recordAudit` already take `string | null` and `runReorder` already passes null,
so this is a signature widening and nothing else. The audit entry reads as the
system having done it, which is the truth.

**Nothing else in the run changes.** The refusals it already has are exactly the
ones an automatic caller needs:

| Situation | Existing behaviour | Right for automation? |
| --- | --- | --- |
| Order cancelled/refunded | Refused by name | Yes - and a refund racing the webhook is now a real case, not a theoretical one |
| POs already raised | Refused, lists them | Yes - a replayed webhook drafts nothing twice |
| No shop installed | Refused | Yes |
| Nothing matched a supplier | Refused, `skipped` says why | Yes, **if somebody is told** - see §5 |

---

## 4. The catch-up sweep

A hook is not enough on its own. Four ways an order gets paid and drafts nothing:

- The webhook died, or the observer threw, or the deploy was mid-flight.
- Purchase-orders was installed after the order was paid.
- The setting was switched on after the order was paid.
- Shop is older than 0.1.357 and has no point to gather.

**New `modules/purchase-orders/lib/paid-sweep.ts`**, run from the existing daily
reorder cron route (`app/api/cron/reorder/route.ts`) rather than a new cron entry
- one more Vercel cron slot for a job measured in milliseconds is not worth it,
and the two jobs want the same "here is your paperwork this morning" framing.

```
Every shp_orders row where:
  payment_status = 'PAID'
  AND status NOT IN ('CANCELLED','REFUNDED')
  AND paid_at >= now() - interval '7 days'
  AND no live po_orders row has source_ref->>'orderId' = that id
→ raise, exactly as the hook does.
```

Seven days is a backstop, not a migration: it stops the first run after switching
the setting on drafting purchase orders for every order the shop has ever taken.
Worth saying so on the settings checkbox in as many words.

Gated on `autoDraftFromPaidOrders` too, so a site that has not asked for this
never sweeps.

**The sweep also reports the reverse case**, which automation creates and the
button did not: a *live* PO whose customer order has since gone `CANCELLED` or
`REFUNDED`. Nobody chose to raise that one, so nobody is watching it. It goes in
the run's result and on the Purchasing panel; it is **not** auto-cancelled -
goods may already be on their way, and that is a decision with a phone call in
it.

---

## 5. Telling somebody

The button's caller reads `skipped` on screen. A background run has no screen, so
three places:

1. **Audit.** `order.created` already records `source: 'FROM_ORDER'`. Add
   `raisedBy: 'AUTO' | 'USER'` so the Reports tab can tell them apart.
2. **The Purchasing panel** on the shop order: says the drafts were raised
   automatically, and lists whatever was skipped, so opening the order tells the
   whole story.
3. **A new email template `PO_AUTO_DRAFT_REPORT`** to
   `adminOrderAlertEmail || storeEmail`, sent **only when there is something
   wrong** - lines that could not be bought, or a supplier that could not be
   matched. A daily "raised 3 drafts, all fine" email is an email nobody reads by
   week two, and the drafts are already sitting on the Orders tab.

---

## 6. Files

**shop 0.1.357**
- `lib/order-paid-hooks.ts` (new)
- `lib/order-fulfillment.ts` (the call, in a try/catch)
- `lib/order-paid-hooks.test.ts` (new): observers run in manifest order, one
  throwing does not stop the next, no observers = no work.

**purchase-orders 0.1.15**
- `lib/config.ts` - the flag
- `lib/order-paid-provider.ts` (new)
- `lib/paid-sweep.ts` (new) + `lib/paid-sweep.test.ts` (new, pure part)
- `lib/from-order-run.ts` - `userId: string | null`, `raisedBy` on the audit
- `lib/from-order.ts` - the "paid but unbought" and "PO live for a dead order"
  queries, pure selection logic tested
- `lib/email-templates.ts` - `PO_AUTO_DRAFT_REPORT`
- `app/api/cron/reorder/route.ts` - runs the sweep after the reorder
- `components/admin/PurchaseOrdersSettingsTab.tsx` - the checkbox
- `components/admin/OrderPurchasePanel.tsx` - "raised automatically", skipped
  lines, the dead-order warning
- `cactus.module.json` - the extension point, version
- No migration. `source_ref` is already JSONB and already carries `orderId`.

**core** - two pins in `modules.json`, FIELD_NOTES, `wiki/Purchase-Orders.md`
(a section under "Raising a purchase order"), `wiki/Shop.md` if the point is
worth documenting for module authors.

---

## 7. Release order

Either order. Shop 0.1.357 alone gathers nothing and does nothing.
Purchase-orders 0.1.15 against an older shop finds no point to register against,
so the hook never fires - **and the sweep still drafts within a day**, which is
the graceful degradation worth having. Neither pin blocks the other, per the
standing rule that a split fix must build in either order.

`requiresCoreVersion` unchanged. `requiresModules` stays `[]` on both.

---

## 8. Risks, honestly

- **Money is being committed by a machine.** It is not - a draft commits nothing
  and no supplier is contacted. But the *paperwork* now appears without a person,
  and paperwork that appears is paperwork that gets sent. The default-off setting
  and the drafts-only rule are the whole defence, and neither should be relaxed
  later without saying so out loud.
- **Latency in a payment webhook.** The run reads the order, plans it and inserts
  one PO per supplier - a few hundred milliseconds. It sits at the very end of
  fulfilment, after the customer's email, inside a try/catch, so the worst case
  is a slower webhook and no drafts. The sweep picks those up.
- **A refund arriving after the draft.** New with automation. Handled by the
  sweep reporting it rather than by auto-cancelling.
- **Duplicate drafts.** Guarded three deep: `markOrderPaid` fires fulfilment
  once, the run refuses when live POs exist, and the sweep asks the same
  question.
- **A shop-side change at all.** Unavoidable: only shop knows when money lands.
  Kept to a generic point that names no module, exactly like
  `shop.order-payment-state` and `shop.order-detail-panels`.

## 9. Checks

`npm run typecheck`, `eslint .`, full `npm test` with the new suites. **No
schema change in either module, so the backup round-trip gate does not apply** -
worth re-stating in FIELD_NOTES so the next person does not wonder.

Not verifiable in a browser here: it needs a paid order on an install with both
modules at the new versions.

---

## 10. Rough size

Half a day. Shop's half is small and mechanical; the sweep and the reporting are
the bulk of it. Two module releases, two pin bumps, one core release.
