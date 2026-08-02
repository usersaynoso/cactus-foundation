"""Drive the import: plan -> emit -> sql -> check -> apply.

    python run_import.py plan  --work-dir <dir> --sheet <supplier.csv> [--images <lsf.txt>]
    python run_import.py emit  --work-dir <dir>
    python run_import.py sql   --work-dir <dir> [--replace-since '2026-07-30 02:00:00']
    python run_import.py check --work-dir <dir>     # runs it for real, then ROLLBACK
    python run_import.py apply --work-dir <dir>     # one transaction, commits

Run analyse_catalogue.py first: it writes the snapshot these steps read, and the report
that says whether the config's bundling rules match the catalogue.

Read plan-report.txt after `plan` and before `emit`. That is the step where a bad merge
is cheap to fix; after `apply` it is a rebuild.
"""
import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_config as cfg
import import_lib as lib

HERE = os.path.dirname(os.path.abspath(__file__))


def _plan(args_work_dir, sheet_path, images_path=None):
    sheet = lib.Sheet(sheet_path, cfg)
    snap = lib.load_snapshot(args_work_dir)
    listings = lib.plan_listings(sheet, skip_skus=snap['existing_skus'])
    return sheet, snap, listings


def cmd_plan(args):
    sheet, _snap, listings = _plan(args.work_dir, args.sheet)
    open(os.path.join(args.work_dir, 'plan-report.txt'), 'w').write(
        lib.plan_report(listings, sheet))
    lib.save_json(os.path.join(args.work_dir, 'plan-args.json'),
                  {'sheet': os.path.abspath(args.sheet),
                   'images': os.path.abspath(args.images) if args.images else None})

    total = sum(L['n'] for L in listings)
    print(f'{len(listings)} listings, {total} variations')
    print('options per listing:',
          dict(sorted(collections.Counter(len(L['axes']) for L in listings).items())))
    over = [L for L in listings if len(L['axes']) > cfg.MAX_OPTIONS]
    bad = [L for L in listings if not L['unique']]
    empty = [L for L in listings if L['n'] > 1 and not L['axes']]
    for label, group in (('OVER OPTION CAP', over), ('NOT UNIQUE', bad),
                         ('MULTI-VARIATION, NO OPTIONS', empty)):
        for L in group:
            print(f'{label}: {L["stem"]} (n={L["n"]}, axes={L["axes"]})')
    if not (over or bad or empty):
        print('every listing within the cap, every SKU on its own combination')
    print(f'\nread {os.path.join(args.work_dir, "plan-report.txt")} before emitting')


def cmd_emit(args):
    pa = json.load(open(os.path.join(args.work_dir, 'plan-args.json')))
    sheet, snap, listings = _plan(args.work_dir, pa['sheet'])
    images = lib.load_images(pa['images'])
    plan, warnings = lib.emit_plan(sheet, listings, snap, images)

    lib.save_json(os.path.join(args.work_dir, 'plan.json'), plan)
    filing = lib.filing_map(plan, cfg)
    lib.save_json(os.path.join(args.work_dir, 'media-filing.json'), filing)
    open(os.path.join(args.work_dir, 'warnings.txt'), 'w').write('\n'.join(warnings) + '\n')

    nvars = sum(len(l['variants']) for l in plan)
    with_img = sum(1 for l in plan for v in l['variants'] if v['media'])
    nblobs = sum(len(f['files']) for f in filing['folders'])
    print(f'{len(plan)} listings, {nvars} variations, '
          f'{sum(len(l["options"]) for l in plan)} options')
    print(f'variations with an image: {with_img}/{nvars}')
    print(f'listings with an image:   {sum(1 for l in plan if l["media"])}/{len(plan)}')
    print(f'media filing: {nblobs} dynamic blobs -> {len(filing["folders"])} canonical '
          f'folders (media-filing.json; file_media.py copy must run before apply)')
    print(f'listings with a description: {sum(1 for l in plan if l["description"])}/{len(plan)}')
    known = set(snap['categories']) | {c[1] for c in cfg.NEW_CATEGORIES}
    for c, n in collections.Counter(l['master_category'] for l in plan).most_common():
        print(f'  {n:5d}  {c}' + ('' if c in known else '   <-- NOT A CATEGORY ON THE SITE'))
    if warnings:
        print(f'{len(warnings)} warnings -> warnings.txt')


def cmd_sql(args):
    plan = json.load(open(os.path.join(args.work_dir, 'plan.json')))
    snap = lib.load_snapshot(args.work_dir)
    sql, counts = lib.write_sql(plan, snap, cfg, replace_since=args.replace_since,
                                new_categories=cfg.NEW_CATEGORIES)
    path = os.path.join(args.work_dir, 'import.sql')
    open(path, 'w').write(sql)
    for table, n in counts.items():
        print(f'{n:7d}  {table}')
    print(f'-> {path} ({len(sql) / 1e6:.1f} MB)')


def _verify_sql():
    return open(os.path.join(HERE, 'verify.sql')).read()


def cmd_check(args):
    """Run the real import in a transaction that rolls back, then the checks.

    Safe on the live database, and the only thing that proves the foreign keys, unique
    constraints and option wiring hold. Run verify.sql on its own beforehand so
    pre-existing oddities are not mistaken for new ones.
    """
    sql = open(os.path.join(args.work_dir, 'import.sql')).read()
    if '\nCOMMIT;\n' not in sql:
        sys.exit('import.sql has no COMMIT to swap - regenerate it')
    dry = sql.replace('\nCOMMIT;\n', '\n' + _verify_sql() + '\nROLLBACK;\n')
    path = os.path.join(args.work_dir, 'dry-run.sql')
    open(path, 'w').write(dry)
    print(lib.psql_run_file(path, quiet=True))


def cmd_apply(args):
    lib.psql_run_file(os.path.join(args.work_dir, 'import.sql'))
    print('committed')
    checks = os.path.join(args.work_dir, 'post-check.sql')
    open(checks, 'w').write(_verify_sql())
    print(lib.psql_run_file(checks, quiet=True))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('plan', 'emit', 'sql', 'check', 'apply'):
        p = sub.add_parser(name)
        p.add_argument('--work-dir', required=True)
        if name == 'plan':
            p.add_argument('--sheet', required=True)
            p.add_argument('--images', help='rclone lsf listing of the media folder')
        if name == 'sql':
            p.add_argument('--replace-since',
                           help="delete this import's own earlier listings first, e.g. "
                                "'2026-07-30 02:00:00'")
    args = ap.parse_args()
    {'plan': cmd_plan, 'emit': cmd_emit, 'sql': cmd_sql,
     'check': cmd_check, 'apply': cmd_apply}[args.cmd](args)


if __name__ == '__main__':
    main()
