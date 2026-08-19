#!/usr/bin/env python3
"""Build (and optionally apply) the 2026-08-19 SEO collections.

  python3 apply.py            # write backups/ + create.sql + rollback.sql only
  python3 apply.py --apply    # ...then run create.sql against DIRECT_URL

Everything lands in one transaction. Rollback is by explicit id, so re-running
the build after an apply would mint new ids - rollback.sql is the file that
matches whatever was actually applied.
"""
import os, re, sys, uuid, json, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PSQL = '/opt/homebrew/opt/libpq/bin/psql'
sys.path.insert(0, HERE)
import curate
from collection_copy import COLLECTIONS


def direct_url():
    for line in open(os.path.join(ROOT, '.env')):
        if line.startswith('DIRECT_URL='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('DIRECT_URL missing from .env')


def q(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def psql(url, *args):
    r = subprocess.run([PSQL, url, *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr.strip() or r.stdout.strip())
    return r.stdout


def main():
    url = direct_url()
    os.makedirs(os.path.join(HERE, 'backups'), exist_ok=True)

    # --- backup ------------------------------------------------------------
    # Small tables, so the whole of each goes in the file rather than a
    # difference. A restore should not need this script to be understood.
    for table, cols in (
        ('shp_collections', 'id,name,slug,description,image_id,position,meta_title,meta_description,og_image_id'),
        ('shp_product_collections', 'product_id,collection_id,position'),
        ('seo_page_meta', 'id,entity_type,entity_id,focus_keyword,notes,score'),
    ):
        rows = psql(url, '-At', '-F', '\t', '-c', f'SELECT {cols} FROM "{table}";')
        with open(os.path.join(HERE, 'backups', f'{table}.tsv'), 'w') as fh:
            fh.write(f'-- {cols}\n')
            fh.write(rows)

    # --- build -------------------------------------------------------------
    members = curate.build()
    ids = {c['slug']: str(uuid.uuid4()) for c in COLLECTIONS}
    start = int(psql(url, '-At', '-c', 'SELECT coalesce(max(position),0) FROM shp_collections;').strip())

    create, rollback = ['BEGIN;'], ['BEGIN;']
    total = 0
    for i, c in enumerate(COLLECTIONS):
        cid = ids[c['slug']]
        pos = start + 1 + i
        create.append(
            'INSERT INTO "shp_collections" (id, name, slug, description, position, meta_title, meta_description) VALUES ('
            f"{q(cid)}, {q(c['name'])}, {q(c['slug'])}, {q(c['description'])}, {pos}, {q(c['meta_title'])}, {q(c['meta_description'])});"
        )
        rows = members[c['slug']]
        total += len(rows)
        for n, p in enumerate(rows):
            create.append(
                'INSERT INTO "shp_product_collections" (product_id, collection_id, position) VALUES ('
                f"{q(p['id'])}, {q(cid)}, {n});"
            )
        create.append(
            'INSERT INTO "seo_page_meta" (entity_type, entity_id, focus_keyword) VALUES ('
            f"'shop-collection', {q(cid)}, {q(c['focus_keyword'])});"
        )
    for c in COLLECTIONS:
        cid = ids[c['slug']]
        rollback.append(f"DELETE FROM \"seo_page_meta\" WHERE entity_type='shop-collection' AND entity_id={q(cid)};")
        rollback.append(f'DELETE FROM "shp_product_collections" WHERE collection_id={q(cid)};')
        rollback.append(f'DELETE FROM "shp_collections" WHERE id={q(cid)};')
    create.append('COMMIT;')
    rollback.append('COMMIT;')

    open(os.path.join(HERE, 'create.sql'), 'w').write('\n'.join(create) + '\n')
    open(os.path.join(HERE, 'rollback.sql'), 'w').write('\n'.join(rollback) + '\n')
    open(os.path.join(HERE, 'membership.json'), 'w').write(json.dumps(
        {s: [{'slug': p['slug'], 'name': p['name']} for p in m] for s, m in members.items()}, indent=1))
    print(f'{len(COLLECTIONS)} collections, {total} membership rows, positions {start+1}-{start+len(COLLECTIONS)}')

    if '--apply' in sys.argv:
        psql(url, '-v', 'ON_ERROR_STOP=1', '-f', os.path.join(HERE, 'create.sql'))
        print('applied')


if __name__ == '__main__':
    main()
