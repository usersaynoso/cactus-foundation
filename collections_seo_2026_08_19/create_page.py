#!/usr/bin/env python3
"""Create the public /collections index page on Deskwell.

  python3 create_page.py            # print what it would write
  python3 create_page.py --apply    # write it

RUN THIS ONLY AFTER the install is on shop >= 0.1.250. The page is one
`ShopCollectionBrowser` block, which is what makes it list every collection with
products in it and keep doing so when a new one is added. On an older shop build
that block does not exist and the page renders empty.

What it does:
  - creates (or updates) the InfoPage at slug `collections`, published
  - repoints the existing admin-only "Collections" menu item at that page and
    makes it PUBLIC, so there is one tidy nav item instead of a 39-item dropdown
  - drops the 12 per-collection children to ADMIN, since the page now does that
    job better than a dropdown can

Rollback lives in page_rollback.sql once applied.
"""
import os, sys, json, subprocess, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PSQL = '/opt/homebrew/opt/libpq/bin/psql'
MENU_ITEM_ID = 'dw-menu-collections'
SLUG = 'collections'

TITLE = 'Office Furniture Collections'
META_DESCRIPTION = ('Every Deskwell collection in one place: by range, by room, by trade and by finish. '
                    'Estate agents, call centres, schools, oak, walnut, budget and more.')

INTRO = ("Categories answer what a thing is. These answer what it is for. Pick the room you are furnishing, "
         "the trade you are in, the finish you have settled on, or the range you have already started buying, "
         "and the list below does the narrowing for you.")


def direct_url():
    for line in open(os.path.join(ROOT, '.env')):
        if line.startswith('DIRECT_URL='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('DIRECT_URL missing from .env')


def psql(url, *args):
    r = subprocess.run([PSQL, url, *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr.strip() or r.stdout.strip())
    return r.stdout


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def vis():
    # Every core block carries this; 'false' means "not hidden at this size".
    return {'mobile': 'false', 'tablet': 'false', 'desktop': 'false'}


def builder_data(menu_id):
    return {
        'root': {
            'type': 'root',
            'props': {
                'bg': {'mode': 'none', 'color': ''},
                'slug': SLUG,
                'title': TITLE,
                'menuIds': [menu_id],
                'paddingY': 'default',
                'ogImageId': '',
                'metaDescription': META_DESCRIPTION,
            },
        },
        'zones': {},
        'content': [
            {
                'type': 'Section',
                'props': {
                    'bg': {'mode': 'none', 'color': ''},
                    'id': 'Section-collections-index',
                    'bgSize': 'cover',
                    'sticky': 'off',
                    'bgImage': '',
                    'content': [
                        {'type': 'Heading', 'props': {
                            'id': 'Heading-collections-index',
                            'text': 'Office furniture collections',
                            'align': 'left', 'color': '', 'level': 'display', 'padding': 'none',
                            'visibility': vis(),
                        }},
                        {'type': 'TextBlock', 'props': {
                            'id': 'TextBlock-collections-index',
                            'size': 'md', 'align': 'left', 'color': 'default',
                            'content': INTRO,
                            'padding': 'default', 'maxWidth': {}, 'visibility': vis(),
                        }},
                        {'type': 'ShopCollectionBrowser', 'props': {
                            'id': 'ShopCollectionBrowser-collections-index',
                            'display': 'cards', 'columns': 4, 'ctaLabel': 'Browse',
                            'showBlurb': 'yes', 'showCount': 'yes',
                        }},
                    ],
                },
            },
        ],
    }


def main():
    url = direct_url()
    apply = '--apply' in sys.argv

    menu_id = psql(url, '-At', '-c',
                   f'SELECT "menuId" FROM "MenuItem" WHERE id={q(MENU_ITEM_ID)};').strip()
    if not menu_id:
        raise SystemExit(f'menu item {MENU_ITEM_ID} not found')

    existing = psql(url, '-At', '-c', f'SELECT id FROM "InfoPage" WHERE slug={q(SLUG)};').strip()
    page_id = existing or uuid.uuid4().hex[:25]
    data = json.dumps(builder_data(menu_id))

    stmts = ['BEGIN;']
    if existing:
        stmts.append(
            f'UPDATE "InfoPage" SET title={q(TITLE)}, "metaDescription"={q(META_DESCRIPTION)}, '
            f'"builderData"={q(data)}::jsonb, "publishedData"={q(data)}::jsonb, '
            f"status='published', \"publishedAt\"=now(), \"updatedAt\"=now() WHERE id={q(page_id)};")
    else:
        stmts.append(
            'INSERT INTO "InfoPage" (id, slug, title, body, "bodyFormat", "builderData", "publishedData", '
            'status, "metaDescription", "publishedAt", "updatedAt") VALUES ('
            f"{q(page_id)}, {q(SLUG)}, {q(TITLE)}, '', 'builder', {q(data)}::jsonb, {q(data)}::jsonb, "
            f"'published', {q(META_DESCRIPTION)}, now(), now());")
    # One nav item pointing at the index, rather than a dropdown of 39.
    stmts.append(
        f"UPDATE \"MenuItem\" SET type='PAGE', \"pageId\"={q(page_id)}, url=NULL, visibility='PUBLIC', "
        f'"updatedAt"=now() WHERE id={q(MENU_ITEM_ID)};')
    stmts.append(
        f"UPDATE \"MenuItem\" SET visibility='ADMIN', \"updatedAt\"=now() WHERE \"parentId\"={q(MENU_ITEM_ID)};")
    stmts.append('COMMIT;')

    open(os.path.join(HERE, 'create_page.sql'), 'w').write('\n'.join(stmts) + '\n')
    open(os.path.join(HERE, 'page_rollback.sql'), 'w').write('\n'.join([
        'BEGIN;',
        f"UPDATE \"MenuItem\" SET type='EXTERNAL', \"pageId\"=NULL, url='/shop', visibility='ADMIN', \"updatedAt\"=now() WHERE id={q(MENU_ITEM_ID)};",
        f"UPDATE \"MenuItem\" SET visibility='PUBLIC', \"updatedAt\"=now() WHERE \"parentId\"={q(MENU_ITEM_ID)};",
        ('' if existing else f'DELETE FROM "InfoPage" WHERE id={q(page_id)};'),
        'COMMIT;',
    ]) + '\n')
    print(f"page {'update' if existing else 'insert'} {SLUG} ({page_id}); menu item -> PAGE/PUBLIC")

    if apply:
        psql(url, '-v', 'ON_ERROR_STOP=1', '-f', os.path.join(HERE, 'create_page.sql'))
        print('applied')


if __name__ == '__main__':
    main()
