# Spec: designable Product Detail & Product Card layouts (shop module)

Status: agreed design, not yet built. No code changes made. This doc is the plan.

## Goal

Let a site owner design the internal layout of two shop blocks - **Product Detail**
(PDP) and **Product Card** (grid cell) - deciding where price, image, title,
add-to-cart etc. live. Ship the current design as the editable **Default**, plus
**2 alternate** layouts each. Owner picks a shop-wide default and can override
per-block. Must reuse the existing Puck layout editor - build no new editor.

## The two grains (do not confuse)

1. **Page-level layout - already exists.** `admin > Layouts`, Shop group. Which
   *blocks* sit on each shop page (Home/Category/Collection/Product/Checkout/
   Confirmation). Seeded by `modules/shop/lib/starterLayouts.ts`.
2. **Block-internal layout - this spec.** Where the *parts* (price/image/title/
   add-to-cart) live *inside* the ProductDetail block and inside one grid card.
   Currently hardcoded JSX in `ShopProductDetail.tsx` / `ShopProductGrid.tsx`.

This spec adds grain 2 by reusing the exact machinery of grain 1.

## Core idea: two new embeddable layout types

Add two layout types to the shop manifest, in the existing **Shop** group:

- `shopProductDetail` - label "Product Detail"
- `shopProductCard` - label "Product Card"

They appear as two more entries under `admin > Layouts ▸ Shop`, edited in the
same drag-drop editor as every other layout. No new admin surface, no new editor.

Confirmed machinery (all already present):

- `cactus.module.json > layoutTypes` + `scripts/generate-module-layout-types.mjs`
  -> the types surface under the Shop group (`groupLabel: "Shop"`).
- `starterImport`/`starterExport` per type -> seed starter templates. One marked
  `publishByDefault` is the Default; no hardcoded fallback (mirrors the existing
  shopIndex/shopProduct/shopCheckout/shopConfirmation "Puck-only, one published
  starter" pattern).
- Each Puck block's `layoutTypes: [...]` scopes it to a type's palette, via
  `getModuleLayoutPuckRscConfig(type)` reading `moduleRscComponentsByLayoutType`.
- `lib/puck/components/LayoutEmbedRsc.tsx` - renders a saved layout inline with
  module-injected context. This is how the PDP/grid render the chosen template.
- `resolveThemeLayout(type, ctx)` - resolves the published layout of a type
  (used already by the product page). The block's shop-wide default resolves the
  same way; nothing hardcoded.
- `lib/puck/LayoutPickerField.tsx` + `LayoutRef` - the per-block override field.

## Part-blocks (the palette the owner drags)

Carve today's hardcoded markup into small part-blocks, each scoped to only the
relevant new type so they never clutter general page building. Editor render =
placeholder/skeleton (canvas has no product, same as blocks do today); RSC render
= reads injected product context and renders its slice. Same class names/markup
as today, so parity holds.

Product Detail parts (`layoutTypes: ["shopProductDetail"]`):
- Gallery (main image + thumbs)
- Badges (new/trade/stock/low/out)
- Title
- SKU
- Price (now/was/save)
- Blurb (short description)
- Pre-order notice
- Add to Cart (ANCHOR - movable, `permissions.delete: false`)
- Reassurance lines (absorbs the current reassure1..3 fields)
- Tabs (description/spec/dimensions/downloads)

Product Card parts (`layoutTypes: ["shopProductCard"]`):
- Image
- Badge
- Name
- Price (price + compare-at)
- Blurb (short description)
- Spec link / CTA

Anchor rule: the card's link wrapper and the PDP Add-to-Cart are required; editor
must prevent their removal.

## Rendering rewire

`ShopProductDetail` (the block on the Product page):
- Stops rendering hardcoded JSX.
- Resolves the Product Detail layout: per-block override if set, else the
  published `shopProductDetail` default.
- Injects the current product into every part (extend the
  `inject-product-context.ts` pattern -> `injectShopProductDetailEmbed`), then
  `<Render config={getModuleLayoutPuckRscConfig('shopProductDetail')} .../>`.
- Stays the `[Anchor]` block on the shopProduct page (delete/duplicate false).

`ShopProductGrid`:
- Keeps its own props (data source: category/collection/tag, `limit`, `columns`,
  `showFilters`). These are grid-level, not card-internal.
- Resolves the Product Card layout once, then renders it **per product**,
  injecting each product's data into a cloned copy of the template.
- The card-internal design now comes entirely from the `shopProductCard`
  template, not hardcoded `ProductCard`.

### Card unification (decision: "apply everywhere cards show")

Today product cards are rendered FOUR inconsistent ways. All image-card surfaces
adopt the one `shopProductCard` template (design once, consistent everywhere):

- `ShopProductGrid` - `sr-` cards (server RSC).
- `ShopRelatedProducts` - `spc-` cards (server RSC).
- `ShopFeaturedCollection` - inline-styled cards (server RSC).
- `ShopProductCard` ("Shop: Single Product") - inline-styled (server RSC).

All four resolve the card template once and stamp it per product with injected
context - same mechanism, just different data sources.

**Exception - `ShopUpsellProducts` ("Goes well with" / cart strip) stays as-is.**
It is a client island (`UpsellClient.tsx`), cart-driven and live-updating, and
the upsell API returns name/slug/price only (NO image) - it is a pill banner, not
a photo card. Forcing the card template there would need API + client-render
changes and does not fit the format. Left unchanged in v1.

## Global default + per-block override ("both")

- **Global default**: the published `shopProductDetail` / `shopProductCard`
  layout. Fresh install ships the Default starter published so the storefront
  works out of the box. Owner tweaks the default by editing that template in Puck.
- **Per-block override**: a `layoutRef` field (reusing `LayoutPickerField`) on
  the `ShopProductDetail` and `ShopProductGrid` blocks: "Use shop default" or a
  specific saved layout. Set where those blocks are edited - i.e. inside their
  Shop-group layouts, not a generic Pages area.
- To make the new types selectable in the picker, they need `embedOptions`
  declared in the manifest (the picker only lists types in `moduleEmbedOptions`).
  Minimal/empty options are fine.

## Starter layouts (Default + 2 each)

New exports in `modules/shop/lib/starterLayouts.ts`, wired via manifest:

- `shopProductDetailStarters()`:
  - Default (publishByDefault) - faithful rebuild of the current 2-column PDP
    from the parts.
  - Editorial - image-led, full-width.
  - Compact stacked - single column, full-width buy.
- `shopProductCardStarters()`:
  - Standard (publishByDefault) - current card (image top, name, price, spec).
  - Overlay - price/badge over the image.
  - Horizontal - image left, text right (list row).

No type gets a hardcoded fallback; the published Default starter is the source of
truth and is fully editable.

## Admin surfacing

```
admin > Layouts ▸ [Shop]
   Home  Category  Collection  Product  Checkout  Confirmation
   Product Detail   ← NEW  (Default ★ · Editorial · Compact stacked)
   Product Card     ← NEW  (Standard ★ · Overlay · Horizontal)
        └ edited in the normal drag-drop layout editor

Override (optional): on the ShopProductDetail / ShopProductGrid block inside its
Shop-group layout -> "Layout: Use shop default ▾".
```

## Wrinkles / risks (none blocking)

1. **Grid perf**: card layout renders once per product. Injector should carry the
   already-loaded product + media into parts so they don't re-fetch (grid already
   does per-card fetches today; pass data down, don't re-query).
2. **Editor preview realism**: parts show labelled placeholders in the canvas
   (no real product), same as today. Optional later: inject a sample product for
   a realistic preview.
3. **Parity**: editor and RSC walk the same Puck data through the same part
   components -> identical markup by construction. Keep it that way.
4. **Anchor safety**: Add-to-Cart (PDP) and card link wrapper cannot be deleted.

## Work breakdown

1. Manifest: add `shopProductDetail` + `shopProductCard` to `layoutTypes.types`
   (with `starterImport/Export` and minimal `embedOptions`); scope the new
   part-blocks' `puckBlocks` entries with the right `layoutTypes`.
2. Build ~15 part-blocks (Detail ~10, Card ~5) - editor skeleton + RSC render,
   markup carved from current `ShopProductDetail.tsx` / `ShopProductGrid.tsx`.
3. Starters: `shopProductDetailStarters()` + `shopProductCardStarters()`
   (Default publishByDefault + 2 alternates each).
4. Injectors: `injectShopProductDetailEmbed`, `injectShopProductCardEmbed`
   (carry full product/media).
5. Rewire to resolve + embed templates instead of hardcoded JSX:
   `ShopProductDetail` (detail template); `ShopProductGrid`, `ShopRelatedProducts`,
   `ShopFeaturedCollection`, `ShopProductCard` (card template, per product).
   Leave `ShopUpsellProducts` (cart pill strip) unchanged.
6. Per-block override field (`LayoutPickerField`) + resolution (override else
   published default).
7. Regenerate module files; `tsc --noEmit`, `eslint .`, `npm run build` clean.

## Invariants to respect (from CLAUDE.md)

- All changes inside `modules/shop/` - zero core edits, zero diffs elsewhere.
- Colours = tokens only, no hex in chrome. AA contrast checked light + dark.
- Puck editor and RSC render identical markup/classes.
- `lib/modules/router.ts`, `lib/puck/module-components.ts` etc. are generated -
  never hand-edit; change generators, regenerate.
- Update `FIELD_NOTES.md` (new blocks, layout types, starters) before closing.
- Wiki: update the Puck/page-builder + shop pages if user-facing behaviour changes.

## Part options (confirmed)

Most "options" are just include-the-part-or-not (drag in / leave out). Only these
parts carry actual settings, set per-part in the layout editor:

- **Image / Gallery**: shape (square / portrait / landscape) + thumbnail position
  (below / beside). Applies to both Detail gallery and Card image.
- **Price**: show compare-at ("was") price toggle; show "Save X%" badge toggle.
- **Add to Cart** (Detail): show quantity stepper, or plain button only.
- **Spec link / CTA** (Card): link label text.

All other parts (title, name, description, badges, SKU, tabs, reassurance) have no
settings - placement only.

Alternate layout names (confirmed, tweakable): Detail = **Editorial**, **Compact**;
Card = **Overlay**, **Horizontal**. Mock up visually before finalising.

## Open questions

- Exact visual design of the 4 alternates - to be mocked up and approved before/
  during build.
