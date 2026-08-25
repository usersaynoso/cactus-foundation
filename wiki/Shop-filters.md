# Shop Filters

The **Filters for Shop** module (`filters-for-shop`) puts a proper filter panel on your
shop's category and collection pages, designed for catalogues where the interesting
differences - colour, finish, width - live on a product's *options* rather than on the
product itself.

> **Where it lives now.** Filters used to have a sidebar link of its own. It is now a **Filters** tab on **Shop → Catalogue**. Old links still work.

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
- On a category page the panel also offers a **Category** section automatically: the
  page's own sub-categories, so a shopper can narrow a parent category's rolled-up grid
  to one branch without leaving the page. No setup involved - it reads the category
  tree, counts like any other group, and only offers sub-categories that actually have
  products in the grid. It can be switched off per page with the block's
  "Category filter" setting.

## What shoppers get

- A filter panel (down the left or across the top) with colour swatches, picture
  swatches, tick lists or dropdowns per group - your choice.
- **Live counts** next to each filter, recalculated as they tick (a tick never counts
  against its own siblings, so options don't vanish while you're choosing between them).
- Ticks within a group widen the results (Blue *or* Green); ticks across groups narrow
  them (Blue *and* Oak), and where both ticks describe a variation, **the same
  variation has to answer both**. Red and Leather asks for a red leather chair, not a
  chair sold in red fabric and, separately, in black leather.
- A **Selected** summary at the very top of the filter panel, above every group: one
  removable chip per tick, each naming the group it came from ("Seat colour Black"),
  so a shopper can see and undo what they have chosen without scrolling or opening a
  single group. On phones and tablets it heads the filter sheet, and the chips above
  the grid take over while the sheet is shut.
- Active-filter chips, one-click clear, a "Showing 12 of 48" line, a tidy empty state,
  and a count badge on each group heading showing how many of its filters are ticked.
- A **Sort by** dropdown above the grid, on the same row as the "Showing" line:
  Recommended (your own order, the one the page arrived in), Best selling, Price low to
  high, Price high to low, Name A to Z, Name Z to A, Newest first and Oldest first.
  Best selling uses the shop's own popularity figure - see
  [Best selling](Shop#best-selling) - and puts products nothing has ranked at the end
  rather than pretending they sold badly. It sorts on the
  very figure printed on the card - the "From £..." price where there is one - so the
  order can never disagree with the numbers a shopper is reading, and products with no
  price at all go to the end whichever way round it is. Names sort the way people read
  them, so "800mm Bench" comes before "1200mm Bench" rather than after it. Sorting and
  filtering work together, in any order, and the chosen sort joins the ticks in the page
  address so a sorted, filtered view can be shared. Switch it off per page with the
  block's "Sort by dropdown" setting.
- Grids **open on Best selling** unless you say otherwise: the block's "Products start
  sorted by" setting picks any of the orders above, and the page arrives already in it
  rather than shuffling itself once it has loaded. Pick "Recommended" there to go back
  to your own order. Pages built before this setting existed open on Best selling too,
  which is what most shops wanted from their category pages in the first place.
- A group that would offer fewer than two choices on a page doesn't appear at all -
  a heading with a single tick under it ("Height adjustable: Yes" on a page of
  sit-stand desks) is not a choice. The automatic Category section follows the same
  rule.
- A long tick list folds after its first eight entries behind a "Show all" link
  (anything ticked stays visible above the fold).
- On desktop the panel is **sticky**: it rides along as the shopper scrolls the grid,
  scrolling within itself if it is taller than the window. Themes can adjust the top
  offset with the `--flt-sticky-top` CSS variable (default 7rem).
- On phones and tablets the panel becomes a proper **filter sheet**: a floating
  "Filter" button (with a badge counting active filters) stays reachable however far
  the grid is scrolled, and opens a sheet that slides up from the bottom on phones or
  in from the right on tablets. The sheet keeps the page from scrolling behind it,
  closes on the dimmed backdrop, the × or the Escape key, and finishes with a
  **"Show N products"** button - the count updates live as filters are ticked - which
  drops the shopper back at the top of the results. Reduced-motion settings are
  respected.
- **Sharing the bottom of a phone screen.** A live chat bubble parks itself in a
  bottom corner and sits above more or less everything, which used to include the
  filter controls: it covered most of the "Show N products" button, and all but a
  sliver of the "Filter" button behind it. The open sheet now sits above the chat
  bubble, as a panel demanding an answer should, and on phones the closed "Filter"
  button has moved from the middle of the bottom edge to the left of it, well clear
  of the corner - and nicely under a thumb while it is there. On tablets there is
  room for both, so it stays in the middle. If you also use Quotes, a quote opened
  from behind the sheet still comes up on top: the pecking order is quote, then
  filter sheet, then chat.
- The selection is mirrored into the page address, so a filtered view can be shared,
  bookmarked, or returned to with the back button.
- **The cards dress for the occasion.** With Blue ticked, a product that comes in blue
  shows the blue variation's own picture - and clicking through opens the product with
  the blue options already chosen, ready to add to the basket. (Both behaviours can be
  switched off in settings.)
- On cards with the little photo arrows, the filter and the arrows cooperate: tick two
  colours and the arrows flick between exactly those two colours' pictures, and hovering
  the card no longer snaps back to an unfiltered photo - the chosen colour stays put.

## Setting it up

1. **Admin > Shop > Catalogue > Filters.** Add a group (Colour), choose whether it filters by
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
   **Shop: Filters & Product Grid** block. Pick columns, filter position, whether counts
   show, whether the Sort by dropdown appears and which order the grid starts in. On a Category, Collection or Tag
   layout you can leave the slug boxes empty - the page fills in whichever category,
   collection or tag the shopper is looking at, so one layout serves the lot. Set a slug
   by hand only when you are dropping the block somewhere else, such as a landing page
   that should always show one particular range.

## Filter collections - a page of its own for a filtered view

Shoppers search for "green office chairs", not for "office chairs, then colour, then
green". A **filter collection** turns any filtered view into a page in its own right:
the same products, the same panel, the filters you pick already ticked, at its own
address with its own page title, description and intro.

`/green-office-chairs` shows what `/shop/categories/office-chairs?colour=green` shows,
but it is a page - so it can be linked to, shared, put in a menu, and found.

**Admin > Shop > Catalogue > Filter Collections.**

1. **Add a page.** Give it a name ("Green Office Chairs") and say what it starts from -
   a category, a collection, a tag, or the whole shop. The address is made from the
   name; you can change it, and an address already spoken for by a page or a product
   quietly gets a number on the end rather than saving a page nobody can reach.
2. **Tick what arrives ticked.** Every filter you have set up is offered, grouped as it
   is on the panel. Tick Colour: Green and that is the page.
3. **Write it up.** A short description sits under the heading. **Design the intro**
   opens the full-screen page builder for the longer piece - the same builder your
   product and category descriptions use.
4. **Fill in the search bits.** Page title and description for search results, a
   sharing picture, and a tick to keep the page out of search engines entirely if it is
   only there to be linked to from a campaign.
5. **Publish.** Until you do, only staff can see it, and it says so across the top.

Published pages are added to your sitemap automatically, at their own address, unless
they are marked as hidden from search.

**Listing them all in one place.** Shop's **Collection Browser** block - the one behind
an "all our collections" page - grows an **Include Filter collections** switch once this
add-on is installed. Turn it on and your published filter collections appear on that
page beside the shop's own collections, using the same tiles: name, short description
and sharing picture, each linking to its own address. Drafts are left off, since a
shopper following that link would only find a page they are not allowed to see. The
tiles carry no product count, because working one out means running the whole filtered
query for every page on the list, and that is a slow page for the sake of a number.

**Nothing is locked.** The panel is the ordinary panel: a shopper who lands on Green
Office Chairs and unticks green sees every office chair, exactly as they would have on
the category page. That is deliberate - a filter page is a good starting point, not a
cul-de-sac.

**The filters stay one set.** A collection only names a starting selection. Add a new
colour to the Colour group next month and every page built on Colour picks it up with
no revisiting.

### How the pages look

All filter collection pages share one design, so you build forty of them without
designing forty layouts.

Out of the box they arrive plain but working: breadcrumb, heading, your intro, the
filter panel and grid. To dress them up, go to **Design > Layouts**, add a layout of
type **Filters > Filter collection page**, and build the arrangement you want from
three blocks:

- **Filter Page: Heading** - the page's name, its short description and the trail back
  to where its products come from.
- **Filter Page: Intro** - whatever that page's own designed intro says. Pages with
  nothing written yet simply leave no gap.
- **Shop: Filters & Product Grid** - the usual grid. It needs no settings here: the
  page tells it which products to start from and which filters to tick.

Publish it and every filter collection wears it, present and future.

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

Ticks in two different groups are checked against a single variation wherever they
can be. A listing sold in red fabric and in black leather satisfies Red on one chair
and Leather on another, so it is not a red leather chair and no longer answers both
ticks at once. Filters that belong to the whole listing rather than to any one
variation stay listing-wide: a price band, a sub-category, and a spec stamped on the
parent product rather than on its variations. Those never rule a listing out on the
grounds that some other variation carries them.

Because rules match by name and label, they survive re-imports that recreate option rows.
The flip side: rename an option value everywhere and the filter stops covering it until
you re-tick the new name in the picker.

## Paging a long list

When a page carries more products than anybody wants to scroll past in one go, the
block's **When there are more products than fit** setting decides what happens: nothing
(the first page and no more), a **Show more** button, **numbered pages**, or **load more
as the shopper scrolls**. **Products per page** sets how many are on screen at a time.

Underneath that sits **Where the later pages come from**, and on a big collection it is
the setting that matters most:

| Choice | What it does | When to pick it |
| --- | --- | --- |
| **Sent with the page** | Every matching product is built into the page when it loads. Pressing "Show more" reveals things that were already there, so it is instant. | Up to a couple of hundred products. It is what every page did before this setting existed, and it is still the default. |
| **Fetched as the shopper reaches them** | Only the first page is built in. The rest are fetched as the shopper scrolls or pages through them. | A big collection. This is the one that turns a page nobody could load on a phone into an ordinary one. |

To put a number on it: one live collection of 432 products was sending **14.6 MB** to
every visitor and taking the best part of twenty seconds to arrive, almost all of it
cards for products nobody scrolled to. Switched to fetched-as-needed, the visitor gets
the first two dozen and nothing else until they ask.

Two things are worth knowing before you switch it on:

- **Filtering and sorting stay instant.** They never depended on the cards being on the
  page, only on the small index behind them, which is still sent in full. Ticking a
  colour still cuts the list the moment you tick it; if the page it lands on has not
  been fetched yet, those cards arrive a moment later.
- **Search engines see the first page.** A crawler reads the page as a shopper does at
  the moment it arrives, so only the first lot of products are linked from it. Your
  sitemap still lists every product, so nothing goes missing - but if you rely on a big
  collection page to pass link weight around your catalogue, that is the trade you are
  making. On a page of forty products it makes no odds. On a page of four hundred, the
  page nobody can load was not passing much either.

If something goes wrong fetching a page - a wobbly connection, usually - the grid says
so and offers a **Try again** rather than quietly stopping.

## Practical notes

- Sent with the page, the block renders every product it lists (capped at 100 unpaged,
  500 paged) and filters instantly. Fetched as needed, it renders the first page and
  asks for the rest - see above.
- Sorting works on the same set, for the same reason: it re-orders the products the page
  is already showing, not the whole catalogue behind it. On a page carrying the full
  category that is the same thing; on a page with a lower product limit, the cheapest
  product on the page is not necessarily the cheapest in the category.
- If your shop hides products that have sold out (**Settings → Shop → General → Out of
  stock products**), they are gone before the filters ever see them, so a filter can never
  offer you a colour whose only product the category page next door refuses to list.
- Products with no variations can't match variation filters, so they hide once any filter
  is ticked. Rather the point, but worth knowing. Price bands and spec rules read the
  product itself too, so those still work for variation-less products.
- On a filter collection page, unticking a preselected filter sticks: come back to the
  page, refresh it, share the link, and it stays unticked. Arriving at the plain address
  again is what puts the page's own starting selection back.
- Filtering and pre-selection read Shop and Shop Variations' existing data and deep
  links. The photo behaviour uses a small contract the Shop module's card carousel
  offers for exactly this: the filter names which variations' pictures are allowed and
  the carousel does the showing, so the two never fight over the same image.

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Modules](Modules)
