# Product Checks

The **Product Checks for Shop** module (`product-checks-for-shop`) is a private
notebook for shop staff: a per-product record of when each part of a listing
was last given a proper look, and a list of which products have gone longest
without one. Shoppers never see any of it.

It is a custom module hosted in the site owner's own GitHub account rather
than the module directory - see
[Authoring a module](Authoring-a-module#writing-a-module-for-your-own-site)
for how that works. It requires the Shop and Shop Variations modules.

## What it records

Ten aspects per product, each with its own last-checked date:

Title, Short description, Long description, Images, 3D models, Variations,
Add-ons, Downloads, Specification, Shipping.

Plus one notes box per product, shared across all ten - a place for "waiting
on supplier photography" rather than a diary.

A check older than **six months** counts as stale. Every save records who
saved it.

## Where it appears

### On the product page (staff only)

A quiet one-line strip - `Checks: 7/10 current, oldest 4 months` - that
expands on click to the full grid: each aspect shows its date (or "never"),
a tick button stamps today, and a date picker backdates. Save is explicit,
and its outcome is shown.

Only signed-in staff with the shop products permission ever see the strip.
Everyone else gets exactly the page they always did - the strip renders
empty for all visitors and only fills itself in once the site has confirmed
who is looking, so cached pages can never leak it.

**Placing it:** the strip is a page-builder block. In **Admin → Layouts →
Shop → Product Detail**, drag **Shop: Product checks** to where you want it -
typically at the top, above the gallery and buy column. It can be moved or
removed at any time like any other block. If you uninstall the module, remove
the block from the layout first (a leftover block renders nothing, but there
is no sense leaving it lying about).

### On a product tile (staff only)

A compact tick list on the product card itself, so a member of staff walking a
category page can see which listings still need work without opening any of
them. It shows a `Checks 7/10` heading, then every aspect with a green tick or
a red cross - a cross meaning never checked, or checked longer ago than six
months - and finally, centred underneath, whether the product carries a note.
The note line reads the other way round: a note is something outstanding, so
**having one is the cross** and an empty box is the tick. Hover it to read the
note, and hover an aspect for its age.

Same privacy as the product-page strip: it renders empty for everyone and only
fills itself in once the site has confirmed who is looking, so a cached
category page can never leak it to a shopper. A whole grid's worth of tiles is
looked up in one go rather than one request per tile.

**Placing it:** in **Admin → Layouts → Shop → Product Card**, drag **Card:
Product checks** to where you want it - under the price is the natural home.

### In the product editor

A **Checks** section in the admin product editor, alongside Downloads and
Add-ons - the same grid, already expanded, for updating while you edit.

### Admin → Product checks

The staleness list: every catalogue product, the longest-unchecked first.
A product that has never been checked at all sorts to the very top, which is
rather the point. Each row shows how many aspects are current, the oldest
check's age, which aspects are outstanding, who last saved and when, and
links through to the product's editor. Hidden variation children and archived
products are left out.

## Installing it

The module needs a core new enough to install modules by URL, and the site's
GitHub App granted access to the module's (private) repository. Then:
**Admin → Modules → Add a custom module**, paste the repository URL, Install.
The module's database table is created on the deploy that follows.
