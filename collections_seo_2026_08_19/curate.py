#!/usr/bin/env python3
"""Curate the 2026-08-19 SEO product collections for Deskwell.

Reads master.json (built from the live catalogue) and applies one rule set per
collection. Rules are deliberately explicit rather than clever - a collection is
a hand-curated snapshot, so what matters is that the membership is readable and
re-runnable, not that the matcher is general.
"""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.environ.get('MASTER_JSON', os.path.join(HERE, 'master.json'))
P = json.load(open(MASTER))

def cats(p): return set(p['cats'])
def nm(p): return p['name'].lower()
def sd(p): return p['sd'].lower()
def opt(p, k): return [v.lower() for v in p['opts'].get(k, [])]
def allopts(p): return [v.lower() for k in ('Finish','Frame Colour','Leg Finish','Upholstery Colour','Back Colour') for v in p['opts'].get(k, [])]
def att(p, k): return [v.lower() for v in p['attrs'].get(k, [])]
def maxkg(p):
    vals = [int(m.group(1)) for v in att(p,'Maximum Weight Capacity') for m in [re.match(r'(\d+)kg', v)] if m]
    return max(vals) if vals else 0

CHAIR_CATS = {'computer-task-chairs','executive-office-chairs','mesh-office-chairs','ergonomic-office-chairs',
              'heavy-duty-24-hour-chairs','draughtsman-chairs-stools','cantilever-chairs','reception-visitor-chairs',
              'meeting-room-conference-chairs','stacking-folding-chairs','canteen-dining-chairs','bar-stools',
              'modular-seating','office-sofas-soft-seating'}
DESK_CATS = {'straight-rectangular-desks','corner-l-shaped-desks','bench-desks-workstations','height-adjustable-standing-desks'}
TABLE_CATS = {'meeting-room-boardroom-tables','training-room-tables','breakout-tables','caf-bistro-tables',
              'coffee-side-tables','poseur-bar-height-tables','folding-flip-top-tables'}
STORAGE_CATS = {'filing-cabinets','office-cupboards','office-pedestals','office-bookcases-shelving','staff-lockers',
                'office-safes-security','key-cabinets-cash-boxes','storage-accessories'}
PART_CATS = {'office-chair-parts-accessories','desk-extensions-spares','storage-accessories','cable-management'}

def has(p, *words):
    n = nm(p)
    return any(w in n for w in words)

def word(p, *words):
    """Whole-word name match. 'glass' must not fire on 'glass fibre', and
    'italia' must not fire on 'Italian Style'."""
    n = nm(p)
    return any(re.search(r'\b' + re.escape(w) + r'\b', n) for w in words)

RULES = {}
def rule(slug):
    def deco(fn):
        RULES[slug] = fn
        return fn
    return deco

# --- Sector collections -----------------------------------------------------

@rule('estate-agent-office-furniture')
def _(p):
    # A branch office: a smart front desk, chairs clients sit in, somewhere to
    # put the keys, and a window display. Not a warehouse and not a boardroom.
    c = cats(p)
    if has(p,'key cabinet','key box','key safe','key store','key deposit'): return True
    if c & {'reception-visitor-chairs'} and not has(p,'stacking','trolley'): return True
    if c & {'office-sofas-soft-seating'} and not has(p,'footstool','linking','stool'): return True
    if c & {'coffee-side-tables'} and has(p,'round','square','oblong'): return True
    if c & {'executive-office-chairs'} and p['from'] < 250: return True
    if c & {'straight-rectangular-desks'} and has(p,'cable managed','with storage','boutique','smart storage'): return True
    if c & {'whiteboards-noticeboards'} and has(p,'noticeboard','pin board','snap frame'): return True
    if c & {'meeting-room-boardroom-tables'} and has(p,'round','square'): return True
    if c & {'office-pedestals','filing-cabinets'}: return True
    return False

@rule('small-office-furniture')
def _(p):
    # Things that fit a spare room, a shop back office or a two-desk unit -
    # slimline, desk high, mobile, or simply small.
    c = cats(p)
    if has(p,'slimline','compact','single starter','one person','desk high','mobile','crescent'):
        if c & (DESK_CATS | STORAGE_CATS | TABLE_CATS): return True
    if c & {'office-pedestals','filing-cabinets','office-bookcases-shelving'}: return True
    if c & {'straight-rectangular-desks','corner-l-shaped-desks'}: return True
    if c & {'height-adjustable-standing-desks'} and has(p,'lite','piste','glass'): return True
    if c & {'coffee-side-tables'} and has(p,'round','square'): return True
    if c & {'monitor-arms-stands'}: return True
    if c & {'computer-task-chairs','mesh-office-chairs'} and p['from'] <= 120: return True
    if c & {'cable-management'} and has(p,'universal'): return True
    return False

@rule('call-centre-furniture')
def _(p):
    c = cats(p)
    if c & {'bench-desks-workstations'}: return True
    if c & {'desk-screens-office-dividers','acoustic-panels','cable-management'}: return True
    if c & {'office-pods-privacy-booths'}: return True
    if c & {'computer-task-chairs','mesh-office-chairs','ergonomic-office-chairs','heavy-duty-24-hour-chairs'}:
        if '24 hours' in att(p,'Recommended Usage'): return True
        if has(p,'24 hour','headrest','posture','ergonomic'): return True
    if c & {'monitor-arms-stands'}: return True
    if c & {'office-pedestals'} and has(p,'mobile'): return True
    return False

@rule('medical-healthcare-furniture')
def _(p):
    c = cats(p)
    n = nm(p)
    if 'washable' in n or p['flags'].get('wipeclean'): return True
    # Wipe-clean seating is the whole point of a waiting room, so vinyl, PU and
    # polyurethane qualify - woven fabric does not.
    if any(m in ' '.join(att(p,'Material (spec)')) for m in ('polyurethane','pu leather','pvc')) and c & CHAIR_CATS: return True
    if c & {'reception-visitor-chairs'} and has(p,'stacking','vinyl','pu','leather','shell','beech','wooden'): return True
    if c & {'stacking-folding-chairs'}: return True
    if c & {'office-sofas-soft-seating'} and has(p,'tub','cube','stool','modular'): return True
    if c & {'coffee-side-tables'} and has(p,'round','square','glass'): return True
    if has(p,'key cabinet','key box','key safe','key store','key deposit'): return True
    if c & {'office-safes-security'} and has(p,'compact','vela','titan','datacare'): return True
    if c & {'staff-lockers'}: return True
    if c & {'whiteboards-noticeboards'} and has(p,'noticeboard','pin board'): return True
    return False

@rule('school-education-furniture')
def _(p):
    c = cats(p)
    if c & {'stacking-folding-chairs','canteen-dining-chairs'}: return True
    if c & {'training-room-tables','folding-flip-top-tables'}: return True
    if c & {'whiteboards-noticeboards'}: return True
    if c & {'staff-lockers'}: return True
    if has(p,'exam paper','firechief','trolley','projection screen','trapezium'): return True
    if c & {'breakout-tables'} and has(p,'square','round','trapezium'): return True
    if c & {'draughtsman-chairs-stools'} and has(p,'hi rise','draughtsman'): return True
    return False

@rule('warehouse-industrial-furniture')
def _(p):
    c = cats(p)
    if c & {'draughtsman-chairs-stools'}: return True
    if c & {'heavy-duty-24-hour-chairs'}: return True
    if maxkg(p) >= 150 and c & CHAIR_CATS: return True
    if has(p,'heavy duty','hi rise','anti fatigue','trolley'): return True
    if c & {'staff-lockers'}: return True
    if c & {'office-cupboards','filing-cabinets','storage-accessories'} and has(p,'qube','steel','tambour'): return True
    if has(p,'key cabinet','key box','key safe','key store'): return True
    if c & {'whiteboards-noticeboards'} and has(p,'weatherproof','outdoor','planner'): return True
    return False

@rule('hotel-hospitality-furniture')
def _(p):
    c = cats(p)
    if c & {'bar-stools','canteen-dining-chairs','caf-bistro-tables','poseur-bar-height-tables'}: return True
    if c & {'office-sofas-soft-seating'} and not has(p,'footstool','linking'): return True
    if c & {'coffee-side-tables'}: return True
    if has(p,'hotel','laptop and tablet security','cash box','day deposit','note deposit','under counter'): return True
    if c & {'reception-visitor-chairs'} and has(p,'timber','beech','wooden','sled','shell'): return True
    return False

@rule('coworking-startup-furniture')
def _(p):
    c = cats(p)
    if c & {'bench-desks-workstations','office-pods-privacy-booths','modular-seating'}: return True
    if c & {'poseur-bar-height-tables','breakout-tables'}: return True
    if c & {'desk-screens-office-dividers','acoustic-panels'}: return True
    if c & {'height-adjustable-standing-desks'}: return True
    if c & {'staff-lockers'}: return True
    if c & {'desk-power-modules-sockets'}: return True
    if c & {'office-sofas-soft-seating'} and has(p,'stool','modular','cube'): return True
    return False

@rule('hot-desking-agile-working')
def _(p):
    # Desks nobody owns, somewhere to leave your things, and the power and
    # screens that make a shared desk usable.
    c = cats(p)
    if c & {'bench-desks-workstations','height-adjustable-standing-desks'}: return True
    if c & {'staff-lockers','office-pods-privacy-booths'}: return True
    if c & {'desk-power-modules-sockets','monitor-arms-stands'}: return True
    if c & {'desk-screens-office-dividers'} and has(p,'desktop','divider','back-to-back'): return True
    if c & (TABLE_CATS | {'office-pedestals'}) and has(p,'mobile','castors','flip-top','flip top','folding'): return True
    return False

# --- Finish and material collections ---------------------------------------

def finish_rule(*words):
    def fn(p):
        f = opt(p,'Finish') + opt(p,'Leg Finish')
        if any(any(w == v or w in v for w in words) for v in f): return True
        n = nm(p)
        return any(w in n for w in words)
    return fn

RULES['oak-office-furniture'] = finish_rule('oak')
RULES['walnut-office-furniture'] = finish_rule('walnut')

FURNITURE_CATS = CHAIR_CATS | DESK_CATS | TABLE_CATS | STORAGE_CATS | {
    'desk-screens-office-dividers','office-pods-privacy-booths','acoustic-panels','whiteboards-noticeboards'}

@rule('white-office-furniture')
def _(p):
    if not cats(p) & FURNITURE_CATS: return False
    f = opt(p,'Finish') + opt(p,'Frame Colour') + opt(p,'Leg Finish')
    if any('white' in v for v in f): return True
    return 'white' in nm(p)

@rule('black-office-furniture')
def _(p):
    # Black is available on nearly everything, so this asks for black as a
    # headline choice - named in the listing or offered as a finish or frame.
    if not cats(p) & FURNITURE_CATS: return False
    f = opt(p,'Finish') + opt(p,'Leg Finish')
    if any('black' in v for v in f): return True
    return 'black' in nm(p)

@rule('grey-office-furniture')
def _(p):
    if not cats(p) & FURNITURE_CATS: return False
    f = opt(p,'Finish') + opt(p,'Leg Finish')
    if any('grey' in v or 'graphite' in v or 'anthracite' in v for v in f): return True
    return has(p,'grey','graphite','anthracite')

@rule('high-gloss-glass-furniture')
def _(p):
    if has(p,'high gloss','black ice'): return True
    if word(p,'glass','italia','acrylic'): return True
    mat = ' '.join(att(p,'Material (spec)'))
    # "Glass Fibre" is a chair shell, not a glass top.
    return bool(re.search(r'\bglass\b(?! fibre)', mat))

# --- Chair need collections -------------------------------------------------

@rule('office-chairs-for-back-pain')
def _(p):
    c = cats(p)
    if not (c & CHAIR_CATS or c & {'office-chair-parts-accessories'}): return False
    # A replacement arm is not a back-pain answer; a lumbar support is.
    if c & {'office-chair-parts-accessories'} and not has(p,'lumbar'): return False
    if c & {'ergonomic-office-chairs'}: return True
    if has(p,'posture','ergonomic','lumbar','chiro','kneeling','sit stand','waterfall','24 hour'): return True
    if 'Yes' in p['attrs'].get('Adjustable Lumbar Support', []): return True
    if 'Yes' in p['attrs'].get('Integral Lumbar Support', []) and 'Yes' in p['attrs'].get('Height Adjustable Back', []): return True
    if 'Yes' in p['attrs'].get('Seat Slide', []) and 'Yes' in p['attrs'].get('Synchro Tilt', []): return True
    return False

@rule('office-chairs-with-headrest')
def _(p):
    c = cats(p)
    if has(p,'headrest'): return True
    if 'Yes' in p['attrs'].get('Headrest Included', []) and c & CHAIR_CATS: return True
    if 'Headrest' in p['opts'] and c & CHAIR_CATS: return True
    return False

@rule('leather-office-chairs')
def _(p):
    c = cats(p)
    if not (c & CHAIR_CATS): return False
    mat = ' '.join(att(p,'Material (spec)'))
    if any(w in mat for w in ('leather','polyurethane','pu','faux')): return True
    return has(p,'leather','pu ','vinyl')

SWIVEL_CHAIR_CATS = {'computer-task-chairs','executive-office-chairs','mesh-office-chairs','ergonomic-office-chairs',
                     'heavy-duty-24-hour-chairs','draughtsman-chairs-stools','cantilever-chairs','reception-visitor-chairs',
                     'meeting-room-conference-chairs','stacking-folding-chairs'}

@rule('big-and-tall-office-chairs')
def _(p):
    # Sofas and footstools carry big weight ratings too, and are not what
    # anyone searching this means.
    c = cats(p)
    if not (c & SWIVEL_CHAIR_CATS): return False
    if maxkg(p) >= 140: return True
    return has(p,'heavy duty','24 hour','extra large','bariatric')

# --- Feature collections ----------------------------------------------------

@rule('lockable-office-storage')
def _(p):
    c = cats(p)
    if 'Yes' in p['attrs'].get('Lockable', []): return True
    if c & {'office-safes-security','key-cabinets-cash-boxes','staff-lockers','filing-cabinets'}: return True
    if has(p,'lockable','locking','lock'): return True
    if 'Locking' in p['opts'] and c & STORAGE_CATS: return True
    return False

@rule('stacking-space-saving-furniture')
def _(p):
    c = cats(p)
    if c & {'stacking-folding-chairs','folding-flip-top-tables'}: return True
    if 'Yes' in p['attrs'].get('Stackable', []): return True
    if p['flags'].get('stackword') and c & CHAIR_CATS: return True
    if has(p,'stacking','stackable','folding','flip-top','flip top','nest','trolley'): return True
    if c & {'training-room-tables','breakout-tables'} and has(p,'mobile','castors'): return True
    return False

@rule('recycled-sustainable-office-furniture')
def _(p):
    # Evidence-led: the listing copy has to actually claim recycled content.
    # Guessing from a range name would put unearned green claims on a page.
    return bool(p['flags'].get('recycled'))

@rule('solicitors-accountants-furniture')
def _(p):
    # Professional services: a room clients are shown into, files that lock and
    # paperwork that survives a fire.
    c = cats(p)
    if c & {'executive-office-chairs'}: return True
    if c & {'filing-cabinets','office-cupboards','office-bookcases-shelving'}: return True
    if c & {'meeting-room-boardroom-tables'}: return True
    if p['flags'].get('fireproof') or has(p,'fireproof','document','data safe','deposit'): return True
    if c & {'cantilever-chairs'} and has(p,'leather','executive'): return True
    if c & {'coffee-side-tables'} and has(p,'italia','high gloss'): return True
    return False

@rule('church-village-hall-furniture')
def _(p):
    # Chairs that stack, tables that fold, and the trolley that moves them.
    c = cats(p)
    if c & {'stacking-folding-chairs','folding-flip-top-tables'}: return True
    if p['flags'].get('stackword') and c & CHAIR_CATS: return True
    if has(p,'trolley','linking clip','writing tablet','banqueting','noticeboard','pin board'): return True
    if c & {'canteen-dining-chairs','breakout-tables'}: return True
    if c & {'whiteboards-noticeboards'} and has(p,'noticeboard','pin board','snap frame','cork'): return True
    return False

@rule('executive-office-furniture')
def _(p):
    c = cats(p)
    if c & {'executive-office-chairs'}: return True
    if has(p,'executive','boardroom','credenza','chesterfield'): return True
    if c & {'meeting-room-boardroom-tables'}: return True
    if c & {'office-cupboards'} and has(p,'high gloss','tall','desk high'): return True
    return False

@rule('training-room-furniture')
def _(p):
    c = cats(p)
    if c & {'training-room-tables','folding-flip-top-tables'}: return True
    if c & {'meeting-room-conference-chairs','stacking-folding-chairs'}: return True
    if c & {'whiteboards-noticeboards'}: return True
    if has(p,'training','writing tablet','linking clip','trolley','trapezium'): return True
    return False

@rule('budget-office-furniture')
def _(p):
    # Priced off the cheapest variation, so a listing qualifies if there is a
    # real way to buy it under the ceiling - not because one obscure option is.
    c = cats(p)
    if c & PART_CATS: return False
    if c & {'office-chair-mats','desk-power-modules-sockets'}: return False
    return p['from'] <= 120 and bool(c & (CHAIR_CATS | DESK_CATS | TABLE_CATS | STORAGE_CATS | {'desk-screens-office-dividers','whiteboards-noticeboards','monitor-arms-stands'}))

def build():
    out = {}
    for slug, fn in RULES.items():
        members = [p for p in P if fn(p)]
        members.sort(key=lambda p: p['name'])
        out[slug] = members
    return out

if __name__ == '__main__':
    built = build()
    which = sys.argv[1] if len(sys.argv) > 1 else None
    for slug, members in built.items():
        if which and which != slug: continue
        print(f"\n=== {slug}  ({len(members)}) ===")
        if which:
            for m in members: print('   ', m['name'])
