---
name: deskwell-bestseller-seed
description: Refresh the Deskwell shop's best-seller ordering from the supplier's own best-selling order. Use when the shop's "Best selling" sort looks stale, when the supplier catalogue has changed, or when asked to re-rank shop products by popularity.
---

# Best-seller seed

The shop sorts on `shp_products.popularity`. That figure is the shop's own sales
laid over a starting rank it was given, and this is where the starting rank comes
from.

## Why there is a seed at all

Deskwell has almost no order history. A best-seller sort built on it alone would
rank five products and tie the other twenty-one thousand, which is not a sort.
The supplier publishes its own best-selling order, so the shop borrows it until
it has enough trade of its own to know better. One real sale outranks any seed
(see `POPULARITY_SALES_WEIGHT` in `modules/shop/lib/popularity.ts`), so the
borrowed ranking retreats on its own as sales come in - it is never subtracted,
just outvoted.

## The two columns

| column | who writes it | what it means |
|---|---|---|
| `popularity_seed` | this skill, or an owner by hand | a rank the shop was given. Higher is better, NULL is "no opinion" |
| `popularity` | the shop's nightly recompute, and this skill | what every grid sorts on: seed + real sales |

## Refreshing

```bash
cd .agents/skills/deskwell-bestseller-seed/scripts
python3 crawl_bestsellers.py                 # writes bestsellers.json
python3 seed_popularity.py                   # dry run, prints the counts
python3 seed_popularity.py --apply           # writes
```

`crawl_bestsellers.py` walks every page of the supplier's `?sort_by=best-selling`
collection and records the order it serves. Shopify never exposes sales numbers,
only that ordering, and only per product - never per variation. So the rank is
ordinal, and every SKU of a supplier product shares its product's rank.

`seed_popularity.py` is a dry run unless given `--apply`. The dry run does the
identical work inside a transaction and rolls it back, so the counts it prints
are what an apply would actually leave behind rather than a guess. It refuses to
run at all until the site is on shop 0.1.193 or later, which is where the
columns arrive.

## What lands where

A supplier rank matches one of our SKUs, and most of our SKUs are hidden
variation children rather than listings. So a rank lands on the child, then each
listing takes the best rank any of its variations earned - a listing is as
popular as its most popular member. Bundling ten fabrics into one listing must
not bury it beneath a single-option product selling a third as well.

## Known limits

- **Ordinal, not units.** The supplier's #1 might outsell its #2 fifty to one or
  by a single unit. Nothing on the page says which.
- **Their trade, not ours.** It is a trade supplier's whole-country order book,
  which is a decent prior for an office furniture shop and nothing more.
- **Products the supplier dropped keep their old rank** until the next crawl
  clears it, because a SKU that has left their catalogue simply stops appearing.
- **Rank 1 is not sacred.** An owner can hand-set `popularity_seed` on any
  product; the next crawl overwrites only the SKUs it matched.
