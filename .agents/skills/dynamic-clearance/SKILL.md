---
name: dynamic-clearance
description: >-
  Read the Dynamic Office Seating clearance collection, match each clearance
  item to the Deskwell / Cactus shop product it corresponds to, and put it on
  sale - writing a sale price of the clearance price plus 6%, and swapping the
  product's SKU over to the clearance code it must now be ordered under. Where
  a clearance item carries no barcode, it guesses which Deskwell product it is
  and hands back both product links side by side to be confirmed before
  anything is written. Use whenever the user asks to check the supplier's
  clearance page, refresh the clearance prices, put the clearance stock on sale,
  update sale prices from Dynamic, work out which clearance items the shop
  actually stocks, confirm the guessed matches, or take products back off sale
  when a clearance run ends. Covers scraping the public collection without a
  login, matching by barcode and supplier code, the exact database writes to
  shp_products, and the rollback file that undoes them.
---

# Dynamic clearance

Puts Dynamic's clearance stock on sale on Deskwell. Nothing is written until
the last step, and the middle step is where a human looks at the guesses.

```bash
node .agents/skills/dynamic-clearance/scripts/fetch-clearance.mjs --out clearance.json
```

```bash
node .agents/skills/dynamic-clearance/scripts/plan-sale-prices.mjs --in clearance.json --out-dir clearance_sale_YYYY_MM_DD
```

```bash
node .agents/skills/dynamic-clearance/scripts/apply-sale-prices.mjs --plan clearance_sale_YYYY_MM_DD/plan.json --apply
```

Run them from the repo root - the scripts read `DIRECT_URL` out of `.env`.
Leave `--apply` off for a rehearsal: the transaction runs in full and is then
rolled back, which is the honest way to find out how many rows would move.

**Always show the user `plan.csv` and get a yes before applying.** The database
on the end of `DIRECT_URL` is the live Deskwell shop.

## What gets written

Both fields live on `shp_products` - matched rows are usually the child variant
rows created by shop-variations, occasionally a standalone product.

| Column | Value |
| --- | --- |
| `sale_price` | `ceil(clearance price x 1.06)` |
| `sku` | the clearance code (`PR1291`), replacing the catalogue code (`OP000115`) |

`price` is never touched. Sale prices are already switched on for this shop
(`shp_settings.config.enabledPriceTypes` contains `sale`), so the storefront
shows the sale figure with `price` struck through beside it, and the checkout
charges the sale figure - `effectivePrice` in `modules/shop/lib/pricing.ts` is
the single place that decides this.

The 6% is the same uplift the shop's normal pricing already carries
(`price = ceil(RRP x 0.37 x 1.06)`), so a clearance line reads as it should
against the rest of the catalogue. Rounded up to the whole pound everything
else is priced in. Change it with `--uplift`.

## Matching, and why the SKU swap makes the barcode the important key

The two catalogues share no identifier by name. What they do share:

1. **Barcode.** `shp_products.barcode` is filled on ~20,800 of ~21,200 rows,
   and Dynamic's product endpoint returns the same EAN. This is the primary
   key, exact, no interpretation.
2. **Supplier code.** Dynamic's clearance listings show the code nowhere in
   their data, but their image filenames start with it (`OP000115_1_<uuid>.jpg`),
   and that matches `shp_products.sku`. Used when there is no barcode.

Once a run has swapped the SKU to `PR1291`, key 2 no longer finds that row -
the catalogue code has gone. **The barcode is what keeps the row findable on
the next run**, which is why an item with neither key is never guessed into the
plan.

## The confirm loop, for everything with no barcode

Only about a third of clearance lines carry a barcode. The rest are guessed at,
and the planner **prints them as a numbered list** - one entry per clearance
variant, one best guess each, with a link to Dynamic's page and a link to the
guessed Deskwell page:

```
2. Felt Pin Board X-Tra!Line® - 90 x 60cm / Green (PR1321, now £25, was £113)
   theirs: https://dynamicofficeseating.co.uk/products/felt-pin-board-x-tra-line®?variant=...
   ours:   Felt Pin Board X-Tra!Line® - 60cm / 45cm / Green - FR0034 at £35 (confidence 0.9)
           https://deskwell.co.uk/shop/products/felt-pin-board-x-tra-line
```

**Relay that list into the chat as it stands.** No spreadsheet, no file to open
- the two links sit side by side and the question is a yes or a no. One guess
rather than a shortlist, because a shortlist is homework.

Confidence is 0 to 1. Above ~0.8 is usually right, below ~0.4 usually is not,
and the number is never the answer on its own - watch the sizes and finishes.
The guesser reads names, and a name matching on every word except "90 x 60cm"
still comes top, which is precisely why a human is in this loop. (That pin
board above is the trap: right product, wrong size.)

Answers go back by number:

```bash
node .agents/skills/dynamic-clearance/scripts/plan-sale-prices.mjs --in clearance.json --out-dir clearance_sale_YYYY_MM_DD --confirm "1=yes,2=no,16=I003259"
```

- `N=yes` - take the guess as offered
- `N=no` - the shop does not stock it. A decision, not a maybe, so it is not asked again
- `N=<SKU>` - the guess was wrong, and this is the right product

Anything not mentioned stays open and is asked again on the next run, so the
list can be worked through a few at a time. Decisions accumulate in `plan.json`
and are never re-asked. **The numbers refer to the list that was just printed**
- once some are answered the rest close up and renumber, so always answer
against the most recent list.

A confirmed pairing outranks every other key, and the confirmed rows appear in
`plan.csv` with `matchedBy` = `confirmed by hand`, ready to apply with the same
command as the rest. They get the same sale price and the same SKU swap.

The guesser weighs words by how rare they are across the shop's own catalogue,
so "trapezium" and "moonstone" decide matches and "office", "chair" and "black"
barely register. Where the shop's price is the one the supplier's RRP implies
(`ceil(was x 0.37 x 1.06)`), the guess is nudged up - gently, because the RRP on
a clearance listing is the one from the day it went into clearance, and it
drifts.

## Endpoints

Public, no cookie, no login:

- `https://dynamicofficeseating.co.uk/collections/clearance/products.json?limit=250&page=N` -
  the collection. **No barcodes on this one.**
- `https://dynamicofficeseating.co.uk/products/<handle>.js` - one product, with
  `barcode` per variant.

Fetching the collection's HTML page and reading it as a document is a dead end -
it renders as a not-found shell to anything that is not a browser. The JSON
endpoints are the way in.

## Taking things back off sale

Every run writes `rollback.sql` next to the plan, restoring each touched row's
previous sale price *and* its previous SKU:

```bash
psql "$DIRECT_URL" -f clearance_sale_YYYY_MM_DD/rollback.sql
```

That is the correct end-of-clearance move: the catalogue code comes back, the
sale price goes to NULL, and the product returns to its normal price. Do not
hand-write UPDATEs for this - the whole point of the file is that it names the
row ids the run actually touched.

## Guards worth knowing about

- A computed sale price that is not **below** `price` is skipped, not written.
  `isOnSale` ignores it anyway, so writing it would only make the admin lie.
- `shp_products.sku` is UNIQUE. A clearance code already held by another
  product, or claimed by two rows in the same run, is skipped with the clash
  named.
- Apply re-reads every row inside the transaction and compares price, sale
  price and SKU against what the plan saw. Any drift aborts the whole run
  rather than writing half of it. `--force` applies the rows that still match.
- Only rows that carry a SKU are ever suggested - a parent listing has none, and
  a confirmation has to name something.
- Sold-out clearance lines are skipped unless `--include-sold-out`.
- `--no-skus` moves prices only, leaving codes alone.

## Files a run leaves behind

| File | For |
| --- | --- |
| `plan.csv` / `plan.json` | what will be written. Show the CSV before applying. `plan.json` also holds the numbered list and every decision made so far |
| `unmatched.csv` | everything skipped, with the reason |
| `rollback.sql` | undo, including the SKUs |
| `applied.json` | written by apply: what actually changed, and when |

## After a run

Tell the user which database was written to, how many rows moved, and where
`rollback.sql` is. If a row matched on barcode but its image code disagrees
with the shop's SKU, the plan flags it (`codeAgrees` false) - worth a look
before applying, as it means one of the two catalogues has the barcode on the
wrong product.
