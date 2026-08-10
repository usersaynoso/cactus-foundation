# What the Deskwell catalogue does

Recorded July 2026 by mapping every existing listing's SKUs back to the supplier groups
they came from. Treat it as a starting point and confirm against a fresh
`analyse_catalogue.py` report - the catalogue grows, and a rule can change.

## Contents

- [Bundling rules](#bundling-rules)
- [Pricing](#pricing)
- [Table layout](#table-layout)
- [Option wiring](#option-wiring)
- [Categories](#categories)
- [Images](#images)
- [The Google Sheet hazard](#the-google-sheet-hazard)

## Bundling rules

Derived from the 25 listings that predate the July 2026 bulk import. Every one of these
was a mistake made and corrected during that import, so they are worth trusting.

**Width is always an option, never a listing.** Eleven supplier groups spanning
800-1800mm collapse into one `impulse-cable-managed-rectangular-desk`. A listing per
width is the single most common way to get this wrong.

**"Slimline" is the 60cm-deep version of the same desk** - it belongs on the Depth
option. Existing children read `120cm / 60cm / Beech / Black`, i.e.
Width / Depth / Finish / Leg Finish. Not a separate listing.

**"Volta ... With Pop-up Power Module" is a Power Data Module option** on the plain
table, with values `None` / `White` / `Black`. `impulse-arrowhead-leg-boardroom-table`
already covers both the plain and the Volta supplier groups this way. The module colour
is sometimes only in the product name ("With Black Pop-up Power Module").

**Pedestals and storage are a Storage option** with up to nine values (`1 Drawer Fixed
Pedestal`, `Double 3 Drawer Fixed Pedestal`, ...), one listing per leg type. Sixteen
supplier groups become one listing.

**Genuinely separate listings**, because the owner treats them as different products:

- leg type - cable managed / cantilever / panel end / post / arrowhead / box frame
- scalloped edge versus square edge
- with-storage versus without
- left-hand versus right-hand crescent, where a five-option listing has to split

**A version word only earns removal if it achieves a merge.** Strip "Slimline" or
"Volta" and the group has to land on an existing stem, otherwise the name has lost
detail for nothing. Keep two lists: noise that always goes (wording the spec columns
already carry - "White Top Natural Wood Edge", "Office" before Bench/Desk/Table) and
version words that go only when they merge.

## Pricing

**Use this for anything you import** (set 2026-07-30, and what `import_config.py`
implements):

```
retail_price = RRP                                  (the supplier's RRP, unchanged)
cost_price   = round(RRP * 0.37, 2)                 to the penny
price        = ceil(cost_price * 1.06)              rounded UP to the whole pound
```

Rounding **up** is deliberate: it means the selling price never lands under the intended
margin. Work it in two steps and keep `cost_price` in the middle - folding it into one
multiplier against the RRP rounds differently and drifts by a pound.

**The older products are on a slightly different rule.** The 4,582 rows that predate the
July 2026 import use `round(cost_price * 1.055)` - a 5.5% margin, rounded to nearest
rather than up. Nobody has repriced them, so the catalogue currently runs two regimes
that differ by roughly £1-£3 on a mid-priced item. Worth mentioning to the owner if it
comes up; do not quietly "fix" one to match the other, since which way it should go is a
commercial decision, not a technical one.

Whichever rule applies, do not shortcut it to a single RRP multiplier. Under the old rule
`round(RRP * 0.39)` agreed on about 80% of rows and drifted by £1 on the rest, which is
the sort of thing nobody spots until a customer does.

Parent (listing) rows carry `price = 0.00`, `retail_price`/`cost_price` NULL and a
`tax_class_id`. The hidden variation children carry the real money, plus `weight` in kg
and `barcode` from the sheet's EAN. `tax_class_id` on children is NULL. Dimensions are
left NULL on both.

## Table layout

A listing is one `shp_products` row with `catalogue_hidden = false`; each variation is
another `shp_products` row with `catalogue_hidden = true`, tied together by
`svr_variants`. Options live in `svr_options` / `svr_option_values`, and
`svr_variant_values` records which values make up each variation.

```
shp_products            listing (catalogue_hidden=false) and variations (true)
shp_product_media       images, per listing and per variation
shp_product_categories  listing -> category, leaf categories only
shp_categories          the category tree
svr_options             an option on a listing (name, control_type, position, card_*)
svr_option_values       a value of an option (label, swatch, source_ref)
svr_variants            listing -> variation child product
svr_variant_values      which option values make up a variation
pat_attributes          the shared attribute library options are sourced from
pat_attribute_values    its values, carrying swatch images and hex colours
```

`shp_products.sku` is UNIQUE, so a re-import that reuses SKUs has to delete the old rows
**before** inserting, in the same transaction.

Deleting a listing cascades its options, values and `svr_variants` rows but **leaves the
child products behind**. Delete children first, via `svr_variants`, or they become
orphans that still hold their SKUs.

Control types: `PILL` for measurements and counts, `IMAGE` for finishes and patterns,
`SWATCH` for frame/leg colours. A value with no swatch falls back to a text label, so
partial swatch coverage is safe and expected.

## Option wiring

Options are sourced from the shared attribute library rather than typed by hand:

```
svr_options.source_provider  = 'product-attributes'
svr_options.source_ref       = pat_attributes.id
svr_option_values.source_ref = pat_attribute_values.id   (NULL for a hand-added value)
```

This is what gives a finish its swatch image, and what lets the shop's attribute filters
group values across products. Two consequences:

- **Option values are in cm** (`120cm`, `47.5cm`, `72.5cm`), because that is what the
  existing `width` / `height` / `depth` / `size` attribute values are. Millimetre labels
  create a second set of values meaning the same thing.
- **Reuse before creating.** Match a label against `pat_attribute_values` for that
  attribute and reuse the row; create one only for a genuinely new label. Prune values
  nothing references afterwards, or the filter lists fill with debris.

**Catalog and Range are assigned to every listing as per-variation columns**, hidden from
the public filters: a `pat_product_attributes` row with `use_for_variations = true` and
`show_in_filters = false`. They are not options and have nothing to do with bundling.
Assigning them is what puts the column on the listing's Variations tab, and so in the
catalogue sheet, for the owner to fill in afterwards; the values themselves live on the
variation children, stamped with the parent assignment's id. Every listing that predates
the July 2026 import carries exactly this pair, so new ones should too
(`VARIATION_COLUMN_ATTRIBUTES` in the config).

Note the two filter gates: `pat_attributes.show_in_filters` hides an attribute across the
whole catalogue, `pat_product_attributes.show_in_filters` hides one product's values. Both
apply, and the catalogue uses the per-product one - the shop-wide flag on `catalog` and
`range` is still true.

Card display: every option should have `card_display = true`, a `card_label` (plural for
a measurement - "Widths", "Finishes"; "<thing> Options" for a choice - "Locking Options",
"Storage Options") and a `card_limit` - how many values show before the "+N" marker.
Swatch/image options draw dots so nine fit; text options print a comma list, so budget
about 34 characters of labels. This only renders because the published `shopProductCard`
layout contains the `ShopCardVariationOptions` block.

## Categories

Products sit on **leaf categories only** - never the top-level parent. One
`master_category_id` plus any number of `shp_product_categories` rows.

The tree is five top-level categories (Office Desks, Office Seating, Office Storage,
Office Tables, Office Accessories) with leaves beneath. `analyse_catalogue.py` dumps the
current tree; map the supplier's own category onto it, refining by keywords in the
product name where one supplier category spans several site ones (a supplier's "Bistro
Tables" splits across `poseur-high-tables`, `coffee-occasional-tables` and
`caf-bistro-tables` depending on the name).

Create a new leaf only when nothing fits - the July 2026 import needed `safes-security`
and `storage-accessories` under Office Storage. Say so when you do; new categories do not
appear in the hand-built main menu on their own.

The tree was restructured on 2026-07-30: 24 empty leaves deleted, 10 tiny ones merged
away (e.g. `laptop-monitor-stands` → `monitor-arms-mounts`, `sofas-modular-soft-seating`
→ `soft-seating-tub-chairs`, `conference-tables-modular` → `meeting-boardroom-tables`),
`key-cabinets-cash-boxes` split out of `safes-security`, and `desk-extensions-returns`
renamed "Desk Fittings & Spares" under Office Accessories. 42 leaves remain, all
populated. Never trust an old config's category slugs - dump the live tree first.

## Images

Supplier photos land in B2 at `media/dynamic/<sku lowercase>_<n>.webp`, served from
`https://media.deskwell.co.uk/media/dynamic/`. That is only the **landing folder**. The
canonical home is per product:

```
media/shop/<master category trail>/<listing>/<sku lowercase>_<n>.webp
```

and the import writes those canonical urls into `shp_product_media` **from the start**;
`file_media.py` copies the blobs across (before `apply`) and re-points the `Media` rows
(after it). Never point new rows at `media/dynamic` - two imports did in July 2026 and
the clean-up on 2026-07-30 had to move 15,356 blobs and rewrite ~16k rows.

Folder names come from core's `sanitizeFolderSegment` over the category **names** and
the listing name (authority: `modules/shop/lib/media/product-media.ts`): lower-cased,
non-alphanumerics to `-`, runs collapsed, **cut at 60 characters** - so `&` becomes `-`,
never `and`. Long listings share a truncated folder; that is what core does on a product
save and it is fine (SKU basenames keep files apart). Expect existing folders to
disagree here and there - the 2026-07-30 clean-up used untruncated slug-style names, and
the category restructure moved products whose files stayed put. Do not "fix" those by
hand; core re-files a product's images whenever it is saved in the admin.

List the bucket rather than trusting the `Media` table:

```bash
rclone lsf "b2s3:Deskwell-Office-Furniture/media/dynamic/"
```

`b2s3:` (S3 endpoint) and `b2:` (native B2 backend) are configured rclone remotes holding
the live Deskwell credentials. Use one of those two names and nothing else - never invent
a remote name and never resurrect the old `b2eu` / `b2old`, which belonged to closed
accounts and answer with `403 account_trouble - please log into your b2 account`. That
message reads like a billing problem with the live account and is not one; it means the
remote name is wrong. They were removed on 2026-08-08.

Raw credentials are in the Cactus root `.env` (`B2_KEY_ID`, `B2_KEY`) if a remote ever has
to be rebuilt. Do not `source .env`
in zsh - a bare `&` on one line makes it a parse error; grep the values out. Expect gaps:
about 18% of SKUs in the July 2026 import had no photo at all. A listing takes its images
from its first variation that has any.

## The Google Sheet hazard

The shop syncs with its own catalogue Google Sheet (`gsp_connection`), and the database is
the source of truth that gets **Pushed** to it. The Pull direction treats a database
product it cannot find in the sheet as a **deletion candidate**, matching on SKU or slug.

So a direct-to-database import leaves every new product exposed until someone Pushes.
Always tell the owner to Push before anyone Pulls. Do not Push yourself - it writes to
their Google Sheet.

Do not confuse the two sheets: the supplier dataset is a read-only source, the catalogue
sheet is the shop's own.
