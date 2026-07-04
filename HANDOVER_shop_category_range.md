# Handover: Shop "Category" layout + RANGE-style product cards

**Date:** 2026-07-04
**Author:** prior Claude session
**Goal:** Make a Cactus shop **category** page look like the `<!-- ================= RANGE ================= -->` section of `deskwell-home-concept.html` (in repo root). Three jobs, in order:

1. **Seed 3 example products** (with the supplied images) and a category to hang them on.
2. **Create a new `shopCategory` Layout** at `http://localhost:3000/cacti/layouts`, assigned to the **entire website**.
3. **Restyle the shop Puck blocks** (`ShopProductGrid` + `ShopCategoryHeader`) so the default category page renders like the concept's RANGE grid.

This follows straight on from the hero + X-RAY/TICKER work already done on the home page (see `HANDOVER_hero_xray_ticker.md` and `FIELD_NOTES.md`). Same tester site, same concept file, same Playwright-compare workflow.

---

## 0. The concept, extracted

RANGE markup is `deskwell-home-concept.html` lines ~373-425; CSS lines ~168-185 and ~226/232 (responsive). Key facts:

**Section head** (`.sec-head`, lines 376-379): eyebrow "The range" + `<h2>Quality furniture, priced out loud.</h2>` (Fraunces, `clamp(30px,...)`). This is the **same `.sec-eyebrow` + `h2` pattern already built on the home page** - eyebrow is the site's Caption token (now teal / uppercase / 0.16em, set last session), h2 is a Heading `level: h2`.

**Card grid** (`.card-grid`, line 168): `display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-top:48px`. Responsive: 2 cols ≤~900px, 1 col ≤~640px.

**Product card** (`.pcard`, lines 169-185):
- White bg, `1px` border (`--color-border`), radius `--r-md` (~12px), shadow `sh1` (`0 1px 3px rgba(0,0,0,.06)`), `overflow:hidden`, flex column, hover lifts to `sh2` (`0 8px 30px rgba(0,0,0,.10)`).
- `.img`: `position:relative; aspect-ratio:4/3; background:--n100 (--color-bg-subtle); overflow:hidden`. Contains the product image (concept uses inline SVGs; **we use real `<img>`** with `object-fit:cover`). A **shimmer sweep** on hover: a `::after` gradient bar that slides across (lines 172-173) - needs a CSS rule + hover, can't be inline style.
- `.badge` (lines 175-178): `position:absolute; top:10px; left:10px; font-size:12px; font-weight:600; padding:4px 8px; radius --r-sm`. Three variants:
  - `badge-new` - teal bg (`--color-primary`), white text.
  - `badge-low` - mustard bg (`--color-heading-mark` / `#E3A857`), dark text (`--color-fg` / n900).
  - `badge-trade` - dark bg (`--color-fg` / n900), white text.
- `.body` (line 179): `padding:18px; flex column; gap:8px; flex:1`.
  - `.name` - 17px / 600 (`--color-fg`).
  - `.price` - 17px / 600, **teal** (`--color-primary`).
  - `.unit` - 12px, muted (`--color-muted`). This is the secondary line: `"£349 per unit for 5+ · 4 day lead time"`, `"Only 4 remaining · restock 14 July"`, `"£152.15 with trade account"`.
  - `.foot` (line 183): `margin-top:auto; padding-top:10px` with a `.spec-link` - 13px / 600 teal `"Full spec →"` link (the arrow is a small chevron SVG).

**The three concept cards** (map these onto the 3 seeded products):

| # | Name | Price | Badge | Unit line | Image |
|---|------|-------|-------|-----------|-------|
| 1 | Linea Standing Desk | £389.00 | New (teal) | £349 per unit for 5+ · 4 day lead time | `.../067292.jpg` |
| 2 | Aria Ergonomic Task Chair | £249.00 | Low stock (mustard) | Only 4 remaining · restock 14 July | `.../047954.jpg` |
| 3 | Modu 3-Tier Storage Unit | £179.00 | Trade price (dark) | £152.15 with trade account | `.../002397.jpg` |

Images (external, load directly as `<img src>` - the shop grid already renders media URLs raw, no `next/image`):
- `https://www.officeboffins.co.uk/media/img/shop/pd/067292.jpg`
- `https://www.officeboffins.co.uk/media/img/shop/pd/047954.jpg`
- `https://www.officeboffins.co.uk/media/img/shop/pd/002397.jpg`

**Colour tokens - use core semantic tokens, never hex** (standing invariant): teal = `--color-primary`, mustard = `--color-heading-mark` (fallback `#E3A857`), dark = `--color-fg`, muted = `--color-muted`, subtle bg = `--color-bg-subtle`, border = `--color-border`. ⚠️ The existing shop blocks use a *different* token vocabulary (`--color-surface-muted`, `--color-text-muted`, `--color-on-primary`, `--color-surface`) - **check which set actually resolves** in `app/globals.css` before you rely on either; prefer the core `--color-*` names the home-page blocks use, since those are known-good on this site.

---

## 1. How a shop category page actually renders (read before touching anything)

The chain (all real, verified this session):

- **Public page**: `modules/shop/app/public/shop/categories/[slug]/page.tsx`. It calls `resolveThemeLayout('shopCategory', { moduleName: 'shop', slug })`. **If a published `shopCategory` Layout matches**, it clones `builderData`, runs `injectCategoryContext(...)`, and renders via `<Render config={getModuleLayoutPuckRscConfig('shopCategory')} data=... />`. **If no layout is published, it falls through to a hardcoded plain grid** (lines 34-51) - so until job 2 is done, your restyle won't show on the page.
- **Context injection**: `modules/shop/lib/inject-category-context.ts` - injects `props.categorySlug` into every `ShopCategoryHeader` **and** `ShopProductGrid` block in the tree (that's the `CATEGORY_CONTEXT_BLOCKS` set). So both blocks know which category they're rendering without a per-instance field.
- **The two blocks that make the RANGE look** (`modules/shop/components/puck/`):
  - **`ShopProductGrid.tsx`** = the card grid. Has an editor render (`ShopProductGrid`, a static `GridSkeleton`) and an RSC render (`ShopProductGridRsc`, real `listProducts(...)` per request via `connection()`). The card markup lives in the inline `ProductCard` async component (lines 34-73) - **this is the `.pcard` you restyle**, and the wrapping `<div style={{ gridTemplateColumns: repeat(columns,1fr) }}>` is the `.card-grid`.
  - **`ShopCategoryHeader.tsx`** = the `.sec-head`. Editor render is a skeleton; RSC render (`ShopCategoryHeaderRsc`) reads `getCategoryBySlug` and emits breadcrumb + `<h1>` + description. Restyle to the concept (eyebrow + big Fraunces heading); it's marked `[Anchor]` (`permissions: { delete:false, duplicate:false }`) so keep that.
- **Registration**: blocks are declared in `modules/shop/cactus.module.json` `puckBlocks[]` with `layoutTypes: ['shopIndex','shopCategory','shopCollection']`, and compiled into the **gitignored** `lib/puck/module-components.ts` / `moduleRscComponents` by `scripts/generate-module-puck.mjs`. You are editing the **component source in `modules/shop/`**, not the generated file. After editing, **regenerate**: `node scripts/generate-module-puck.mjs` (never hand-edit the generated file).

⚠️ **`checkout-modules` gotcha** (from CLAUDE.md / project memory): `scripts/checkout-modules.mjs` re-clones modules and will **revert uncommitted working-tree edits to module files** on a local build. To verify locally without losing your edits: run `node scripts/generate-module-puck.mjs` then `next build`/`next dev` directly - **do not** run `checkout-modules` mid-task. (You're not committing anyway - see constraints.)

### Editor-vs-RSC parity - the one relaxation
Standing invariant is "editor and RSC paths make identical markup." **Shop data-fetching blocks deliberately break this** (editor shows a skeleton, RSC shows real fetched products - the "Gazette pattern"). That's expected and fine. So: restyle the **RSC `ProductCard`** to match the concept, and update the **`GridSkeleton`** to at least echo the new card proportions (4/3 image, 18px body) so the editor canvas isn't wildly misleading. Don't try to make them byte-identical.

### Where does the shimmer/hover CSS go? (module isolation)
Hover shimmer + card-lift + badge styles need real CSS (`:hover`, `::after`), not inline styles. **Do not add them to core `app/globals.css`** - that's a core file and shop is a module (module-isolation invariant: zero diffs outside `modules/shop/` unless unavoidable). Instead ship the CSS **from inside the block**: emit a scoped `<style>` block within the server component (styled-jsx or a plain `<style dangerouslySetInnerHTML>` once per grid), scoped by a class prefix like `shop-pcard`. Keep the whole RANGE styling inside `modules/shop/`. If you find an existing module CSS entry point in `modules/shop/`, prefer that; otherwise the in-component `<style>` is the clean option.

---

## 2. Job 1 - seed 3 products + a category

**Real helpers exist** (verified) - use them from a root-run script, same pattern the home-page work used (`.mjs` in repo root, run, `rm`). Prisma resolves `@/modules/shop/lib/...` from the project root only.

- `createCategory({ name, slug, description? })` → `{ id }` (`modules/shop/lib/db/catalogue.ts`)
- `createProduct({ name, slug, type:'PHYSICAL', status:'ACTIVE', price, shortDescription?, compareAtPrice?, trackInventory?, stockCount?, lowStockThreshold? })` → `{ id }` (`modules/shop/lib/db/products.ts`; **status must be `ACTIVE`** or the grid filters it out - the grid queries `status:'ACTIVE'`)
- `setProductMedia(productId, [{ type:'IMAGE', url, altText, isPrimary:true }])` (`products.ts:315`)
- `setProductCategories(productId, [categoryId])` (`products.ts:330`)

Confirmed enums (`modules/shop/lib/types.ts`): `ShpProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE'` (use `PHYSICAL`), `ShpProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'` (use `ACTIVE`). Price is passed as a number to `createProduct`, stored as a `NUMERIC` string.

**The "unit line" and "badge" have no native single field** - decide the mapping:
- **Unit line** (`.unit`): simplest faithful option is to store the concept's text in `shortDescription` and render `shortDescription` as the `.unit` line. (Clean, no schema change.)
- **Badges**: prefer deriving from **real fields** where possible so the badge means something:
  - *Low stock* (product 2): set `trackInventory:true, stockCount:4, lowStockThreshold:5` and render a "Low stock" badge when `stockCount <= lowStockThreshold`. The grid already computes an `outOfStock` flag you can mirror.
  - *New* (product 1) / *Trade price* (product 3): no native flag. Two options - (a) use the shop **tags** tables (`shp_tags` / `shp_product_tags`) and drive the badge off a `new` / `trade` tag (module-clean, real data), or (b) if that's heavy, a tiny presentational rule (e.g. `compareAtPrice` present → "Trade price"; `createdAt` within N days → "New"). Recommend (a) if a tag helper exists, else (b). **Do not add a column to `shp_products` just for a demo badge** - that's schema churn for cosmetics; if you must, edit the single init migration in place per CLAUDE.md and apply to the test DB the same turn, but check with the user first.

**Shared-DB caution** (project memory): `DATABASE_URL` in `.env.local` points at the **live Tester Neon DB**. Creating products/categories is additive and is what the user asked for - fine. Do **not** run destructive DB actions or finish the setup wizard. If you add any column, it's the single init migration edited in place + applied direct to the test DB via Neon API/`psql` in the same turn (never a second migration file).

---

## 3. Job 2 - create the `shopCategory` Layout, assign entire website

**Layout model** (`prisma/schema.prisma`): `Layout { name, type, builderData Json, displayConditions Json, priority, status PageStatus, isStarter }`. For site-wide:
- `type: 'shopCategory'`
- `status: 'published'`
- `displayConditions: { include: [{ type: 'entire_site' }], exclude: [] }` - confirmed shape: it's the `ENTIRE_SITE_CONDITIONS` constant in `lib/setup/starterLayouts.ts:4`. `ConditionRule` types + scoring live in `lib/layout/displayConditions.ts` (`entire_site` scores 10, the lowest / site-wide default, so any more specific layout still wins).
- `builderData`: a Puck blob whose `content` holds `ShopCategoryHeader` + `ShopProductGrid`. Copy the shape from `modules/shop/lib/starterLayouts.ts` → `shopCategoryStarters()` (three ready templates there - the "Full Width" one is `content: [ ShopCategoryHeader, ShopProductGrid(columns:3, limit:12) ]`, which is closest to the RANGE; you can drop the `ShopPromoBanner`). Each block node is `{ type, props: { id, ... } }` with a unique `props.id`.

**Two ways to create it - pick one:**
- **(a, recommended) Seed the `Layout` row directly** via a root-run prisma script (mirrors how starters seed, avoids the local-login OTP faff). Set the fields above. This is consistent with how the home page was edited this session.
- **(b) Via the admin UI** at `http://localhost:3000/cacti/layouts` → "New" → Shop group → **Category** sub-type → build → set display conditions to **Entire site** → publish. Login is email + password + Brevo OTP at `/cacti/login` (passkeys fail locally - rpId bound to taylor-guest.co.uk). Only go this route if the user specifically wants the UI exercised; otherwise (a) is faster and less fragile.

Whichever you use: the category page only picks up the layout when `status` is **published** and an `include` rule matches. After seeding, hit `/shop/categories/<your-slug>` and confirm the layout renders (not the hardcoded fallback).

---

## 4. Job 3 - restyle the blocks to the RANGE

Edit `modules/shop/components/puck/ShopProductGrid.tsx` and `ShopCategoryHeader.tsx`:

- **`ProductCard` (RSC)** → the `.pcard`: 4/3 image wrapper with `object-fit:cover`, absolute badge top-left (variant by the mapping from job 1), 18px body with name / teal price / muted unit line (`product.shortDescription`) / `.foot` "Full spec →" link to `/shop/products/${slug}`. Keep the existing `outOfStock`/`isPreOrder` badge logic or fold it into the new badge system - don't silently drop it.
- **Grid wrapper (RSC)** → `.card-grid`: `repeat(columns,1fr)`, `gap: 24px`, and the responsive collapse (2 then 1 col) via the scoped `<style>` (media queries can't be inline). `columns` default stays 3.
- **`GridSkeleton`** → echo the new card proportions (4/3 image, 18px body) so the editor canvas roughly matches.
- **`ShopCategoryHeaderRsc`** → the `.sec-head`: small teal uppercase eyebrow (e.g. "The range", or the category's parent name) + a big Fraunces `<h2>`-scale heading using the category name. Reuse the display/heading font token (`var(--display-family, ...)`) and the caption-eyebrow styling the home page already uses. Keep the `[Anchor]` permissions.
- **Shimmer/hover/badge CSS** → scoped `<style>` inside the module (see §1, module-isolation). Include the `.pcard:hover` lift, the `.img::after` shimmer sweep, `.badge-*` variants, and the grid media queries.
- **Tilt** (concept's `transform-style:preserve-3d` mouse parallax, `data-oscar`) is JS-driven progressive enhancement - **skip it** (or a tiny client wrapper later). Not needed for the look and it drags a client component into a server-rendered grid.

After editing: `node scripts/generate-module-puck.mjs`, then `tsc --noEmit` + `eslint .` clean.

---

## 5. Verify (Playwright compare - reuse last session's harness)

Dev server on `http://localhost:3000` (user starts it; you may restart). Public site is coming-soon for anon visitors - inject the session cookie:

```
cactus_session = 962648f142f43862112925dabd89cc2a443d2861830ebbeec7723c2ce9acd087
```

(domain `localhost`, path `/`, sameSite `Lax`; ask the user for a fresh one if you get "Coming Soon".)

Playwright isn't in project `node_modules` - symlink the npx cache into the scratchpad:
`ln -sfn /Users/chris/.npm/_npx/361ceb562f3b3235/node_modules <scratchpad>/node_modules` (v1.61.1, chromium installed). Adapt last session's `<scratchpad>/shot.mjs` (it screenshots the concept `file://.../deskwell-home-concept.html` and the live site at multiple widths with `reducedMotion:'reduce'`, injecting the cookie for the live target and cache-busting the URL, then you Read the PNGs to compare).

- **Concept target**: selector `.card-grid` (and `#range .sec-head`).
- **Live target**: `http://localhost:3000/shop/categories/<your-slug>` (the category you seeded, with the published layout assigned).
- Compare desktop (1280) + mobile (480). Iterate until the grid, cards, badges, prices, and section head read like the concept.

---

## 6. Constraints (all still apply - from CLAUDE.md + project memory)

- **No build / commit / push / release / Vercel unless the user asks that turn.** `tsc --noEmit` + `eslint .` must pass zero errors/warnings before you report done. (Run `node scripts/generate-module-puck.mjs` after module edits so tsc sees the wiring.)
- **No local browser testing beyond the Playwright compare** (shared live DB). The product/category/layout **seeding** is the sanctioned exception the user asked for - additive only, no destructive DB actions, don't finish the setup wizard.
- **Module isolation / minimal footprint** (STRICT memory): keep every diff inside `modules/shop/`. No core `app/globals.css` edit, no core block changes, for a shop-only look. Never hand-edit `lib/puck/module-components.ts` (generated).
- **Colours are tokens, never hex** in block chrome; AA contrast in light + dark for any new text/surface (check the mustard "Low stock" badge - dark text on mustard, and white on teal/dark).
- Update `FIELD_NOTES.md` (Shop / Puck sections + the running "Last updated" line) after the block changes - surgically.
- If a category page's feature/behaviour changes end-to-end, the **Puck / shop wiki page** wants updating before any commit (you're not committing, so flag it in your report rather than half-editing the separate wiki checkout).
- British spelling, no em dashes, dry wit in any user-facing copy.
- **Telegram progress pings** at each checkpoint (start / products seeded / layout created / blocks restyled / done) via `/Users/chris/.claude/telegram-bridge/send.sh "<plain text>"` - short, jargon-free.

## 7. Suggested order
1. Read `resolveThemeLayout.ts` (confirm `entire_site` rule shape) + `ShpProduct`/`ShpProductType` types + `starterLayouts.ts` `shopCategoryStarters()`.
2. Seed category + 3 products (+ media, + category links, + badge signals) via a root-run script.
3. Seed (or build in UI) the published `shopCategory` Layout, entire-site. Confirm `/shop/categories/<slug>` renders the layout, not the fallback.
4. Restyle `ShopProductGrid` (`ProductCard` + grid + skeleton + scoped CSS) and `ShopCategoryHeader` to the RANGE. Regenerate, tsc, eslint.
5. Playwright-compare desktop + mobile, iterate.
6. Update FIELD_NOTES. Report; do not commit/push unless asked.
```
