<p align="center">
  <img src="module-art.webp" alt="Cactus Search Module" width="640" />
</p>

# Cactus Search Module

Site-wide search for [Cactus](https://github.com/usersaynoso/cactus-foundation).

One search box, every public content type: pages, shop products, categories and
collections, gazette articles, directory entries, forum threads and member
profiles. Ships a heavily configurable Search Box block (inline dropdown, full
overlay or classic results-page modes, with product-card results and full-width
mega-dropdown options) and a Search Results block on a designable `/search`
results page.

Content is indexed into the module's own table with Postgres full-text search
(ranked, weighted title/excerpt/body, match highlighting, prefix matching while
typing). The index refreshes nightly, can be rebuilt any time from the admin
dashboard, and re-evaluates each source's own visibility rules on every run -
drafts, hidden products, private posts and members-only boards stay out (the
latter appear only for signed-in visitors). Prices on product results are read
live at query time, never from the index.

The admin dashboard shows index status per content type plus search analytics:
top search terms and - the useful bit - searches that found nothing.

If the shop module is installed and registers its `search.shop-cards` provider,
the results page can render product hits with the site's own designed Product
Card template, identical to the shop grids. The live dropdown can do the same:
set the Search Box block's "Products shown as" to "Designed product cards
(from the shop)" and the dropdown fetches the server-stamped cards from
`/search/cards` (colour swatches and all), falling back to its own plain
cards if the shop is closed or the fetch fails.

If a module also answers the `search.product-filters` point (filters-for-shop
does), the results page puts the shop's own filter panel beside the product
results: the same ticks, swatches and counts a category page offers, cut down to
the filters these particular results can actually be narrowed by, and built over
every matching product rather than the page of them on screen. Turn it off per
block with "Product filters panel". The other content types carry on in the list
below it, with the pager over them alone.

## Installation

Add to your Cactus installation's `modules.json` and deploy, or install from
the Cactus admin panel under Modules.

## Configuration

Once installed: Settings -> Search for site-wide options (content types,
language, ranking weights, search-term logging), and Admin -> Search for the
index dashboard and analytics. Grant `search.view` / `search.manage` to
whichever roles should see them. All per-block options live on the blocks
themselves in the page builder.

## License

MIT
