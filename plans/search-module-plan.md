# Search module - implementation plan

Status: SHIPPED 2026-08-01 - search v0.1.0 + shop v0.1.156, registered in core v0.5.828. Plan written same day from a three-agent codebase recon.
Scope: a new first-party module named `search` providing site-wide frontend search across
all public content types, with a heavily configurable Puck block. No core changes required.

---

## 1. What exists today (recon summary)

- **No site-wide public search exists anywhere** - not in core, not in any module. `search` as
  a module name, `srch_` as a table prefix and `search` as a publicBasePath are all free.
- **Boards is the only full-text search prior art**: GIN indexes on
  `to_tsvector('english', ...)` in `modules/boards/migrations/001_initial.sql:125,160` and a
  ranked `plainto_tsquery` endpoint at `modules/boards/app/api/public/boards/search/route.ts`.
  Everything else is admin-side ILIKE filters.
- **Ultimate SEO has the two patterns we need to copy**:
  - `modules/ultimate-seo/lib/content.ts` → `extractContent(data)` - a block-agnostic Puck
    JSONB → plain text extractor (walks `content` + `zones`, recurses arrays/objects, strips
    HTML, skips id/url/colour keys). We copy this into the search module (no cross-module
    import - it must work when ultimate-seo is absent).
  - `modules/ultimate-seo/lib/inventory.ts` - the canonical "query
    `prisma.module.findMany({ where: INSTALLED_MODULE_WHERE })`, conditionally include each
    source, `Promise.allSettled` so a half-installed module skips instead of 500s" pattern
    for reading other modules' tables without touching their schemas.
- **`core.menu-entity-provider`** (`lib/modules/menu-entity-provider.ts`) is the nearest
  existing cross-module search contract (shop/gazette/boards/directory each implement
  `searchEntities`/`resolveEntity` for the admin menu link picker). We model a future
  extension point on it, but v1 does not depend on other modules shipping anything.

### Content inventory (what gets indexed)

| Source key | Table(s) | Text fields | Public gate | URL |
|---|---|---|---|---|
| `page` | `"InfoPage"` (core) | `title`, `metaDescription`, Puck `publishedData ?? builderData` via extractor | `status='published'`; homepage is `/` when `SiteConfig.homepageId` matches (see `ultimate-seo/lib/inventory.ts`) | `/<slug>` |
| `shop-product` | `shp_products` (+ `shp_product_media.alt_text`, tags, category names) | `name`, `short_description`, `description` or extracted `description_puck`, `sku` | `status='ACTIVE' AND catalogue_hidden=false` (exactly what `modules/shop/lib/sitemap.ts` does); whole source dark when shop gate CLOSED | `/shop/products/<slug>` |
| `shop-category` | `shp_categories` | `name`, `short_description`, `description`/`description_puck` | always (category pages public) | `/shop/categories/<slug>` |
| `shop-collection` | `shp_collections` | `name`, `description` | always | `/shop/collections/<slug>` |
| `gazette-post` | `gz_posts` | `title`, `excerpt`, extracted `builder_data` | **reuse `publicVisibleSql()` from `modules/gazette/lib/visibility.ts` semantics** - `(PUBLISHED AND published_at<=now) OR (SCHEDULED AND scheduled_for<=now)`, `is_private=false`. Re-implement the predicate in our own SQL (no cross-module import); note scheduled posts go live lazily, so indexing must re-check | `/gazette/<slug>` |
| `directory-entry` | `dir_entries` (+ `dir_categories.name` for URL + copy) | `name`, `short_description`, extracted `description` (JSONB Puck), `tags` array, `area` | `status='published'` | `/directory/<cat-slug>/<entry-slug>` (needs category join) |
| `boards-thread` | `brd_threads` (+ board title) | `title`, extracted `opener_data` | thread `status='PUBLISHED'` AND board visibility (see §4 visibility model) | `/boards/t/<slug>` |
| `member` | `"Member"` (core) | `username`, `displayName`, `bio` | members feature enabled + `directoryEnabled` + `profileVisibility` (PUBLIC → public, MEMBERS_ONLY → members tier, HIDDEN → skip); respect `MemberProfileVisibility.showBio` | `/members/<username>` |

Deliberately **excluded**: `Layout` rows (site chrome), `InfoPage.history`, boards replies
(`brd_posts`) in v1 (threads only - replies are volume without much nav value; revisit),
reviews (render on product pages - product hit suffices), media metadata (admin-only, no
public URL), contact submissions, quotes, `catalogue_hidden` variation children.

Each adapter is gated on module installed status (`INSTALLED_MODULE_WHERE` +
`MODULES_IN_BUILD` - read the comment at the top of `lib/modules/live-status.ts` first)
and wrapped so a missing table skips the source rather than failing the run.

---

## 2. Architecture decision: dedicated index table

**Chosen: a search-module-owned index table (`srch_documents`), populated by per-source
adapters, queried with Postgres FTS.** Not live federated queries.

Why: body text lives in four differently named Puck JSONB columns
(`InfoPage.publishedData`, `gz_posts.builder_data`, `shp_products.description_puck`,
`dir_entries.description`, `brd_threads.opener_data`). JSONB cannot be tsvector-indexed
without a derived plain-text column, and module isolation forbids adding columns to other
modules' tables. A single owned index table gives one GIN index, one ranked query, uniform
result cards, and zero schema changes elsewhere. Cost: staleness, handled in §5.

**tsvector as a plain column written by the indexer, not a GENERATED column.** The language
(regconfig) is a site setting; a generated column bakes `'english'` in and a language change
would need DDL. Indexer computes
`setweight(to_tsvector($lang, title), 'A') || setweight(..., excerpt, 'B') || setweight(..., body, 'C')`
at write time; language change prompts a rebuild.

---

## 3. Module identity and manifest

```json
{
  "name": "search",
  "version": "0.1.0",
  "tablePrefix": "srch_",
  "requiresCoreVersion": "<current core at release>",
  "description": "Site-wide search across pages, shop, articles, directory, forum and members, with a configurable search box and results page.",
  "publicBasePath": "search",
  "permissions": ["search.view", "search.manage"],
  "navEntries": [
    { "label": "Search", "path": "/m/search/index", "icon": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m21 21-4.3-4.3\"/>", "permission": "search.view" }
  ],
  "settingsTabs": [
    { "id": "search", "label": "Search", "permission": "search.manage",
      "import": "./components/admin/SearchSettingsTab", "component": "SearchSettingsTab" }
  ],
  "teardown": ["srch_documents", "srch_queries", "srch_settings"],
  "cronJobs": [
    { "path": "/api/m/search/cron/reindex", "schedule": "0 4 * * *" }
  ],
  "layoutTypes": {
    "groupLabel": "Search",
    "types": [
      { "key": "searchResults", "label": "Search results page",
        "starterImport": "./lib/starterLayouts", "starterExport": "searchResultsStarter" }
    ]
  },
  "puckBlocks": [
    { "type": "SiteSearch",
      "import": "./components/puck/SiteSearchBlock", "component": "siteSearchPuckComponent",
      "rscImport": "./components/puck/SiteSearchBlock.rsc", "rscComponent": "siteSearchPuckRscComponent" },
    { "type": "SiteSearchResults",
      "import": "./components/puck/SiteSearchResultsBlock", "component": "siteSearchResultsPuckComponent",
      "rscImport": "./components/puck/SiteSearchResultsBlock.rsc", "rscComponent": "siteSearchResultsPuckRscComponent",
      "layoutTypes": ["searchResults"] }
  ]
}
```

Notes:
- Block type names `SiteSearch`/`SiteSearchResults` chosen to avoid any collision risk with
  a generic "Search".
- `SiteSearch` (the box) is placeable anywhere - pages, header layout, footer. It is the
  one owners drop into the header.
- One nav entry stays flat (≤2 rule). Settings live on the Settings tab, never a
  standalone page.
- `rscImport`/`navGroupOrder` are honoured by generators but stripped by the Zod manifest
  schema post-install until next deploy re-syncs - known quirk, harmless, don't chase it.

---

## 4. Schema - `migrations/001_initial.sql`

```sql
-- Search Module - Initial Migration
-- Table prefix: srch_
-- Applied once by the Cactus module migration runner during build.

CREATE TABLE IF NOT EXISTS "srch_settings" (
  "id"                 TEXT PRIMARY KEY DEFAULT 'singleton',
  "language"           TEXT NOT NULL DEFAULT 'english',      -- regconfig name, validated against an allowlist in code
  "sources"            JSONB NOT NULL DEFAULT '{}',          -- { "shop-product": true, ... } master switches
  "weights"            JSONB NOT NULL DEFAULT '{}',          -- optional per-source rank multiplier { "page": 1.0, ... }
  "query_logging"      BOOLEAN NOT NULL DEFAULT true,
  "log_retention_days" INTEGER NOT NULL DEFAULT 90,
  "excerpt_length"     INTEGER NOT NULL DEFAULT 160,
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "srch_documents" (
  "id"                TEXT PRIMARY KEY,                      -- '<source>:<entity_id>'
  "source"            TEXT NOT NULL,                         -- 'page' | 'shop-product' | ...
  "entity_id"         TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "excerpt"           TEXT,                                  -- pre-built card snippet (fallback when no headline)
  "body"              TEXT NOT NULL DEFAULT '',              -- extracted plain text
  "url"               TEXT NOT NULL,                         -- site-relative, e.g. /shop/products/foo
  "image_url"         TEXT,                                  -- plain stored URL, NEVER a signed URL
  "extra"             JSONB,                                 -- card data: price, currency, date, author, category, badge label
  "tier"              TEXT NOT NULL DEFAULT 'public',        -- 'public' | 'members'
  "source_updated_at" TIMESTAMPTZ,                           -- from the source row, for staleness diff
  "indexed_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "search_vector"     TSVECTOR NOT NULL,
  CONSTRAINT "srch_documents_source_entity_key" UNIQUE ("source", "entity_id")
);

CREATE INDEX IF NOT EXISTS "srch_documents_vector_idx" ON "srch_documents" USING GIN ("search_vector");
CREATE INDEX IF NOT EXISTS "srch_documents_source_idx" ON "srch_documents" ("source");

CREATE TABLE IF NOT EXISTS "srch_queries" (
  "id"           TEXT PRIMARY KEY,
  "query"        TEXT NOT NULL,
  "normalized"   TEXT NOT NULL,                              -- lowercased/trimmed for aggregation
  "result_count" INTEGER NOT NULL,
  "sources"      TEXT,                                       -- comma list if the request filtered
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "srch_queries_created_idx" ON "srch_queries" ("created_at");
CREATE INDEX IF NOT EXISTS "srch_queries_normalized_idx" ON "srch_queries" ("normalized");
```

Privacy: `srch_queries` stores query text and counts only - no IP, no session id, no user
id. Nothing here needs a cookie category.

**Backup gate (STRICT)**: this migration adds a `tsvector` column.
`lib/backup/serialize.ts` already lists `tsvector` as a supported udt, and
`lib/backup/schema-coverage.test.ts` will assert coverage automatically - but the standing
rule applies regardless: any new module migration means `npm run test:backup-roundtrip`
must genuinely PASS (a skip is a fail) before the task is done.

No `pg_trgm`, no extensions in v1. An extension-creating migration would be a new
precedent across every install - phase 2 at the earliest, and only with sign-off.

---

## 5. Indexing pipeline

### Adapters

`lib/adapters/<source>.ts`, one per source key in the §1 table, each exporting:

```ts
export type SearchAdapter = {
  source: string                                   // 'shop-product'
  isAvailable(): Promise<boolean>                  // module installed + in build (live-status + MODULES_IN_BUILD)
  listIds(): Promise<string[]>                     // all currently-public entity ids (for deletion diff)
  listChangedSince(since: Date | null): Promise<string[]>  // ids whose source row changed (null = all)
  fetchDocuments(ids: string[]): Promise<SearchDocument[]> // batched, joins done here
}
```

All DB access through the shared `@/lib/db/prisma` client with `$queryRaw` +
`Prisma.sql` (never a second client - the stale-plan retry extension and the Vercel
`connection_limit=1` cap live on the shared instance). Every adapter call wrapped in the
runner with `Promise.allSettled`; a failing adapter logs and skips, never aborts the run.

Text extraction: `lib/extract.ts`, a copy of ultimate-seo's `extractContent()` walker
(same `SKIP_KEY_RE` idea: skip id/url/colour/slug-ish keys, strip HTML, recurse arrays and
zones), extended to collect image alt text into the body. Unit-test it against a fixture
of real block shapes (Heading `props.text`, TextBlock `props.content`, RichTextBlock HTML,
Accordion items array).

### Runner

`lib/indexer.ts` - `runIndex({ full, sources?, batchSize = 200, deadlineMs })`:

1. Per available + enabled adapter: `listChangedSince(lastRun)` (or all ids when `full`).
2. `fetchDocuments` in batches; upsert into `srch_documents`
   (`INSERT ... ON CONFLICT ("source","entity_id") DO UPDATE`), computing `search_vector`
   in the same statement with `setweight(to_tsvector($lang::regconfig, ...))` A/B/C.
3. Deletion diff: `listIds()` vs indexed ids per source → delete vanished/unpublished rows.
   (This also catches gazette scheduled posts crossing their go-live time and boards
   visibility flips - publicness is re-evaluated every run, not cached.)
4. Respect `deadlineMs` (the 60-second module-route ceiling is un-overridable): stop
   cleanly at ~45 s, return a cursor `{ source, offset }` so the caller can continue.

### Triggers

- **Cron, daily 04:00** (`/api/m/search/cron/reindex`): incremental run + purge
  `srch_queries` older than `log_retention_days`. Daily because Vercel hobby crons are
  once-per-day; the schedule string is trivial to tighten on paid plans later.
- **Admin "Rebuild index" button**: the admin client loops
  `POST /api/m/search/admin/reindex { cursor }` until `done`, each call under the 60 s
  ceiling, progress bar from returned counts. Also per-source "Reindex" buttons.
- **Opportunistic freshness (cheap)**: the public search endpoint, at most once per
  10 minutes (in-memory timestamp), fires a bounded incremental check inline before
  answering (max ~1 s budget: compare `max(updated_at)` per source against `indexed_at`
  high-water mark; if stale, flag the dashboard rather than reindexing inline). Do NOT
  use `after()` for follow-up work - it dies with the route's 60 s ceiling and gets
  starved (documented project memory).

There is no "index on publish" hook in core and we are not adding one - cron + manual +
the staleness flag covers it. If a hook seam ever lands in core, the indexer's
`runIndex({ sources: [x], ids })` shape is ready for it.

---

## 6. Query pipeline

`lib/query.ts` - one function both the API route and the RSC results block call:

```ts
searchDocuments({
  q, sources?, tier,            // tier: 'public' | 'members' (derived from session presence)
  limit, offset, sort,          // sort: 'relevance' | 'newest'
  highlight, snippetLength,
})
```

- Parse with `websearch_to_tsquery($lang, q)` (supports quoted phrases, OR, -exclusion;
  first use in the codebase - boards uses `plainto_tsquery`). Guard: empty/invalid tsquery
  → return empty result, never throw.
- **Typeahead prefix matching**: for live search, rewrite the final token to `token:*` via
  `to_tsquery`, OR-combined with the websearch parse, so "gre" matches "green". No pg_trgm
  needed.
- Rank: `ts_rank_cd("search_vector", query)` multiplied by the per-source weight from
  settings (join unnested weights or CASE). Secondary order `source_updated_at DESC`.
- Snippets: `ts_headline` with `StartSel=<mark>, StopSel=</mark>, MaxWords/MinWords` from
  snippet length - computed only for the returned page of rows (it is expensive), falling
  back to `excerpt`. Sanitise: headline output is built from our own extracted plain text,
  but escape everything except our `<mark>` markers before render.
- Visibility: `tier = 'public'` always included; `'members'` rows included only when the
  caller has a session (`getSessionFromCookie()` presence - matches boards MEMBERS
  semantics and member MEMBERS_ONLY profiles). PRIVATE boards content is never indexed
  at all.
- Grouped mode: when `groupBySource`, run one ranked query and regroup in JS (single
  round-trip; the pgbouncer 4-RTT lesson says minimise query count).
- **Product hit enrichment (query time, never index time)**: for `shop-product` hits the
  query path live-joins `shp_products` (+ primary media) by id for price, sale price,
  stock/pre-order badge state and image. Prices change outside the index's knowledge
  (sheet Pull, sales), so the indexed `extra` payload is used for text/fallbacks only -
  anything money- or stock-shaped is fetched fresh in the same round trip
  (`JOIN ... = ANY(ids)` on the returned page of hits, so cost is bounded by page size).

---

## 7. API surface

| Route (on disk under `modules/search/app/api/`) | URL | Auth | Purpose |
|---|---|---|---|
| `public/search/query/route.ts` | `GET /api/m/search/public/query` | none (session optional, widens tier) | Main search. Params: `q`, `sources`, `limit` (clamp ≤ 50), `offset`, `sort`, `group`, `highlight`. Zod-validated at module scope. Logs to `srch_queries` when enabled. |
| `public/search/suggest/route.ts` | `GET /api/m/search/public/suggest` | none | Typeahead: title-weighted prefix query, limit 8, no headline, no logging. |
| `admin/search/reindex/route.ts` | `POST /api/m/search/admin/reindex` | `search.manage` | Batched rebuild with cursor. Body: `{ full?, sources?, cursor? }`. |
| `admin/search/status/route.ts` | `GET /api/m/search/admin/status` | `search.view` | Docs per source, last run, staleness flags, index size. |
| `admin/search/queries/route.ts` | `GET /api/m/search/admin/queries` | `search.view` | Query log: top queries, zero-result queries, volume by day. |
| `admin/search/settings/route.ts` | `GET/PUT /api/m/search/admin/settings` | `search.manage` | Settings singleton read/write. |
| `cron/reindex/route.ts` | `GET /api/m/search/cron/reindex` | cron | Incremental run + log purge. |

Auth is inline per route (no wrapper HOF exists): `getSessionFromCookie()` →
`hasPermission(user, 'search.manage')` → `errorResponse(...)`, exactly the contact-form
pattern. Public query route must clamp pagination and rate-limit by being cheap, not by
state.

### Public page

`app/public/search/page.tsx` → the `/search` results page. Resolves a `Layout` of type
`searchResults` via `resolveThemeLayout`, injects the request's `?q=`/`?page=`/`?sources=`
into the stored Puck data through `lib/inject-search-context.ts` (the gazette
`inject*Context` pattern), renders with the RSC Puck config. `force-dynamic` like every
module public page. Starter layout (`lib/starterLayouts.ts` - **pure data, no imports**)
ships a `SiteSearch` box + `SiteSearchResults` block so the page works out of the box and
owners restyle it in Appearance → Layouts.

`lib/robots.ts` → `getPublicRobotsDisallow()` returning `['/search']` (auto-discovered by
the router generator). No sitemap entries.

---

## 8. Puck blocks - the configuration surface

Conventions that bind every field below (from recon, all load-bearing):

- Editor half (`SiteSearchBlock.tsx`) is a static, fetch-free skeleton; RSC half
  (`SiteSearchBlock.rsc.tsx`) spreads the editor object and swaps `render`. Editor file
  must never import prisma or `lib/puck` editor-tainted widgets.
- **Never name a field** `visibility`, `sticky`, `stickyOffset`, `animationType`,
  `animationDuration`, `animationDelay` - core owns all six and strips/injects them.
- Booleans are `select` with `'yes'`/`'no'` string options (house style, no real booleans).
- Flat field list with `// Section` comment dividers mirrored in the Props type and
  `defaultProps` (key-for-key). No `object`/`external` fields - unproven in this repo.
- `resolveFields` does the grouping work: hide inapplicable fields per the gating column
  below, and narrow the source toggles to installed modules via a module-scope-cached
  (60 s TTL) fetch of `/api/m/search/public/sources` (tiny endpoint returning available
  source keys; same caching idiom as `ContactFormBlock._authConfigCache`).
- Colours via semantic tokens only (select fields mapping to `var(--color-*)`), styles as
  inline `style={{}}` plus one injected `<style>` block with a `srch-` class prefix.
  No `.css` files, no `globals.css` edits.
- `inline: true` + attach `puck.dragRef` to the root element (editor wrapper-div parity
  trap); `delete props.puck; delete props.editMode` before spreading into the client
  island; pass the client only its display subset.

### Block 1: `SiteSearch` (the search box) - ~30 fields

**// Behaviour**

| Field | Type | Options / default | Shown when |
|---|---|---|---|
| `mode` | select | `page` (go to results page, default) / `inline` (dropdown under box) / `overlay` (full-screen layer) | always |
| `minChars` | number | 2 | mode ≠ page |
| `debounce` | select | 150 / 250 (default) / 400 ms | mode ≠ page |
| `maxResults` | number | 8 | mode ≠ page |
| `groupResults` | select | yes/no (group dropdown hits by content type) | mode ≠ page |
| `hotkey` | select | `none` (default) / `/` / `mod+k` (⌘K / Ctrl+K) | always |
| `autoFocus` | select | no (default) / yes | always |
| `resultsPath` | text | `/search` | always (where Enter/View-all goes) |

**// Content types** (each select yes/no, default yes; `resolveFields` shows only sources
whose module is installed - a fresh site with no shop simply never sees `searchProducts`)

`searchPages`, `searchProducts`, `searchCategories`, `searchCollections`,
`searchArticles`, `searchDirectory`, `searchForum`, `searchMembers`

**// Appearance**

| Field | Type | Options / default | Shown when |
|---|---|---|---|
| `presentation` | select | `field` (default) / `iconButton` (expands/opens overlay) / `fieldWithButton` | always |
| `placeholder` | text | "Search…" | presentation ≠ iconButton |
| `buttonLabel` | text | "Search" | presentation = fieldWithButton |
| `ariaLabel` | text | "Search this site" | always |
| `showIcon` | select | yes/no | presentation ≠ iconButton |
| `size` | select | small / medium (default) / large | always |
| `cornerStyle` | select | square / rounded (default) / pill | always |
| `fieldStyle` | select | outlined (default) / filled / minimal | always |
| `accent` | select | primary (default) / link / neutral - maps to token families for focus ring + button | always |
| `widthMode` | select | full (default) / fixed | always |
| `widthPx` | number | 320 | widthMode = fixed |
| `align` | select | left (default) / centre / right | widthMode = fixed |

**// Dropdown results** (all: mode ≠ page)

| Field | Type | Options / default | Shown when |
|---|---|---|---|
| `dropdownWidth` | select | `field` (match the input, default) / `container` (span the block's container) / `viewport` (edge-to-edge mega panel) | always |
| `productDisplay` | select | `rows` (default) / `cards` (product-card grid inside the dropdown) | shop installed |
| `dropdownColumns` | select | 2 / 3 (default) / 4 | productDisplay = cards AND dropdownWidth ≠ field |
| `showThumbnails` | select | yes/no, default yes | productDisplay = rows |
| `showExcerpts` | select | yes/no, default yes | productDisplay = rows |
| `showTypeBadges` | select | yes/no, default yes (little "Product"/"Article" chip) | always |
| `showPrices` | select | yes/no, default yes | shop installed |
| `highlightMatches` | select | yes/no, default yes (`<mark>` on matched words) | always |
| `viewAllLabel` | text | `See all results for "{query}"` | always |
| `emptyText` | text | "No results. Try a different word or two." | always |

Notes on the new fields:

- **Products-only mega search** is a configuration, not a variant: turn every Content
  types toggle off except `searchProducts`, set `mode: inline`,
  `dropdownWidth: viewport`, `productDisplay: cards` - that is the classic e-commerce
  header search. Non-product hits simply never appear.
- `dropdownWidth` is done without portals (editor/RSC parity rule): `container` makes the
  panel absolute against the block root; `viewport` uses the
  `left: 50%; transform: translateX(-50vw); width: 100vw` technique inside the injected
  `<style>` block. Both keep identical markup in editor and RSC paths.
- `productDisplay: cards` renders **search-owned card lookalikes** in the dropdown
  (image, name, price with sale strike-through, badge - token-styled, `srch-card-*`
  classes), fed by the query-time price enrichment in §6. They are deliberately NOT the
  owner's designed Product Card template: the dropdown is a client island fetching JSON
  per keystroke, and the designed card template can only be stamped server-side (see
  §8.5). Mixed-source results render non-product hits as rows beneath the card grid.

Editor preview: the styled input (all appearance fields live), plus a faked static
dropdown of two ghost rows when mode ≠ page so owners can see the result-row options
without typing. RSC render: same markup with the `'use client'` island
(`components/public/SearchBoxClient.tsx`) mounted - debounced fetch to
`/api/m/search/public/query`, ARIA combobox pattern (`role="combobox"`,
`aria-expanded`, `aria-activedescendant`, arrow/Enter/Escape keys), dropdown rendered
in-flow (no portal - keeps editor/RSC markup identical).

### Block 2: `SiteSearchResults` (the results page body) - ~25 fields

Reads the injected query context (never `useSearchParams` - RSC).

**// Query** - same eight per-source toggles as above (per-block override of what this
results view includes).

**// Layout**

| Field | Type | Options / default | Shown when |
|---|---|---|---|
| `layout` | select | list (default) / grid / compact | always |
| `columns` | select | 2 / 3 (default) / 4 | layout = grid |
| `perPage` | number | 20 | always |
| `paginationStyle` | select | numbered (default) / loadMore | always |
| `groupBySource` | select | yes/no (sectioned results with headings) | always |
| `filterTabs` | select | yes (default)/no - "All / Products / Articles…" chips above results | always |
| `sortControl` | select | yes/no - relevance vs newest toggle | always |

**// Result cards**

| Field | Type | Default | Shown when |
|---|---|---|---|
| `productCardStyle` | select | `standard` (default, same card as other sources) / `shopCard` (the owner's designed Product Card template - pixel-identical to shop grids) | shop installed |
| `showThumbnails` | select yes/no | yes | always |
| `thumbnailShape` | select | landscape (default) / square / circle | showThumbnails = yes |
| `showExcerpts` | select yes/no | yes | always |
| `snippetLength` | select | short / medium (default) / long | showExcerpts = yes |
| `highlightMatches` | select yes/no | yes | showExcerpts = yes |
| `showTypeBadges` | select yes/no | yes | always |
| `showPrices` | select yes/no | yes | shop installed |
| `showDates` | select yes/no | yes | always |
| `showAuthors` | select yes/no | no | gazette/boards searched |
| `showUrls` | select yes/no | no (breadcrumb-style path under title) | always |

**// Headings & empty state**

| Field | Type | Default |
|---|---|---|
| `headingTemplate` | text | `Results for "{query}"` (empty string hides heading) |
| `countTemplate` | text | `{count} results` (empty hides) |
| `emptyTitle` | text | "Nothing found" |
| `emptyBody` | textarea | "No matches for that. Check the spelling, or try fewer words." |
| `showSearchBoxWhenEmpty` | select yes/no | yes |

Editor preview: three ghost result cards obeying every card/layout field, so the sidebar
is fully WYSIWYG without a live query. RSC render: calls `lib/query.ts` directly
(`await connection()` first), no client island needed except the load-more button
(small `'use client'` component) when `paginationStyle = loadMore`.

### §8.5 Real shop product cards - how, and where the line is

Verified facts driving this design:

- Product cards on shop grids are NOT a fixed component. Every card surface (grid,
  related, featured, single) resolves an **owner-designed Puck layout** of type
  `shopProductCard` via `resolveCardTemplate()` in `modules/shop/lib/card-template.tsx`,
  injects per-product context (`injectShopProductCardEmbed`) and stamps it with `Render`
  from `@puckeditor/core/rsc`. **Server-side only.**
- The generated extension-point registry (`lib/modules/extension-points.ts`) eagerly
  imports server libs from registered modules, so it is consumable from RSC/route code
  only - a `'use client'` island can never read it.
- Search must not import from `modules/shop/**` statically - the build breaks on any
  install without shop.

Therefore:

**Results page (`SiteSearchResults`, RSC) gets pixel-identical designed cards.** New
extension point `search.shop-cards`. A small shop patch release adds to shop's manifest:

```json
"extensionPoints": [
  { "point": "search.shop-cards", "id": "shop",
    "import": "./lib/search-cards", "component": "shopSearchCardProvider" }
]
```

`modules/shop/lib/search-cards.tsx` (new file in the shop module, ~40 lines) exports a
server provider `{ renderProductCards(productIds, opts): Promise<ReactNode[]> }` that
wraps the existing `resolveCardTemplate` → inject → `Render` pipeline - the exact code
path the shop grid uses, so the cards are identical by construction, including the
owner's per-site card design. The search results RSC looks the provider up in the
registry; absent (shop not installed, or shop older than the release that adds this),
`productCardStyle: shopCard` silently falls back to `standard`, and `resolveFields`
hides the option when the probe endpoint says the provider is missing.

Module-isolation check: shop owns 100% of the card rendering (its own new file, its own
manifest entry); search owns 100% of the search UI and consumes only through the
registry. No schema changes, no core changes - the extension-point mechanism exists for
exactly this. Shop change ships as a normal shop patch release; `requiresModules` is NOT
used (search works without shop).

**Dropdown stays a lookalike in v1.** Live-as-you-type is a client island fetching JSON;
the designed template cannot be stamped client-side without shipping the Puck render
config to the browser (the exact editor-bundle taint the whole module-components split
exists to prevent). If dropdown-perfect cards become a must-have, the v2 route is an
HTML-fragment endpoint (server-rendered card markup fetched by the island) - new
precedent, interactivity inside cards arrives dead, needs its own decision.

### Settings tab (site-wide, not per-block)

`components/admin/SearchSettingsTab.tsx` (`'use client'`, no props, no chrome, own
fetching): master per-source enable switches (block toggles can only narrow, never
re-enable a source disabled here), language dropdown (allowlisted regconfigs; changing it
warns "rebuild required" and offers the rebuild), per-source weight sliders, query logging
on/off + retention days, default excerpt length.

### Admin dashboard

`app/cactus-admin/search/index/page.tsx` (nav entry target): index status per source
(count, last indexed, stale flag), Rebuild/per-source Reindex buttons with progress,
query analytics (top queries, zero-result queries - the genuinely useful bit for shop
owners), link to Settings tab.

---

## 9. Files summary

```
modules/search/
├── cactus.module.json
├── package.json                        # cactus-module-search, version matches manifest
├── README.md / LICENSE
├── migrations/001_initial.sql
├── lib/
│   ├── settings.ts                     # singleton get/put (gazette pattern)
│   ├── extract.ts                      # Puck JSONB → plain text (copied walker, + alt text)
│   ├── adapters/{page,shop-product,shop-category,shop-collection,gazette-post,directory-entry,boards-thread,member}.ts
│   ├── indexer.ts                      # runIndex with batch cursor + deadline
│   ├── query.ts                        # searchDocuments()
│   ├── inject-search-context.ts
│   ├── starterLayouts.ts               # PURE DATA
│   └── robots.ts                       # disallow /search
├── components/
│   ├── admin/{SearchSettingsTab,SearchDashboard}.tsx
│   ├── public/{SearchBoxClient,LoadMoreButton}.tsx
│   └── puck/{SiteSearchBlock,SiteSearchBlock.rsc,SiteSearchResultsBlock,SiteSearchResultsBlock.rsc}.tsx
└── app/
    ├── cactus-admin/search/index/page.tsx
    ├── public/search/page.tsx
    └── api/{public/search/{query,suggest},admin/search/{reindex,status,queries,settings},cron/reindex}/route.ts
```

Core repo changes: **none** except (at release time) the `modules.json` pin, the README
"Available modules" list entry, FIELD_NOTES.md, and a wiki page (`Search-module.md` +
link from the module architecture page). Verify with
`git grep "modules/search" -- ':!modules' ':!wiki' ':!.gitmodules'` → must be empty.

---

## 10. Phasing

**v1 (this plan)**: everything above.

**v2 candidates (explicitly out)**:
- `search.content-provider` extension point (modelled on `MenuEntityProvider`) so
  third-party modules contribute documents without the search module knowing them.
  The adapter interface in §5 is already the right shape for it.
- Fuzzy/typo tolerance via `pg_trgm` (extension precedent - needs sign-off).
- Synonym dictionaries; per-language stemming beyond regconfig choice.
- Boards replies (`brd_posts`) as a source; reviews as a source.
- "Popular searches" suggestions on the empty state, fed from `srch_queries`.
- Index-on-publish hook if core ever grows one.
- HTML-fragment endpoint so the live dropdown can show the owner's designed Product Card
  template (v1 dropdown uses search-owned lookalike cards; see §8.5).

---

## 11. Risks & gotchas checklist (verify during build)

1. Reserved Puck field names (§8) - core silently strips `visibility` and manages the
   animation/sticky six.
2. Editor DOM ≠ RSC DOM: `inline: true` + `puck.dragRef`; identical markup both paths;
   no portals in the dropdown.
3. `delete props.puck; delete props.editMode` before the client island; display-subset
   props only (they land in view-source).
4. 60 s un-overridable ceiling on every module route; no `after()` reliance; batch
   cursors everywhere the work can grow with site size.
5. Signed URLs are never keys: `image_url` in the index stores the plain DB URL; sign at
   render time if the media layer requires it.
6. `npm run test:backup-roundtrip` real PASS (tsvector column) - a skip is a fail.
7. Adapter SQL re-implements other modules' visibility predicates - copy the semantics
   from `gazette/lib/visibility.ts`, `boards/lib/visibility.ts`, `shop/lib/sitemap.ts`
   and note in each adapter where the source of truth lives, so drift gets caught in
   review when those modules change.
8. Shop gate: when `shopStatus === 'CLOSED'`, shop sources must vanish from results at
   query time (tier filter alone is not enough - check the gate in the query path or
   drop shop docs at index time and reindex on gate change; decide at build time,
   query-time check is safer).
9. Homepage: index the homepage InfoPage with `url = '/'` (SiteConfig.homepageId check),
   and skip its slug URL to avoid a duplicate hit.
10. Migration discipline: 001 never edited after release; every later schema change is a
    new numbered idempotent file.
11. New module → `requiresCoreVersion` set (standing rule), README list, FIELD_NOTES,
    wiki page, and `--prerelease` on the GitHub release.
12. Prices/stock in results always come from the query-time join (§6), never from the
    indexed `extra` payload - prices move via sheet Pull and sales while the index
    sleeps.
13. Extension-point registry is server-only (eager server-lib imports) - never reference
    it from a `'use client'` file; the dropdown island gets data via JSON, the results
    RSC gets components via the registry.
