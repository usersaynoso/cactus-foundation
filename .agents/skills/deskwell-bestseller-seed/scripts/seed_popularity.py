"""Load a supplier best-seller order into shp_products.popularity_seed, then
work out the popularity figure the shop sorts on.

Dry run by default. Nothing is written without --apply.

    python3 seed_popularity.py                      # report only
    python3 seed_popularity.py --apply              # write
    python3 seed_popularity.py --csv other.csv      # a different rank file

The CSV is sku,rank,handle with rank 1 = best selling (what crawl_bestsellers.py
writes). Ranks are supplier SKUs; this shop's listings are parents of hidden
variation children, so a rank lands on the child that carries the SKU and then
the listing takes the best rank any of its variations earned. A listing is as
popular as its most popular member: bundling ten fabrics into one listing must
not bury it under a single-option product that sells a third as well.

Sales are blended in exactly as modules/shop/lib/popularity.ts does it, so
running this and letting the shop's nightly recompute run produce the same
numbers. Refunded units are taken back off, only orders that actually paid
count, and anything older than the window is ignored.
"""
import argparse, csv, os, pathlib, re, subprocess, sys

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_CSV = HERE.parent / "data" / "dynamic-bestsellers.csv"
REPO = HERE.parents[3]

# Keep these two in step with modules/shop/lib/popularity.ts.
SALES_WEIGHT = 100_000
WINDOW_DAYS = 365


def direct_url() -> str:
    env = (REPO / ".env").read_text()
    m = re.search(r"^DIRECT_URL=(.*)$", env, re.M)
    if not m:
        sys.exit(".env has no DIRECT_URL")
    return m.group(1).strip().strip('"').strip("'")


def run(url: str, sql: str) -> str:
    p = subprocess.run([PSQL, url, "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"],
                       input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(p.stderr.strip() or "psql failed")
    return p.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    path = pathlib.Path(args.csv).resolve()
    with open(path) as f:
        rows = [r for r in csv.DictReader(f) if r.get("sku") and r.get("rank")]
    if not rows:
        sys.exit(f"{path} has no sku,rank rows")
    max_rank = max(int(r["rank"]) for r in rows)
    print(f"{len(rows)} ranked SKUs, worst rank {max_rank}")

    url = direct_url()

    # Refuse rather than half-apply: the columns arrive with shop 0.1.193, so
    # before the site has taken that update there is nothing to write to.
    have = run(url, "SELECT count(*) FROM information_schema.columns "
                    "WHERE table_name='shp_products' AND column_name IN ('popularity','popularity_seed');")
    if have != "2":
        sys.exit("shp_products has no popularity columns yet - update the site to shop 0.1.193 first")

    # Score so that rank 1 scores highest and the worst rank still scores 1.
    # A plain rank number would sort backwards and leave no room for "unranked".
    load = "".join(f"({_lit(r['sku'])},{int(r['rank'])}),"
                   for r in rows).rstrip(",")

    body = f"""
CREATE TEMP TABLE seed_rank (sku text PRIMARY KEY, rank int);
INSERT INTO seed_rank (sku, rank) VALUES {load} ON CONFLICT (sku) DO NOTHING;

-- 1. Every product whose own SKU the supplier ranks.
UPDATE "shp_products" p
SET "popularity_seed" = {max_rank} + 1 - r.rank
FROM seed_rank r
WHERE r.sku = p."sku";

-- 2. A listing inherits the best rank any of its variations earned.
UPDATE "shp_products" p
SET "popularity_seed" = c.best
FROM (
  SELECT v."product_id", MAX(cp."popularity_seed") AS best
  FROM "svr_variants" v
  JOIN "shp_products" cp ON cp."id" = v."child_product_id"
  WHERE cp."popularity_seed" IS NOT NULL
  GROUP BY v."product_id"
) c
WHERE p."id" = c."product_id"
  AND (p."popularity_seed" IS NULL OR p."popularity_seed" < c.best);

-- 3. The sortable figure: the seed, plus real sales rolled up to the listing.
--    Same arithmetic as recomputePopularity() in modules/shop/lib/popularity.ts.
UPDATE "shp_products" SET "popularity" = "popularity_seed"
WHERE "popularity" IS DISTINCT FROM "popularity_seed";

WITH sold AS (
  SELECT COALESCE(v."product_id", oi."product_id") AS product_id,
         SUM(GREATEST(oi."quantity" - oi."refunded_qty", 0)) AS units
  FROM "shp_order_items" oi
  JOIN "shp_orders" o ON o."id" = oi."order_id"
  LEFT JOIN "svr_variants" v ON v."child_product_id" = oi."product_id"
  WHERE oi."product_id" IS NOT NULL
    AND o."created_at" >= NOW() - INTERVAL '{WINDOW_DAYS} days'
    AND o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED')
    AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
  GROUP BY 1
  HAVING SUM(GREATEST(oi."quantity" - oi."refunded_qty", 0)) > 0
)
UPDATE "shp_products" p
SET "popularity" = COALESCE(p."popularity_seed", 0) + sold.units * {SALES_WEIGHT}
FROM sold WHERE p."id" = sold.product_id;

SELECT 'seeded', count(*) FROM "shp_products" WHERE "popularity_seed" IS NOT NULL;
SELECT 'sortable', count(*) FROM "shp_products" WHERE "popularity" IS NOT NULL;
SELECT 'listings sortable', count(*) FROM "shp_products" p
  WHERE p."popularity" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "svr_variants" v WHERE v."child_product_id" = p."id");
"""

    # A dry run does the identical work and throws it away, so the counts it
    # prints are the counts an --apply would leave behind - not an estimate.
    sql = "BEGIN;\n" + body + ("\nCOMMIT;\n" if args.apply else "\nROLLBACK;\n")
    print(run(url, sql))
    print("APPLIED" if args.apply else "DRY RUN - nothing written (pass --apply)")


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


main()
