"""Crawl dynamicofficeseating.co.uk /collections/all?sort_by=best-selling and
record the product order Shopify serves. Product-level rank only - Shopify never
exposes per-variant sales - so every SKU of a product inherits its product rank.

Writes two files:
  bestsellers.json            the whole crawl, kept for looking things up later
  ../data/dynamic-bestsellers.csv   sku,rank,handle - what seed_popularity.py reads

A SKU listed under two products keeps the better of the two ranks: the supplier
sometimes sells the same part inside more than one listing, and the kinder read
is the one that matches how it is actually selling.
"""
import csv, json, pathlib, re, time, urllib.request, sys

BASE = "https://dynamicofficeseating.co.uk/collections/all?sort_by=best-selling"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def fetch(page):
    url = BASE + (f"&page={page}" if page > 1 else "")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if attempt == 2:
                raise
            print(f"  retry p{page} after {e}", file=sys.stderr)
            time.sleep(3)


def extract(html):
    """The theme prints the rendered page's products as a JSON array, in the
    order the grid shows them. That is the sort we are after."""
    i = html.find('"collection": [')
    if i < 0:
        return None
    j = html.index("[", i)
    depth = 0
    for k in range(j, len(html)):
        if html[k] == "[":
            depth += 1
        elif html[k] == "]":
            depth -= 1
            if depth == 0:
                break
    return json.loads(html[j : k + 1])


def main():
    html = fetch(1)
    pages = sorted({int(x) for x in re.findall(r"[?&]page=(\d+)", html)})
    last = pages[-1] if pages else 1
    print(f"pages: {last}")

    out, seen = [], set()
    for page in range(1, last + 1):
        h = html if page == 1 else fetch(page)
        arr = extract(h)
        if not arr:
            print(f"  p{page}: no collection block - stopping")
            break
        for p in arr:
            if p["handle"] in seen:
                continue
            seen.add(p["handle"])
            out.append(
                {
                    "rank": len(out) + 1,
                    "handle": p["handle"],
                    "title": p["title"],
                    "type": p.get("type"),
                    "vendor": p.get("vendor"),
                    "tags": p.get("tags") or [],
                    "price_min": p.get("price_min"),
                    "skus": [v.get("sku") for v in (p.get("variants") or []) if v.get("sku")],
                }
            )
        print(f"  p{page}: {len(arr)} products, running total {len(out)}")
        if page < last:
            time.sleep(1.0)

    json.dump(out, open("bestsellers.json", "w"), indent=1)
    print(f"wrote bestsellers.json - {len(out)} products, {sum(len(p['skus']) for p in out)} skus")

    best: dict[str, tuple[int, str]] = {}
    for p in out:
        for sku in p["skus"]:
            sku = (sku or "").strip()
            if not sku:
                continue
            if sku not in best or p["rank"] < best[sku][0]:
                best[sku] = (p["rank"], p["handle"])
    csv_path = pathlib.Path(__file__).resolve().parent.parent / "data" / "dynamic-bestsellers.csv"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sku", "rank", "handle"])
        for sku, (rank, handle) in sorted(best.items(), key=lambda kv: kv[1][0]):
            w.writerow([sku, rank, handle])
    print(f"wrote {csv_path} - {len(best)} skus")


main()
