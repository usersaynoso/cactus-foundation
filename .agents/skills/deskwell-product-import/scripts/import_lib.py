"""Engine for the Deskwell product import: sheet rows -> listings -> SQL.

The interesting decision this makes is which of a supplier group's differences become
options on one listing and which become separate listings, under a hard cap of four
options. Everything site-specific lives in import_config.py; this file is the part that
rarely needs changing.

Nothing here talks to the database except the psql helpers at the top.
"""
import csv
import collections
import json
import os
import re
import subprocess
import sys
import unicodedata
import uuid
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

csv.field_size_limit(10 ** 9)

def _repo_root():
    """The Cactus checkout this skill is installed in.

    The skill lives at <repo>/.agents/skills/<name>/scripts/, so the root is four
    levels up. Resolved rather than hardcoded so every checkout works, and
    overridable with CACTUS_ROOT for an unusual layout.
    """
    override = os.environ.get('CACTUS_ROOT')
    if override:
        return override
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, '..', '..', '..', '..'))


def _psql_bin():
    """libpq's psql. The homebrew keg is not on PATH by default on macOS."""
    if os.environ.get('PSQL_BIN'):
        return os.environ['PSQL_BIN']
    for candidate in ('/opt/homebrew/opt/libpq/bin/psql', '/usr/local/opt/libpq/bin/psql'):
        if os.path.exists(candidate):
            return candidate
    return 'psql'


PSQL = _psql_bin()
ENV_FILE = os.environ.get('CACTUS_ENV', os.path.join(_repo_root(), '.env'))
SEP = '\x1f'


# --------------------------------------------------------------------- database

def env_value(key):
    """One value out of the Cactus .env, grepped rather than sourced: one line of
    that file has a bare & in it, which makes `source` a parse error in zsh."""
    out = subprocess.run(f"grep -m1 '^{key}=' {ENV_FILE!r} | cut -d= -f2-",
                         shell=True, capture_output=True, text=True).stdout.strip()
    if len(out) >= 2 and out[0] == out[-1] and out[0] in '"\'':
        out = out[1:-1]
    return out


def dsn():
    """The direct (non-pooled) connection string, read out of the Cactus .env."""
    for key in ('DIRECT_URL', 'DATABASE_URL'):
        out = env_value(key)
        if out:
            return out
    sys.exit(f'no DIRECT_URL or DATABASE_URL in {ENV_FILE}')


def psql_rows(sql, url=None):
    r = subprocess.run([PSQL, url or dsn(), '-At', '-F', SEP, '-c', sql],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip())
    return [line.split(SEP) for line in r.stdout.splitlines() if line]


def psql_run_file(path, url=None, quiet=True):
    args = [PSQL, url or dsn(), '-v', 'ON_ERROR_STOP=1', '-f', path]
    if quiet:
        args.insert(2, '-q')
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        print(r.stdout)
        sys.exit(r.stderr.strip())
    return r.stdout


# ----------------------------------------------------------------------- values

def q(v):
    """A SQL literal. Standard-conforming strings, so only quotes need doubling."""
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def num(v):
    return 'NULL' if v in (None, '') else str(v)


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = s.lower().replace('&', ' and ')
    return re.sub(r'-{2,}', '-', re.sub(r'[^a-z0-9]+', '-', s).strip('-'))


def mm(v):
    """Normalise a raw dimension cell to a label. Ranges keep their unit."""
    v = (v or '').strip()
    if not v:
        return ''
    if re.fullmatch(r'\d+(\.0+)?', v):
        return f'{int(float(v))}mm'
    if re.fullmatch(r'\d+(\.\d+)?-\d+(\.\d+)?', v):
        return f'{v}mm'          # an adjustment range, e.g. a monitor arm's reach
    return v


def to_cm(text):
    """Millimetres to centimetres, because that is what the catalogue's shared
    attribute values use. A parallel set of mm values would break filtering."""
    def cm(raw):
        return f'{(Decimal(raw) / 10).normalize():f}'.rstrip('.')
    text = re.sub(r'(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b',
                  lambda m: f'{cm(m.group(1))} x {cm(m.group(2))}cm', text)
    text = re.sub(r'(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*mm\b',
                  lambda m: f'{cm(m.group(1))}-{cm(m.group(2))}cm', text)
    return re.sub(r'(\d+(?:\.\d+)?)\s*mm\b', lambda m: cm(m.group(1)) + 'cm', text)


# --------------------------------------------------------------- media filing
#
# Product images are filed in the media library (and so in B2) under
#   media / shop / <master category trail> / <listing> / <basename>
# - the authority is modules/shop/lib/media/product-media.ts, whose folder names
# are core's sanitizeFolderSegment over the category NAMES (not slugs) and the
# listing name. The import writes those canonical urls into shp_product_media
# from the start; file_media.py then copies the blobs out of media/dynamic and
# re-points their Media rows to match.

UNCATEGORISED = 'Uncategorised'


def folder_segment(name):
    """Python mirror of core sanitizeFolderSegment (lib/media/organise.ts): the
    string that both NAMES a media-library folder and forms its storage path
    segment. Keep byte-for-byte in step with the TypeScript original."""
    cleaned = re.sub(r'-+', '-', re.sub(r'[^a-zA-Z0-9._-]', '-', name.strip()))
    cleaned = cleaned.strip('-')[:60].lower()
    return '' if re.fullmatch(r'\.+', cleaned) else cleaned


def category_name_trail(snap, cfg, slug):
    """Category names root -> leaf for a master category slug, the same walk as
    core's getCategoryAncestorPath. NEW_CATEGORIES are not in the snapshot yet,
    so they resolve through the config."""
    slug_of_id = {v['id']: s for s, v in snap['categories'].items()}
    new = {s: (n, parent) for n, s, parent, _d in cfg.NEW_CATEGORIES}
    names, cur = [], slug
    for _ in range(50):                      # same depth cap core uses
        if not cur:
            break
        if cur in snap['categories']:
            v = snap['categories'][cur]
            names.append(v['name'])
            cur = slug_of_id.get(v['parent']) if v['parent'] else None
        elif cur in new:
            name, parent = new[cur]
            names.append(name)
            cur = parent
        else:
            sys.exit(f'category {slug!r}: ancestor {cur!r} is in neither the snapshot '
                     'nor NEW_CATEGORIES - re-run analyse_catalogue.py')
    return list(reversed(names))


def media_folder_segments(snap, cfg, master_slug, listing_name):
    """['shop', <category segments...>, <listing segment>] - each string is both
    the Folder row's name and its storage path segment. Blank segments are
    skipped, exactly as core's getOrCreateFolderByPath skips them."""
    trail = category_name_trail(snap, cfg, master_slug) or [UNCATEGORISED]
    segs = [folder_segment(s) for s in ['Shop', *trail, listing_name]]
    return [s for s in segs if s]


def media_prefix(segments):
    return 'media/' + '/'.join(segments) + '/'


def media_url(cfg, prefix, basename):
    return cfg.MEDIA_HOST.rstrip('/') + '/' + prefix + basename


def filing_map(plan, cfg):
    """The media-filing.json contents: which dynamic blobs belong in which
    canonical folder. file_media.py drives its rclone copies and the
    Folder/Media SQL off this; nothing else reads it."""
    folders = {}
    for listing in plan:
        files = sorted({f for v in listing['variants'] for f in v['media_files']})
        if not files:
            continue
        entry = folders.setdefault(listing['media_prefix'], {
            'segments': listing['media_segments'],
            'prefix': listing['media_prefix'], 'files': set()})
        entry['files'].update(files)
    return {'bucket': cfg.B2_BUCKET, 'host': cfg.MEDIA_HOST,
            'dynamic_prefix': cfg.DYNAMIC_PREFIX,
            'folders': [dict(e, files=sorted(e['files']))
                        for _p, e in sorted(folders.items())]}


# ------------------------------------------------------------------ sheet input

class Sheet:
    """A supplier CSV, with typo normalisation applied on the way out.

    Typos are fixed here rather than at the point of use because a misspelt group name
    silently defeats duplicate detection - "Straigh" once hid a whole desk range that
    was already on the site.
    """

    def __init__(self, path, cfg):
        rows = list(csv.reader(open(path, newline='', encoding='utf-8')))
        self.header = rows[cfg.HEADER_ROW]
        self.col = {h: n for n, h in enumerate(self.header)}
        self.rows = [r for r in rows[cfg.HEADER_ROW + 1:] if any(c.strip() for c in r)]
        self.cfg = cfg

    def get(self, row, logical):
        name = self.cfg.COLUMNS.get(logical, logical)
        n = self.col.get(name)
        v = row[n].strip() if n is not None and n < len(row) else ''
        for rx, rep in self.cfg.TYPOS:
            v = rx.sub(rep, v)
        return v

    def group_of(self, row):
        return self.get(row, 'group') or self.get(row, 'name')


# ------------------------------------------------------------------ name tidying

def tidy(name):
    out = re.sub(r'\s{2,}', ' ', name).strip(' -–')
    out = re.sub(r'\s+(Desk|Table|Screen)\s+(Desk|Table|Screen)\b', r' \1', out)
    out = re.sub(r'\s+(With|For|And|Of|The)$', '', out, flags=re.I)
    out = re.sub(r'\s+With\s+(?=With\b)', ' ', out, flags=re.I)
    return out.strip(' -–')


def denoise(name, cfg):
    for rx in cfg.NOISE_PHRASES:
        name = rx.sub(' ', name)
    return name


def lift_group(name, cfg):
    """Strip variant tokens out of a group name, recording each as an option value.

    Returns (stem, {axis: value}). Groups that reduce to the same stem become one
    listing, and the stripped tokens are what the buyer then chooses between.
    """
    lifted, out = {}, denoise(name, cfg)
    for rx in cfg.MERGE_PHRASES:
        out = rx.sub(' ', out)
    for axis, rx, fmt in cfg.GROUP_LIFTS:
        m = rx.search(out)
        if m and axis not in lifted:
            lifted[axis] = fmt(m)
            out = out[:m.start()] + ' ' + out[m.end():]
    return tidy(out), lifted


def merge_key(stem, cfg):
    """A loose form of a stem, used only to decide which groups become one listing."""
    k = stem.lower()
    for a, b in cfg.MERGE_KEY_SUBSTITUTIONS:
        k = k.replace(a, b)
    k = re.sub(r'[^a-z0-9]+', ' ', k)
    return ' '.join(sorted(w for w in k.split() if w not in cfg.MERGE_KEY_STOPWORDS))


def lift_name(sheet, row):
    """Attributes the supplier only ever states in the product name."""
    name = sheet.get(row, 'name')
    out = {}
    for axis, rx, fmt, absent in sheet.cfg.NAME_LIFTS:
        m = rx.search(name)
        if m:
            out[axis] = fmt(m)
        elif absent:
            out[axis] = absent
    return out


def column_axes(sheet, row):
    """Candidate option values carried by the spec columns."""
    v = {}
    for axis, logical_cols in sheet.cfg.COLUMN_AXES:
        for logical in logical_cols:
            raw = sheet.get(row, logical)
            if raw:
                v[axis] = mm(raw) if axis in sheet.cfg.DIMENSION_AXES else raw
                break
    for axis, logical, suffix in sheet.cfg.COUNT_AXES:
        raw = sheet.get(row, logical)
        if raw and re.fullmatch(r'\d+(\.0+)?', raw):
            v[axis] = f'{int(float(raw))}{suffix}'
    return v


STOP = set('and with without for the a of by in on to set kit'.split())


def design_axis(sheet, members):
    """The part of a product name that no column and no lift explains.

    Catches attributes the supplier states nowhere else, like the SCH! acoustic
    patterns. Only trusted when every SKU has one - a partly blank residue is leftover
    wording, not a choice.
    """
    per_row, word_sets = {}, []
    for _sku, row, _lifted in members:
        word_sets.append([w for w in re.split(r'[\s,/()\-–]+', sheet.get(row, 'name')) if w])
    common = None
    for ws in word_sets:
        s = {w.lower() for w in ws}
        common = s if common is None else (common & s)
    for (sku, row, lifted), ws in zip(members, word_sets):
        known = {v.lower() for v in column_axes(sheet, row).values()}
        known |= {v.lower() for v in lifted.values()}
        known |= {v.lower() for v in lift_name(sheet, row).values()}
        blob = ' '.join(sorted(known))
        residue = [w for w in ws
                   if w.lower() not in common and w.lower() not in STOP
                   and w.lower() not in known and w.lower() not in blob
                   and not re.fullmatch(r'[\d.]+(mm|cm|m)?', w.lower())]
        per_row[sku] = ' '.join(residue).strip()
    return per_row


# ------------------------------------------------------------------ the planner

def build_listing(sheet, stem, category, brand, members, split_note=''):
    cfg = sheet.cfg
    skus = [m[0] for m in members]
    designs = design_axis(sheet, members)
    use_design = all(designs.get(s) for s in skus)

    axes_by_row = {}
    for sku, row, lifted in members:
        a = column_axes(sheet, row)
        a.update(lift_name(sheet, row))
        a.update(lifted)                      # a group-name token wins over a column
        if use_design:
            a['Design'] = designs[sku]
        axes_by_row[sku] = a

    varying = []
    for axis in cfg.KEEP_ORDER:
        vals = {axes_by_row[s].get(axis, '') for s in skus}
        vals.discard('')
        if len(vals) > 1:
            varying.append(axis)

    def dupes(axes):
        c = collections.Counter(tuple(axes_by_row[s].get(a, '') for a in axes) for s in skus)
        return sum(n - 1 for n in c.values())

    # Add axes until every SKU is uniquely identified, skipping any that separates
    # nothing new. That is how a measurement which merely tracks another choice
    # (height following the base type) drops out instead of doubling up with it.
    chosen, left = [], dupes([])
    for axis in [a for a in cfg.KEEP_ORDER if a in varying]:
        if left == 0:
            break
        d = dupes(chosen + [axis])
        if d < left:
            chosen.append(axis)
            left = d

    for axis in chosen:
        for s in skus:
            if not axes_by_row[s].get(axis):
                axes_by_row[s][axis] = cfg.BLANK_LABEL.get(axis, 'Standard')

    return {
        'stem': stem, 'category': category, 'brand': brand, 'axes': chosen,
        'unique': left == 0, 'n': len(skus),
        'members': members, 'axes_by_row': axes_by_row, 'split_note': split_note,
    }


def plan_listings(sheet, skip_skus=frozenset()):
    """Group the sheet into listings of at most MAX_OPTIONS options each."""
    cfg = sheet.cfg
    rows = [r for r in sheet.rows if sheet.get(r, 'sku').upper() not in skip_skus]

    buckets = collections.defaultdict(list)
    for r in rows:
        buckets[(sheet.get(r, 'category'), sheet.get(r, 'brand'),
                 sheet.group_of(r))].append((sheet.get(r, 'sku').upper(), r))

    by_key = collections.defaultdict(list)
    for (cat, brand, grp), rs in buckets.items():
        stem, lifted = lift_group(grp, cfg)
        by_key[(cat, brand, merge_key(stem, cfg))].append((grp, stem, lifted, rs))

    stems = collections.defaultdict(list)
    for (cat, brand, _key), sources in sorted(by_key.items()):
        if len(sources) == 1:
            # Nothing merged, so the lift bought nothing: keep the supplier's own name
            # (minus the noise wording) rather than silently dropping detail.
            grp, _stem, _lifted, rs = sources[0]
            stem = tidy(denoise(grp, cfg))
            for sku, r in rs:
                stems[(cat, brand, stem)].append((sku, r, {}))
            continue
        display = max(sources, key=lambda s: len(s[3]))[1]
        # An axis named by only some of the merged groups still has a value on the
        # others - no module, the standard base - so it stays a real choice instead of
        # looking non-varying and letting a measurement stand in for it.
        named = {ax for _g, _s, lift, _rs in sources for ax in lift}
        for _grp, _stem, lifted, rs in sources:
            filled = dict(lifted)
            for ax in named - set(filled):
                if ax in cfg.ABSENT_LABEL:
                    filled[ax] = cfg.ABSENT_LABEL[ax]
            for sku, r in rs:
                stems[(cat, brand, display)].append((sku, r, dict(filled)))

    listings, queue, guard = [], [], 0
    for (cat, brand, stem), members in sorted(stems.items()):
        queue.append(build_listing(sheet, stem, cat, brand, members))

    while queue:
        cur = queue.pop(0)
        guard += 1
        if len(cur['axes']) <= cfg.MAX_OPTIONS or guard > 4000:
            listings.append(cur)
            continue
        # Too many options: peel one axis off into separate listings, preferring the one
        # that reads as a different product over one a buyer expects to choose.
        split_ax = next((a for a in cfg.SPLIT_PREFERENCE if a in cur['axes']), cur['axes'][-1])
        parts = collections.defaultdict(list)
        for sku, row, lifted in cur['members']:
            parts[cur['axes_by_row'][sku].get(split_ax, '')].append((sku, row, lifted))
        for val, mem in sorted(parts.items()):
            label = cfg.SPLIT_NAME.get(split_ax, lambda v: v)(val) if val else ''
            name = tidy(f"{cur['stem']} {label}") if label else cur['stem']
            note = f"{cur['split_note']} {split_ax}={val}".strip()
            queue.append(build_listing(sheet, name, cur['category'], cur['brand'], mem, note))

    listings.sort(key=lambda L: (L['category'], L['brand'], L['stem']))
    return listings


def plan_report(listings, sheet):
    out = []
    for L in listings:
        out.append(f"{L['category']} | {L['brand']} | {L['stem']} | n={L['n']} "
                   f"unique={L['unique']} {L['split_note']}".rstrip())
        skus = [m[0] for m in L['members']]
        for axis in [a for a in sheet.cfg.DISPLAY_ORDER if a in L['axes']]:
            vals = sorted({L['axes_by_row'][s].get(axis, '') for s in skus})
            shown = ', '.join(v or '(blank)' for v in vals)
            out.append(f'      {axis}: {len(vals)} -> {shown[:180]}')
    return '\n'.join(out) + '\n'


# --------------------------------------------------------------------- pricing

def price_set(cfg, rrp):
    """(price, retail_price, cost_price) as strings, or (None, None, None).

    Cost is a share of the supplier's RRP to the penny; the selling price is a margin on
    the cost, rounded UP to the whole pound so it never lands under the intended margin.
    Work it in two steps - folding it into a single multiplier against the RRP rounds
    differently and drifts by a pound.
    """
    if not rrp:
        return None, None, None
    R = Decimal(str(rrp))
    cost = (R * cfg.COST_OF_RRP).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    price = (cost * cfg.PRICE_OF_COST).quantize(Decimal('1'), rounding=ROUND_CEILING)
    return f'{price}.00', f'{R:.2f}', str(cost)


# ---------------------------------------------------------------- site snapshot

def load_snapshot(work_dir):
    """The live catalogue state that analyse_catalogue.py dumped."""
    snap = {'categories': {}, 'attrs': {}, 'slugs': set(), 'existing_skus': set()}
    for line in open(os.path.join(work_dir, 'categories.tsv')):
        parts = line.rstrip('\n').split('\t', 4)
        if len(parts) < 5:
            sys.exit('categories.tsv has no name column - re-run analyse_catalogue.py '
                     '(the snapshot gained a column so images can be filed by category name)')
        cid, slug, parent, pos, name = parts
        snap['categories'][slug] = {'id': cid, 'parent': parent, 'position': int(pos),
                                    'name': name}
    for line in open(os.path.join(work_dir, 'attributes.tsv')):
        aid, slug, ctrl = line.rstrip('\n').split('\t')
        snap['attrs'][slug] = {'id': aid, 'control': ctrl, 'values': {}}
    for line in open(os.path.join(work_dir, 'attribute_values.tsv')):
        aslug, vid, label, vslug, swatch, pos = line.rstrip('\n').split('\t')
        if aslug in snap['attrs']:
            snap['attrs'][aslug]['values'][label.lower()] = {
                'id': vid, 'slug': vslug, 'swatch': swatch, 'position': int(pos)}
    snap['slugs'] = {l.strip() for l in open(os.path.join(work_dir, 'slugs.txt')) if l.strip()}
    for line in open(os.path.join(work_dir, 'skus.txt')):
        if line.strip():
            snap['existing_skus'].add(line.strip().upper())
    return snap


# ------------------------------------------------------------------ plan -> json

def card_limit(cfg, control, labels):
    """How many values a product card shows before the "+N" marker.

    A swatch or image option draws dots, so nine fit. A text option prints a comma
    list, so it is the characters that run out rather than the count.
    """
    if control in ('SWATCH', 'IMAGE'):
        return cfg.CARD_DOT_LIMIT if len(labels) > cfg.CARD_DOT_LIMIT else None
    used, fits = 0, 0
    for label in labels:
        used += len(label) + (2 if fits else 0)
        if used > cfg.CARD_TEXT_BUDGET and fits:
            break
        fits += 1
    return None if fits >= len(labels) else max(fits, 1)


def emit_plan(sheet, listings, snap, images):
    """Everything the SQL writer needs: names, slugs, prices, categories, options."""
    cfg = sheet.cfg
    used_slugs = set(snap['slugs'])

    def unique_slug(base):
        base = (base[:150].strip('-') or 'product')
        slug, n = base, 1
        while slug in used_slugs:
            n += 1
            slug = f'{base}-{n}'
        used_slugs.add(slug)
        return slug

    def value_sort_key(axis, label):
        if axis in cfg.NUMERIC_AXES:
            nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', label)]
            return (0, nums or [1e9], label)
        lib = snap['attrs'].get(cfg.AXIS_ATTR[axis][1], {}).get('values', {})
        hit = lib.get(label.lower())
        return (0, [hit['position']], '') if hit else (1, [0], label)

    def common(rows, logical):
        vals = collections.Counter(sheet.get(r, logical) for r in rows if sheet.get(r, logical))
        return vals.most_common(1)[0][0] if vals else ''

    out, warnings = [], []
    for L in listings:
        name = tidy(L['stem'])
        rows = [m[1] for m in L['members']]
        master, extra = cfg.categorise(L['category'], name)
        slug = unique_slug(slugify(name))
        segments = media_folder_segments(snap, cfg, master, name)
        prefix = media_prefix(segments)

        body = common(rows, 'description_html')
        marketing = common(rows, 'marketing_text')
        features = common(rows, 'features')
        description = body or (f'<p>{marketing}</p>' if marketing else None)
        if features:
            bullets = [f.strip(' -•\t') for f in re.split(r'\r?\n|<br\s*/?>', features)
                       if f.strip(' -•\t')]
            if bullets:
                description = (description or '') + '<ul>' + ''.join(
                    f'<li>{b}</li>' for b in bullets) + '</ul>'

        options = []
        for pos, axis in enumerate([a for a in cfg.DISPLAY_ORDER if a in L['axes']]):
            oname, aslug, ctrl, pctrl = cfg.AXIS_ATTR[axis]
            labels = sorted({L['axes_by_row'][m[0]][axis] for m in L['members']},
                            key=lambda v: value_sort_key(axis, v))
            if axis in cfg.DIMENSION_AXES:
                labels = [to_cm(v) for v in labels]
            values = []
            for label in labels:
                lib = snap['attrs'].get(aslug, {}).get('values', {}).get(label.lower())
                swatch = (lib['swatch'] if lib and lib['swatch']
                          else cfg.SWATCH_FALLBACK.get(axis, {}).get(label.lower(), ''))
                values.append({'label': label, 'slug': slugify(label) or 'value',
                               'swatch': swatch, 'attr_value_id': lib['id'] if lib else None})
            options.append({
                'axis': axis, 'name': oname, 'attr_slug': aslug, 'control': ctrl,
                'pat_control': pctrl, 'position': pos, 'values': values,
                'card_label': cfg.CARD_LABEL.get(oname, oname),
                'card_limit': card_limit(cfg, ctrl, labels),
            })

        variants = []
        for sku, row, _lifted in L['members']:
            labels = [to_cm(L['axes_by_row'][sku][o['axis']]) if o['axis'] in cfg.DIMENSION_AXES
                      else L['axes_by_row'][sku][o['axis']] for o in options]
            price, retail, cost = price_set(cfg, sheet.get(row, 'rrp'))
            if price is None:
                warnings.append(f'no RRP, skipped: {sku} ({name})')
                continue
            suffix = ' / '.join(labels)
            base = (f'{slug}-' + '-'.join(slugify(x) or 'x' for x in labels)) if labels \
                else f'{slug}-{slugify(sku)}'
            weight = sheet.get(row, 'weight')
            files = [cfg.MEDIA_BASENAME(sku, n) for n in images.get(sku, [])]
            variants.append({
                'sku': sku,
                'name': tidy(f'{name} - {suffix}' if suffix else name),
                'slug': unique_slug(base),
                'price': price, 'retail_price': retail, 'cost_price': cost,
                'weight': weight if re.fullmatch(r'\d+(\.\d+)?', weight or '') else None,
                'barcode': sheet.get(row, 'barcode') or None,
                'labels': labels,
                'media': [media_url(cfg, prefix, f) for f in files],
                'media_files': files,
            })

        parent_media = next((v['media'] for v in variants if v['media']), [])[:4]
        if not parent_media:
            warnings.append(f'no image: {name}')

        out.append({
            'name': name, 'slug': slug, 'description': description,
            'short_description': marketing or None,
            'master_category': master, 'categories': sorted({master, *extra}),
            'tax_class_id': cfg.TAX_CLASS_ID, 'media': parent_media,
            'media_segments': segments, 'media_prefix': prefix,
            'options': options, 'variants': variants,
            'source': {'sheet_category': L['category'], 'brand': L['brand'],
                       'split': L['split_note']},
        })
    return out, warnings


# ------------------------------------------------------------------- json -> sql

PRODUCT_COLS = ['id', 'name', 'slug', 'type', 'status', 'description', 'short_description',
                'sku', 'barcode', 'price', 'retail_price', 'cost_price', 'tax_class_id',
                'weight', 'master_category_id', 'catalogue_hidden']


def write_sql(plan, snap, cfg, replace_since=None, new_categories=()):
    """One transaction. Returns (sql_text, counts)."""
    categories = dict(snap['categories'])
    attrs = {k: {'id': v['id'], 'values': {vv['slug']: vv['id'] for vv in v['values'].values()}}
             for k, v in snap['attrs'].items()}
    counts = collections.Counter()
    out = ['BEGIN;', "SET LOCAL statement_timeout = '600s';", '']

    if replace_since:
        out += [
            "-- Replace this import's own listings. Children go first: deleting a parent",
            '-- cascades its options and variant rows but leaves the child products behind,',
            '-- and they would keep holding the SKUs this run is about to reuse.',
            'CREATE TEMP TABLE _mine AS SELECT id FROM "shp_products"'
            f'  WHERE "catalogue_hidden" = false AND "created_at" >= {q(replace_since)};',
            'DELETE FROM "shp_products" WHERE "id" IN (SELECT v."child_product_id"'
            '  FROM "svr_variants" v WHERE v."product_id" IN (SELECT id FROM _mine));',
            'DELETE FROM "shp_products" WHERE "id" IN (SELECT id FROM _mine);',
            'DROP TABLE _mine;', '']

    def bulk(table, cols, rows, chunk=400):
        if not rows:
            return
        collist = ', '.join(f'"{c}"' for c in cols)
        for i in range(0, len(rows), chunk):
            vals = ',\n  '.join('(' + ', '.join(r) + ')' for r in rows[i:i + chunk])
            out.append(f'INSERT INTO "{table}" ({collist}) VALUES\n  {vals};')
        counts[table] += len(rows)

    # new leaf categories, if the plan needs somewhere that does not exist yet
    cat_rows = []
    for name, slug, parent, desc in new_categories:
        if slug in categories:
            continue
        pos = 1 + max((c['position'] for c in categories.values()
                       if c['parent'] == categories[parent]['id']), default=-1)
        cid = str(uuid.uuid4())
        categories[slug] = {'id': cid, 'parent': categories[parent]['id'], 'position': pos}
        cat_rows.append([q(cid), q(name), q(slug), q(desc),
                         q(categories[parent]['id']), str(pos)])
    bulk('shp_categories', ['id', 'name', 'slug', 'description', 'parent_id', 'position'], cat_rows)

    # shared attribute library: reuse a value whenever the label already exists, so
    # finishes keep their swatch images and the shop's filters stay coherent
    attr_rows, val_rows = [], []
    attr_pos = len(attrs)

    def ensure_attribute(slug, name, control):
        nonlocal attr_pos
        if slug in attrs:
            return attrs[slug]['id']
        aid = str(uuid.uuid4())
        attrs[slug] = {'id': aid, 'values': {}}
        attr_rows.append([q(aid), q(name), q(slug), q(control), str(attr_pos), 'true'])
        attr_pos += 1
        return aid

    for slug in getattr(cfg, 'VARIATION_COLUMN_ATTRIBUTES', ()):
        ensure_attribute(slug, cfg.ATTR_NAME.get(slug, slug.title()), 'DROPDOWN')

    for listing in plan:
        for o in listing['options']:
            a = o['attr_slug']
            ensure_attribute(a, cfg.ATTR_NAME.get(a, o['name']), o['pat_control'])
            for v in o['values']:
                if v['slug'] not in attrs[a]['values']:
                    vid = str(uuid.uuid4())
                    attrs[a]['values'][v['slug']] = vid
                    val_rows.append([q(vid), q(attrs[a]['id']), q(v['label']), q(v['slug']),
                                     q(v['swatch']), str(len(attrs[a]['values']))])
                v['attr_value_id'] = attrs[a]['values'][v['slug']]
    bulk('pat_attributes',
         ['id', 'name', 'slug', 'control_type', 'position', 'show_in_filters'], attr_rows)
    bulk('pat_attribute_values',
         ['id', 'attribute_id', 'label', 'slug', 'swatch', 'position'], val_rows)

    prod, pcat, media = [], [], []
    opts, optvals, variants, varvals, prodattrs = [], [], [], [], []
    simple = 0

    for listing in plan:
        pid = str(uuid.uuid4())
        master = categories[listing['master_category']]['id']

        def image_rows(owner_id, urls, alt):
            for n, url in enumerate(urls):
                media.append([q(str(uuid.uuid4())), q(owner_id), q('IMAGE'), q(url), q(alt),
                              str(n), 'true' if n == 0 else 'false'])

        # Attributes the owner fills in per variation rather than per listing, kept out
        # of the public filters. They carry no values here - assigning them is what puts
        # the column on the Variations tab (and so in the catalogue sheet) for someone to
        # fill in. Every pre-existing listing is set up this way.
        for n, aslug in enumerate(getattr(cfg, 'VARIATION_COLUMN_ATTRIBUTES', ())):
            prodattrs.append([q(str(uuid.uuid4())), q(pid), q(attrs[aslug]['id']),
                              'true', 'false', str(n)])

        # One variation and nothing to choose between: a plain product, not a parent with
        # an empty option list and no way to put anything in the basket.
        if not listing['options'] and len(listing['variants']) == 1:
            v = listing['variants'][0]
            simple += 1
            prod.append([q(pid), q(listing['name']), q(listing['slug']), q('PHYSICAL'),
                         q('ACTIVE'), q(listing['description']), q(listing['short_description']),
                         q(v['sku']), q(v['barcode']), num(v['price']), num(v['retail_price']),
                         num(v['cost_price']), q(listing['tax_class_id']), num(v['weight']),
                         q(master), 'false'])
            for cslug in listing['categories']:
                pcat.append([q(pid), q(categories[cslug]['id'])])
            image_rows(pid, v['media'], listing['name'])
            continue

        prod.append([q(pid), q(listing['name']), q(listing['slug']), q('PHYSICAL'), q('ACTIVE'),
                     q(listing['description']), q(listing['short_description']), 'NULL', 'NULL',
                     '0.00', 'NULL', 'NULL', q(listing['tax_class_id']), 'NULL',
                     q(master), 'false'])
        for cslug in listing['categories']:
            pcat.append([q(pid), q(categories[cslug]['id'])])
        image_rows(pid, listing['media'], listing['name'])

        value_id = {}
        for o in listing['options']:
            oid = str(uuid.uuid4())
            opts.append([q(oid), q(pid), q(o['name']), q(o['control']), str(o['position']),
                         q(cfg.OPTION_SOURCE_PROVIDER), q(attrs[o['attr_slug']]['id']),
                         'true', q(o['card_label']),
                         str(o['card_limit']) if o['card_limit'] else 'NULL'])
            for n, v in enumerate(o['values']):
                vid = str(uuid.uuid4())
                value_id[(o['name'], v['label'])] = vid
                optvals.append([q(vid), q(oid), q(v['label']), q(v['swatch']), str(n),
                                q(v['attr_value_id'])])

        for n, var in enumerate(listing['variants']):
            cid, vrid = str(uuid.uuid4()), str(uuid.uuid4())
            prod.append([q(cid), q(var['name']), q(var['slug']), q('PHYSICAL'), q('ACTIVE'),
                         'NULL', 'NULL', q(var['sku']), q(var['barcode']),
                         num(var['price']), num(var['retail_price']), num(var['cost_price']),
                         'NULL', num(var['weight']), 'NULL', 'true'])
            image_rows(cid, var['media'], var['name'])
            variants.append([q(vrid), q(pid), q(cid), 'true', str(n)])
            for o, label in zip(listing['options'], var['labels']):
                varvals.append([q(vrid), q(value_id[(o['name'], label)])])

    bulk('shp_products', PRODUCT_COLS, prod, chunk=200)
    bulk('shp_product_categories', ['product_id', 'category_id'], pcat)
    # after shp_products: this table has a foreign key to the products it assigns to
    bulk('pat_product_attributes',
         ['id', 'product_id', 'attribute_id', 'use_for_variations', 'show_in_filters',
          'position'], prodattrs)
    bulk('shp_product_media',
         ['id', 'product_id', 'type', 'url', 'alt_text', 'position', 'is_primary'], media)
    bulk('svr_options', ['id', 'product_id', 'name', 'control_type', 'position',
                         'source_provider', 'source_ref', 'card_display', 'card_label',
                         'card_limit'], opts)
    bulk('svr_option_values',
         ['id', 'option_id', 'label', 'swatch', 'position', 'source_ref'], optvals)
    bulk('svr_variants', ['id', 'product_id', 'child_product_id', 'enabled', 'position'], variants)
    bulk('svr_variant_values', ['variant_id', 'option_value_id'], varvals, chunk=800)

    out.append('COMMIT;')
    counts['simple products (one variation, no options)'] = simple
    return '\n'.join(out) + '\n', counts


# ----------------------------------------------------------------------- images

def load_images(path):
    """{SKU: [1, 2, ...]} from an `rclone lsf` listing of the media folder."""
    images = collections.defaultdict(list)
    if not path or not os.path.exists(path):
        return images
    for line in open(path):
        m = re.match(r'(.+)_(\d+)\.webp$', line.strip())
        if m:
            images[m.group(1).upper()].append(int(m.group(2)))
    for k in images:
        images[k].sort()
    return images


def save_json(path, obj):
    json.dump(obj, open(path, 'w'), indent=1)
