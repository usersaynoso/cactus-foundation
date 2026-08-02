---
name: deskwell-product-import
description: >-
  Import a supplier product list (Google Sheet or CSV of SKUs) into the Deskwell /
  Cactus shop database as the fewest possible product listings, bundling widths,
  finishes, frame colours and other variations into options with a hard maximum of
  four options per listing. Use this whenever the user wants products added to the
  shop from a supplier sheet or catalogue export - phrasings like "add all the
  products from this sheet", "import these SKUs", "get this supplier range on the
  site", "bundle these into listings", "why are these separate products" - and also
  when reviewing, deduplicating or re-bundling products that are already there.
  Covers reading the existing catalogue to copy its conventions, deduplicating
  against products already on the site, pricing, images, categories, and writing to
  the live database safely. Use it even if the user does not mention listings,
  options or variations by name; any request to put a supplier's products on the
  shop belongs here.
---

# Deskwell product import

Turning a supplier list into shop listings is mostly one judgement, made hundreds of
times: **what is one product, and what is a choice within a product?** Get it wrong
towards "everything is its own product" and you bury a range under 300 near-identical
listings. Get it wrong towards over-merging and you produce listings nobody can
navigate, or you collide two genuinely different products onto one variation.

The catalogue already answers that judgement, product by product. Read it before you
plan anything: the site's existing listings are the specification, and copying them is
both faster and more correct than inventing rules.

## Non-negotiables

- **Maximum four options per listing.** This is the owner's rule. When a listing needs
  a fifth to keep every SKU distinct, split it into separate listings instead - and
  split on the axis that reads as a different product (leg type, base, edge profile),
  never on the one a buyer expects to choose (finish, width).
- **Fewest listings that respect that cap.** Merging is the default; a separate
  listing needs a reason.
- **Every SKU lands on its own unique combination of option values.** Two SKUs sharing
  a combination means one of them is unbuyable.
- **Never invent a bundling rule the catalogue already answers.** Check first.

## Workflow

### 1. Read the existing catalogue first

```bash
python scripts/analyse_catalogue.py --out <work-dir> --sheet <supplier.csv>
```

Read-only. Writes `catalogue-report.md` plus the snapshot files the later steps need
(categories, attributes, attribute values, existing slugs and SKUs).

Read the report properly - it reconstructs the conventions by mapping each existing
listing's SKUs back to the supplier groups they came from, which is the only reliable
way to see what the owner treats as one product. Eleven width groups on one listing is
the site telling you widths are an option.

`references/catalogue_conventions.md` records what that mapping showed as of July 2026,
including the rules that are easy to get wrong. Read it, then confirm against the fresh
report rather than trusting it.

If you are re-running an import of your own, pass `--since '<timestamp>'` so your
earlier listings are not counted as "existing" - otherwise every SKU looks like a
duplicate and the plan comes out empty.

### 2. Deduplicate on product identity, not just SKU

A SKU-only check is not enough, and the failure is silent. A supplier group can have
entirely new SKUs and still be a product the site already sells - the sheet once spelt
one group "Straigh", which hid an 1800mm pedestal desk that belonged in an existing
listing, and it sailed through a SKU comparison because the SKUs really were new.

The report's "Duplicate families" section lists these. For each one, decide between:

- **The variations are new**, filling combinations the existing listing does not yet
  have (a missing width, a missing height). Add them to the **existing** listing's
  option grid - `scripts/graft_variants.py` does this, reusing option values that
  already exist. It writes canonical image urls (the parent listing's folder) and its
  own `media-filing.json`, so the same drill as step 5 applies around the real run:
  `file_media.py copy` before it, `file_media.py finish` after.
- **The variations are already there** under different SKUs. Skip the group, say so.

Only create a new listing when no existing listing covers the family.

### 3. Plan the listings

```bash
python scripts/run_import.py plan --work-dir <work-dir> --sheet <supplier.csv> \
    --images <rclone-lsf.txt>
```

`scripts/import_config.py` holds the rules: which words in a group name are a version
of the same product rather than a different product, which attributes hide in the
product name, the option order, and the category mapping. **Expect to edit it for each
import** - a new supplier phrases things its own way. The engine in `import_lib.py`
does not need touching.

The planner writes `plan-report.txt`: every proposed listing, its options and values,
and which axis any split happened on. Read it end to end before going near the
database. You are looking for:

- a listing per width, per frame colour, or per "Slimline" - a merge you missed
- an option named for a measurement where the buyer is really choosing a thing
  ("Height: 47.5cm / 49.5cm" standing in for disc base versus cross base)
- names with a dangling "With", or a word clearly eaten by a lift
- listings with one variation and no options (fine - they become plain products)

Iterate on the config until the report reads like a shop rather than a spreadsheet.
`references/bundling_worked_examples.md` shows what good and bad look like on real
cases from this catalogue.

### 4. Emit and dry-run

```bash
python scripts/run_import.py emit  --work-dir <work-dir>   # -> plan.json + media-filing.json
python scripts/run_import.py sql   --work-dir <work-dir>   # -> import.sql
python scripts/run_import.py check --work-dir <work-dir>   # runs it, then ROLLBACK
```

`check` runs the real import inside a transaction that rolls back, then prints the
integrity checks from `scripts/verify.sql`. Every count must be zero except the ones
labelled pre-existing. A dry run against the live database is safe, and it is the only
thing that proves the foreign keys, unique constraints and option wiring actually hold.

Run `verify.sql` on its own first so you have a baseline - then you can tell your own
defects from ones that were already there.

### 5. File the photos, then apply

Supplier photos land in B2 under `media/dynamic/`, but the import points
`shp_product_media` at each listing's **canonical folder from the start**
(`media/shop/<master category trail>/<listing>/<sku>_<n>.webp` - the same place the
shop files an editor upload, per `modules/shop/lib/media/product-media.ts`). So the
blobs have to be standing at those paths before the SQL goes in, and the media
library's own rows follow afterwards:

```bash
python scripts/file_media.py copy   --work-dir <work-dir>  # blobs -> canonical folders
python scripts/run_import.py apply  --work-dir <work-dir>  # one transaction
python scripts/file_media.py finish --work-dir <work-dir>  # library rows follow, originals hidden
```

That order is the point. `copy` is an rclone **server-side** copy out of
`media/dynamic`, batched per destination folder with `--files-from`, and it verifies
every blob is really at its canonical path before letting you near `apply` - run it
first and the new urls never 404, not even for a moment. It is idempotent and safe
to re-run. `apply` is the same single transaction as ever (`sql --replace-since
'<timestamp>'` first if this replaces an earlier run of your own). `finish` then
creates any missing media-library Folder rows (shop / category trail / listing,
parent ids chained) and re-points each blob's `Media` row (key, url, folderId) at
its new home, then hides the `media/dynamic` originals - a hide, not a delete: the
remote runs `hard_delete=false`, so B2 keeps them as recoverable versions. An
original is only hidden once its canonical copy is confirmed in the bucket. Both
subcommands take `--dry-run`; `finish` also takes `--skip-hide`.

Blobs that `finish` reports as having no `Media` row still work on the product page
(that reads `shp_product_media`), but the media library cannot see them - say so in
the report rather than shrugging.

### 6. Afterwards

- Report the real numbers from `verify.sql`, not the intended ones.
- **Tell the owner to Push to the catalogue Google Sheet.** The shop's sheet
  integration treats a database product it cannot find in the sheet as a deletion
  candidate, so products written straight to the database need a Push before anyone
  Pulls. Do not run the Push - it writes to their Google Sheet.
- Say plainly what did not make it: SKUs with no image, groups skipped as duplicates,
  listings that had to split because four options were not enough.
- Photos that reach `media/dynamic` **after** the import (late supplier shots) are not
  covered by any of this - they need a hand-built `media-filing.json` (the shape is
  documented in `file_media.py`) plus the copy/finish pair, and the new
  `shp_product_media` rows to go with them.

## How to choose options

Three places hold the variations, and only reading all three gets a listing right:

| Where | Examples |
|---|---|
| Spec columns | Width, Depth, Height, Finish, Frame Colour, Leg Type, Drawer/Shelf Qty |
| The group name | `1400mm`, `Left`/`Right`, `Cantilever`, `Black Leg`, `With Cross Base`, `- 450mm High` |
| The product name only | SCH! patterns (Bubbles, Drift), `600 Deep` pedestal, `with Maple Doors`, `N Door`, `N Person`, `Bevelled Edge`, `with Electronic Lock`, `N Hook`, `Size 3` |

Two rules decide which candidates become options, and both exist because the obvious
approach produces listings that are technically correct and useless:

**Prefer the choice over its consequence.** A cross base happens to be 20mm taller than
a disc base. If height gets picked first, the buyer sees "47.5cm / 49.5cm" with no
mention of the base, and the base axis is then dropped as redundant. Order the axes so a
thing a buyer picks comes before a measurement that merely follows from it.

**An attribute named by only some of the merged groups still has a value on the
others.** When "Table With Cross Base" merges with plain "Table", the plain one is not
missing a base - it has the standard one. Fill it in (`ABSENT_LABEL` in the config:
`None` power module, `Standard Base`, `Leg Frame`) or the axis looks non-varying, gets
dropped, and some measurement stands in for it.

Also: skip any axis that separates nothing new. Without that, Height tags along behind
Base, the listing hits five options, and it splits for no reason.

## Getting the details right

Small things that make new products look like they belong next to the old ones:

- **Option values are in cm, not mm** (`120cm`, `47.5cm`) because the existing
  `pat_attribute_values` are. Millimetre labels start a parallel set of values meaning
  the same thing and break attribute filtering.
- **Width and Depth are separate options**, never one `120 x 60cm` value.
- **Options are attribute-sourced**: `svr_options.source_provider =
  'product-attributes'`, `source_ref` = the `pat_attributes` id, each value's
  `source_ref` = its `pat_attribute_values` id. That is what gives finishes their swatch
  images. Reuse an existing value whenever the label matches; create only for genuinely
  new labels, and prune values nothing references afterwards.
- **Every option summarises itself on the product card** (`card_display`), under a
  plural for a measurement ("Widths", "Finishes") or "<thing> Options" for a choice
  ("Locking Options"). Nothing renders unless the published `shopProductCard` layout
  contains the `ShopCardVariationOptions` block - it does on this site.
- **One variation and no options is a plain product**, not a parent with an empty option
  list and no way to add anything to the basket.
- **Prices come from the RRP by formula**: cost is 37% of the RRP to the penny, and the
  selling price is that plus 6%, **rounded up** to the whole pound so it never lands under
  the intended margin. `references/catalogue_conventions.md` has the detail, including why
  the two steps cannot be folded into one multiplier and why products imported before
  2026-07-30 sit on a slightly different rule.

## Files

- `references/catalogue_conventions.md` - what the existing catalogue does: bundling
  rules, pricing formula, table layout, media paths. Read before planning.
- `references/bundling_worked_examples.md` - real before/after cases, including the
  mistakes worth not repeating.
- `scripts/analyse_catalogue.py` - read-only survey of the live catalogue.
- `scripts/import_config.py` - the per-import rules. Edit this.
- `scripts/import_lib.py` - the engine. Rarely needs changing.
- `scripts/run_import.py` - `plan` / `emit` / `sql` / `check` / `apply`.
- `scripts/file_media.py` - `copy` / `finish`: blobs out of `media/dynamic` into the
  canonical per-product folders, Folder/Media rows to match, originals hidden.
- `scripts/graft_variants.py` - add variations to a listing that already exists.
- `scripts/verify.sql` - integrity checks.
