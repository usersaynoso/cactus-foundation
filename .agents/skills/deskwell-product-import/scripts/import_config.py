"""Per-import rules for the Deskwell product import. EDIT THIS, not import_lib.py.

This revision is tuned for the August 2026 supplier "Soft Seating Dataset"
(Brixworth booths and soft seating, Mawsley modular, Harlestone stools, Lamport).
The previous Seating Dataset (Dynamic chairs) version is preserved beside this file
as import_config_seating_2026-07.py.bak - restore it before re-running that import.

Soft-seating conventions this encodes, read off the sheet and the existing catalogue:

  - the bespoke fabric is one "Upholstery Colour" option whose labels carry the
    range prefix, the way the chair import's Camira values already do ("Rivet
    Quench"): 'Rivet Burnish', 'Main Line Flax Bank', 'Era Endurance'. A two-tone
    pick (panels & sofa, body & top) is one value: 'Rivet Burnish & Olive'.
  - booth/sofa/modular leg colour comes from the Frame Colour column; the booth
    table's own colour and leg come from the Table Top / Table Frame Colour columns
  - a booth-with-table family runs to five axes (Seats, Table Colour, Table Leg,
    Upholstery, Frame) so it splits on Frame Colour - the air-desk
    "...-black-frame" precedent - which also collapses Table Leg on the black
    listing (black frames only ever pair a black table leg)
  - Frame Colour sits BEFORE Table Leg in KEEP_ORDER so the booth leg choice is
    never silently derived from the table leg (choice before consequence)
  - Mawsley/Brixworth modular units merge into one listing per brand with a Unit
    option lifted from the group names; Low/High back is a Back Height option
    lifted per row
"""
import re
from decimal import Decimal

# ----------------------------------------------------------------- sheet shape

HEADER_ROW = 3          # rows 0-2 are banner/section rows; headings sit on row 4

# logical name -> the sheet's column heading
COLUMNS = {
    'sku': 'SKU', 'name': 'Product Name', 'group': 'Product Group',
    'category': 'Category', 'brand': 'Brand', 'rrp': 'RRP',
    'weight': 'Product Weight (kg)', 'barcode': 'EAN Barcode',
    'description_html': 'Product Group Body HTML',
    'marketing_text': 'Marketing Text', 'features': 'Product Features',
    'width': 'Width', 'depth': 'Depth', 'height': 'Height',
    'finish': 'Finish', 'colour': 'Colour', 'frame_colour': 'Frame Colour',
    'table_top_colour': 'Table Top Colour',
    'table_frame_colour': 'Table Frame Colour',
    'range': 'Range',
}

TYPOS = [
    # supplier writes "Modular Seating Set - Circular Booth"; the dash would
    # otherwise survive into a listing name
    (re.compile(r'Seating Set - '), 'Seating Set '),
    # one supplier group spans two sheet categories (Armchairs + Sofas), which
    # would produce two listings with the same name; blanking it lets the product
    # names drive the stems, landing on 'Lamport Armchair' and 'Lamport Sofa'
    (re.compile(r'^Lamport Armchair And Sofa$'), ''),
]

# ------------------------------------------------------------ what becomes an axis

COLUMN_AXES = [
    ('Frame Colour', ['frame_colour']),
    ('Table Colour', ['table_top_colour']),
    ('Table Leg', ['table_frame_colour']),
    # Harlestone stools come in two physical sizes stated only as Small/Large plus
    # the Width column; the width is the clearer label and sorts numerically
    ('Width', ['width']),
    # accessories (the power module) have no fabric, just a colour
    ('Finish', ['colour']),
]
COUNT_AXES = []

DIMENSION_AXES = {'Width', 'Depth', 'Height'}
NUMERIC_AXES = DIMENSION_AXES | {'Seats'}

# ------------------------------------------------------------------ name wrangling

NOISE_PHRASES = [re.compile(p, re.I) for p in (
    r'\s+in\s+(Single|Two)\s+Tone\s*$',
    r'\s*\(MOQ of \d+[^)]*\)',
)]

MERGE_PHRASES = []

_FABRIC_RANGES = r'Rivet|Main Line Flax|Synergy|X2'


def _fabric_pair(m):
    """'Rivet Burnish' for a single tone, 'Rivet Burnish & Olive' for two."""
    rng, a, b = m.group(1), m.group(2), m.group(3) if m.lastindex >= 3 else None
    label = f'{rng} {a.title()}'
    if b:
        label += f' & {b.title()}'
    return label


GROUP_LIFTS = [
    # 'Brixworth Sofa 2 Seater' + '3 Seater' -> one 'Brixworth Sofa' with a Seats
    # option; also strips the seater count out of the ungrouped white-leg booth
    # names so they land on the booth stems
    ('Seats', re.compile(r'\s+(\d+)\s+Seater\b', re.I),
     lambda m: f'{m.group(1)} Seater'),
    # modular unit groups merge into one listing per brand; the descriptor becomes
    # the Unit option. Longest alternatives first so 'Left End' beats 'Left'.
    ('Unit', re.compile(r'\s+(90 Degree Inner Curved|90 Degree Outer Curved|'
                        r'90 Degree Backless Curved|Central Backless|Central|'
                        r'Corner|Left End|Right End|D-End|Left|Right)(?=\s+Unit\b)'),
     lambda m: f'{m.group(1)} Unit'),
    # the rest only ever fire on the ungrouped white-leg booth rows, whose "group"
    # is the full product name - they reduce it to the same stem as the grouped
    # booth-with-table rows ('and'/'with' are merge-key stopwords)
    ('Frame Colour', re.compile(r'\s+With\s+(Black|White)\s+(?:Legs|[Ff]eet)\b'),
     lambda m: m.group(1)),
    ('Table Leg', re.compile(r'(?<=Table)\s+With\s+(Black|Silver|White)\s+Leg\b'),
     lambda m: m.group(1)),
    ('Table Colour', re.compile(r'\s*(Black|Grey|White)(?=\s+Table\b)'),
     lambda m: m.group(1)),
    ('Upholstery Colour',
     re.compile(r'\s+In\s+(' + _FABRIC_RANGES + r')\s+Fabric\s*-\s*(\w+)\s+Panels\s+'
                r'And\s+(?:(\w+)\s+)?Sofa\s*$'),
     _fabric_pair),
    # the plain form ('... In Rivet Fabric - Burnish'), for the Lamport rows whose
    # group was blanked above; runs after the booth form so it never steals it
    ('Upholstery Colour',
     re.compile(r'\s+In\s+(' + _FABRIC_RANGES + r')\s+Fabric\s*-\s*(\w+)\s*$'),
     _fabric_pair),
]

NAME_LIFTS = [
    ('Seats', re.compile(r'\b(\d+)\s+Seater\b', re.I),
     lambda m: f'{m.group(1)} Seater', None),
    # Mawsley Low/High back, stated per row; units without the words (Corner, ends,
    # backless) get the BLANK_LABEL
    ('Back Height', re.compile(r'\b(Low|High)\s+Back\b', re.I),
     lambda m: f'{m.group(1).title()} Back', None),
    # the L-shaped corner sofa set: arms both ends, or one end only
    ('Arms', re.compile(r'\bWith\s+(?:(Left|Right)\s+)?Arms?\b(?!\s*chair)', re.I),
     lambda m: f'{m.group(1).title()} Arm Only' if m.group(1) else 'Arms Both Sides',
     None),
    # Harlestone curved stools: the arc is the choice, the width follows from it
    ('Shape', re.compile(r'\b(90|180)\s+Degree\b(?=\s+Stool)', re.I),
     lambda m: f'{m.group(1)} Degree', None),
    # fabric, always stated only in the name; anchored patterns keep the four name
    # shapes (booth panels/sofa, stool body/top, plain, Era) from crossing
    ('Upholstery Colour',
     re.compile(r'\bIn\s+(' + _FABRIC_RANGES + r')\s+Fabric\s*-\s*(\w+)\s+Panels\s+'
                r'And\s+(?:(\w+)\s+)?Sofa\s*$'),
     _fabric_pair, None),
    ('Upholstery Colour',
     re.compile(r'\bIn\s+(' + _FABRIC_RANGES + r')\s+Fabric\s*-\s*(\w+)\s+Body'
                r'(?:\s+And\s+Top|\s+(\w+)\s+Top)\s*$'),
     _fabric_pair, None),
    ('Upholstery Colour',
     re.compile(r'\bIn\s+(' + _FABRIC_RANGES + r')\s+Fabric\s*-\s*(\w+)\s*$'),
     _fabric_pair, None),
    ('Upholstery Colour',
     re.compile(r'\bin\s+(Era)\s*-\s*(\w+)\s*$'),
     _fabric_pair, None),
]

ABSENT_LABEL = {}

BLANK_LABEL = {
    'Table Colour': 'None',        # the no-table rows of the Mawsley circular booth
    'Back Height': 'Standard',     # Mawsley units with one back style (Corner, ends)
}

MERGE_KEY_SUBSTITUTIONS = []
MERGE_KEY_STOPWORDS = {'office', 'the', 'a', 'and', 'with', 'in'}

# ------------------------------------------------------------------- option order

MAX_OPTIONS = 4

# Frame Colour must precede Table Leg: a black booth frame always carries a black
# table leg, so if Table Leg were considered first it would silently stand in for
# the frame choice and the buyer would never see the booth legs.
KEEP_ORDER = ['Seats', 'Unit', 'Back Height', 'Arms', 'Shape',
              'Table Colour', 'Frame Colour', 'Table Leg',
              'Upholstery Colour', 'Finish', 'Width', 'Depth', 'Height']

# Only the booth-with-table family runs past four axes; it peels off Frame Colour
# (air-desk '-black-frame' precedent), which also collapses Table Leg on the black
# listing since black frames only pair a black table leg.
SPLIT_PREFERENCE = ['Frame Colour', 'Table Leg', 'Table Colour', 'Unit',
                    'Back Height', 'Arms', 'Shape', 'Seats',
                    'Width', 'Upholstery Colour', 'Finish']

# The order options appear in on the product page.
DISPLAY_ORDER = ['Seats', 'Unit', 'Back Height', 'Arms', 'Shape', 'Width',
                 'Depth', 'Height', 'Table Colour', 'Table Leg',
                 'Upholstery Colour', 'Finish', 'Frame Colour']

SPLIT_NAME = {
    'Frame Colour': lambda v: f'{v} Frame',
}

# ------------------------------------------------------- options -> attributes

# axis -> (option name, pat_attributes slug, svr control type, pat control type)
AXIS_ATTR = {
    'Seats':             ('Seats', 'seats', 'PILL', 'DROPDOWN'),
    'Unit':              ('Unit', 'unit', 'PILL', 'DROPDOWN'),
    'Back Height':       ('Back Height', 'back-height', 'PILL', 'DROPDOWN'),
    'Arms':              ('Arm Option', 'arm-option', 'PILL', 'DROPDOWN'),
    'Shape':             ('Shape', 'shape', 'PILL', 'DROPDOWN'),
    'Width':             ('Width', 'width', 'PILL', 'DROPDOWN'),
    'Depth':             ('Depth', 'depth', 'PILL', 'DROPDOWN'),
    'Height':            ('Height', 'height', 'PILL', 'DROPDOWN'),
    'Table Colour':      ('Table Colour', 'colour', 'SWATCH', 'DROPDOWN'),
    'Table Leg':         ('Table Leg', 'leg-finish', 'SWATCH', 'SWATCH'),
    'Upholstery Colour': ('Upholstery Colour', 'upholstery-colour', 'IMAGE', 'IMAGE'),
    'Finish':            ('Finish', 'finish', 'IMAGE', 'IMAGE'),
    'Frame Colour':      ('Frame Colour', 'frame-colour', 'SWATCH', 'SWATCH'),
}
ATTR_NAME = {'seats': 'Seats', 'unit': 'Unit', 'back-height': 'Back Height',
             'arm-option': 'Arm Option', 'shape': 'Shape', 'colour': 'Colour',
             'leg-finish': 'Leg Finish', 'upholstery-colour': 'Upholstery Colour',
             'finish': 'Finish', 'frame-colour': 'Frame Colour',
             'catalog': 'Catalog', 'range': 'Range'}
OPTION_SOURCE_PROVIDER = 'product-attributes'

# Attributes assigned to every listing as a per-variation column, hidden from the public
# filter grid. Not options - assigning them puts the column on the Variations tab (and
# so in the catalogue sheet) for the owner to fill in. Every pre-existing listing
# carries exactly this pair.
VARIATION_COLUMN_ATTRIBUTES = ['catalog', 'range']

SWATCH_FALLBACK = {
    'Frame Colour': {'black': '#323232', 'white': '#f3f3f3', 'silver': '#7E7E7E'},
    'Table Colour': {'black': '#323232', 'grey': '#8A8D8F', 'white': '#f3f3f3',
                     'none': ''},
    'Table Leg':    {'black': '#323232', 'silver': '#7E7E7E', 'white': '#f3f3f3'},
}

# --------------------------------------------------------------- product cards

CARD_LABEL = {
    'Seats': 'Seats', 'Unit': 'Units', 'Back Height': 'Back Height Options',
    'Arm Option': 'Arm Options', 'Shape': 'Shapes', 'Width': 'Widths',
    'Depth': 'Depths', 'Height': 'Heights', 'Table Colour': 'Table Colours',
    'Table Leg': 'Table Legs', 'Upholstery Colour': 'Colours',
    'Finish': 'Finishes', 'Frame Colour': 'Frame Colours',
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
    ('Privacy Booths & Pods', 'privacy-booths', 'office-seating',
     'Enclosed and open acoustic booths for meetings, calls and focused work.'),
    ('Modular Soft Seating', 'modular-seating', 'office-seating',
     'Modular sofa units and complete seating sets for breakout and collaboration '
     'spaces.'),
]


def _has(name, *words):
    low = name.lower()
    return any(w.lower() in low for w in words)


def categorise(sheet_category, listing_name):
    """(master category slug, [additional slugs]) - leaf categories only."""
    cat, name = sheet_category, listing_name
    if cat == 'Accessory':
        if _has(name, 'Power Module'):
            return 'power-modules-desktop-sockets', []
        if _has(name, 'Monitor'):
            return 'monitor-arms-mounts', []
        return 'seating-accessories', []
    if cat == 'Privacy Booths':
        return 'privacy-booths', []
    if cat == 'Modular Seating':
        return 'modular-seating', []
    if cat in ('Armchairs', 'Sofas', 'Ottomans', 'Swivel Armchair', 'Stools'):
        return 'soft-seating-tub-chairs', []
    raise SystemExit(f'no category mapping for {cat!r} (listing {listing_name!r}) - '
                     f'add a rule to categorise() in import_config.py')
