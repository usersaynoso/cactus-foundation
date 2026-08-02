"""Per-import rules for the Deskwell product import. EDIT THIS, not import_lib.py.

This revision is tuned for the July 2026 supplier "Seating Dataset" (Dynamic chairs).
The previous Furniture Dataset (desks/tables/storage) version is preserved beside this
file as import_config_furniture_2026-07.py.bak - restore it before re-running that
import.

Chair conventions this encodes, read off the existing catalogue:

  - seat colour is the "Upholstery Colour" option (attr upholstery-colour, IMAGE),
    an independently chosen back is "Back Colour" (attr back-colour) - chiro-plus style
  - arms / headrest / draughtsman kit / mesh-vs-upholstered back are stated only in
    product names, so they are NAME_LIFTS
  - "High Back" / "Medium Back" groups merge into one listing with a Back Height
    option (the chiro-medium-high-back precedent)
  - Eclipse Plus I/II/III are lever counts: they merge via the Adjustments option,
    with the same labels the existing eclipse-plus-medium listing uses
"""
import re
from decimal import Decimal

# ----------------------------------------------------------------- sheet shape

HEADER_ROW = 0          # the flattened seating CSV has its headings on the first row

# logical name -> the sheet's column heading
COLUMNS = {
    'sku': 'SKU', 'name': 'Product Name', 'group': 'Product Group',
    'category': 'Category', 'brand': 'Brand', 'rrp': 'RRP',
    'weight': 'Product Weight (kg)', 'barcode': 'EAN Barcode',
    'description_html': 'Product Group Body HTML',
    'marketing_text': 'Marketing Text', 'features': 'Product Features',
    'width': 'Width', 'depth': 'Depth', 'height': 'Height',
    'finish': 'Finish', 'colour': 'Colour', 'frame_colour': 'Frame Colour',
    'seat_colour': 'Seat Colour', 'back_colour': 'Back Colour',
    'seat_material': 'Seat Material', 'back_material': 'Back Material',
    'material': 'Material', 'range': 'Range',
}

TYPOS = []

# ------------------------------------------------------------ what becomes an axis

COLUMN_AXES = [
    ('Upholstery Colour', ['seat_colour']),
    ('Back Colour', ['back_colour']),
    ('Frame Colour', ['frame_colour']),
    ('Material', ['seat_material']),
    # accessories (gas lifts, castors, headrests) have no seat, just a colour
    ('Finish', ['colour']),
    ('Width', ['width']),
    ('Depth', ['depth']),
    ('Height', ['height']),
]
COUNT_AXES = []

DIMENSION_AXES = {'Width', 'Depth', 'Height'}
NUMERIC_AXES = DIMENSION_AXES | {'Seats', 'Size'}

# ------------------------------------------------------------------ name wrangling

NOISE_PHRASES = [re.compile(p, re.I) for p in (
    r'\s*\(MOQ of \d+[^)]*\)',
    r'\s*\(Available in \d+ Sizes\)',
)]

# "Stacking" names the glides version of a chair that also comes on castors; stripping
# it is what lets the Brunswick castor group land on the same listing. A single-source
# group keeps its original name, so every other Stacking chair is unaffected.
MERGE_PHRASES = [re.compile(r'\s+Stacking\b', re.I)]

_ADJUSTMENTS = {'I': 'Seat Height',
                'II': 'Seat Height & Backrest Tilt',
                'III': 'Seat Height, Backrest & Seat Tilt'}

GROUP_LIFTS = [
    # Eclipse Plus I/II/III are lever counts - the existing eclipse-plus-medium listing
    # bundles them as Adjustments, with exactly these labels. Lookbehind so only the
    # numeral is cut and "Eclipse Plus" stays in the stem.
    ('Adjustments',  re.compile(r'(?<=Eclipse Plus )(III|II|I)\b'),
                     lambda m: _ADJUSTMENTS[m.group(1)]),
    ('Back Height',  re.compile(r'\s+(High|Medium|Low)\s+Back\b', re.I),
                     lambda m: f'{m.group(1).title()} Back'),
    # "Medium Mesh Back": lift the height word but keep "Mesh Back" in the stem -
    # mesh is part of the product's identity, the height is the option.
    ('Back Height',  re.compile(r'\s+(High|Medium|Low)(?=\s+(?:Mesh|Airmesh)\s+Back\b)', re.I),
                     lambda m: f'{m.group(1).title()} Back'),
    ('Frame Colour', re.compile(r'\s+(Black|Silver|White|Chrome|Graphite|Green|Red|Blue)\s+Frame\b', re.I),
                     lambda m: m.group(1).title()),
    ('Castors',      re.compile(r'\s+[Ww]ith\s+Castors\b'), lambda m: 'With Castors'),
]


def _arm_label(m):
    if m.group(1):                      # "Without Arms"
        return 'No Arms'
    kind = m.group(2)
    if not kind:                        # bare "With Arms"
        return 'Fixed Arms'
    kind = re.sub(r'\s+', ' ', kind).strip().title()
    kind = kind.replace(' And ', ' & ')
    return f'{kind} Arms'


def _seat_label(m):
    colour = m.group(1).title()
    mat = m.group(2).lower()
    if 'leather' in mat:
        mat = 'Leather'
    elif mat.startswith('poly'):
        mat = 'Poly'
    else:
        mat = mat.title()
    if mat == 'Fabric' and colour != 'Black':
        return colour            # the library's fabric colours are plain labels
    return f'{colour} {mat}'     # 'Black Fabric', 'Black Leather', 'Blue Vinyl'


def _gas_lift_label(m):
    label = f'Size {m.group(2)}'
    if m.group(3):
        label += ' HD'
    if m.group(1):
        label += ' Memory Return'
    return label


NAME_LIFTS = [
    # absent='No Arms' matters: a group offering only with/without one arm type (Nest,
    # Academy) must still see two values, or the axis looks non-varying and drops.
    ('Arm Option',
     re.compile(r'\bWith(out)?\s+((?:Loop|Folding|Sliding|Multi[- ]Adjustable|'
                r'Height Adjustable(?:\s*(?:&|and)\s*Folding)?)\s+)?Arms\b', re.I),
     _arm_label, 'No Arms'),
    # "With Arms And Headrest" is how Stealth Shadow phrases it
    ('Headrest', re.compile(r'\b(?:With|And)\s+Headrest\b', re.I),
     lambda m: 'With Headrest', 'Without Headrest'),
    # Absent labels double as words the design-residue detector ignores, so they must
    # not contain a word that is itself a distinguishing feature ("Standard" killed the
    # castor-set group's Design axis).
    ('Draughtsman Kit', re.compile(r'\bWith\s+Hi(?:gh)?\s+Rise\s+Draughtsman\s+Kit\b', re.I),
     lambda m: 'With Draughtsman Kit', 'None'),
    ('Back Height', re.compile(r'\b(High|Medium|Low)\s+Back\b', re.I),
     lambda m: f'{m.group(1).title()} Back', None),
    # Mesh / Nylon / Black Fabric back stated only in the name (ISO, Academy,
    # Brunswick, Zure); rows that never say have a back matching the seat. The
    # lookbehind keeps "Airmesh Seat And Mesh Back" (Stealth - a seat-material
    # choice, not a back option) out of it.
    ('Back', re.compile(r'(?<!Seat And )\b((?:Black\s+)?(?:Mesh|Airmesh|Nylon|Fabric))\s+Back\b', re.I),
     lambda m: f'{m.group(1).title()} Back', 'Matching Back'),
    # "Black Mesh Seat" / "Black Airmesh Seat": mesh seat variants of a fabric chair
    # (Ergo Click, Relay) keep the material in the colour label, overriding the
    # column's plain 'Black' that would collide with the fabric black.
    ('Upholstery Colour',
     re.compile(r'\b(Black|Blue|Grey|White)\s+(Mesh|Airmesh)\s+Seat\b', re.I),
     lambda m: f'{m.group(1).title()} {m.group(2).title()}', None),
    # A colour the name states beside its seat material wins over the seat colour
    # column (which is occasionally wrong - Banqueting says Blue Fabric over a column
    # that says Black), and the material folds into the label the way the shared
    # attribute library already does: it holds 'Black Fabric' and 'Black Leather' but
    # plain 'Blue' / 'Charcoal' for fabric colours. "(?!\s+Back)" keeps "Black Fabric
    # Back" - a back descriptor - from clobbering a bespoke seat colour. Mesh/Airmesh
    # stay out of the alternation: they describe backs and whole chairs, not the seat
    # colour ("Camden Black Mesh Chair Bespoke Colour Seat ...").
    ('Upholstery Colour',
     re.compile(r'\b(Black|Blue|Brown|Burgundy|Charcoal|Green|Grey|Red|Tan|White|Wine)\s+'
                r'(Fabric|Vinyl|Velvet|Poly(?:propylene|urethane)?|'
                r'(?:Soft\s+)?(?:Bonded\s+)?Leather)\b(?!\s+Back)', re.I),
     lambda m: _seat_label(m), None),
    ('Writing Table',
     re.compile(r'\bWith\s+(?:Foldaway\s+)?(?:Poly\s+)?Writing\s+Tab(?:le|let)\b', re.I),
     lambda m: 'With Writing Table', 'None'),
    ('Glides', re.compile(r'\bWith\s+(Chrome\s+)?Glides\b', re.I),
     lambda m: 'With Chrome Glides' if m.group(1) else 'With Glides', 'With Castors'),
    ('Hand', re.compile(r'\b(Left|Right)(?:\s+Hand)?\b', re.I),
     lambda m: f'{m.group(1).title()} Hand', 'Right Hand'),
    ('Size', re.compile(r'\b(Memory Return )?Gas Lift (\d+)"?(?: (?:Black|Chrome))?( HD)?\b', re.I),
     _gas_lift_label, None),
    ('Design', re.compile(r'\bGlass\s+Top\b', re.I), lambda m: 'Glass Top', 'Solid Top'),
    ('Castors', re.compile(r'\bWith Castors\b', re.I), lambda m: 'With Castors', None),
]

# What a merged group that never mentions a lifted attribute actually offers. Back
# Height only ever fills in on the Eclipse Deluxe merge, where the II group drops the
# "Medium" its own spec column still states - confirm in the plan report if new merges
# appear.
ABSENT_LABEL = {'Back Height': 'Medium Back', 'Castors': 'No Castors'}

BLANK_LABEL = {'Arm Option': 'No Arms', 'Headrest': 'Without Headrest',
               'Back': 'Matching Back', 'Draughtsman Kit': 'None',
               'Castors': 'No Castors', 'Material': 'Standard',
               'Writing Table': 'None', 'Glides': 'With Castors',
               'Hand': 'Right Hand'}

MERGE_KEY_SUBSTITUTIONS = []
MERGE_KEY_STOPWORDS = {'office', 'the', 'a'}

# ------------------------------------------------------------------- option order

MAX_OPTIONS = 4

# A thing a buyer picks (adjustments, arms, headrest, back style) comes before the
# colours, so a colour never stands in for a feature.
KEEP_ORDER = ['Size', 'Adjustments', 'Back Height', 'Draughtsman Kit', 'Headrest',
              'Arm Option', 'Writing Table', 'Back', 'Glides', 'Castors', 'Hand',
              'Upholstery Colour', 'Frame Colour', 'Back Colour', 'Material', 'Finish',
              'Width', 'Depth', 'Height', 'Shape', 'Design', 'Leg Type', 'Range']

# Which axis a five-option listing peels off into separate listings. Undoing a name
# merge beats breaking up a choice a buyer expects to make; colours go last.
SPLIT_PREFERENCE = ['Leg Type', 'Hand', 'Back', 'Draughtsman Kit', 'Back Height',
                    'Material', 'Writing Table', 'Glides', 'Castors', 'Headrest',
                    'Height', 'Width', 'Depth',
                    'Design', 'Shape', 'Range', 'Adjustments', 'Arm Option',
                    'Frame Colour', 'Size', 'Back Colour', 'Upholstery Colour', 'Finish']

# The order options appear in on the product page.
DISPLAY_ORDER = ['Size', 'Back Height', 'Adjustments', 'Arm Option', 'Headrest',
                 'Draughtsman Kit', 'Writing Table', 'Back', 'Material', 'Width',
                 'Depth', 'Height', 'Shape', 'Hand', 'Design', 'Glides', 'Castors',
                 'Range', 'Upholstery Colour',
                 'Back Colour', 'Finish', 'Frame Colour', 'Leg Type']

SPLIT_NAME = {
    'Back': lambda v: '' if v == 'Matching Back' else v,
    'Back Height': lambda v: v,
    'Headrest': lambda v: '' if v == 'Without Headrest' else v,
    'Draughtsman Kit': lambda v: '' if v in ('Standard', 'None') else v,
    'Writing Table': lambda v: '' if v == 'None' else v,
    'Glides': lambda v: '' if v == 'With Castors' else v,
    'Arm Option': lambda v: '' if v == 'No Arms' else f'With {v}',
    'Frame Colour': lambda v: f'{v} Frame',
    'Castors': lambda v: '' if v == 'No Castors' else v,
    'Hand': lambda v: f'{v} Hand',
}

# ------------------------------------------------------- options -> attributes

# axis -> (option name, pat_attributes slug, svr control type, pat control type)
AXIS_ATTR = {
    'Size':              ('Size', 'size', 'PILL', 'DROPDOWN'),
    'Width':             ('Width', 'width', 'PILL', 'DROPDOWN'),
    'Depth':             ('Depth', 'depth', 'PILL', 'DROPDOWN'),
    'Height':            ('Height', 'height', 'PILL', 'DROPDOWN'),
    'Adjustments':       ('Adjustments', 'adjustments', 'PILL', 'DROPDOWN'),
    'Back Height':       ('Back Height', 'back-height', 'PILL', 'DROPDOWN'),
    'Headrest':          ('Headrest', 'headrest', 'PILL', 'DROPDOWN'),
    'Arm Option':        ('Arm Option', 'arm-option', 'PILL', 'DROPDOWN'),
    'Draughtsman Kit':   ('Draughtsman Kit', 'draughtsman-kit', 'PILL', 'DROPDOWN'),
    'Back':              ('Back', 'back-style', 'PILL', 'DROPDOWN'),
    'Writing Table':     ('Writing Table', 'writing-table', 'PILL', 'DROPDOWN'),
    'Glides':            ('Glides', 'glides', 'PILL', 'DROPDOWN'),
    'Castors':           ('Castors', 'castors', 'PILL', 'DROPDOWN'),
    'Material':          ('Material', 'material', 'PILL', 'DROPDOWN'),
    'Range':             ('Range', 'range', 'PILL', 'DROPDOWN'),
    'Upholstery Colour': ('Upholstery Colour', 'upholstery-colour', 'IMAGE', 'IMAGE'),
    'Back Colour':       ('Back Colour', 'back-colour', 'IMAGE', 'IMAGE'),
    'Finish':            ('Finish', 'finish', 'IMAGE', 'IMAGE'),
    'Shape':             ('Shape', 'shape', 'PILL', 'DROPDOWN'),
    'Frame Colour':      ('Frame Colour', 'frame-colour', 'SWATCH', 'SWATCH'),
    'Hand':              ('Hand', 'hand', 'PILL', 'DROPDOWN'),
    'Leg Type':          ('Leg Type', 'leg-type', 'PILL', 'DROPDOWN'),
    'Design':            ('Design', 'design', 'PILL', 'DROPDOWN'),
}
ATTR_NAME = {'adjustments': 'Adjustments', 'back-height': 'Back Height',
             'headrest': 'Headrest', 'arm-option': 'Arm Option',
             'draughtsman-kit': 'Draughtsman Kit', 'back-style': 'Back Style',
             'writing-table': 'Writing Table', 'glides': 'Glides',
             'upholstery-colour': 'Upholstery Colour', 'back-colour': 'Back Colour',
             'castors': 'Castors', 'material': 'Material', 'range': 'Range',
             'catalog': 'Catalog', 'design': 'Design', 'frame-colour': 'Frame Colour',
             'hand': 'Hand', 'leg-type': 'Leg Type', 'shape': 'Shape'}
OPTION_SOURCE_PROVIDER = 'product-attributes'

# Attributes assigned to every listing as a per-variation column, hidden from the public
# filter grid. Not options - assigning them puts the column on the Variations tab (and
# so in the catalogue sheet) for the owner to fill in. Every pre-existing listing
# carries exactly this pair.
VARIATION_COLUMN_ATTRIBUTES = ['catalog', 'range']

SWATCH_FALLBACK = {
    'Frame Colour': {'black': '#323232', 'silver': '#7E7E7E', 'white': '#f3f3f3',
                     'chrome': '#C9CDD1', 'aluminium': '#A8ADB3',
                     'brushed aluminium': '#B4B8BC', 'graphite': '#4A4A4A',
                     'green': '#2F6B3C', 'red': '#B03A2E', 'blue': '#2C4F8A',
                     'beech': '#D7B68C', 'wooden': '#B08954',
                     'black & chrome': '#3A3D40', 'black & silver': '#4F5357',
                     'silver & white': '#D9DCDF', 'brushed aluminium & white': '#C9CDD1'},
}

# --------------------------------------------------------------- product cards

CARD_LABEL = {
    'Size': 'Sizes', 'Width': 'Widths', 'Depth': 'Depths', 'Height': 'Heights',
    'Adjustments': 'Adjustment Options', 'Back Height': 'Back Height Options',
    'Headrest': 'Headrest Options', 'Arm Option': 'Arm Options',
    'Draughtsman Kit': 'Draughtsman Kit', 'Back': 'Back Options',
    'Writing Table': 'Writing Table', 'Glides': 'Glide Options',
    'Castors': 'Castor Options', 'Material': 'Materials', 'Range': 'Ranges',
    'Upholstery Colour': 'Colours', 'Back Colour': 'Back Colours',
    'Finish': 'Finishes', 'Shape': 'Shapes', 'Frame Colour': 'Frame Colours',
    'Hand': 'Handing', 'Leg Type': 'Leg Types', 'Design': 'Designs',
}
CARD_DOT_LIMIT = 9        # swatch/image options draw dots; nine fit on a tile
CARD_TEXT_BUDGET = 34     # text options print a comma list, so characters run out

# ---------------------------------------------------------------------- pricing

# cost = this share of the supplier RRP, to the penny
COST_OF_RRP = Decimal('0.37')
# selling price = cost plus this margin, rounded UP to the whole pound
PRICE_OF_COST = Decimal('1.06')
TAX_CLASS_ID = '2de2dd0e-389e-42fe-8b29-1f6bc5bd86ce'

# ----------------------------------------------------------------------- media

# Supplier photos land in B2 at media/dynamic/<basename> when they are converted.
# The import points shp_product_media at the CANONICAL per-product path from the
# start - media/shop/<master category trail>/<listing>/<basename>, the same place
# modules/shop/lib/media/product-media.ts files an editor upload - and
# file_media.py copies the blobs there and re-points their Media rows to match.
MEDIA_HOST = 'https://media.deskwell.co.uk/'
DYNAMIC_PREFIX = 'media/dynamic/'          # the landing folder the photos start in
B2_BUCKET = 'Deskwell-Office-Furniture'    # for file_media.py's rclone steps


def MEDIA_BASENAME(sku, n):
    """How converted supplier photos are named, in dynamic and canonical alike."""
    return f'{sku.lower()}_{n}.webp'


# -------------------------------------------------------------------- categories

NEW_CATEGORIES = [
    ('Seating accessories', 'seating-accessories', 'office-seating',
     'Gas lifts, castors, bases, arms, headrests and other spares for office chairs.'),
]


def _has(name, *words):
    low = name.lower()
    return any(w.lower() in low for w in words)


def categorise(sheet_category, listing_name):
    """(master category slug, [additional slugs]) - leaf categories only."""
    cat, name = sheet_category, listing_name
    if cat == 'Accessory':
        if _has(name, 'Mat'):
            return 'anti-fatigue-floor-mats', []
        if _has(name, 'Laptop'):
            return 'monitor-arms-mounts', []
        return 'seating-accessories', []
    if cat == 'Task and Operator':
        if _has(name, 'Hi Rise', 'High Rise', 'Draughtsman', 'Kneeling', 'Stool'):
            return 'draughtsman-chairs-stools', \
                (['mesh-chairs'] if _has(name, 'Mesh') else [])
        return 'task-operator-chairs', (['mesh-chairs'] if _has(name, 'Mesh') else [])
    if cat == 'Executive':
        return 'executive-chairs', (['mesh-chairs'] if _has(name, 'Mesh') else [])
    if cat == 'Posture':
        if _has(name, 'Stool'):
            return 'draughtsman-chairs-stools', ['ergonomic-chairs']
        return 'ergonomic-chairs', []
    if cat == 'Heavy Duty':
        return '24-hour-heavy-duty-chairs', \
            (['ergonomic-chairs'] if _has(name, 'Posture') else [])
    if cat == 'Visitor':
        if _has(name, 'Sofa', 'Modular', 'Cube', 'Tub', 'Lounge'):
            return 'soft-seating-tub-chairs', []
        if _has(name, 'Stool'):
            return 'stools', []
        if _has(name, 'Cantilever'):
            return 'cantilever-chairs', ['visitor-reception-chairs']
        extra = []
        if _has(name, 'Stacking', 'Folding'):
            extra.append('stacking-folding-chairs')
        if _has(name, 'Training'):
            extra.append('meeting-conference-chairs')
        return 'visitor-reception-chairs', extra
    if cat == 'Conference':
        extra = ['stacking-folding-chairs'] if _has(name, 'Stacking', 'Folding') else []
        if _has(name, 'Visitor'):
            extra.append('visitor-reception-chairs')
        return 'meeting-conference-chairs', extra
    if cat == 'Conference/visitor':
        if _has(name, 'Cantilever'):
            return 'cantilever-chairs', ['meeting-conference-chairs']
        return 'meeting-conference-chairs', ['visitor-reception-chairs']
    if cat == 'Reception':
        if _has(name, 'Table'):
            return 'coffee-occasional-tables', []
        return 'soft-seating-tub-chairs', []
    if cat == 'Swivel Armchair':
        if _has(name, 'Executive'):
            return 'executive-chairs', []
        return 'soft-seating-tub-chairs', []
    if cat == 'Stools':
        if _has(name, 'Footstool'):
            return 'soft-seating-tub-chairs', []
        return 'stools', []
    if cat == 'Café & Bistro':
        if _has(name, 'Stool'):
            return 'stools', ['canteen-dining-chairs']
        return 'canteen-dining-chairs', []
    raise SystemExit(f'no category mapping for {cat!r} (listing {listing_name!r}) - '
                     f'add a rule to categorise() in import_config.py')
