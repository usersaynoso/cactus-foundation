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

Twelve aspects per product, each with its own last-checked date:

Title, Short description, Long description, Images, 3D models, Variations,
Add-ons, Add-on models, Downloads, Specification, Shipping, Categories and
tags.

Add-on models is the separate one worth explaining: an add-on a shopper bolts
on - a pedestal, a screen - carries its own 3D model, and it can be wrong long
after the product's own model is fine. Categories and tags covers where the
listing actually sits in the shop, which is the sort of thing that quietly
drifts as the catalogue grows.

Plus one notes box per product, shared across all twelve - a place for "waiting
on supplier photography" rather than a diary.

A check older than **six months** counts as stale, on the product page and the
product tile alike. The admin list can be switched to a tighter or looser window
just for the view you are looking at. Every save records who saved it.

## Where it appears

### On the product page (staff only)

A quiet one-line strip - `Checks: 7/12 current, oldest 4 months` - that
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
them. It shows a `Checks 7/12` heading, then every aspect with a green tick or
a red cross - a cross meaning never checked, or checked longer ago than six
months - and finally, centred underneath, whether the product carries a note.
The note line reads the other way round: a note is something outstanding, so
**having one is the cross** and an empty box is the tick. Hover it to read the
note, and hover an aspect for its age.

Same privacy as the product-page strip: it renders empty for everyone and only
fills itself in once the site has confirmed who is looking, so a cached
category page can never leak it to a shopper. A whole grid's worth of tiles is
looked up in one go rather than one request per tile, and a very large category
- a few hundred listings on one page - is looked up in a couple of goes rather
than one. Grids that size used to come back with no ticks at all.

**Placing it:** in **Admin → Layouts → Shop → Product Card**, drag **Card:
Product checks** to where you want it - under the price is the natural home.

### In the product editor

A **Checks** section in the admin product editor, alongside Downloads and
Add-ons - the same grid, already expanded, for updating while you edit.

### Admin → Shop → Catalogue → Checks

The working list, as a tab on the Catalogue page beside Products, Categories
and Collections rather than a link of its own in the sidebar - it is a view of
the catalogue, so it sits with the rest of it.

Every catalogue product, the longest-unchecked first until
you say otherwise. Hidden variation children and archived products are left
out.

**Each row** shows the product's picture and SKU, twelve small squares (one per
aspect: filled green means current, amber means checked but out of date, an
empty dashed square means never checked), how many are current out of twelve,
the age of the oldest check, the first line of any note, and who last saved.
Hover a square for that aspect's age; **click it to mark that aspect checked
today** without opening anything. The arrow at the end of a row opens the full
grid inline, where dates can be backdated and the note edited.

**Counting along the top** are six tiles - everything in view, all checks done,
checks outstanding, never checked, gone out of date, and carrying a note. Each
one is a button that filters the list to it. Under them is a chip per aspect
with how many products still want that aspect looked at; clicking one narrows
the list to exactly those products, so "which listings still have no 3D models"
is one click.

**Filtering:** search by name, slug or SKU; by product status; by category
(which follows sub-categories down the tree); by whether the checks are done or
not; by a single aspect being done, not done, never checked or out of date; and
by whether the product carries a note. There is also a "current for" choice -
three months, six months or a year - which decides what counts as still in
date for the view you are looking at, without changing anything saved.

**Sorting:** longest unchecked first or last, fewest checks done first or most,
notes first or last, recently saved first or longest since saved, and name
either way. The column headings sort too - click one, click it again to turn it
round.

**Doing several at once:** tick the boxes down the left, choose an aspect (or
"Every check") in the bar that appears, and mark them all checked today. The
same bar can clear those dates back to never, which asks first.

**Export CSV** hands you whatever the filters currently show as a spreadsheet -
handy for giving somebody a morning's worth of checking on paper.

The view lives in the address bar, so a filtered, sorted list is a link you can
send to whoever is doing the checking, and a refresh lands you back on it.

## Installing it

The module needs a core new enough to install modules by URL, and the site's
GitHub App granted access to the module's (private) repository. Then:
**Admin → Modules → Add a custom module**, paste the repository URL, Install.
The module's database table is created on the deploy that follows.
