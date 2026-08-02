"""Survey the live catalogue before importing anything. Read-only.

Two jobs. It snapshots the state the later steps need (categories, the shared attribute
library, existing slugs and SKUs), and it reconstructs how the owner actually bundles
products by mapping each existing listing's SKUs back to the supplier groups they came
from. That mapping is the specification: copying it beats inventing rules, and it is the
only way to see that eleven width groups are meant to be one listing.

    python analyse_catalogue.py --out <work-dir> [--sheet <supplier.csv>] [--since TS]

Without --sheet you still get the snapshot and the option structures; with it you also
get the group-to-listing mapping and the duplicate-family warnings.
"""
import argparse
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_config as cfg
from import_lib import Sheet, psql_rows


def dump(path, sql):
    with open(path, 'w') as f:
        for row in psql_rows(sql):
            f.write('\t'.join(row) + '\n')


def family(name):
    """A loose key for "the same product family", used only to spot duplicates.

    Strips what the site turns into options (width, frame colour, pedestal spec,
    Straight/Slimline) but keeps what it turns into separate listings (leg type,
    scalloped edge, and whether there is storage at all).
    """
    storage = 'storage' if re.search(r'pedestal|storage', name, re.I) else ''
    s = name
    for rx, rep in cfg.TYPOS:
        s = rx.sub(rep, s)
    for pattern in (r'\b\d{3,4}\s*mm\b',
                    r'\bWith\s+(?:Single|Two|Double)?\s*(?:One Drawer\s+)?(?:Fixed|Mobile)\s+Pedestals?\b',
                    r'\bFrame\b', r'\b(Black|Silver|White|Chrome|Graphite|Aluminium)\b',
                    r'\bStraight\b', r'\bSlimline\b', r'\bLeg\b', r'\bDesk\b',
                    r'\bOffice\b', r'\bWith\b', r'\bTable\b'):
        s = re.sub(pattern, ' ', s, flags=re.I)
    s = re.sub(r'[^A-Za-z0-9]+', ' ', s).lower()
    return ' '.join(sorted([w for w in s.split()] + ([storage] if storage else [])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True, help='work directory for the snapshot')
    ap.add_argument('--sheet', help='supplier CSV, to map groups onto listings')
    ap.add_argument('--since', help="only treat listings created before this timestamp as "
                                    "'existing' (use when re-running your own import)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    def o(n):
        return os.path.join(args.out, n)

    mine = ''
    if args.since:
        # Exclude an earlier run of this import from "existing", so its own SKUs and
        # slugs are free to be reused by the corrected run.
        mine = f"""AND p.id NOT IN (
                   WITH mine AS (SELECT id FROM shp_products
                                  WHERE catalogue_hidden = false AND created_at >= '{args.since}')
                   SELECT id FROM mine
                   UNION SELECT v.child_product_id FROM svr_variants v
                          WHERE v.product_id IN (SELECT id FROM mine))"""

    # name last: it feeds the media folder trail (folders are named after category
    # NAMES, not slugs) and is the one field that could ever grow a surprise in it
    dump(o('categories.tsv'),
         "SELECT id, slug, coalesce(parent_id,''), position, name FROM shp_categories")
    dump(o('attributes.tsv'), 'SELECT id, slug, control_type FROM pat_attributes')
    dump(o('attribute_values.tsv'),
         "SELECT a.slug, v.id, v.label, v.slug, coalesce(v.swatch,''), v.position "
         'FROM pat_attribute_values v JOIN pat_attributes a ON a.id = v.attribute_id')
    dump(o('slugs.txt'), f'SELECT p.slug FROM shp_products p WHERE true {mine}')
    dump(o('skus.txt'), f'SELECT p.sku FROM shp_products p WHERE p.sku IS NOT NULL {mine}')

    listings = psql_rows(f"""
        SELECT p.slug, p.name, coalesce(mc.slug,'-'),
               (SELECT count(*) FROM svr_variants v WHERE v.product_id = p.id),
               coalesce((SELECT string_agg(o.name || '(' ||
                          (SELECT count(*) FROM svr_option_values x WHERE x.option_id = o.id)
                          || ')', ' + ' ORDER BY o.position)
                         FROM svr_options o WHERE o.product_id = p.id), '-')
        FROM shp_products p
        LEFT JOIN shp_categories mc ON mc.id = p.master_category_id
        WHERE p.catalogue_hidden = false {mine}
        ORDER BY p.slug""")
    listing_skus = psql_rows(f"""
        SELECT coalesce(pp.slug, p.slug), p.sku
        FROM shp_products p
        LEFT JOIN svr_variants v ON v.child_product_id = p.id
        LEFT JOIN shp_products pp ON pp.id = v.product_id
        WHERE p.sku IS NOT NULL {mine}""")
    tree = psql_rows("""
        SELECT coalesce(pc.slug,'(top)'), c.slug, c.name,
               (SELECT count(*) FROM shp_product_categories x WHERE x.category_id = c.id)
        FROM shp_categories c LEFT JOIN shp_categories pc ON pc.id = c.parent_id
        ORDER BY coalesce(pc.slug,''), c.position""")
    cards = psql_rows("""
        SELECT o.name, o.control_type, coalesce(o.card_label,'-'),
               coalesce(o.card_limit::text,'all'), count(*)
        FROM svr_options o WHERE o.card_display GROUP BY 1,2,3,4 ORDER BY 5 DESC""")

    report = ['# Existing catalogue', '', f'{len(listings)} listings.', '',
              '## Category tree (leaf, products filed directly)', '']
    for parent, slug, name, n in tree:
        report.append(f'- {parent} / **{slug}** - {name} ({n} products)')

    report += ['', '## Listings and their options', '',
               '| listing | master category | variations | options |', '|---|---|---|---|']
    for slug, _name, master, nvars, opts in listings:
        report.append(f'| `{slug}` | {master} | {nvars} | {opts} |')

    report += ['', '## Card display in use', '',
               'Every option should summarise itself on the category grid.', '',
               '| option | control | card label | limit | count |', '|---|---|---|---|---|']
    for name, ctrl, label, limit, n in cards:
        report.append(f'| {name} | {ctrl} | {label} | {limit} | {n} |')

    collisions = {}
    if args.sheet:
        sheet = Sheet(args.sheet, cfg)
        group_of = {sheet.get(r, 'sku').upper(): sheet.group_of(r) for r in sheet.rows}
        covered = collections.defaultdict(set)
        for slug, sku in listing_skus:
            g = group_of.get(sku.strip().upper())
            if g:
                covered[slug].add(g)

        report += ['', '## How the owner bundles: supplier groups per existing listing', '',
                   'Several groups on one listing means those differences belong on options.', '']
        for slug in sorted(covered):
            report.append(f'**`{slug}`** - {len(covered[slug])} supplier group(s)')
            for g in sorted(covered[slug]):
                report.append(f'  - {g}')
            report.append('')

        existing_family = collections.defaultdict(set)
        for slug, groups in covered.items():
            for g in groups:
                existing_family[family(g)].add(slug)
        known_skus = {s.strip().upper() for _sl, s in listing_skus}
        new_groups = collections.defaultdict(set)
        for r in sheet.rows:
            if sheet.get(r, 'sku').upper() not in known_skus:
                new_groups[family(sheet.group_of(r))].add(sheet.group_of(r))

        collisions = {f: (g, existing_family[f]) for f, g in new_groups.items()
                      if f in existing_family}
        report += ['## Duplicate families: groups that belong to a listing you already have', '']
        if not collisions:
            report.append('None. Every group with new SKUs is a family the site does not sell.')
        else:
            report.append('Do NOT create a listing for these. Check whether the target '
                          "listing's option grid already covers the combinations; if it does "
                          'not, add the variations to it (graft_variants.py).')
            report.append('')
            for _f, (groups, slugs) in sorted(collisions.items()):
                report.append(f'- {", ".join(sorted(slugs))}')
                for g in sorted(groups):
                    report.append(f'    <- sheet group: {g}')
        report.append('')

    open(o('catalogue-report.md'), 'w').write('\n'.join(report) + '\n')
    print(f'wrote {o("catalogue-report.md")}')
    print(f'  {len(listings)} existing listings, {len(listing_skus)} SKUs')
    if args.sheet:
        print(f'  duplicate families: {len(collisions)}'
              + (' <- read the report before planning' if collisions else ''))


if __name__ == '__main__':
    main()
