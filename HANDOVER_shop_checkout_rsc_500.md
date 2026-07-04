# Handover: Shop **checkout + order-confirmation** pages 500 (client-registered Puck blocks under RSC Render)

**Date:** 2026-07-04
**Author:** prior Claude session (found while shipping the product-page restyle, shop v0.1.8 / core v0.5.228)
**Severity:** High - a fresh shop cannot take payment. The **checkout page** and the **order-confirmation page** both return HTTP 500 out of the box, on their default published layouts. Pre-existing; not introduced by the product-page work.

---

## 1. Symptom

- `GET /shop/checkout` → **500**.
- `GET /shop/order/<...>` (order confirmation) → **500**.
- The shop **index** (`/shop`), **category**, **collection** and **product** pages render fine (200).

Reproduce (needs a login cookie because the public site is coming-soon for anon - mint a `cactus_session` the same way the product-page handover describes, or ask the user):

```
curl -sS -m 90 --cookie "cactus_session=<token>" -o /dev/null -w "%{http_code}\n" \
  http://localhost:3000/shop/checkout      # -> 500
```

Dev-server log shows, once per request:

```
⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly
   expose it by marking it with "use server". Or maybe you meant to call this function
   rather than return it.
  {renderDropZone: function renderDropZone, metadata: ..., dragRef: ..., isEditing: ...}
                   ^^^^^^^^^^^^^^^^^^^^^^^
    at stringify (<anonymous>)
  { digest: '...' }
```

---

## 2. Root cause

The public shop pages render their layout through Puck's **RSC** renderer - `import { Render } from '@puckeditor/core/rsc'` (see e.g. `modules/shop/app/public/shop/checkout/page.tsx`). Puck hands **every** registered block a render-prop bag on the server: `{ renderDropZone, metadata, dragRef, isEditing }`. `renderDropZone` is a **function**.

- For a block whose registered `render` is a **server** component, that is fine - server components receive functions and run on the server, nothing is serialised.
- For a block whose registered `render` is a **client** component (`'use client'` at the top of the file, exported straight through as both `...PuckComponent.render` and `...PuckRscComponent`), React has to **serialise the props across the client boundary**. It hits `renderDropZone` (a function), throws "Functions cannot be passed directly to Client Components", and 500s the whole page.

This is exactly the bug that was fixed for the product page's `ShopBackInStockForm` and `ShopUpsellProducts` in **shop v0.1.8** (commit `3513d45`). The checkout/confirmation blocks were never converted, so they still break.

### Affected blocks (all in `modules/shop/components/puck/`)

Client-registered (`'use client'` + `xxxPuckRscComponent = xxxPuckComponent`) → **broken under RSC Render**:

| Block | Renders on | In default layout? |
|---|---|---|
| `ShopCheckoutContact` | `/shop/checkout` | **Yes** - all 3 checkout starters |
| `ShopCheckoutShipping` | `/shop/checkout` | **Yes** - all 3 checkout starters |
| `ShopCheckoutPayment` | `/shop/checkout` | **Yes** - all 3 checkout starters (has Stripe) |
| `ShopCheckoutReview` | `/shop/checkout` | **Yes** - all 3 checkout starters |
| `ShopOrderConfirmation` | order-confirmation page | **Yes** - all 3 confirmation starters |
| `ShopCartSummary` | wherever a site owner drops it in Puck | No starter uses it (latent, lower priority) |

The `/shop/cart` page is **not** affected: it renders `CartPageClient` directly from a server page, not through Puck (`app/public/shop/cart/page.tsx`).

Every one of these blocks takes `Record<string, never>` props - **no configurable fields** - so the conversion below carries no prop plumbing.

Blocks that are already correct (leave them alone): `ShopProductDetail`, `ShopBackInStockForm`, `ShopUpsellProducts` (all fixed in v0.1.8), and the server blocks `ShopProductGrid`, `ShopRelatedProducts`, `ShopCategoryHeader`, `ShopCollectionHeader`, `ShopFeaturedCollection`, `ShopCategoryBrowser`, `ShopProductCard`, `ShopPromoBanner`.

---

## 3. The fix (proven pattern - copy v0.1.8)

For each broken block, split it into a **server wrapper** (the registered Puck block) + a **client island** (the interactive body). The server wrapper receives Puck's function bag harmlessly (server side), and passes only plain props (here: none) into the client island.

Reference implementations shipped in v0.1.8:
- `modules/shop/components/puck/ShopBackInStockForm.tsx` (server wrapper) + `modules/shop/components/public/BackInStockClient.tsx` (`'use client'` island).
- `modules/shop/components/puck/ShopUpsellProducts.tsx` + `modules/shop/components/public/UpsellClient.tsx`.

### Per block, do:

1. Create `modules/shop/components/public/<Name>Client.tsx`:
   - Add `'use client'` at the top.
   - Move the **entire current body** of the block file into it (the component + its hooks/state/fetch/Stripe logic). Export it, e.g. `export function CheckoutContactClient() { ... }`.
2. Rewrite `modules/shop/components/puck/<Name>.tsx` as a **server** file (remove `'use client'`):
   - Import the client island.
   - The registered component just returns the island: `export function ShopCheckoutContact() { return <CheckoutContactClient /> }`.
   - Keep the same `label` / `fields: {}` / `defaultProps: {}` and the two exports. `xxxPuckRscComponent = xxxPuckComponent` is now fine because the registered `render` is a server component.
3. Regenerate: `node scripts/generate-module-puck.mjs`.

Because every affected block has empty props, the wrapper passes nothing. If a future refactor gives one of them real fields, forward only those (plain, serialisable) values into the island - never spread Puck's `puck`/render-prop bag into it.

---

## 4. Watch-outs specific to these blocks

- **`ShopCheckoutPayment`** wraps Stripe. Keep the Stripe Elements / client SDK usage entirely inside `CheckoutPaymentClient`; the server wrapper must not touch it. Verify the payment step still mounts and can take a Stripe **test** card.
- The checkout steps share client state via `modules/shop/components/public/checkout-state.ts` and the cart in `modules/shop/components/public/cart.ts` (localStorage). That state lives in the client islands already - moving the body wholesale preserves it. Don't try to lift any of it to the server.
- **`ShopOrderConfirmation`** reads the order from the URL/query on the client - confirm it still resolves the order after the split.
- Editor parity: in the Puck **editor** these render client-side anyway, so the canvas is unchanged. Only the public RSC path was broken.

---

## 5. Verify (end-to-end - this is why it's a separate job)

The type-check/lint/build will pass as soon as it compiles, but the real test is the flow:

1. Mint a `cactus_session` cookie (coming-soon gate) - see the product-page handover for the exact `createSession` recipe, or ask the user for a fresh cookie.
2. Put an item in the cart (localStorage `cactus_shop_cart`, or click Add to basket on a product), then load `/shop/checkout`.
3. Step through **Contact → Shipping → Payment → Review**. Confirm each step renders (no 500) and advances.
4. Payment needs Stripe **test** mode configured on the shop; run a test card through to produce an order, then confirm the **order-confirmation** page renders (not 500).
5. Screenshot-compare is optional here - correctness (pages load, flow completes) is the bar, not pixels.

Shared **live Tester DB** - additive only, do not finish the setup wizard, no destructive actions.

---

## 6. Checks + shipping

- After converting: `node scripts/generate-module-puck.mjs`, then `tsc --noEmit`, `eslint .`, `vitest run` - all zero.
- `npm run build` runs `checkout-modules` first, which **reverts uncommitted module edits by re-cloning the module from its `main`**. So: **commit + push the shop module FIRST**, then build core, then commit core. (The tree is often multi-agent - stage only the files this task changed; never `git add -A`.)
- Ship order: shop module (patch-bump **both** `package.json` and `cactus.module.json`, e.g. 0.1.8 → 0.1.9, tag = manifest version, `--prerelease`, identity `airings.snug-0m@icloud.com`) → build core → core (patch-bump `package.json`, push `origin` only, `--prerelease` release, site-owner notes: "you can check out again", zero jargon) → wiki only if behaviour changes (it does not; this is a straight fix).

---

## 7. Scope notes

- **Do not** touch the already-fixed product-page blocks or the server blocks listed in section 2.
- Same latent bug can exist in **other modules**: any block that is `'use client'` at the top and exports `xxxPuckRscComponent = xxxPuckComponent` will 500 when rendered on a public page through the RSC `Render`. Worth a sweep once checkout is sorted - grep each module's `components/puck/` for `'use client'` blocks whose RSC export just re-uses the client component. Out of scope for this task, but flag anything found.
