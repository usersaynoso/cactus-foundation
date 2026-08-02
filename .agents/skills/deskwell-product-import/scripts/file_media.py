"""File a fresh import's photos into their canonical per-product folders.

The import SQL points shp_product_media at the canonical urls from the start
(media/shop/<master category trail>/<listing>/<sku>_<n>.webp). The blobs, though,
land in media/dynamic/ when the supplier photos are converted, and their media
library Media rows sit there with them. This script closes that gap, driven by
the media-filing.json that `run_import.py emit` (and graft_variants.py) writes:

    python file_media.py copy   --work-dir <dir> [--dry-run]   # BEFORE apply
    python file_media.py finish --work-dir <dir> [--dry-run] [--skip-hide]

copy    rclone server-side copy of every referenced blob from media/dynamic into
        its product folder - basenames kept, batched per destination folder with
        --files-from - then a listing of each destination to verify nothing is
        missing. Idempotent, and safe to run before the SQL goes in: the copies
        simply sit unreferenced until apply commits. Run it BEFORE
        `run_import.py apply` so the canonical urls never 404.

finish  one transaction that creates any missing media-library Folder rows
        (shop / <category trail> / <listing>, parent ids chained) and re-points
        each blob's Media row (key, url, folderId) at its canonical home; then
        hides the dynamic originals (rclone delete on a hard_delete=false
        remote, so B2 keeps them as recoverable hidden versions). An original is
        only hidden once its canonical copy is visible in the bucket; anything
        else is left alone and reported. Run it AFTER apply.

Blobs with no Media row are reported, not invented: the product page works off
shp_product_media alone, but the library will not show the file - worth a look.

B2 credentials come out of the Cactus root .env (B2_KEY_ID / B2_KEY), grepped
rather than sourced - see import_lib.env_value for why.
"""
import argparse
import json
import os
import secrets
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_lib import env_value, psql_rows, psql_run_file, q

RCLONE = os.environ.get('RCLONE_BIN', 'rclone')


def load_filing(work_dir):
    path = os.path.join(work_dir, 'media-filing.json')
    if not os.path.exists(path):
        sys.exit(f'{path} not found - run `run_import.py emit` (or graft_variants.py) first')
    filing = json.load(open(path))
    if not filing['folders']:
        print('media-filing.json lists no images - nothing to file')
        sys.exit(0)
    return filing


def remote(bucket):
    """rclone connection-string remote. hard_delete=false is what turns a delete
    into a hide: B2 keeps the bytes as a hidden prior version."""
    kid, key = env_value('B2_KEY_ID'), env_value('B2_KEY')
    if not kid or not key:
        sys.exit('B2_KEY_ID / B2_KEY not found in the Cactus root .env')
    return f':b2,account={kid},key={key},hard_delete=false:{bucket}/'


def rclone(argv):
    shown = [a if 'key=' not in a else a[:a.index('key=') + 4] + '***' + a[a.index(':', a.index('key=')):]
             for a in argv]
    r = subprocess.run(argv, capture_output=True, text=True)
    if r.returncode:
        print(' '.join(shown))
        print(r.stderr.strip())
        sys.exit(f'rclone exited {r.returncode}')
    return r.stdout


def dest_listing(rem, prefix):
    """Basenames currently at a canonical folder (empty when the folder does not
    exist yet - rclone lsf on a missing B2 'directory' just lists nothing)."""
    return {l.strip() for l in rclone([RCLONE, 'lsf', rem + prefix.rstrip('/')]).splitlines()
            if l.strip()}


# ------------------------------------------------------------------------ copy

def cmd_copy(args):
    filing = load_filing(args.work_dir)
    rem = remote(filing['bucket'])
    src = rem + filing['dynamic_prefix'].rstrip('/')
    lists_dir = os.path.join(args.work_dir, 'media-filing')
    os.makedirs(lists_dir, exist_ok=True)

    total = 0
    for n, folder in enumerate(filing['folders']):
        lst = os.path.join(lists_dir, f'{n:03d}-{folder["segments"][-1][:40]}.list')
        open(lst, 'w').write('\n'.join(folder['files']) + '\n')
        argv = [RCLONE, 'copy', src, rem + folder['prefix'].rstrip('/'), '--files-from', lst]
        if args.dry_run:
            argv.append('--dry-run')
        rclone(argv)
        total += len(folder['files'])
        print(f'{len(folder["files"]):5d} -> {folder["prefix"]}')

    if args.dry_run:
        print(f'dry run: {total} blobs -> {len(filing["folders"])} folders, nothing copied')
        return

    missing = []
    for folder in filing['folders']:
        have = dest_listing(rem, folder['prefix'])
        missing += [folder['prefix'] + f for f in folder['files'] if f not in have]
    if missing:
        for m in missing:
            print(f'MISSING after copy: {m}')
        sys.exit(f'{len(missing)} of {total} blobs missing at their canonical path - '
                 'they were not in media/dynamic to copy. Fix (or drop them from the '
                 'plan) before apply, or those product images 404.')
    print(f'{total} blobs verified at their canonical paths '
          f'({len(filing["folders"])} folders) - safe to apply')


# ---------------------------------------------------------------------- finish

def new_folder_id():
    """Unique text id in the shape the library's cuid ids wear."""
    return 'c' + secrets.token_hex(12)


def folder_chains(filing):
    """(inserts, leaf_of_prefix): the Folder rows to create, parents chained, and
    each canonical prefix's leaf folder id - existing rows reused by (parent,
    name), the same walk as core's getOrCreateFolderByPath."""
    existing = {}
    for fid, name, parent in psql_rows('SELECT "id", "name", coalesce("parentId", \'\') FROM "Folder"'):
        existing[(parent or None, name)] = fid
    inserts, leaf_of_prefix = [], {}
    for folder in filing['folders']:
        parent = None
        for name in folder['segments']:
            fid = existing.get((parent, name))
            if not fid:
                fid = new_folder_id()
                existing[(parent, name)] = fid
                inserts.append((fid, name, parent))
            parent = fid
        leaf_of_prefix[folder['prefix']] = parent
    return inserts, leaf_of_prefix


def cmd_finish(args):
    filing = load_filing(args.work_dir)
    host = filing['host'].rstrip('/')
    dyn = filing['dynamic_prefix']

    # Which of the dynamic blobs actually have a Media row to re-point.
    present = {k for k, in psql_rows(
        f'SELECT "key" FROM "Media" WHERE "key" LIKE {q(dyn + "%")}')}
    inserts, leaf_of_prefix = folder_chains(filing)

    sql, updates, no_row = ['BEGIN;'], 0, []
    for fid, name, parent in inserts:
        sql.append(f'INSERT INTO "Folder" ("id", "name", "parentId") VALUES '
                   f'({q(fid)}, {q(name)}, {q(parent) if parent else "NULL"});')
    for folder in filing['folders']:
        leaf = leaf_of_prefix[folder['prefix']]
        for f in folder['files']:
            old = dyn + f
            if old not in present:
                no_row.append(old)
                continue
            new = folder['prefix'] + f
            sql.append(f'UPDATE "Media" SET "key" = {q(new)}, "url" = {q(host + "/" + new)}, '
                       f'"folderId" = {q(leaf)} WHERE "key" = {q(old)};')
            updates += 1
    sql.append('ROLLBACK;' if args.dry_run else 'COMMIT;')

    path = os.path.join(args.work_dir, 'media-finish.sql')
    open(path, 'w').write('\n'.join(sql) + '\n')
    psql_run_file(path)
    print(f'{len(inserts)} Folder rows, {updates} Media rows re-pointed'
          + (' (dry run, rolled back)' if args.dry_run else ''))
    if no_row:
        print(f'{len(no_row)} blobs have no Media row (product pages fine, library blind '
              'to them until someone looks): ' + ', '.join(no_row[:5])
              + (' ...' if len(no_row) > 5 else ''))

    if args.dry_run or args.skip_hide:
        total = sum(len(f['files']) for f in filing['folders'])
        print(f'would hide {total} dynamic originals'
              + (' (--skip-hide)' if args.skip_hide else ' (dry run)'))
        return

    # Hide originals - but only ones whose canonical copy is really in the bucket.
    rem = remote(filing['bucket'])
    hide, keep = [], []
    for folder in filing['folders']:
        have = dest_listing(rem, folder['prefix'])
        for f in folder['files']:
            (hide if f in have else keep).append(f)
    if keep:
        print(f'{len(keep)} originals NOT hidden - no canonical copy found '
              '(did copy run?): ' + ', '.join(keep[:5]) + (' ...' if len(keep) > 5 else ''))
    if hide:
        lst = os.path.join(args.work_dir, 'media-filing', 'hide.list')
        os.makedirs(os.path.dirname(lst), exist_ok=True)
        open(lst, 'w').write('\n'.join(sorted(set(hide))) + '\n')
        rclone([RCLONE, 'delete', rem + dyn.rstrip('/'), '--files-from', lst])
        print(f'{len(set(hide))} dynamic originals hidden (recoverable - hard_delete=false)')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('copy', 'finish'):
        p = sub.add_parser(name)
        p.add_argument('--work-dir', required=True)
        p.add_argument('--dry-run', action='store_true')
        if name == 'finish':
            p.add_argument('--skip-hide', action='store_true',
                           help='re-point the rows but leave the dynamic originals visible')
    args = ap.parse_args()
    {'copy': cmd_copy, 'finish': cmd_finish}[args.cmd](args)


if __name__ == '__main__':
    main()
