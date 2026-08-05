# Space Planner module - implementation plan

Status: PLANNED 2026-08-04. Not started. Plan written from live-catalogue recon, then
**revised same day after a codebase verification pass** - every platform-mechanics claim
below now carries a file reference, measured against the repo, not remembered. Catalogue
numbers were measured against the Deskwell database on 2026-08-04.
Scope: a new first-party module named `space-planner-for-shop` letting shoppers build a
scale 3D model of their own room (any polygon shape), place their cart items and any other
catalogue products in it, check fit, and get plans, renders, item lists and quotes out of
it - entirely in the browser, on the catalogue's existing 3D files, without authoring any
alternate asset versions. **Single build to completion, one release. No phased delivery.**

Revision summary (what the verification pass changed):
- The five invented "shop seams" are gone. Modules import required modules' libraries
  directly and implement extension points that already exist; no shop release, and very
  probably no core release, is needed at all (§4, §15).
- The quote flow is gone from this module's schema. Deskwell runs `quote-for-shop` v0.1.8,
  which already has the whole pipeline (numbered quotes, emails, admin inbox, expiry cron,
  convert-to-order). The planner feeds it instead of duplicating it (§10).
- `cart_session_id` was fiction - there is no cart session id of any kind (§3, §9).
- **Member carts now persist server-side and follow the shopper across devices** (shop
  0.1.192, `shp_member_carts` + `cart-sync.ts`). Folded in 2026-08-04: the planner must use
  shop's cart util rather than localStorage or it silently loses that sync; the 200-line cap
  applies to "add whole plan to cart"; and the cross-device expectation it sets is why
  member plans following the account matters more than it did (§9).
- **Saved plans belong to an account, and rooms hold many plans** (added 2026-08-04 on
  request). `spl_plans` split into `spl_rooms` (the measured space) and `spl_plans` (a
  layout within it), both member-owned and both named by the user; saving requires sign-in,
  guests work in localStorage scratch. This removed anonymous persistence entirely -
  `client_id`, guest retention sweeps, adoption reconciliation and every unauthenticated
  write endpoint went with it (§3, §9b, §13). Plan comparison and geometry-edit propagation
  are the two behaviours the new shape makes possible and necessary.
- The runtime budget was self-defeating: a ~40-instance cap kills the 20-desk office that
  §7's repetition tools exist for. Budgets are now per unique model, with instancing (§8).
- Public module pages always render inside the site header/footer - there is no full-screen
  opt-out. §11 now plans for that instead of assuming a bare route.
- Added: product-page and cart entry points, member account surface, instancing, emails,
  permissions, analytics home, anti-abuse, GDPR export/teardown, media-seam registration,
  and a verify-at-build-start list (§18).

Second review pass, same day - gaps found by deliberately hunting for them:
- **Real-world scale is destroyed by the loader we planned to reuse.** p3d's `frameModel`
  normalises every model to a 2-unit longest side; a planner must take the
  pre-normalisation bounding box or every room is convincingly wrong (§8).
- **Delivery dates on the BOM went from "out of scope" to "nearly free"** - the shipping
  module already answers exactly this, batched, per line (§10).
- Added: plan version history and restore, a resumable dimension rebuild (22,055 products
  will not fit in a 60-second route), thumbnail policy, first-run design, typed room entry,
  bulk finish replace, safety-guidance wording, render staleness, a decision on whole-room
  GLB export versus the model-theft posture, consent gating, and `owner_user_id` kept free
  for the owner-revises-a-plan loop.

---

## 1. Ground truth (measured 2026-08-04)

### Catalogue

| Fact | Number | Consequence |
|---|---|---|
| Active products | **22,055** - 462 visible listings, 21,593 catalogue-hidden variant children (was 17,939/343 earlier the same day; **the catalogue is a moving target, so treat every absolute here as a snapshot and the proportions as the durable fact**) | Planner works at variant level like the cart, but *browses* at listing level: `listProducts({excludeHidden:true})` returns the 462, and shop-variations resolves options → child. That is a comfortable browse-panel scale |
| Modelled listings | **26 of 462 visible = 5.6%** (re-measured; the earlier "26 of 343" was the same 26 against a smaller denominator) | **94% of what a shopper can browse has no model.** Placeholder rendering is the main path, not the fallback |
| Products with a 3D model | 4,402 variant children across those 26 listings | See the modelled-listings row above |
| Spec attribute rows to resolve | 283,946 `pat_product_values` over 4,170 distinct attribute values, 49 categories | A full dimension-cache rebuild is a **bulk backfill, not a request** - it cannot run in one 60 s route (§5) |
| Model rows by format | glb 4,370 / fbx 18 / obj 14 | **The existing viewer loads all three** (`load-model.ts:280-295` - OBJLoader, FBXLoader). No format conversion needed; the planner inherits the same loaders |
| Variants whose only model is fbx/obj | 32 (Oslo Back-to-Back Desks, Impulse Arrowhead Boardroom Table 180/240) | Both are planner-relevant products. They render, but pull heavy lazy loader chunks and uncompressed ASCII geometry - the case for re-exporting *those 11 files* to GLB |
| **Distinct model files** | **257** (246 glb, 9 fbx, 2 obj) after normalising urls; 298 raw | This, not 4,402, is the real pipeline workload. One chair file is stored 42 times under 42 stale signed urls, so **dedupe must strip the query string** before counting |
| Geometry compression in shipped GLBs | **None.** Sampled files carry `KHR_texture_transform` only - no Draco, no meshopt | Nothing to decode today; decoder registration is future-proofing. Also means bytes-on-the-wire is the weak point, not triangles |
| GLB size where recorded (22 rows) | avg 4.0 MB, max 8.5 MB (local working copies run 20-22 MB) | ~12 unique models resident ≈ 48 MB of raw download *before* any runtime crunching. Decimation saves GPU, not bandwidth |
| `dimension_l/w/h` populated | **0 of 17,939** | Core dimension columns are dead. Sizes must come from spec attributes, GLB geometry, or defaults |
| "Overall Width" spec values | 12,888 products | Best dimension source, text-valued, needs parsing |
| "Overall Depth" / "Overall Height (spec)" | 5,283 / 5,274 | Patchy - category defaults must fill the gap |
| "Height Under Top" / "Width Under Top" | 2,394 / 8,108 | Enables a real "does this pedestal fit under this desk" check |
| Made To Order products | 4,486 | **No `shp_products` flag exists for this** - it lives in spec attributes. Stock badging draws on `track_inventory`/`stock_count`/`out_of_stock_behaviour`/`is_pre_order` plus the attribute |
| Largest GLB | 8.1 MB (`p3d_models.size` is 0 on most rows - url-only bulk inserts) | Byte budgeting must measure at fetch time; CDN 405s HEAD, so read `content-length` off the streamed GET |
| GLB sharing | Impulse maps variation→GLB by Width+Storage only | Dedupe loads by URL - many variants share one file |

### Platform mechanics (verified in-repo, load-bearing for this plan)

| Fact | Evidence | Consequence |
|---|---|---|
| **Guest** cart is localStorage only - no table, no cookie, no session id | `modules/shop/components/public/cart.ts` (`cactus_shop_cart`, change events `cactus-shop-cart-changed`/`-added`) | Guest plans need the planner's own anonymous id - there is still no cart session to borrow |
| **Member** cart persists server-side and follows the shopper across devices (shop 0.1.192) | `shp_member_carts` (`migrations/016_member_carts.sql`), `lib/db/member-cart.ts`, client layer `components/public/cart-sync.ts`, route `/api/m/shop/member/cart` | Changes the plan in three places - see the cross-device row below. Cap: **200 lines** (`MEMBER_CART_MAX_LINES`) |
| Cart sync is auto-wired and transparent: reading or writing the cart util calls `ensureCartSync()` itself | `cart.ts:99,156`; merge-on-signin, 600 ms debounced push, 15 s throttled pull on tab focus, `pagehide` keepalive push | **The planner must go through shop's cart util and never touch `cactus_shop_cart` directly** - direct writes skip the sync layer and silently lose cross-device |
| Dependent modules import required modules' code directly | p3d imports shop's gallery contract (`modules/shop/lib/gallery-media.ts:68-77`); pattern repo-wide | No data "seams" needed - import `listProducts`, tax utils, model resolvers |
| Extension point names are arbitrary strings owned by the publishing module; core keeps no registry | `lib/modules/manifest.ts:106-116`; generated `lib/modules/extension-points.ts` | Implementing an existing point is module-only work; a new point is only core work if its host surface is a core page |
| 33 extension points live today, incl. `shop.product-detail-parts`, `shop.product-detail-tabs`, `shop.cart-header-actions`, `members.account-section`, `members.account-nav`, `core.admin-dashboard-widgets` | generated `lib/modules/extension-points.ts:72-202` | Planner entry points and member surfaces plug into existing slots - zero shop changes |
| Module crons declare in the manifest; `vercel.json` is generated | `lib/modules/manifest.ts:25-30`, `scripts/generate-module-cron.mjs:39-63` | Nightly cache rebuild needs no core edit. Auth = `CRON_SECRET` bearer check in the handler |
| Email templates register via manifest into one core registry; keys must be `space-planner.`-prefixed | `lib/modules/manifest.ts:141-145`, `lib/email/registry.ts:321-329`, send via `sendTemplateEmail` (`lib/email/index.ts:107-118`) | Owner-editable copy and on/off for free; handle the null (switched-off) render |
| Module permissions declare in the manifest, upsert at install; every admin page enforces its own key | `lib/modules/manifest.ts:50`, `app/api/admin/modules/route.ts:187-195`, pattern `modules/shop/lib/access.ts:17-26` | §12 names concrete keys and a shop-style access helper |
| Media writes go through `uploadMedia` + `saveMediaRecord`; storing a media url in your own table obliges you to implement `core.media-usage-providers` and `core.media-reference-rewriters` | `lib/media/upload.ts:393,839-882`, `lib/media/usage-providers.ts:3-26`, `wiki/Authoring-a-module.md:464-465` | Without both, plan thumbnails get offered for bulk deletion and break on media renames |
| Module public pages hang off `publicBasePath` under core catch-alls, always inside the site header/footer, always dynamic | `scripts/generate-module-router.mjs:126-159`, `app/(public)/layout.tsx:110-120` | `/space-planner` works module-only; "full screen" means full-bleed under the header (§11) |
| All module API routes share an un-overridable `maxDuration = 60`; `after()` gets starved | `app/api/m/[module]/[...path]/route.ts:4-7` | Nothing render-shaped runs inline, ever |
| `three@^0.180`, `draco3d`, `meshoptimizer` already in core `package.json`; module npm deps hoist to the core root | `package.json:50,58,71`; module `package.json`s are stubs | Planner shares three with the 3D viewer. **Any new npm dep = a core release** - so the plan needs none (§18) |
| Deskwell's installed modules include `quote-for-shop` 0.1.8, `product-3d-views-for-shop` 0.1.82, `shop-variations` 0.1.108, `product-attributes-for-shop` 0.1.43 | install repo `modules.json`, read 2026-08-04 | The dependency set in §2 is real on the one live site |

Known asset hazards carried in from the 3D workflow history: node world scales vary and node
names are not unique; a missing `modelHeights` entry in the viewer config silently renders
fabric ~17x too small (so the planner consumes the same per-product viewer config the product
page uses - `p3d_fabric_configs` via `getFabricConfig()`, `modules/product-3d-views-for-shop/lib/db/fabric-config.ts:128` -
never a raw GLB with guessed materials); 21 distinct wood UV densities shipped; model
origins/orientations are not consistent. Nothing in this plan trusts a GLB's own transform,
and nothing requires re-authoring or alternate versions of any 3D file.

---

## 2. Module identity and boundary

- **Name**: `space-planner-for-shop`. Repo `cactus-foundation-modules/space-planner-for-shop`.
  Table prefix `spl_`. `publicBasePath: "space-planner"` (uniqueness vs other bases and
  InfoPage slugs is validated at install - `lib/modules/manifest.ts:206-215`).
- **`requiresModules`** (minVersions pinned at build time to whatever ships the imports used):
  1. `shop` - listing/price/tax/cart libraries, product-page + cart extension points.
     minVersion is **the release that ships member carts** (0.1.192 or whatever it lands as)
     if the planner is to promise cross-device continuity; see §18.7 - that version is not
     published yet, and Deskwell is on 0.1.191.
  2. `product-3d-views-for-shop` - `p3d_*` model rows, fabric config, `load-model` pipeline,
     vendored decoders.
  3. `shop-variations` - option matrix → variant child resolution for the browse panel's
     option picker.
  4. `quote-for-shop` - the quote pipeline the planner feeds (§10).
  `product-attributes-for-shop` is deliberately **not** required: spec attributes are read
  with the established `to_regclass`-probed raw SQL pattern
  (`modules/advanced-shipping-for-shop/lib/resolve.ts:206-239`) and the ladder degrades to
  defaults if the tables are absent.
  `requiresCoreVersion`: set to the current core at build start (it validates manifests and
  carries the generators); no new core hook is expected - see §18 for the one thing that
  could change that.
- **Zero core diffs** - now verified achievable, not aspirational: routes, crons, emails,
  permissions, settings tabs, Puck blocks, extension-point implementations and the public
  page all declare in `cactus.module.json` and land via generated files. The single trap
  that would force a core release is a new npm dependency (deps hoist to the core root
  `package.json`), so the plan uses none: three/draco/meshopt exist, polygon triangulation
  with holes comes from three's `ExtrudeGeometry`/`ShapeGeometry` (earcut is inside three),
  3D labels are canvas sprites, and the floor-plan PDF is a print stylesheet (§10).
- Module-to-module isolation rules apply: the planner owns 100% of its own schema and UI.
  It **consumes** required modules the two sanctioned ways - importing their exported
  libraries, and implementing extension points they publish - and never extends their
  schema or UI. Writes to another module's domain only ever go through that module's own
  code (cart via shop's cart util, quotes via quote-for-shop's create path).
- Manifest also declares: `teardown` (all `spl_` tables, PascalCase, for code-and-data
  uninstall), `memberExtensions` (`activityTypes` for the member activity stream,
  `dataExportPath` for GDPR export of a member's plans, `routeTiers` marking plan-write
  routes PUBLIC), `cookieCategories` if the anonymous client id is judged to need declaring
  under the consent framework (check at build against how shop treats `cactus_shop_cart` -
  same functional-storage category).
- Two version fields (`package.json` + `cactus.module.json`) patch-bumped per release; the
  GitHub release tag tracks the manifest version.
- On completion: core README "Available modules" list, FIELD_NOTES.md, wiki page (§15).
  About credits only if a dependency lands, which the plan avoids.

---

## 3. Database schema (module migrations, `001_initial.sql`)

All DDL idempotent. New tables mean the **backup round-trip gate applies: `npm run
test:backup-roundtrip` must genuinely PASS before this module is done - a skip is a fail.**
The schema-coverage test picks up any new column types automatically; stick to types
`serialize.ts` already supports (text, jsonb, boolean, integer, numeric, timestamp).

**Saving requires a member account, and a room is a first-class thing that holds many plans.**
A shopper measures a space once and then tries several layouts in it - that is the actual
workflow, and modelling it as one flat "plan" row would force them to re-draw the room for
every option they wanted to compare. So the shape is `Member → rooms (many) → plans (many
per room)`, and there is **no anonymous persistence at all** (see "Guest work" below).

- **`spl_rooms`** - the measured space. `id`, `member_id` (core `Member.id`, a cuid string -
  no FK, matching quote-for-shop's precedent), `owner_user_id` nullable (core `User.id` -
  see below), `name` (user's own label: "Ground floor, east wing"), `notes` nullable,
  `geometry` jsonb (§6 format - vertices, openings, obstructions, ceiling height, units),
  `schema_version` integer, `thumbnail_media_id` nullable, `created_at`, `updated_at`.
  Indexed on `member_id`.

  `owner_user_id` costs one nullable column now and keeps a door open that is expensive to
  reopen later. The natural B2B loop is *buyer sketches → supplier refines → buyer
  approves*: the owner opening a customer's plan, adjusting it, and sending it back with
  the quote reply is what turns this from a toy into a sales instrument. Building that is
  **out of scope for this release** (§17), but a schema where every room must belong to a
  Member forecloses it, because staff are `User` rows and not Members. So the column exists
  and is null for everything in v1; exactly one of the two owner columns is ever set.
- **`spl_plans`** - one furniture layout within one room. `id`, `room_id` (FK →
  `spl_rooms` **ON DELETE CASCADE** - an in-module FK, unlike the core-table references),
  `member_id` (denormalised so ownership checks and "all my plans" need no join; the room
  stays the authority and the two are written together), `name` ("Option A - 12 desks"),
  `position` integer for ordering within the room, `items` jsonb (§7 format),
  `product_snapshot` jsonb (name/price/image per referenced product at save time, so old
  plans render after products change or die), `share_token` (unique, unguessable, **null
  until the plan is actually shared** - no token exists to leak for a plan nobody shared),
  `schema_version` integer (day one - saved plans live for years and the JSON will evolve),
  `thumbnail_media_id` nullable, `created_at`, `updated_at`. Indexed on `room_id` and
  `member_id`.

  Names are free text and duplicates are allowed - they are labels, not keys; the UI
  proposes "Copy of Option A" rather than the database refusing. Quotas live in settings
  and are enforced server-side (defaults: 25 rooms per member, 25 plans per room, plus §8's
  per-plan item cap) so a bored visitor with a script cannot fill the table.

  **Guest work** is not persisted anywhere on the server. A signed-out visitor plans freely
  with the whole tool - the scratch room and layout live in localStorage exactly as the
  cart does - and the save action is the sign-in prompt. On sign-in, whatever is on screen
  becomes their first room and plan. That is one deliberate product gate in exchange for
  deleting an entire class of work: no anonymous rows, no `client_id`, no guest retention
  sweep, no adoption reconciliation, and no unauthenticated write endpoint to rate limit
  (§13 shrinks accordingly). The cost is a visitor who closes the tab before signing in,
  which the UI mitigates by prompting before that happens and by keeping the scratch state
  in localStorage so returning to the site restores it.
- **`spl_model_meta`** - the human-curated fix-up layer, split-keyed with stated precedence:
  **file-level rows** (keyed by `p3d_models.id`) carry what belongs to the file - `yaw_offset_degrees`,
  footprint override (jsonb), `no_decimation` flag; **product-level rows** (keyed by
  `product_id`) carry semantics - `mount_type` override, `notes`. Product-level wins where
  both speak to the same variant. Wonky assets get corrected here instead of re-exporting.
- **`spl_category_defaults`** - `category_id`, default depth/height/width (mm), default
  `mount_type`. Fills the 70% depth/height hole in spec data.
- **`spl_dimension_cache`** - `product_id` (unique), resolved width/depth/height (mm),
  `source` (`glb` | `attribute` | `category_default` | `manual`), `parsed_from` (raw
  attribute text), `product_updated_at` (the product's `updated_at` at resolution time),
  `stale` boolean. Materialised output of the resolution ladder (§5) so the planner never
  parses attribute text at request time. Freshness is three-layered because catalogue edits
  arrive by Google Sheet Pull, which fires no product-save event: (a) lazy revalidation -
  plan load spot-checks referenced products' `updated_at` against the cached value and
  re-resolves the handful that moved inline; (b) nightly cron (manifest `cronJobs`,
  `CRON_SECRET`-guarded handler) sweeps a **bounded** slice of the stale tail; (c) manual
  rebuild in admin (§12).

  **The rebuild is a resumable job, not a request.** 22,055 active products against 283,946
  attribute rows will not resolve inside the dispatcher's 60-second ceiling, and this exact
  mistake is already documented in the codebase: the sheet sync's own comment records that
  "one unbounded call over a big grid died at the dispatcher's 60s ceiling before it could
  advance the phase, and every retry started over"
  (`modules/google-sheet-products-for-shop/lib/pull-run.ts:270-274`). So the planner copies
  that module's proven shape rather than rediscovering it: a job row banking a cursor, a
  `STEP_TIME_BUDGET_MS` that stops well short of the ceiling, the caller looping the endpoint,
  deterministic ordering so resume is exact, and a cancel check each chunk
  (`pull-run.ts:285,373`). The same job row drives a progress bar and makes "rebuild" a
  thing the owner can watch and stop, instead of a button that appears to hang.
- **`spl_render_jobs`** - `plan_id`, `plan_updated_at` (the plan's stamp when the job was
  enqueued), `status` (QUEUED/RUNNING/DONE/FAILED), `params` jsonb, `result_media_id`,
  `error`, timestamps. Async because module routes have an un-overridable 60-second ceiling
  and `after()` gets starved - nothing render-shaped runs inline, ever. One live
  (QUEUED/RUNNING) job per plan; a repeat request returns the existing job. **A render is a
  photograph of a moment**: if the plan has changed since `plan_updated_at`, the finished
  image is labelled with the date it depicts and the plan offers a re-render, rather than
  presenting a picture of furniture that has since moved as if it were current.
- **`spl_backfill_jobs`** - the resumable cursor row behind the dimension rebuild (below):
  `kind`, `cursor` integer, `total`, counters, `status` (QUEUED/RUNNING/DONE/CANCELLED/FAILED),
  `error`, timestamps.
- **`spl_plan_versions`** - `plan_id`, `version` integer, `items` jsonb, `product_snapshot`
  jsonb, `label` nullable, `created_at`. Undo/redo (§7) only survives the session, and a
  saved plan is a document someone put an afternoon into: overwriting one by dragging
  before noticing must be recoverable. A version is written on each explicit save and
  before any destructive-by-nature operation (room geometry edit, plan overwrite, bulk
  replace), capped per plan (keep the last 20, plus any the member has labelled), and
  restorable from the plan menu.

  Core already treats user documents this way, and the precedent is worth following closely
  because it has been through the edge cases: `Layout` and `InfoPage` carry
  `builderData`/`publishedData`/`history`, where `history` is a capped array (10) of past
  published versions, archived **on publish** by prepending the version being replaced
  (`app/api/admin/layouts/[id]/route.ts:118-142`). Restore is not a server verb - the client
  fetches `history?index=N` and re-submits it through the normal save path, so restoring
  archives what it replaced automatically, and the comment says why: "restoring a published
  layout IS publishing" (`app/cactus-admin/layouts/[id]/page.tsx:121-122`). The planner
  copies the semantics exactly. It **diverges on storage** - a separate table rather than a
  jsonb column - because a plan's `items` blob is far larger than a page's and core already
  has to hand-exclude `history` from every list and render query to stop it costing
  (`app/api/admin/layouts/route.ts:9`, `lib/layout/resolveThemeLayout.ts:5-6`). A side table
  is never selected by accident.
- **`spl_events`** - lightweight analytics home (§12 promises numbers; they need a table):
  `event` text, `plan_id` nullable, `product_id` nullable, `created_at`. **No IPs, no
  session ids, no PII** - same shape and retention discipline as the search module's query
  log (`modules/search/migrations/001_initial.sql:50`), purged by the same nightly cron per
  a retention setting. Member-linked actions additionally emit to the core
  `MemberActivityEvent` stream (`prisma/schema.prisma:1021`) via manifest `activityTypes`.

There is deliberately **no quote table**: quotes are `quote-for-shop`'s rows (§10).

Media obligations that come with `thumbnail_media_id` and `result_media_id`: the module
implements `core.media-usage-providers` (report referenced media so the library never
offers plan thumbnails for bulk deletion) and `core.media-reference-rewriters` (survive
media renames/moves) - both are existing extension points, and skipping them is a known
foot-gun (`wiki/Authoring-a-module.md:464-465`).

**Thumbnails need a policy, not just a column.** Every room and plan wants a preview image,
and a naive implementation uploads a fresh Media row on every autosave - which would bury
the owner's media library under thousands of machine-generated PNGs and quietly cost
storage. So: thumbnails are captured from the canvas on **explicit save only** (never
autosave), heavily downscaled, written to a dedicated `media/space-planner/` folder,
**replaced in place** rather than accumulating (one live thumbnail per room and per plan),
and excluded from the library's browsing UI the way other machine-generated assets are.
The usage provider still reports them so nothing sweeps them up. If replacing in place
turns out to fight the media layer's rename/rewrite rules, the fallback is no thumbnails
at all rather than an unbounded pile - a grid of names is a smaller loss than a wrecked
media library.

GDPR: every row the planner persists now belongs to a known member, which makes the
obligations simpler than the old guest model. Rooms, plans, thumbnails and renders export
through `memberExtensions.dataExportPath` and delete with the account. Account deletion is
the one place a missing FK bites - core owns `Member`, the module cannot cascade off it, so
**deletion must be actively handled, not assumed** (§18.9). Retention setting still exists
for abandoned data (default: rooms untouched for 24 months are flagged to the owner rather
than silently destroyed - a fit-out plan is a document someone paid attention to, not a log
line). Covered on the module settings page and in the wiki.

---

## 4. Integration with installed modules (verified - replaces the invented "shop seams")

The original plan proposed five new server seams shop would have to ship. Verification
killed that: the platform's pattern is that a dependent module **imports the libraries** of
modules it requires and **implements extension points** they already publish. Nothing here
needs a shop, p3d or shop-variations release.

**Libraries the planner imports (build-time, from the pinned module checkouts):**

| Need | Import | Evidence |
|---|---|---|
| Catalogue browse data | `listProducts(filter)` + `getProductMediaForProducts` + `getPrimaryProductImages` | `modules/shop/lib/db/products.ts:246,141,589` (search, category, stock filters, perPage clamp 100) |
| Price + VAT display identical to the shop | `resolveCardFromPrices`, `resolveTaxDisplay`, `formatMoney`, `withPriceSuffix` in the canonical order | `modules/shop/components/puck/ShopProductGrid.rsc.tsx:52-62`, `modules/shop/lib/money.ts:11`, `modules/shop/lib/tax-display*.ts` |
| Cart read/write + change notification | shop's client cart util + its `cactus-shop-cart-changed`/`-added` events - **never localStorage directly** | `modules/shop/components/public/cart.ts` (line shape `{productId, quantity, lineId?, meta?}`); the util self-arms cross-device sync at `:99,156` |
| Variant model rows | `getModelsForProductTree(productId)`, then `visibleItems(payload, activeProductId)` | `modules/product-3d-views-for-shop/lib/db/models.ts:174`, `lib/visible-items.ts:32` |
| Viewer config (the 17x-trap owner) | `getFabricConfig()` + `applyProductOverrides` + sitewide `p3d_settings` | `modules/product-3d-views-for-shop/lib/db/fabric-config.ts:128`, `lib/db/product-settings.ts:73` |
| GLB loading, decoders, material assembly | p3d's `load-model.ts` pipeline - decoder/transcoder paths already point at p3d's own vendored, same-origin decoder route | `modules/product-3d-views-for-shop/lib/three/load-model.ts:48,69,136,243-245` |
| Option picker → variant child | shop-variations' option/variant resolution (`svr_*` via its libs) | same import pattern; exact entry points confirmed at build |
| Quote creation | quote-for-shop's create path (the lib behind `app/api/public/requests/route.ts:33`) | §10; §18 if it needs exporting |
| Spec attribute values (dimension ladder) | raw SQL join `pat_product_values` → `pat_attribute_values`, `to_regclass`-probed, read-only | precedent `modules/advanced-shipping-for-shop/lib/resolve.ts:206-239` |

Server-rendered planner surfaces keep RSC-only imports out of client bundles the same way
the Puck generator splits `import`/`rscImport` - the discipline, not a new mechanism.

**Extension points the planner implements (all exist today - generated registry lines cited §1):**

1. `shop.product-detail-parts` (or `-tabs`, chosen at build by fit): a "See it in your
   room" action on every product page that opens the planner with that variant staged.
   This is the conversion funnel's front door and was missing from the original plan.
2. `shop.cart-header-actions`: **"View in Space Planner" on the cart page** - see §9a for
   the full behaviour. quote-for-shop already puts two buttons in this exact slot
   (`modules/quote-for-shop/cactus.module.json:78-96`), so the mechanism is proven and the
   layout consequence - three actions sharing that row - is known in advance.
3. `members.account-section` + `members.account-nav`: "My plans" in the member account
   area - list, rename, duplicate, delete, open.
4. `core.admin-dashboard-widgets`: plans-this-week / quotes-raised tile.
5. `core.media-usage-providers` + `core.media-reference-rewriters` (§3).

The planner publishes **no extension points of its own** - nothing needs to call into it.

---

## 5. Dimension resolution ladder (core feature, serves 92% of catalogue)

Resolved per variant, cached in `spl_dimension_cache`, strictly in this order:

1. **Model bounding box** - if a model exists, mesh is truth. Measured with node world
   transforms applied, normalised (§8). Applies to **all three shipped formats** - the p3d
   loader handles obj and fbx as well as glb, so the 32 fbx/obj-only variants get measured
   geometry like everything else rather than falling to placeholders.
2. **Parsed spec attributes** - "Overall Width/Depth/Height", parsed from text with unit
   detection (mm/cm/m, "W 1200mm", "120cm", bare numbers with a unit column convention).
   Parser is pure + unit-tested against a committed fixture dump of the full live value set;
   anything unparseable lands in a junk-tail report (admin screen, §12) instead of a silent
   guess.
3. **Category defaults** (`spl_category_defaults`) for missing axes - item is visually
   badged "approx. size" in the planner. Never a silent guess.
4. **Manual entry** - user types sizes when nothing else exists.
5. **Generic marker** - last resort; item joins the plan as a labelled marker so adding to a
   plan is never blocked.

**Cross-check where both sources exist**: when a variant has a GLB *and* parsed attributes
and they disagree by more than 10% on any axis, flag it in the dimension report (§12).
Disagreement means either the model scale or the spec data is wrong - this is exactly the
class of defect (17x fabric, wrong-scale exports) that otherwise ships silently.

First build task ("calibration"): run the draft parser across all 12,888 Overall Width values
plus depth/height, produce the junk-tail count, and seed `spl_category_defaults` for every
populated category. Also flag the standing opportunity: a dimension backfill into spec data
lifts planner quality more than any rendering feature - surfaced to the owner, not done
unilaterally.

---

## 6. Room editor

- **2D polygon floor-plan editor** is the front door and the first thing every user touches -
  it gets the polish budget. Draw walls; click any wall to type its exact length (users know
  lengths, they cannot draw to scale); SketchUp-style edit where changing a length slides
  downstream vertices. No constraint solver - it is a tar pit and the simple model is
  predictable.
- Arbitrary polygons from day 1: L-shapes, bays, angled walls. Interior obstruction polygons
  (pillars, chimney breasts, stair boxes). Triangulation with holes comes from three's
  `ShapeGeometry`/`ExtrudeGeometry` (earcut ships inside three - no new dependency). Curved
  walls as segment approximation, labelled as such. Flat ceiling, single height field (wall
  visual only). Wall openings (doors/windows) marked as gaps with width + sill/height - no
  swing arcs or joinery modelling. Opening width is validated against its wall's length.
- **Measurements are internal.** Typed wall lengths are the inside-of-room dimensions
  (what a person with a tape measure actually has); walls render with a nominal visual
  thickness (~100 mm) extruded outward so the interior stays true to the numbers.
- Validation at draw time: self-intersection, reversed winding (auto-fix), walls under 10 cm,
  unclosed loops - refused gently with a pointer at the offending wall.
- Units: metric primary; feet/inches accepted on input and converted.
- Room presets (common rectangles) as starting points so the empty state is never a blank
  canvas.
- **A typed route into every room, not only a drawn one.** "Rectangular room, 6.2 m × 4.1 m,
  2.4 m ceiling" as a form is faster than drawing for the most common case, is the only
  workable path for keyboard and screen-reader users, and is how someone with a tape
  measure actually holds the information. Drawing is for the L-shapes and the bays. Every
  subsequent geometry edit is reachable numerically too (the wall-length field already
  is), so the drawing canvas is never the sole way to accomplish anything - which is what
  makes the accessibility position in §7 honest rather than aspirational.
- **First run gets designed, not left to the empty state.** This is the most complex thing
  on the site by a distance, and a shopper who cannot work out what to do in fifteen seconds
  leaves. The opening move is a three-way choice - start from a preset, type your
  dimensions, or draw it - followed by inline coaching on the first placement only
  (dismissible, remembered). No modal tour, no video. Worth building properly: every other
  feature in this plan is downstream of someone getting past the first screen.
- 3D generation: floor polygon → extruded walls with opening cut-outs. Simple floor/wall
  material palette (a handful of finishes) purely for believability, plus a door-height
  reference and an optional human figure for scale.

Room jsonb format: versioned alongside `schema_version`; vertices in mm integers (no float
drift in saved data), openings and obstructions as child arrays. World conventions stated
once and never varied: millimetres, y-up, yaw in degrees, plan origin at the room bounding
box minimum.

---

## 7. Placement engine

- **Views**: 2D top-down (primary placement surface), 3D orbit, eye-level preset ("stand in
  the room"). Phone gets 2D placement + 3D viewing; full editing is desktop/tablet - stated
  honestly in the UI, not silently broken.
- **Overlap policy - no naive collision blocking.** Legitimate overlaps are the norm in
  office planning (chair tucks under desk, pedestal slides under desktop). Footprint overlap
  warns only when height bands actually clash. The pedestal fit check uses "Height Under
  Top"/"Width Under Top" where present: green "fits", red "5 cm too tall" live while
  dragging. Warn (do not block) when a standalone pedestal goes under a desk variant whose
  options already include storage (doubled-up drawers).
- **Mount types**: `floor` (default), `desk-surface`, `desk-edge-clamp`, `wall`. Mapping per
  category with per-product override in `spl_model_meta`. Drop an accessory over a desk →
  raycast the desktop plane → stick at surface height; clamp-mounted items constrain to the
  desktop edge; wall-mounted items pick a wall and take a height field. Mounted items (and
  tucked pedestals, as a loose group) **parent to their desk** - move the desk, they follow;
  one tap detaches. Fixed representative pose for articulated arms and sit-stand desks. No
  accessory-on-accessory stacking.
- **Snapping**: wall-parallel, wall-flush, 15° rotation snap, item-edge alignment guides -
  all escapable with a modifier/toggle.
- **Repetition tools** (Deskwell's buyer furnishes offices): duplicate, duplicate-along-wall,
  grid array with spacing. Cheap to build, transforms the tool for the actual customer.
  Budgets are designed for this (§8) - twenty identical desks share one geometry.
- **Multi-select**: marquee select in top-down, group move / duplicate / delete. Placing a
  bank of desks and shifting it half a metre must not be twenty drags.
- **Properties panel**: the selected item's exact position, rotation, mount state and sizes
  as editable numbers, plus variant swap. Serves precision users and is the accessible
  editing path for everything the canvas does by dragging.
- **Bulk variant replace across a selection**: "these twelve desks, in oak instead of
  white". With repetition tools putting twenty identical items in a room, changing them one
  at a time is not a workable interaction - and this is the single most likely thing a buyer
  does after seeing the total. Writes one version row first (§3) so it is undoable after the
  fact, not merely within the session.

  **And it is cheap, which was not obvious.** A finish change is a *repaint*, not a reload:
  p3d's viewer keys its model build on `[item.url, item.format]` and repaints textures on a
  separate effect keyed by the fabric signature (`Viewer3d.tsx:995,1098`), so two variants
  sharing one GLB swap finish with `applyFabricPaint` on the live model - no refetch, no
  rebuild, GPU geometry untouched. The module learnt this the hard way and left the note:
  keying the stage on the variant id "remounted this whole subtree on every colour pick…
  That rebuild, not the texture fetch, was the bulk of the seconds a shopper waited"
  (`Gallery3d.tsx:373-383`). The planner inherits both the technique and the warning, and
  texture masters are already cached module-wide by url and shared across products
  (`load-model.ts:512-519`), so a range that shares a finish pays for it once. Recolouring
  twelve desks should cost about what recolouring one does - and if it does not, the cause
  is a model swap hiding behind what looks like a finish option.
- **Measurements**: live dimension lines item→wall and item→item while dragging; walkway
  clearance warnings with UK DSE-informed defaults (e.g. space behind a desk for a chair),
  presented as guidance, never blocking. **These figures carry liability and are worded
  accordingly**: rules of thumb to help arrange furniture, explicitly not a workplace
  assessment, not fire-safety or means-of-escape guidance, and not a building-regulations
  check. The wording appears with the warnings themselves and on every printed output -
  a tool that draws a green tick next to a walkway must not be mistaken for one that has
  signed it off. The defaults are settings so the owner can adjust or switch them off.
- Cart quantity N = N individually-placed instances. Items larger than the room, dragged
  through walls or dropped outside: clamped with visual feedback, never lost or errored.
- **Undo/redo from the first commit** (command stack over plan state, capped depth -
  retrofitting into direct-manipulation 3D is misery). Keyboard: arrows nudge, shift-arrows
  rotate, delete removes; visible focus; the editor gets a stated accessibility position
  (AA on all surrounding chrome; the 3D canvas is mirrored by the BOM list and the
  properties panel, which are fully accessible and enumerate every placed item).
- Autosave to the server (debounced) once a plan has been saved, which means once the
  shopper has an account (§3); before that, localStorage holds the scratch state and the
  save button is the sign-in prompt. Two tabs on one plan: last-write-wins plus a "this plan
  changed elsewhere - reload?" banner, on the `updated_at` stamp check borrowed wholesale
  from cart-sync (§9) rather than a second scheme with its own edge cases.
- **Unsaved-work guards come from core's existing pattern**, not a new one: the Puck editor
  already distinguishes "would leaving now lose work?" from "would saving change anything?"
  and drives a back-link confirm and a `beforeunload` warning off the first
  (`lib/puck/tabs/editorDirtyState.ts:5-21`). The planner has exactly these two questions
  and reuses the shape. It matters more here than in Puck: a signed-out visitor's work
  lives only in localStorage until they make an account.

Item jsonb format: variant id, position (mm), yaw, mount state (parent item id + local
offset), size source flag, manual size if any.

---

## 8. Asset pipeline (no alternate files - all runtime)

- Resolve models with p3d's own resolvers (§4), fetch with a freshly-signed url at load
  time, but **key everything by the query-stripped public url** - signed urls are never
  persisted or used as cache keys (they rot), and the catalogue proves why: 42 rows on one
  chair store 42 different stale tokens for a single file, so a naive dedupe would fetch it
  42 times. Strip the query, then dedupe, before anything else (that plus Impulse-style
  sharing collapses 4,402 rows to **257 real files**, the single biggest saving). Byte
  budget enforced from `content-length` on the streamed GET with abort - the CDN 405s HEAD
  and DB sizes are 0 on 4,379 of 4,402 rows, so fetch-time is the only truthful measurement.
- **No shipped model uses Draco or meshopt compression today** (measured - only
  `KHR_texture_transform` appears). Decoders still register unconditionally because the
  catalogue grows and authoring eras vary, but the practical consequence is that **download
  bytes, not triangles, are the binding constraint**: runtime decimation shrinks what the
  GPU holds, never what the network moved. Hence the fetch-time byte budget, the IndexedDB
  cache being load-bearing rather than a nicety, and the recommendation below.
- **Normalisation on load** (never trust the file): compute the world bounding box, recentre,
  ground to y=0, derive the 2D footprint, apply `spl_model_meta.yaw_offset`. Decoders are
  vendored and same-origin - Draco and the KTX2 transcoder are served from a module's own
  `assets/` directory (`next.config.ts:99-106` traces `./modules/*/assets/**` for **any**
  module, by generic glob), and meshopt is a bundled npm import, not a route. Reusing p3d's
  `load-model.ts` inherits its hardcoded decoder path
  (`/api/m/product-3d-views-for-shop/decoders/`, `load-model.ts:48`); if the planner ends up
  not reusing that loader wholesale it ships its own four decoder files rather than pointing
  at another module's route, which is the coupling the platform's generic asset tracing
  exists to avoid. Neither path touches a CDN.
- **The loader throws real-world scale away, and the planner cannot let it.** p3d's
  `frameModel` normalises every model to a 2-unit longest side centred at the origin
  (`load-model.ts:1112-1142`) - correct for a product viewer where the model fills a frame,
  fatal for a planner where a desk must be 1.6 m next to a 6 m wall. Real size enters p3d
  only through the fabric configurator's `realCm`, and only for AR sizing
  (`lib/three/ar.ts:46-61`). So the planner takes the **pre-normalisation** world bounding
  box as its dimension truth (§5 rung 1) and applies its own metric scale, treating
  `frameModel` as a product-page concern to be bypassed rather than inherited. This is the
  single most likely way to end up with a beautifully rendered room where nothing is the
  size it claims, so it gets an assertion in the calibration script: every measured model's
  bounding box in millimetres, compared against its spec attributes (§5's cross-check).
- **No device or capability detection is inherited.** p3d has no WebGL2 check, no mobile
  downgrade and no memory heuristic anywhere - only `prefers-reduced-motion` and
  `KTX2Loader.detectSupport()`. Every fallback this plan promises (WebGL2 absent → 2D
  editor, low-memory degradation) is the planner's own work, not something the existing
  viewer already solved.
- **Decimation in a Web Worker** via `MeshoptSimplifier` (meshoptimizer is already a core
  dep) - conservative target (keep 30-50%), planner camera rarely gets closer than ~1 m.
  Thin parts (mesh backs, cable trays) are the known ragged-edge risk; the per-model escape
  hatch is the `no_decimation` flag in `spl_model_meta`.
- **Texture downscale before GPU upload** via `createImageBitmap` resize - 1k cap in the
  planner, product page untouched. KTX2 transcoded where the source already is. Texture
  dedupe by url across products (ranges share finish textures).
- Materials come from the **same viewer config as the product page** (`p3d_fabric_configs`
  + `p3d_settings` + per-product overrides) - never raw GLB with guessed fabric repeats
  (the `modelHeights` silent-17x trap lives in that config, and its owner module keeps
  owning it).
- **Instancing is the budget model.** Identical variants share one crunched geometry +
  material set (`InstancedMesh`/shared `BufferGeometry`); a 20-desk bank costs one desk
  plus transforms. Budgets are therefore per **unique model**: ~12-16 distinct crunched
  GLBs resident (least-recently-visible eviction beyond that, with per-model triangle and
  texture-byte ceilings), while **placed instances run to ~150-200** before the friendly
  "plan is full" message - placeholders are near-free and uncapped within reason. The old
  flat ~40-instance cap contradicted the office fit-out use case and is gone.
- **Cache the crunched result in IndexedDB** keyed by `plain_url + pipeline_version`;
  feature-detect and degrade to no-cache (private browsing), treat `QuotaExceededError` as
  cache-off, never as an error the user sees. Second visit skips decimation. Bumping
  `pipeline_version` invalidates the lot.
- **Placeholders** for the 92%: clean box at ladder-resolved size, product photo as a front
  decal (same-origin/CORS-clean via the media CDN the product pages already draw from),
  name label as a canvas sprite (no text library). Deliberately styled so it reads as
  intentional. **Any GLB fetch/parse failure degrades to the placeholder silently-visibly**
  (badged "preview unavailable"), never a blocked plan or an error page.
- Hard runtime caps: devicePixelRatio 1.5, context-loss handler that **restores the scene
  from plan state, not from GPU** (the number one silent killer on integrated GPUs). WebGL2
  absent → the 2D top-down editor still works fully (it is canvas), with a notice that 3D
  view needs a newer device - graceful degradation, not an error page.

Calibration (first build week, inside this single release): a script loads every one of the
26 modelled listings' distinct GLB urls, runs the full normalise/decimate/downscale pipeline
headless, and reports per-model triangle counts, memory estimate, and decimation artefacts to
eyeball. Its output seeds `spl_model_meta` and validates the budgets before UI work sits on
top. Lives in the module's `scripts/`, runs read-only against `.env` DB + live CDN. This is
the plan's riskiest assumption and it gets measured first, not discovered last.

**Standing opportunity, flagged not assumed (owner's call, like the dimension backfill):**
a one-time asset optimisation pass over the 257 real files - `gltf-transform` Draco or
meshopt compression, plus re-exporting the 11 fbx/obj files to GLB - is the highest-leverage
preparation available, and **it is not a prerequisite**: the planner works on the files as
they stand. The case for doing it anyway is that it is the only lever that reduces bytes on
the wire (runtime decimation cannot), typically 60-90% on furniture geometry of this kind,
and **it speeds up the existing product pages just as much as the planner** - so it earns
its keep whether or not this module ever ships. It is also strictly additive to the
catalogue: same urls, same materials config, smaller files. The counter-risk is that
re-exporting touches assets whose UV densities and world scales are already known to be
fragile, so it wants the same-angle render comparison the 3D workflow already uses, per
file, before anything is overwritten. Scoped as its own small job, not smuggled into this
build.

---

## 9. Catalogue browser, cart, entry points, ownership

- Side panel built on `listProducts` + the shop price/tax utils (§4): search, category
  filter, price, stock state (from `track_inventory`/`stock_count`/`out_of_stock_behaviour`/
  `is_pre_order`; Made-To-Order label from spec attributes - no shop flag exists), variant
  option picker via shop-variations' resolution. Respects `catalogue_hidden` and status
  exactly as the storefront does. Placing an item does not require it to be in the cart;
  the plan is the workspace.
- **Badge which listings have a real 3D model** - it is the difference between a browse
  panel and a lucky dip, and with 94% unmodelled the shopper deserves to know before
  placing. The cheap bulk primitive already exists: `getModelsForProducts(ids)` +
  `getVariationChildrenForProducts(ids)` - two set-wide queries, no per-product work
  (`modules/product-3d-views-for-shop/lib/db/models.ts:263-290`). **Do not reach for
  `card-media-provider` for this**: it is batched for the model lookups but then awaits
  `getFabricConfig` and `getP3dProductConfig` sequentially inside a per-product loop
  (`lib/card-media-provider.ts:70-113`), which is two serial round-trips per modelled
  product - fine for a grid of twelve cards, not for a browse panel paging a catalogue.
- **Cart integration goes through shop's cart util, never localStorage directly.** For a
  guest the util is localStorage; for a signed-in member the util additionally syncs to
  `shp_member_carts` and follows them between devices, and it arms that sync itself on
  first read or write (`cart.ts:99,156`). So the planner gets cross-device for free -
  *provided* it uses the util. A direct write to `cactus_shop_cart` would work on the day
  and silently break cross-device, which is exactly the kind of defect that surfaces as
  "the planner lost my basket" a fortnight later. The planner reads with the util, writes
  with the util, and listens for `cactus-shop-cart-changed` to live-badge plan items.
  Opening the planner offers to pull current cart lines in; "add to cart" per item and
  **"add whole plan to cart"** write through the same util (N placed instances of a variant
  = one line, quantity N).
- **Line cap**: a member cart holds at most 200 lines (`MEMBER_CART_MAX_LINES`, enforced
  server-side by the route's zod schema). Because instances collapse into quantities, a
  large office plan is nowhere near it - but "add whole plan to cart" checks the resulting
  line count before writing and says so plainly rather than letting the PUT 400.
- **Cross-device consistency**: with member carts following the shopper, a member's *plans*
  must follow too or the tool feels broken half way through a purchase. They do -
  `spl_plans.member_id` (§3) - so the story holds: signed in, both follow; guest, neither
  does, and the share link is the answer offered. Signing out clears the local basket by
  design (`cart-sync.ts:148-152`); the planner's scratch plan is separate state and stays,
  so a signed-out shopper keeps their layout and simply has an empty basket to refill.
- **Conflict handling is borrowed, not invented**: cart-sync's model - an owner key so a
  shared machine never adopts someone else's state, an `updated_at` stamp to detect the
  other device having moved on, local-pending-change wins, and silent failure when offline -
  is exactly the shape §7 needs for two-tab plan editing. Mirror it rather than inventing a
  second scheme with different edge cases. Note its merge rule (union, **larger quantity
  wins, never the sum**, `cart-sync.ts:69-78`) so planner staging matches what the shopper
  will see in the cart afterwards.
- Sync rules: item removed from cart after placement → stays in plan, badged "no longer in
  cart", one-tap re-add. Variant swapped in cart → model swaps in place, position kept. Plan
  reopened later with changed/discontinued products → renders from `product_snapshot`, banner
  lists what changed, add-to-cart skips dead products with a note.
- **Ownership**: everything saved belongs to a member (§3). Guests plan freely in
  localStorage and the save action is the sign-in prompt; signing in turns what is on
  screen into their first room and plan. The library itself is §9b.
- **Entry points** (§4): the cart page's "View in Space Planner" (§9a), the product page's
  "See it in your room" (that variant pre-staged), the Puck teaser block (§11), and the
  planner's own public page. Returning visitors with unsaved scratch state get "continue
  where you left off" from localStorage.
- Share links (`share_token`) open read-only with "copy to my planner"; the share page
  serves an OG image from the plan thumbnail via `generateMetadata`, and the module's
  `getPublicRobotsDisallow()` keeps the tool and share paths out of crawlers (the
  owner-built Puck landing page is the indexable surface).

### 9a. "View in Space Planner" on the cart page

The cart is where a fit-out buyer has already assembled the shopping list and is at their
most receptive to "will this actually fit?". It is the planner's highest-intent entry point
and gets specified rather than assumed.

- **Placement**: `shop.cart-header-actions`, alongside quote-for-shop's existing buttons.
  Label "View in Space Planner", secondary styling - checkout stays the primary action; the
  planner is an aid to buying, never a diversion from it. Semantic tokens only, AA in light
  and dark, and the three-button row gets a real mobile check (that slot is where it will
  crowd first).
- **Behaviour on click**: opens the planner with every cart line pre-staged - each line's
  quantity N becomes N individually placeable instances, parked in a staging tray rather
  than auto-scattered into the room, because the user has not drawn a room yet. New visitors
  land on the room editor with the tray already loaded; returning visitors are offered their
  most recent plan or a new one, and the tray reconciles against whatever is already placed
  (§9 sync rules) so re-entering from the cart never duplicates items.
- **Empty cart**: the button is hidden rather than disabled - an empty cart page has nothing
  to plan, and the planner's own public page is one click away in the nav.
- **Items the planner cannot model**: nothing is filtered out. Everything reaches the tray;
  models render as models, the rest as ladder-sized placeholders (§8). A cart line whose
  product has died renders from `product_snapshot` and is badged.
- **Round trip**: whatever the buyer changes in the plan writes back through shop's cart
  util (§9), so the cart they return to reflects the plan they built - add, remove, quantity
  and variant swaps all included.
- **Server cost: none of the planner's own.** Staging is a client-side hand-off - no new
  route, no planner round trip, nothing to rate limit. For a signed-in member, writes the
  planner makes back to the cart do cost shop's own debounced sync push, which is shop's
  existing budget and already debounced at 600 ms; the planner just must not defeat it by
  writing in a tight loop (batch the plan→cart write, do not emit one call per instance).
- Analytics: `spl_events` records the cart-entry event, so cart→plan→checkout conversion is
  answerable rather than felt (§12).
- **Signed out**: the button still appears and still works - the staged cart opens in the
  scratch planner. Sign-in is asked for at save, not at entry, so the tool is never a
  locked door to someone who has not decided yet.

### 9b. Rooms, plans and the account library

The model is `Member → rooms → plans` (§3). A room is a measured space; a plan is one
furniture layout in it. Measure once, compare layouts - which is what a fit-out buyer is
actually doing when they ask for a quote.

**The library** lives in the member account area via `members.account-section` +
`members.account-nav` ("My spaces"): rooms listed with thumbnail, name, plan count and last
edited; expanding a room lists its plans with their own thumbnails and BOM totals. The same
library is reachable from inside the planner so switching rooms never means leaving the tool.

- **Room actions**: new (draw, start from a preset, or duplicate an existing room), rename,
  edit geometry, duplicate (geometry only, or geometry with all its plans), delete.
- **Plan actions**: new within a room (blank, or duplicate a sibling plan - "try it with
  fewer desks" is the common move), rename, duplicate, delete, reorder.
- **Deleting a room takes its plans with it** (FK cascade). The confirmation says how many
  plans that is, by name, because "delete room" reading as "delete one drawing" and taking
  four layouts with it is the kind of surprise people do not forgive.

**Editing a room's geometry when it already has plans** is the sharp edge of this model, and
the answer is that it applies to all of them - that is the entire point of measuring once.
What it must not do is quietly destroy work:

- The edit dialog states, before saving, how many plans are affected.
- On save each plan is re-validated. Items now outside the outline, or clashing with a new
  obstruction, are **moved to that plan's staging tray, never deleted**, and the plan opens
  with a banner naming them. A wall moved 10 cm should not silently eat a pedestal.
- Where the change is really a different space rather than a correction, the dialog offers
  "duplicate this room and edit the copy" so the original layouts stay intact.

**Comparing plans** falls out of the model and is worth building: two plans of the same room
side by side, each with its BOM total, and the difference stated in cash. "Option A £12,400,
Option B £9,850, 4 fewer desks and the smaller pedestals" is the sentence a buyer takes to
whoever signs it off - and it is the planner's strongest argument for existing at all.

**Sharing** is per plan: minting a `share_token` on demand gives a read-only link with
"copy to my planner" (which requires sign-in, like any save). A shared plan carries its
room's geometry so the link stands alone. Revoking a share clears the token. Room-level
sharing ("here are all four options") is a natural follow-on and is deliberately left out
of the first build - §17.

---

## 10. Outputs: exports, renders, BOM, quotes, emails

- **Client-side, instant**: PNG snapshot of the current view; 2D floor plan print view -
  orthographic top view with dimension lines, a scale bar with an auto-picked paper scale
  (1:50 / 1:100), and items numbered to match the BOM, delivered as a print stylesheet
  (browser print-to-PDF; zero dependencies, vector-crisp). **BOM** - itemised list with
  quantities, unit prices and totals through the shop's own price resolution + tax display
  utils with the configured suffix ("inc. VAT" etc.), so the planner can never disagree
  with the storefront. List prices only; promotions/discounts resolve at checkout, and the
  BOM footer says so. The BOM doubles as the accessible representation of the scene.
  Both plan and BOM carry a one-line disclaimer: guidance only - verify measurements on
  site; prices correct at time of saving; not a workplace, fire-safety or building-regs
  assessment (§7).
- **Pricing reality for the B2B buyer, stated so nobody expects otherwise**: the platform
  has price *types* (`price`, `sale_price`, `retail_price`, `trade_price`) toggled shop-wide,
  but **no per-account or trade-account pricing** - there is no customer group or price
  group anywhere in shop (`modules/shop/lib/pricing.ts`). So a fit-out buyer's BOM shows the
  same list prices as everyone else's, and the negotiation happens in the quote. That is
  precisely why the quote path (§10) matters more here than checkout, and it is worth the
  owner knowing before someone asks why a twenty-desk plan does not price itself.
- **Delivery dates on the BOM - reversed, because it turns out to be nearly free.** The
  first draft of this plan deferred lead times as "needs its own integration". It does not:
  `advanced-shipping-for-shop` already exposes `estimateItems(inputs, now?)`
  (`lib/estimate-service.ts:259`) which takes up to 200 lines at once, echoes back a caller
  supplied `ref` per line so answers map straight onto BOM rows, batches its own queries so
  N lines cost a fixed number of round-trips, and returns both per-item `targetDate` and a
  pre-grouped `deliveries[]` - literally "arrives in N deliveries" with dates and item
  names. That is BOM-shaped to the point of looking designed for this.

  For a fit-out buyer the question after "how much" is always "when", and 4,486 products
  are made to order, so this is not a nicety. **It stays optional rather than a fifth hard
  dependency**: a shop without advanced shipping gets a BOM with no delivery column instead
  of a broken module. The clean way to reach it across a module boundary is a small
  extension point published by advanced-shipping (same shape as the quote-for-shop export
  in §18.1, one patch release there), with the registry lookup absent meaning "no delivery
  column" - not a build-time import that fails when the module is not checked out. Confirm
  the approach at §16 step 9.
- **Room export needs a decision the original plan skipped.** Exporting the whole room as a
  GLB is easy (three's GLTFExporter) and directly contradicts a security posture the
  platform deliberately built: signed asset urls exist specifically so a scraped model link
  "stops working within a couple of days and a third-party site cannot embed our models at
  all", moving theft's cost "from copy the url to write and maintain a scraper"
  (`lib/media/asset-token.ts:14-20`). A one-click download bundling a dozen supplier models
  into a single unsigned file is precisely the scraper, supplied by us, with a button.
  There is a partial precedent the other way - the product page already bakes a **USDZ**
  of one model in-browser for iOS AR and serves it as a blob without storing it
  (`modules/product-3d-views-for-shop/lib/three/ar.ts:135,163`) - so single-model export is
  effectively already accepted. The difference is scale and convenience, not principle.
  **The decision taken here**: keep USDZ (it is the AR hand-off, one room, already
  precedented, and iOS gives no alternative), and make whole-room **GLB export an
  owner-controlled setting, default off**, described plainly on the settings page as
  "lets customers download the 3D models in their plan". A shopper who wants their layout
  elsewhere is served by the floor plan, the BOM and the render - none of which hand over
  the geometry. This is the owner's call about their suppliers' assets, not ours to make
  silently in either direction.
- **Photoreal render**: `spl_render_jobs` row + a scale-to-zero Fly worker (same pattern as
  the media worker, which stays video-only per the standing decision - this is a separate
  small app, `cactus-planner-render`, in `lhr` next to everything else). Concretely: the
  worker consumes the same plan JSON + the same resolved model/material inputs as the
  browser (one scene-assembly library, two consumers - divergence here is how renders stop
  matching plans), renders with high-quality offline settings (proper lighting/AO; "better
  than the viewport", not path-tracing marketing), uploads the result straight to the media
  Worker with a signed upload token (`lib/media/upload-token.ts` - raster images are an
  accepted direct-upload type), then calls back to a module route that verifies a shared
  secret and writes the Media row + job status. Module route enqueues and polls only -
  60-second ceiling. Auth both directions via env vars (`SPACE_PLANNER_RENDER_URL`,
  `SPACE_PLANNER_RENDER_SECRET`), declared in the manifest's `requiredEnvVars` and the
  Configuration reference. **None of this shape is invented here**: core's video worker
  already runs enqueue → HMAC-signed job context → status-poll route
  (`lib/media/video-optimise.ts:32,38,137`, `app/api/admin/media/video-status/route.ts`),
  with clients polling every 3-8 seconds and a `machineId:jobId` reference when per-job Fly
  machines are in play. Copy it. Worth knowing the video worker keeps no job table at all -
  it stores state in `Notification` rows keyed by `dedupeKey` (`lib/media/video-jobs.ts:4-9`);
  the planner uses a real `spl_render_jobs` table because a render belongs to a plan and
  wants a history, but the auth and polling mechanics transfer directly. Placeholder-only
  items render as tidy schematic blocks; the render dialog says so up front. Email on
  completion (below). Machine sizing measured during §16's render spike, not guessed.
- **Quotes ride `quote-for-shop` - the planner ships no quote pipeline of its own.**
  Deskwell already runs the module: numbered quotes, shopper + owner emails, admin inbox
  with status flow, expiry cron, convert-to-order (`modules/quote-for-shop/migrations/001_initial.sql:55`,
  `lib/email-templates.ts`). "Request a quote for this plan" creates a REQUEST-kind quote
  through quote-for-shop's own creation path with the BOM as its priced `lines`/`cart`
  snapshot, the plan share link as `source_url`, and the floor-plan reference in the
  message. The owner handles it in the quote inbox they already know, and conversion to an
  order is already built. `requiresModules` makes this a hard dependency (§2) - one code
  path, no fallback inbox. The only planner-side state is the quote linkage on the plan.
- **"Email me my plan"** for the not-ready-to-buy - lead capture, arguably worth more than
  checkout for fit-out sized orders. Since saving now needs an account, this is a member
  action and the email goes to the account address by default (editable, so a plan can be
  sent to whoever holds the budget). For a signed-out visitor the button is the same
  sign-in prompt as save: the plan they built is the reason to make an account, which is
  the cheapest account-growth mechanism on offer given there are two accounts today.
- **Email templates** (manifest-registered, keys prefixed `space-planner.`, owner-editable,
  individually switch-off-able; renderer returns null when off and the code path honours
  it): `space-planner.plan-emailed` (your plan + link), `space-planner.render-done`
  (render attached/linked). Quote emails belong to quote-for-shop and already exist.
  Because every recipient is now a member (§3), these go through **`sendMemberEmail(member,
  key, vars, opts)`** (`lib/email/templates.ts:64`), not the owner-facing `sendEmail`.
  `plan-emailed` is transactional - the shopper pressed the button and is owed the result.
  `render-done` is not: it is an unprompted "your picture is ready" arriving minutes later,
  so the module registers a `notificationCategories` entry for it in `memberExtensions` and
  passes `{category, memberId}`, letting a member switch it off. Core ships **no**
  notification categories of its own and hides the member Notifications tab entirely until
  a module contributes one (`lib/modules/member-extensions.ts:30-36`), so this single
  declaration is what lights that tab up - worth getting right rather than defaulting
  everything to transactional because it is easier.

All render/export server endpoints are enqueue-and-poll. Nothing long-running inline (60 s
ceiling, starved `after()` - both proven).

---

## 11. Puck block, public page, performance isolation

- One Puck block ("Space Planner") whose editor and RSC paths emit identical markup. The
  block renders as a **static teaser** (image + "Plan your space" button); the full app
  (three.js + planner code) lazy-loads only on interaction or on the planner's own public
  page. Three.js itself is already in the core dependency tree and shared with the product
  3D viewer - the planner adds its own code on top, not a second copy of three. The planner
  must never tax a page it merely sits on.
- **The planner's public page lives at `/space-planner` via `publicBasePath`** - and it
  renders inside the site header and footer like every module public page; there is no
  full-screen opt-out in `app/(public)/layout.tsx`, so the design target is **full-bleed
  within `<main>`**: the planner fills the viewport minus the (76 px, sticky) header. That
  is the honest layout on this platform and it keeps site navigation present, which is
  what a shopper mid-purchase actually wants. Module public pages are always dynamic - no
  ISR assumptions anywhere.
- Colours are semantic tokens throughout; light + dark checked for AA; no hardcoded hex.

---

## 12. Admin screens, permissions, analytics (module's own nav section)

Manifest declares `navGroupLabel: "Space Planner"` with `navEntries` (more than two links,
so per the sidebar rule: own section with a "Pages" sub-link), and `permissions`:
`space-planner.access`, `space-planner.manage` (a shop-style access helper mirrors
`modules/shop/lib/access.ts` - `manage` supersedes, every admin page and API route checks
its own key; nothing is guarded for free).

1. **Rooms & plans** - members' rooms with their plans nested, open read-only, rooms and
   plans per week, plan→cart/quote conversion, delete. Useful in its own right when a
   customer rings up about a layout they saved.
2. **Model metadata** - `spl_model_meta` curation with a **worst-offenders view** (models
   never reviewed, categories without defaults, junk-tail dimension parses, **bbox-vs-
   attribute disagreements from §5's cross-check**) so upkeep is a ten-minute job, not
   archaeology. Includes per-model preview with yaw/mount editing.
3. **Dimension report** - the parser's junk tail, category default coverage, and the
   **resumable rebuild** with a progress bar, elapsed count and a stop button (§3), because
   22,055 products is a job the owner watches rather than a button that appears to hang.
4. **Render jobs** - log with errors.
5. **Settings** - retention, quotas, budgets, clearance-guidance defaults and toggles,
   render worker status readout, quote email recipient.

(No quote inbox - that screen belongs to quote-for-shop and already exists.)

Analytics: events land in `spl_events` (§3 - no PII, retention-swept), member actions also
emit `MemberActivityEvent` rows via manifest `activityTypes`. Admin numbers come off these
tables; a `core.admin-dashboard-widgets` tile surfaces plans-this-week. Directly answers
"what should we 3D-model next" (placement counts per product without a model).

---

## 13. Abuse, validation, privacy

**Requiring sign-in to save removed most of this section's original surface** - there is no
unauthenticated write endpoint left to defend. What remains:

- **Server-side validation on every write**: room geometry and plan JSON both go through a
  zod schema (zod is already a core dep) - shape, `schema_version` gate, vertex and item
  count ceilings, byte-size cap on the payload. Junk is rejected, never stored.
- **Ownership checks on every read and write**, by `member_id`, on rooms *and* plans. A plan
  id is not a capability: fetching, editing or deleting one has to prove the session owns
  the room it belongs to. This is the defect class that turns a planner into a data leak, so
  it gets its own tests (§14) rather than being assumed from the route tier.
- **Per-member quotas** (§3: 25 rooms, 25 plans per room, item cap per plan), enforced
  server-side, with a plain-English message rather than a 400.
- **Rate limiting** on what is still reachable without an account - the share view - and on
  the expensive authenticated actions (render enqueue, quote trigger, plan email).
  **The trap here is reaching for core's limiter**: `lib/auth/rate-limit.ts` looks like the
  obvious tool, but its `RateLimitAction` is a closed union (`:6-22`) with no module
  extension point, so adding `space_planner_render` to it would force a core release for
  what should be module-local work. The module therefore counts its own rows, exactly as
  contact-form does (`modules/contact-form/lib/rate-limit.ts`), while still borrowing core's
  `clientIpFromHeaders` - which reads the **last** forwarded hop rather than the first,
  because the leftmost entry is caller-forgeable and rotating it walked straight through
  every per-IP limit (`lib/auth/rate-limit.ts:52-69`). Never waved through when the IP is
  null (`app/api/contact/submit/route.ts:171-191`).
- **Consent**: core has a full framework - categories `necessary`/`preferences`/`analytics`/
  `marketing`, a pre-hydration cookie bootstrap, and `loadIfConsented(category, fn)` for
  deferring work until consent arrives (`lib/consent/gate.ts:35`). Declared
  `cookieCategories` in a manifest are currently only *suggestions* for the admin's GDPR
  tab; nothing enforces them at runtime, and at least one module tracks views without
  checking (`modules/gazette/components/public/ViewTracker.tsx:9`). The planner does not
  copy that. Its split: the localStorage scratch plan is the shopper's own work in their own
  browser, functionally identical to the cart, so it sits with the cart's category; its
  `spl_events` analytics writes are gated on `hasConsent('analytics')` through the existing
  gate. `loadIfConsented` has zero call sites today, so the planner would be the first
  module to actually use the mechanism core already built - which is a good reason to use
  it properly rather than a reason to skip it.
- **Turnstile** on the quote trigger and plan email, exactly as contact-form gates
  submission (`verifyTurnstile` from `@/lib/auth/turnstile`, config-toggled, only when
  configured). Render enqueue additionally requires the plan to be saved.
- **Route tiers**: every room and plan route declared MEMBER in
  `memberExtensions.routeTiers`; only the share view is PUBLIC.
- Share tokens are long-random, constant-time compared, and the share page is
  robots-disallowed (§9). No personal data ever appears in a URL beyond the token itself.
- Privacy posture: `spl_events` carries no PII (§3); GDPR export via `dataExportPath`,
  retention purge via the nightly cron; uninstall teardown drops all `spl_` tables.

---

## 14. Testing

- **Unit**: dimension parser against the committed fixture dump of the full live attribute
  value set; room geometry (triangulation, winding, self-intersection, openings); plan JSON
  migrations (schema_version 1 → N); mount/parenting maths; BOM totals against the shop
  tax-display utils; zod validation of both room and plan payloads (reject cases);
  **geometry-edit propagation** - which items a given wall move displaces, asserted per
  plan, since that is the rule with the most ways to quietly lose someone's work.
- **Ownership**: an explicit suite proving one member cannot read, edit, delete, share,
  render or quote another member's room or plan, by id, on every route. Cheap to write,
  and the one bug in this module that would be a data breach rather than a nuisance.
- **Resumability**: the dimension rebuild, driven to completion across many bounded calls
  against a fixture catalogue, plus a mid-run cancel and a mid-run restart, asserting the
  cursor never loses or double-counts a product (§3).
- **Version restore**: save, edit, restore, confirm the plan matches the earlier state and
  that restoring is itself versioned rather than destroying the newer one.
- **Pipeline**: the calibration script doubles as a regression harness - budgets and
  normalisation assertions over the real GLB set.
- **E2E**: Playwright - desktop Chromium plus the established WebKit iPhone emulation, and
  an iPad-sized WebKit viewport (the tablet is a real planning device and hits the
  touch/desktop boundary). A seeded "kitchen sink" plan (poly room with obstruction +
  opening, modelled items, placeholders, a mounted arm, a tucked pedestal, a duplicated
  desk bank) drives visual-regression screenshots across the three views, light and dark.
  3D tools regress invisibly without this. A second journey covers the account path: plan
  as a guest, hit save, sign in, find the work intact as room one plan one, add a second
  plan to the same room, edit the room's geometry, and confirm both plans survive with the
  displaced items in their trays.
- **Render worker smoke**: one end-to-end job against the worker (enqueue → upload →
  callback → Media row) in CI-adjacent form, plus §16's early spike.
- **Backup round-trip**: STRICT gate, real PASS required (new `spl_` tables). A skip is a
  fail. Schema-coverage backstop runs in plain `npm test`.
- Standing checks throughout: `tsc --noEmit`, `eslint .` at zero/zero. No production build
  unless asked.

---

## 15. Documentation + release

- Wiki: new "Space planner" feature page (user-facing behaviour, imports/extension points
  consumed, schema, budgets, retention, render worker) + Architecture overview touched
  (new Fly app) + Configuration reference (`SPACE_PLANNER_RENDER_URL`/`_SECRET`,
  `CRON_SECRET` already documented). `wiki/Authoring-a-module.md` is the authoring
  checklist to follow, not re-derive. Wiki is a separate checkout - push it separately,
  both trackers.
- FIELD_NOTES.md updated (routes, tables, extension-point implementations, block, admin
  pages, scripts, env vars).
- README "Available modules" entry.
- **Release train (corrected)**: no shop release, no shop-variations release, no p3d
  release, and no core release is expected - the module is self-declaring end to end. The
  two things that would change that, known in advance: a new npm dependency (§2 - avoided)
  and quote-for-shop's create path needing a small export patch (§18). Module release:
  patch versions only, tag = plain manifest version, `--prerelease`, notes in the house
  style (British wit, zero jargon, no banned words).
- **Install adoption**: Deskwell adds the module to its own `modules.json` through the
  install's module admin - the owner's action, never ours, same as every update.
- **Uninstalling this module destroys customer documents**, which is not true of most
  modules: unlike an order or a review, the customer has no copy of a plan anywhere else.
  Core's uninstall dialog already handles this better than expected - `code_only` is the
  default and is labelled "(recommended)", leaving every table intact so a reinstall finds
  the plans still there; `code_and_data` is labelled "(irreversible)" in the destructive
  colour and spells out that all data is permanently deleted, and it is disabled outright
  for modules that declare no `teardown` (`app/cactus-admin/modules/page.tsx:617-700`,
  `app/api/admin/modules/[id]/route.ts:274-320`). So the generic warning exists. What the
  module adds is an **export-everything action on its settings page** - nothing in the
  uninstall path exports anything first - and a wiki line saying plainly what the data-mode
  uninstall costs a customer.

---

## 16. Build order (dependency-driven, one release at the end)

Not phases - nothing ships until all of it ships. Order exists only because later work sits
on earlier work:

1. Calibration trio - GLB pipeline survey, dimension parser dry run over live values, and
   a one-day render-worker spike (same scene lib headless, one image out, machine sizing) -
   feeds budgets, `spl_model_meta`, `spl_category_defaults`, and settles the riskiest
   assumptions first. Also the moment to build the **first-run flow as a paper prototype**
   (§6): it costs a day, it is the screen every other item here depends on, and finding out
   it does not land after the placement engine exists is the expensive order to discover it.
2. Schema + migrations + backup round-trip green. Manifest skeleton (permissions, nav,
   cron, email templates, teardown, memberExtensions) so every later piece has its
   declaration point.
3. Import wiring: shop listing/price/tax/cart utils, p3d resolvers + load pipeline,
   shop-variations resolution, pat read probes - proven with thin integration tests before
   any UI exists.
4. Asset pipeline (worker decimation, instancing, caching, normalisation, placeholders).
5. Room editor (2D) + 3D generation.
6. Placement engine (views, snapping, overlap policy, mount types, multi-select,
   properties panel, repetition, undo).
7. Catalogue browser panel + cart integration.
8. **Rooms and plans library** (§9b): save/sign-in gate, room and plan CRUD, geometry-edit
   propagation with the staging-tray rule, version history and restore, sharing, plan
   comparison. Ownership checks and quotas land here, with their tests, not as a later
   hardening pass.
9. Outputs (print view + BOM incl. the optional delivery column, USDZ, GLB export behind
   its default-off setting, quote-for-shop integration, render worker last
   within this).
10. Puck block + public page + performance isolation.
11. Extension-point surfaces: product page button, cart action, member account section
    ("My spaces"), dashboard widget, media usage/rewriter providers.
12. Admin screens + analytics + remaining abuse hardening (§13).
13. E2E + visual regression + accessibility pass.
14. Docs, FIELD_NOTES, wiki, release train.

Estimated shape: this is a multi-month module - the largest single module on the platform by
some distance. The riskiest unknowns (asset behaviour in bulk, attribute parse junk tail,
render worker feasibility, touch feel) are all front-loaded into items 1-6 so they surface
while the architecture is still cheap to bend.

---

## 17. Explicitly out of scope (decided, not forgotten)

Multi-floor plans; door swing arcs and full joinery; sloped ceilings; articulated accessory
posing; accessory-on-accessory stacking; live sit-stand height animation; pathtraced
rendering in-browser (server renders cover it); collaborative simultaneous editing;
localisation beyond en-GB units handling; physical-device AR beyond the USDZ hand-off;
a quote pipeline of the planner's own (quote-for-shop owns quotes - decided, §10); a
full-screen chrome-free route (the platform renders module pages inside the site frame,
and the planner designs for it - §11); **anonymous saved plans** (saving requires an
account - decided, §3); room-level share links (per-plan sharing only in the first build -
§9b); plans belonging to more than one room, or a plan spanning several rooms (a plan is a
layout of exactly one space); and organisation-level sharing between colleagues, which is
the obvious next want and needs an account model the platform does not have yet.

Two more that are deliberately deferred rather than dismissed, because both are strong and
both would double the build:

- **Owner-authored proposals** - staff opening a customer's plan, revising it, and returning
  it with the quote reply. This is the real B2B loop and probably the module's best future
  feature. The only thing v1 does for it is refuse to foreclose it: `spl_rooms.owner_user_id`
  exists and stays null (§3). Everything else - a staff editing surface, proposal status,
  reply attachment - is a later release.
- **Delivery and lead-time estimation in the BOM** - needs a real integration with
  `advanced-shipping-for-shop` to be truthful (§10).

---

## 18. Assumptions to verify at build start (each is cheap to check, none blocks planning)

1. **quote-for-shop's create path is importable** - its creation logic currently sits
   behind `modules/quote-for-shop/app/api/public/requests/route.ts:33`. If the callable
   isn't exported as a lib function, the fix is a small quote-for-shop patch release that
   extracts it (the one other-module release this plan might need). Confirm before §16
   step 8.
2. **shop-variations' resolution entry points** - the exact exported functions for
   options→variant-child mapping (`svr_*`). Confirm at §16 step 3.
3. **p3d `load-model.ts` client boundaries** - it is written for the product-page client;
   confirm the planner's Web-Worker decimation stage can sit behind it without dragging
   server-only imports into the worker bundle. Confirm at §16 step 4.
4. **Vercel cron allowance on the install's plan** - 17 crons already generate today, so
   one more is precedented; confirm the schedule lands as declared after the first deploy.
5. **Consent categorisation of the planner's localStorage scratch state** - match whatever
   category shop's own localStorage cart sits in (§2). Nothing is persisted server-side
   without an account, so this is the only storage question left.
6. **`listProducts` perPage clamp (100)** is comfortable for the browse panel's paging; if
   the panel wants infinite scroll it pages, never widens the clamp.
7. **Member carts must actually be released before the planner can pin them.** The feature
   is present in the local shop checkout at 0.1.192, but the newest published shop release
   is **v0.1.191**, which is also what Deskwell pins - so the live site does not have it
   yet. Nothing in this plan breaks without it (the cart util is the same call either way);
   only the cross-device *promise* in §9 depends on the release landing and Deskwell taking
   it. Re-read the pin at build start rather than trusting this line.
8. **What core does when a member deletes their account.** The module cannot FK to core's
   `Member`, so rooms and plans do not cascade on their own. Find the hook core actually
   provides (`app/api/members/delete-account`, and whether module teardown of member data
   is signalled anywhere); if there is none, the module registers its own cleanup and the
   nightly cron sweeps rows whose `member_id` no longer resolves. Confirm at §16 step 8 -
   orphaned personal data after a deletion request is a compliance failure, not a bug.
9. **Member sign-up friction is the feature's real risk.** Deskwell has **2 member
   accounts** and 13 orders, with guest checkout on - so gating saves behind sign-in is
   asking most visitors for something they have never yet done on this site. The plan
   accepts that trade (§3) because the alternative is anonymous rows nobody can find again
   anyway, but the sign-in prompt deserves the same polish as the room editor, and the
   owner should see the conversion numbers (§12) early rather than at the end.
10. **Reference assets nobody owns yet - confirmed as a real dependency.** p3d ships
    **six files in `assets/`, all decoders**: no human figure, no scale reference, no HDRI,
    no environment map, no floor texture. Its lighting is procedural (three's
    `RoomEnvironment`, chosen precisely so there is "no asset to host, nothing to fetch, no
    licence" - `load-model.ts:1245-1247`). So the door-height marker, the human figure for
    scale (§6) and any floor/wall finishes are **new assets somebody has to make or licence**.
    "Someone has to model a person" is exactly the dependency that surfaces late and stalls
    a release, so it is named now and settled at §16 step 5. The cheap escape, if it comes
    to it, is a flat silhouette sprite rather than geometry.
11. **Real GLB byte sizes across all 257 files** - only 22 rows carry a recorded `size` and
   `SESSION_SECRET` is Vercel-only, so the CDN cannot be sampled from a dev machine. The
   calibration script (§16 step 1) runs where the secret exists and produces the true size
   distribution; the budgets in §8 are set from the measured sample (avg 4.0 MB, max
   8.5 MB) and get re-fitted then, not before.
