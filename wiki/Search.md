# Search

Site-wide search for the frontend. One search box, every public content type: pages, shop products, shop categories and collections, Gazette articles, Directory entries, Boards threads and member profiles. Ships two page-builder blocks - a Search Box you can put anywhere (including the header) and a Search Results block on a designable results page at `/search`.

Provided by the `search` module (`cactus-foundation-modules/search`, table prefix `srch_`).

## What visitors get

- **Search box** anywhere a block can go - regular pages, and the header layout editor (where it usually belongs). Three behaviours: submit to the results page (works without JavaScript), live results in a dropdown while typing, or a full-screen overlay. The dropdown can match the field width, widen into a panel, or span the whole viewport - the classic shop "mega search".
- **Results page** at `/search`: ranked results with highlighted matching words, filter tabs per content type, relevance/newest sorting, numbered pages or a Load More button, and templates for the heading, count line and empty state.
- **Products behave like products.** Product results carry live prices (sale strike-through included) straight from the shop at the moment of the search, never stale figures from the index. In the dropdown they can render as a card grid; on the results page they can use the site's own designed Product Card template, identical to the shop grids (see below).
- Matching is proper full-text search: word stemming in your chosen language, quoted phrases, `-word` exclusion, and prefix matching on the last word so results appear mid-word while typing.
- **Keyboard**: optional `/` or Ctrl/Cmd-K shortcut to focus the box, arrow keys and Enter in the dropdown, Escape to close. The box is a screen-reader-correct combobox.

## What owners get

- **Admin → Search** (its own sidebar section): the index dashboard - how many items of each type are indexed and when, a Rebuild button (per type or the lot), and search analytics for the last 30 days: top search terms and, most usefully, searches that found nothing. On a fresh install the first build starts itself the moment this screen opens; an empty index also raises a bell notification that links straight here, so the notification is the one-click fix.
- **Settings → Search**: master switches per content type (a block can narrow these, never widen them), the stemming language (changing it asks for a rebuild), per-type ranking weights, and search-term logging with a retention period. The log stores the words typed and the result count - never who typed them.

## How content gets into the index

The module keeps its own index table (`srch_documents`). Puck-built bodies cannot be text-indexed in place, so each source's text is extracted to plain text at index time, weighted title / excerpt / body, and stored with a GIN-indexed tsvector.

Each content type has an adapter that re-implements that module's own public-visibility rules, so what search shows always matches what the site shows:

| Source | Visible when | URL |
|---|---|---|
| Pages | `status = published`; the homepage indexes once as `/` | `/<slug>` |
| Shop products | `ACTIVE` and not catalogue-hidden; all shop results vanish while the shop is closed | `/shop/products/<slug>` |
| Shop categories / collections | contain at least one product | `/shop/categories/<slug>`, `/shop/collections/<slug>` |
| Gazette posts | published, or scheduled and past go-live; never private | `/gazette/<slug>` |
| Directory entries | `published` | `/directory/<category>/<slug>` |
| Boards threads | published, on a PUBLIC board - or a MEMBERS board, shown only to signed-in visitors | `/boards/t/<slug>` |
| Member profiles | member directory on, profiles not hidden; members-only visibility respected | `/members/<username>` |

Members-only content (MEMBERS boards, members-only profiles) is stored at a separate tier and only returned when the visitor has a session (admin or member). PRIVATE boards are never indexed at all.

**Freshness**: a nightly cron run picks up changes and deletions incrementally (it also re-evaluates visibility, which is what catches scheduled Gazette posts crossing their go-live time), and any admin with the `search.manage` permission can rebuild on demand. The rebuild is batched with a progress readout, so it works on any size of site without hitting the platform's route time ceiling.

**Prices are never trusted from the index.** Product hits are re-joined to the live shop tables per page of results for price, sale price and visibility - a product that went off sale or got archived after the last index run shows correctly or not at all.

## The blocks

Both blocks keep their entire configuration in the page builder sidebar - there is no per-block admin screen. Content-type toggles only offer types this install actually has, and the sidebar trims itself as options change (for example, dropdown settings disappear in results-page mode).

**Search Box** (~35 options): behaviour (mode, minimum characters, debounce, result count, grouping, hotkey, autofocus, results path), per-content-type toggles, appearance (field / field with button / icon button, size, corner style, outlined/filled/minimal, accent colour token, width and alignment), and dropdown options (width, products as rows or cards, card columns, thumbnails, excerpts, type badges, prices, match highlighting, view-all and empty text).

**Search Results** (~30 options): the same content-type toggles, layout (list/grid/compact, columns, per page, pagination style, grouping, filter tabs, sort control) and result-card anatomy (product card style, thumbnails and their shape, excerpt length, highlighting, badges, prices, dates, authors, URLs, heading/count templates and the empty state).

The results page is a **layout type** (`searchResults`) under Appearance → Layouts, with a starter arrangement of a large search box over the results list. Until one is published, `/search` renders that arrangement anyway, so search works out of the box.

## Designed product cards (shop integration)

Shop product cards on grids are not a fixed design - they are a Puck layout the owner designs (`shopProductCard`). With a shop version that registers the `search.shop-cards` extension point, the Search Results block's "Designed shop product cards" option stamps that same template for product hits, so search results are pixel-identical to the shop grids by construction. Without it, the option quietly disappears and product hits use the standard result cards. The live dropdown always uses search's own card lookalikes - the designed template can only be rendered server-side.

## SEO

Search result URLs are deliberately kept out of search engines: the module registers `/search` in `robots.txt` disallow rules, adds nothing to the sitemap, and the results page carries a noindex tag.

## Permissions

- `search.view` - see the Search dashboard and analytics.
- `search.manage` - rebuild the index and change settings.

## For developers

- Index, adapters, query and settings all live in the module (`modules/search/lib/`); everything reads other modules' tables via raw SQL through the shared prisma client and never imports their code, so search builds and runs whatever else is installed.
- The extension point contract: register `search.shop-cards` (or a future equivalent) with a server-side provider object exposing `renderProductCards(productIds, { columns })` returning a rendered fragment. The registry is server-only - never touch it from a client component.
- Cron: `GET /api/m/search/cron/reindex` (Vercel cron with `CRON_SECRET`), incremental run plus query-log purge.
