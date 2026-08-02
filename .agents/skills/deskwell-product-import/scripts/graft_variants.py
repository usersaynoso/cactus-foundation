"""Add a supplier group's variations to a listing the site already has.

For when the analyse report flags a duplicate family: the listing exists, the option
values usually exist too, and the group's SKUs simply fill combinations the option grid
has not been given yet. Creating a second listing beside it would be the wrong answer,
and dropping the SKUs would lose real products.

Edit MOVES below, then:

    python graft_variants.py --sheet <supplier.csv> --work-dir <dir> --dry-run
    python graft_variants.py --sheet <supplier.csv> --work-dir <dir>

Each move says which sheet group goes where, and how to read each of the target listing's
options off a sheet row. If a label the readers produce does not exist on the target
option, the script stops rather than inventing a value - decide deliberately whether that
value belongs there.
"""
import argparse
import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_config as cfg
from import_lib import (Sheet, folder_segment, load_images, price_set, psql_rows,
                        psql_run_file, q, slugify)

# ---------------------------------------------------------------------- edit me
# (sheet group, target listing slug, {target option name: how to read it off a row})
# The example below is the July 2026 case, kept as a worked template.
MOVES = [
    ('Impulse 1800mm Panel End Straight Desk With Single Fixed Pedestal',
     'impulse-panel-end-rectangular-desk-with-storage',
     {'Width': lambda s, r: '180cm',
      'Storage': lambda s, r: f"{int(float(s.get(r, 'drawer_qty')))} Drawer Fixed Pedestal",
      'Finish': lambda s, r: s.get(r, 'finish')}),
]
# Listings of your own to delete once their variations have moved. They hold the SKUs
# being reused, and sku is UNIQUE, so this happens before the inserts in the same
# transaction - the shop is never missing the products in between.
DUPLICATE_LISTINGS = []


def canonical_media(pid, pname):
    """(segments, prefix) of the target listing's canonical media folder - the
    parent's master category trail plus its name, the same walk core's
    product-media.ts makes. Grafted variants file under the PARENT's folder,
    exactly as an editor upload to a variation would."""
    rows = psql_rows(f'''WITH RECURSIVE trail AS (
        SELECT c.id, c.name, c.parent_id, 0 AS d
        FROM shp_categories c JOIN shp_products p ON p.master_category_id = c.id
        WHERE p.id = {q(pid)}
        UNION ALL
        SELECT c.id, c.name, c.parent_id, t.d + 1
        FROM shp_categories c JOIN trail t ON c.id = t.parent_id)
        SELECT name FROM trail ORDER BY d DESC''')
    names = [r[0] for r in rows] or ['Uncategorised']
    segments = [s for s in (folder_segment(x) for x in ['Shop', *names, pname]) if s]
    return segments, 'media/' + '/'.join(segments) + '/'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--work-dir', required=True)
    ap.add_argument('--images', help='rclone lsf listing of the media folder')
    ap.add_argument('--dry-run', action='store_true', help='run it, then ROLLBACK')
    args = ap.parse_args()

    sheet = Sheet(args.sheet, cfg)
    images = load_images(args.images)
    taken = {s for s, in psql_rows('SELECT slug FROM shp_products')}

    sql = ['BEGIN;']
    for slug in DUPLICATE_LISTINGS:
        if not psql_rows(f'SELECT id FROM shp_products WHERE slug = {q(slug)}'):
            sys.exit(f'listing {slug} not found - check the slug')
        sql.append('DELETE FROM "shp_products" WHERE "id" IN (SELECT v."child_product_id" '
                   'FROM "svr_variants" v JOIN "shp_products" p ON p."id" = v."product_id" '
                   f'WHERE p."slug" = {q(slug)});')
        sql.append(f'DELETE FROM "shp_products" WHERE "slug" = {q(slug)};')

    moved, filing_folders = 0, {}
    for group, target_slug, readers in MOVES:
        found = psql_rows(f'SELECT id, name FROM shp_products WHERE slug = {q(target_slug)}')
        if not found:
            sys.exit(f'target listing {target_slug} not found')
        pid, pname = found[0]
        segments, prefix = canonical_media(pid, pname)
        filing = filing_folders.setdefault(prefix, {'segments': segments,
                                                    'prefix': prefix, 'files': set()})
        opts = {name: (oid, int(pos)) for oid, name, pos in psql_rows(
            f'SELECT id, name, position FROM svr_options WHERE product_id = {q(pid)}')}
        missing = [n for n in readers if n not in opts]
        if missing:
            sys.exit(f'{target_slug} has no option named {missing}')
        if set(opts) - set(readers):
            sys.exit(f'{target_slug} also has options {sorted(set(opts) - set(readers))} - '
                     'every option needs a reader or the variations will be incomplete')
        values = {(oid, label): vid for oid, label, vid in psql_rows(
            'SELECT o.id, v.label, v.id FROM svr_options o '
            f'JOIN svr_option_values v ON v.option_id = o.id WHERE o.product_id = {q(pid)}')}
        order = sorted(readers, key=lambda n: opts[n][1])
        next_pos = 1 + max(int(p) for p, in psql_rows(
            f'SELECT position FROM svr_variants WHERE product_id = {q(pid)}'))

        rows = [r for r in sheet.rows if sheet.group_of(r) == group]
        if not rows:
            sys.exit(f'no sheet rows in group {group!r}')
        for r in rows:
            labels = [readers[name](sheet, r) for name in order]
            absent = [(n, l) for n, l in zip(order, labels) if (opts[n][0], l) not in values]
            if absent:
                sys.exit(f'{target_slug} has no value for {absent} - add it deliberately '
                         'rather than letting this script invent one')
            sku = sheet.get(r, 'sku').upper()
            price, retail, cost = price_set(cfg, sheet.get(r, 'rrp'))
            name = f'{pname} - ' + ' / '.join(labels)
            base = f'{target_slug}-' + '-'.join(slugify(x) for x in labels)
            slug, n = base, 1
            while slug in taken:
                n += 1
                slug = f'{base}-{n}'
            taken.add(slug)
            weight = sheet.get(r, 'weight')

            cid, vrid = str(uuid.uuid4()), str(uuid.uuid4())
            sql.append(
                'INSERT INTO "shp_products" ("id","name","slug","type","status","sku","barcode",'
                '"price","retail_price","cost_price","weight","catalogue_hidden") VALUES ('
                f"{q(cid)}, {q(name)}, {q(slug)}, 'PHYSICAL', 'ACTIVE', {q(sku)}, "
                f'{q(sheet.get(r, "barcode"))}, {price}, {retail}, {cost}, '
                f'{weight if re.fullmatch(r"[0-9.]+", weight or "") else "NULL"}, true);')
            for i, imgnum in enumerate(images.get(sku, [])):
                basename = cfg.MEDIA_BASENAME(sku, imgnum)
                filing['files'].add(basename)
                url = cfg.MEDIA_HOST.rstrip('/') + '/' + prefix + basename
                sql.append('INSERT INTO "shp_product_media" ("id","product_id","type","url",'
                           f'"alt_text","position","is_primary") VALUES ({q(str(uuid.uuid4()))}, '
                           f"{q(cid)}, 'IMAGE', {q(url)}, {q(name)}, {i}, "
                           f'{"true" if i == 0 else "false"});')
            sql.append('INSERT INTO "svr_variants" ("id","product_id","child_product_id",'
                       f'"enabled","position") VALUES ({q(vrid)}, {q(pid)}, {q(cid)}, true, '
                       f'{next_pos});')
            next_pos += 1
            for name_, label in zip(order, labels):
                sql.append('INSERT INTO "svr_variant_values" ("variant_id","option_value_id") '
                           f'VALUES ({q(vrid)}, {q(values[(opts[name_][0], label)])});')
            moved += 1
        print(f'{len(rows):5d} variations -> {target_slug}')

    folders = [dict(f, files=sorted(f['files']))
               for _p, f in sorted(filing_folders.items()) if f['files']]
    if folders:
        json.dump({'bucket': cfg.B2_BUCKET, 'host': cfg.MEDIA_HOST,
                   'dynamic_prefix': cfg.DYNAMIC_PREFIX, 'folders': folders},
                  open(os.path.join(args.work_dir, 'media-filing.json'), 'w'), indent=1)

    if args.dry_run:
        sql.append(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     'verify.sql')).read())
        sql.append('ROLLBACK;')
    else:
        sql.append('COMMIT;')
    path = os.path.join(args.work_dir, 'graft.sql')
    open(path, 'w').write('\n'.join(sql) + '\n')
    print(f'{moved} variations, {len(DUPLICATE_LISTINGS)} duplicate listings dropped -> {path}')
    print(psql_run_file(path, quiet=True))
    if folders:
        n = sum(len(f['files']) for f in folders)
        print(f'media filing: {n} blobs across {len(folders)} folders -> media-filing.json.\n'
              'Order matters: file_media.py copy BEFORE the real (non-dry) graft run,\n'
              'file_media.py finish after it.')


if __name__ == '__main__':
    main()
