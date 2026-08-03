# Shop Filters

The **Filters for Shop** module (`filters-for-shop`) puts a proper filter panel on your
shop's category and collection pages, designed for catalogues where the interesting
differences - colour, finish, width - live on a product's *options* rather than on the
product itself.

Requires the [Shop](Shop) and [Shop Variations](Shop-variations) modules. If
[Product Attributes](Product-attributes) is installed too, filters can also match
spec values - and price-band groups need neither.

## The idea

Your products don't share one tidy "Blue". One chair's upholstery is *Stevia Blue*,
another's is *Sky Blue*, a stool just says *Blue*. Shoppers don't care - they want the
blue ones.

So this module separates the two:

- A **filter group** is a heading on the panel: Colour, Finish, Width.
- A **filter** is one tick under it: Blue, Oak, 160cm.
- Each filter **stands for any number of real option values**, picked from a searchable
  catalogue of every option value in your shop. Tick Blue, Stevia Blue, Sky Blue and
  Powder Blue once, and "Blue" covers them on every product - including products you
  import next month, with no further wiring.
- The same picker also offers **spec values** (shown as "Spec: ..." sections) when the
  Product Attributes module is installed - so a filter like "24-hour use" or "Wave"
  can match a product's specifications, read from the product or any of its variations.
- A group can instead be a set of **price bands** (Under £100, £100 - £250, ...). Each
  band has a from and an up-to figure (either end can be left open) and matches against
  the price the product card actually shows - the "From £..." figure where there is one.
  Price bands work for products with no variations at all.

## What shoppers get

- A filter panel (down the left or across the top) with colour swatches, picture
  swatches, tick lists or dropdowns per group - your choice.
- **Live counts** next to each filter, recalculated as they tick (a tick never counts
  against its own siblings, so options don't vanish while you're choosing between them).
- Ticks within a group widen the results (Blue *or* Green); ticks across groups narrow
  them (Blue *and* Oak).
- Active-filter chips, one-click clear, a "Showing 12 of 48" line, a tidy empty state,
  and a filter drawer on phones.
- On desktop the panel is **sticky**: it rides along as the shopper scrolls the grid,
  scrolling within itself if it is taller than the window. Themes can adjust the top
  offset with the `--flt-sticky-top` CSS variable (default 7rem).
- The selection is mirrored into the page address, so a filtered view can be shared,
  bookmarked, or returned to with the back button.
- **The cards dress for the occasion.** With Blue ticked, a product that comes in blue
  swaps its card photo to the blue variation's own picture - and clicking through opens
  the product with the blue options already chosen, ready to add to the basket. (Both
  behaviours can be switched off in settings.)

## Setting it up

1. **Admin > Shop > Filters.** Add a group (Colour), choose whether it filters by
   product values or price bands, pick how shoppers choose from it (colour swatches,
   say), then add a filter (Blue). Filters in a price-band group get from/up-to boxes
   instead of a value picker; the up-to figure is exclusive, so neighbouring bands
   never both claim a product sat exactly on the boundary.
2. The value picker opens with the filter's name as a ready-made search - "blue" surfaces
   Stevia Blue, Sky Blue, Powder Blue and friends across every option, each with a count
   of the products carrying it. Tick the ones Blue should stand for and save.
3. A colour filter with no swatch borrows one from its ticked values automatically; you
   can set your own hex colour (or a picture, for picture-swatch groups) on the filter row.
4. **Page builder:** open a category or collection page's layout and drop on the
   **Shop: Filters & Product Grid** block. Set the category or collection slug in the
   block's settings (or a tag), pick columns, filter position and whether counts show.

## Settings

Under **Settings > Shop > Filters**:

- **Hide filters that match nothing on the page** (on by default) - a category page never
  offers a tick that would bring back nothing.
- **Show the matching variation's photo on product cards** (on by default).
- **Open products with the filtered options already chosen** (on by default).

## How the matching works (for the curious)

A rule is an *(option name, value label)* pair - "Upholstery Colour: Stevia Blue". A
product matches a filter when any of its **enabled** variations carries a ticked value.
The first matching variation (in your variant order) lends the card its photo and its
link; the link is the variation's own address, which Shop Variations already turns into
the parent product's page with that combination pre-selected.

Spec rules work the same way but read Product Attributes values instead, from the
product itself or any of its variations. Spec and price matches don't swap the card
photo - there is no single variation to borrow one from.

Because rules match by name and label, they survive re-imports that recreate option rows.
The flip side: rename an option value everywhere and the filter stops covering it until
you re-tick the new name in the picker.

## Practical notes

- The block renders every product it lists (capped at 100) and filters instantly on the
  page - right for catalogues this platform aims at, not for thousands of products on one
  page.
- Products with no variations can't match variation filters, so they hide once any filter
  is ticked. Rather the point, but worth knowing. Price bands and spec rules read the
  product itself too, so those still work for variation-less products.
- Filtering, photo-swapping and pre-selection need no changes to Shop or Shop Variations;
  the module reads their data and uses the existing variation deep links.

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Modules](Modules)
