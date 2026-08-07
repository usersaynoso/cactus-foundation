# Search

Site-wide search for the frontend. One search box, every public content type: pages, shop products, shop categories and collections, Gazette articles, Directory entries, Boards threads and member profiles. Ships two page-builder blocks - a Search Box you can put anywhere (including the header) and a Search Results block on a designable results page at `/search`.

Provided by the `search` module (`cactus-foundation-modules/search`, table prefix `srch_`).

## What visitors get

- **Search box** anywhere a block can go - regular pages, and the header layout editor (where it usually belongs). Three behaviours: submit to the results page (works without JavaScript), live results in a dropdown while typing, or a full overlay while typing. The overlay keeps the box exactly where it sits on the page - the page dims and results drop from the box in place (the icon-button presentation keeps the centred overlay panel, having no field to anchor to). The dropdown can match the field width, widen into a panel, or span the whole viewport - the classic shop "mega search" - and the width choice applies in dropdown and overlay modes alike.
- **A magnifier in a phone header.** Set the presentation to **Icon button** and, from search 0.1.10, choose what tapping it opens: the overlay as before, or **a bar under the header** - the field slides in full width directly beneath the whole header row, menu and logo included, with results listed underneath it and nothing showing at all until something is typed. The bar is the one to pick on phones: a centred overlay panel goes full-height there, so an untyped search is one field above a screen of white. On a touch screen the typing field never draws smaller than 16px whatever size you pick (from 0.1.12), because iPhones zoom the whole page in on anything smaller the moment it is tapped into - which looks like the search box suddenly being too wide with its edge off the screen. The icon itself follows the **Field style** setting - "minimal" drops the button's border and background so the magnifier sits bare among other header icons, "filled" gives it a soft chip, "outlined" keeps the box. From 0.1.11 there is also an **Icon size** box: leave it blank and the magnifier follows the Size setting as before, or type the size in pixels to match the icons either side of it exactly (the theme, account and basket icons are 20 by default).
- **Results page** at `/search`: ranked results with highlighted matching words, filter tabs per content type, relevance/newest sorting, numbered pages or a Load More button, and templates for the heading, count line and empty state.
- **Products behave like products.** Product results carry live prices (sale strike-through included) straight from the shop at the moment of the search, never stale figures from the index. A product priced by a companion module (shop-variations) shows the same **From £…** figure as the shop grids - the cheapest of its variations, never the parent's unused £0.00. In the dropdown they can render as a card grid - or, from search 0.1.7, as the site's own designed Product Card template; on the results page they can use that same template, identical to the shop grids (see below).
- Matching is proper full-text search: word stemming in your chosen language, quoted phrases, `-word` exclusion, and prefix matching on the last word so results appear mid-word while typing. **Every word typed has to appear** - the half-finished last one only as a beginning. Type a product's full name and you get that product, not the several hundred things that happen to share its last word (fixed in 0.1.13; before it, the last word was treated as an alternative to everything before it, which is very nearly the opposite of searching).
- **Titles win.** A search term found in something's title outranks the same term buried in a description, and an exact title match comes first of all - so the thing you named by name is the thing at the top, however chatty everyone else's descriptions are (0.1.13).
- **A stray word does not empty the page.** If nothing matches every word, the search quietly relaxes and shows what matches any of them, best first, rather than the "no results" wall (0.1.13). The owner's analytics are not fooled by this: a relaxed search is still recorded as having found nothing, because it did - the visitor is simply shown the near misses rather than a blank page.
- **Keyboard**: optional `/` or Ctrl/Cmd-K shortcut to focus the box, arrow keys and Enter in the dropdown, Escape to close. The box is a screen-reader-correct combobox.

## What owners get

- **Admin → Search** (its own sidebar section): the index dashboard - how many items of each type are indexed and when, a Rebuild button (per type or the lot), and search analytics for the last 30 days: top search terms and, most usefully, searches that found nothing (a search that only matched after relaxing to any-word counts as nothing found here - it is exactly the term worth knowing about). On a fresh install the first build starts itself the moment this screen opens.
- **Settings → Search**: master switches per content type (a block can narrow these, never widen them), the stemming language (changing it asks for a rebuild), per-type ranking weights, search-term logging with a retention period, and its own "Rebuild index now" button. The log stores the words typed and the result count - never who typed them.
- **A notification that does the job**: if the index is ever empty, admins get a bell notification whose button says "Build the index" and does exactly that - it opens Settings → Search, home of the Rebuild button.

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

**Search Box** (~36 options): behaviour (mode, minimum characters, debounce, result count, grouping, hotkey, autofocus, results path), per-content-type toggles, appearance (field / field with button / icon button, size, corner style, outlined/filled/minimal, accent colour token, width and alignment - **size can differ per screen size**, so a box that reads well in a roomy desktop header can be set smaller on phones without touching how it looks on a big screen), and dropdown options (width, products as rows / cards / designed shop cards, card columns, thumbnails, excerpts, type badges, prices, match highlighting, view-all and empty text).

**Search Results** (~31 options): the same content-type toggles, layout (list/grid/compact, columns, per page, pagination style, grouping, filter tabs, sort control) and result-card anatomy (product card style, thumbnails and their shape, excerpt length, highlighting, badges, prices, dates, authors, URLs, heading/count templates and the empty state).

**Who can see this** is on both blocks and takes "Everyone" (the default) or "Admins only". On "Admins only" the block renders for a signed-in site admin and is left out of the page entirely for everyone else - handy for trying search on a live site before announcing it. Set it on both blocks and the public gets a search box they cannot see and a results page with nothing on it. The page builder always shows both blocks so they can still be positioned and styled. The check runs per request, so a page carrying an admins-only block is not statically cached; "Everyone" skips the check and stays cacheable.

This hides blocks, it does not lock the door: `/search` stays a reachable URL and the search API still answers, so treat it as "not announced yet" rather than as a security control.

The results page is a **layout type** (`searchResults`) under Appearance → Layouts, with a starter arrangement of a large search box over the results list. Until one is published, `/search` renders that arrangement anyway, so search works out of the box - including the designed shop product cards described below, so the results page matches what the dropdown shows for the same products without anyone having to publish a layout first. That fallback page widens to the shop's own page width when it is showing those cards, so a row of three is not squeezed into a reading column.

## Designed product cards (shop integration)

Shop product cards on grids are not a fixed design - they are a Puck layout the owner designs (`shopProductCard`). With a shop version that registers the `search.shop-cards` extension point, the Search Results block's "Designed shop product cards" option stamps that same template for product hits, so search results are pixel-identical to the shop grids by construction. Without it, the option quietly disappears and product hits use the standard result cards. **This is the default from search 0.1.9** - a results block that has never been told otherwise shows designed shop cards wherever the shop can supply them, and falls back to the standard result rows on its own where it cannot. A block already set to "Standard result cards" keeps that choice. In this mode the grid column count stays editable whatever the block's own list/grid Layout setting says, because the shop cards lay out in their own grid regardless. From search 0.1.7 the live dropdown can use the designed template too: the Search Box block's "Products shown as" gains a "Designed product cards (from the shop)" option (offered under the same provider check). The template can only be stamped server-side, so the dropdown fetches the fragment from a small public page at `/search/cards` and lifts it in - cached per set of product ids, with a skeleton while it loads and search's own card lookalikes as the fallback if the fetch fails or the shop is closed. The fetched markup never hydrates, so the provider is asked for still media (one image per card, no carousel or 3D controls - nothing renders that doesn't work), and those cards sit outside arrow-key navigation; mouse, touch and tab all work as normal.

## SEO

Search result URLs are deliberately kept out of search engines: the module registers `/search` in `robots.txt` disallow rules, adds nothing to the sitemap, and the results page carries a noindex tag.

## Permissions

- `search.view` - see the Search dashboard and analytics.
- `search.manage` - rebuild the index and change settings.

## For developers

- Index, adapters, query and settings all live in the module (`modules/search/lib/`); everything reads other modules' tables via raw SQL through the shared prisma client and never imports their code, so search builds and runs whatever else is installed.
- Query-text handling sits in `lib/query-terms.ts`, deliberately free of the prisma client so it can be unit-tested (`query-terms.test.ts`). `splitPrefix` holds every word but the last as required and prefix-matches only the trailing one, bailing out of the split entirely on quoted phrases, `-negation` and `or` rather than corrupting them; `looseTerms` builds the any-word retry. Only alphanumerics reach `to_tsquery`, which throws on a syntax error. `searchDocuments` returns `relaxed: true` when the hits came from that retry - anything logging analytics must count a relaxed result as zero.
- Relevance is `ts_rank_cd` times the per-source weight, plus a title-match boost of 1000 (title equals the query), 100 (title starts with it) or 10 (title contains it). The boost exists because cover-density ranking rewards repetition, so without it a long body outranks a short exact title.
- The extension point contract: register `search.shop-cards` (or a future equivalent) with a server-side provider object exposing `renderProductCards(productIds, { columns, media })` returning a rendered fragment (`media: 'still'` asks for one image per card and no overlay controls, for markup that will never hydrate). The registry is server-only - never touch it from a client component.
- Cron: `GET /api/m/search/cron/reindex` (Vercel cron with `CRON_SECRET`), incremental run plus query-log purge.
