#!/usr/bin/env python3
"""Copy for the 2026-08-19 SEO product collections.

One entry per collection: the on-page name and description (plain text - the
Collection Header block renders it in a <p>, there is no HTML path), the meta
title and description, and the ultimate-seo focus keyword.

Focus keyword rules, per the existing keyword programme:
  - it must be a contiguous substring of the SCORED title, which is meta_title
    when set, so every keyword below reads straight out of its meta_title
  - normalisation is per word, so an ampersand in the title is NOT the word
    "and"; keywords are taken from a stretch of the title without one
  - unique site-wide, checked against seo_keywords_2026_08_19/keywords.tsv
"""

COLLECTIONS = [
    dict(
        slug='estate-agent-office-furniture',
        name='Estate Agent Office Furniture',
        description="Everything a branch needs, from the window display to the back office. Reception seating people do not mind waiting in, desks that photograph well, and a key cabinet so the Tuesday viewing does not begin with a search.",
        meta_title='Estate Agent Office Furniture | Reception, Desks & Key Cabinets',
        meta_description='Office furniture for estate agents: reception and client seating, desks, coffee tables, filing and lockable key cabinets, all in one place.',
        focus_keyword='estate agent office furniture',
    ),
    dict(
        slug='small-office-furniture',
        name='Small Office Furniture',
        description="For rooms where the tape measure has the final say. Compact desks, slimline pedestals, desk high cupboards and bookcases that suit a spare room, a shop back office, or a unit with more ambition than floor space.",
        meta_title='Small Office Furniture | Compact Desks, Pedestals & Storage',
        meta_description='Compact office furniture for small rooms: slimline desks, under desk pedestals, desk high storage and bookcases that fit where the big stuff will not.',
        focus_keyword='small office furniture',
    ),
    dict(
        slug='call-centre-furniture',
        name='Call Centre Furniture',
        description="Rows of desks, seating rated for the long shift, and enough acoustic screening that the person opposite can hear their own caller. Cable management included, because forty workstations of loose leads is nobody's idea of a good Monday.",
        meta_title='Call Centre Furniture | Bench Desks, Screens & 24 Hour Chairs',
        meta_description='Furniture for call and contact centres: bench desks, acoustic desk screens, 24 hour task chairs, monitor arms, booths and cable management.',
        focus_keyword='call centre furniture',
    ),
    dict(
        slug='medical-healthcare-furniture',
        name='Medical & Healthcare Furniture',
        description="Waiting rooms, treatment rooms and the reception desk in front of them. Wipe clean seating, chairs that stack for the busy clinics, lockable storage for the things that must not wander, and tables that take a cloth and a spray.",
        meta_title='Medical & Healthcare Furniture | Wipe Clean Waiting Room Chairs',
        meta_description='Healthcare furniture for surgeries, clinics and dental practices: wipe clean waiting room chairs, stacking seating, lockable storage and side tables.',
        focus_keyword='healthcare furniture',
    ),
    dict(
        slug='school-education-furniture',
        name='School & Education Furniture',
        description="Classrooms, halls, staff rooms and the exam cupboard. Chairs that stack without complaint, tables that fold flat, and trapezium tops that group up into whatever this term's layout happens to be.",
        meta_title='School & Education Furniture | Stacking Chairs & Folding Tables',
        meta_description='Education furniture for schools and colleges: stacking and folding chairs, training and trapezium tables, whiteboards, lockers and exam safes.',
        focus_keyword='education furniture',
    ),
    dict(
        slug='warehouse-industrial-furniture',
        name='Warehouse & Industrial Furniture',
        description="Built for the part of the building with a concrete floor. Hi rise draughtsman chairs for the packing bench, heavy duty seating, steel cupboards, lockers and key cabinets that shrug off a knock.",
        meta_title='Warehouse Furniture | Heavy Duty Chairs & Steel Storage',
        meta_description='Warehouse furniture for industrial units: hi rise draughtsman chairs, heavy duty seating, steel cupboards, staff lockers and anti fatigue matting.',
        focus_keyword='warehouse furniture',
    ),
    dict(
        slug='hotel-hospitality-furniture',
        name='Hotel & Hospitality Furniture',
        description="Bars, breakfast rooms, lounges and lobbies. Bistro tables, stools with backs on them, sofas that survive a season of guests, and a laptop safe for the rooms upstairs.",
        meta_title='Hotel & Hospitality Furniture | Bar Stools & Bistro Tables',
        meta_description='Hospitality furniture for hotels, cafés and bars: bistro tables, bar stools, lounge sofas, coffee tables, canteen chairs and cash safes.',
        focus_keyword='hospitality furniture',
    ),
    dict(
        slug='coworking-startup-furniture',
        name='Co-working & Startup Office Furniture',
        description="Shared floors that need to look deliberate rather than assembled. Bench desks that grow one workstation at a time, privacy booths for the call nobody else wants to hear, lockers, poseur tables and acoustic panels.",
        meta_title='Co-working & Startup Office Furniture | Bench Desks & Booths',
        meta_description='Startup office furniture for co-working spaces: bench desks, privacy booths, sit-stand desks, lockers, poseur tables and acoustic panels.',
        focus_keyword='startup office furniture',
    ),
    dict(
        slug='hot-desking-agile-working',
        name='Hot Desking & Agile Working',
        description="Desks nobody owns and everybody uses. Bench and sit-stand desks, staff lockers for the things people bring in, monitor arms, power modules, and tables on castors for when the layout changes again.",
        meta_title='Hot Desking Furniture | Agile Working Desks, Lockers & Power',
        meta_description='Hot desking furniture for agile offices: bench and sit-stand desks, staff lockers, monitor arms, desk power modules, booths and mobile tables.',
        focus_keyword='hot desking furniture',
    ),
    dict(
        slug='oak-office-furniture',
        name='Oak Office Furniture',
        description="Oak and grey oak run right through the ranges, so a desk, a pedestal, a cupboard and a meeting table can all arrive in the same finish. Warmer than white, and far more forgiving of a coffee ring.",
        meta_title='Oak Office Furniture | Oak Desks, Storage & Meeting Tables',
        meta_description='Oak office furniture in oak and grey oak finishes: desks, pedestals, cupboards, bookcases and meeting tables that match across the whole office.',
        focus_keyword='oak office furniture',
    ),
    dict(
        slug='walnut-office-furniture',
        name='Walnut Office Furniture',
        description="The dark end of the finish chart. Walnut desks, pedestals, cupboards and bookcases that match across the whole office, for anyone who finds white a little clinical.",
        meta_title='Walnut Office Furniture | Walnut Desks, Storage & Tables',
        meta_description='Walnut office furniture: walnut finish desks, under desk pedestals, cupboards, bookcases and meeting tables from the matching office ranges.',
        focus_keyword='walnut office furniture',
    ),
    dict(
        slug='white-office-furniture',
        name='White Office Furniture',
        description="The finish that makes a room look larger than the floor plan suggests. White desks, storage, screens and tables, plus white frames and legs wherever the range offers them.",
        meta_title='White Office Furniture | White Desks, Storage & Tables',
        meta_description='White office furniture: white desks, bench desks, pedestals, cupboards, meeting tables and screens, with white frames and legs where offered.',
        focus_keyword='white office furniture',
    ),
    dict(
        slug='black-office-furniture',
        name='Black Office Furniture',
        description="Black tops, black frames and black legs. The safe choice that quietly hides a decade of scuffs, across desks, seating, screens and storage.",
        meta_title='Black Office Furniture | Black Desks, Chairs & Storage',
        meta_description='Black office furniture: black finish desks, task and executive chairs, storage, screens and tables, with black frames and legs where offered.',
        focus_keyword='black office furniture',
    ),
    dict(
        slug='grey-office-furniture',
        name='Grey Office Furniture',
        description="Grey oak, graphite and anthracite, for offices that want warmth without committing to it. Desks, storage, seating and screens that go with almost any carpet, which is rather the point.",
        meta_title='Grey Office Furniture | Grey Oak Desks, Chairs & Storage',
        meta_description='Grey office furniture in grey oak, graphite and anthracite: desks, storage, seating, screens and tables that suit almost any office scheme.',
        focus_keyword='grey office furniture',
    ),
    dict(
        slug='high-gloss-glass-furniture',
        name='High Gloss & Glass Office Furniture',
        description="The showing-off end of the catalogue. High gloss boardroom tables, writable tops, glass desks and glass whiteboards, for rooms where the furniture is part of the pitch.",
        meta_title='High Gloss & Glass Office Furniture | Boardroom & Desks',
        meta_description='Glass office furniture and high gloss boardroom tables, writable dry wipe tops, glass standing desks, coffee tables and glass whiteboards.',
        focus_keyword='glass office furniture',
    ),
    dict(
        slug='office-chairs-for-back-pain',
        name='Office Chairs for Back Pain',
        description="Chairs built to be adjusted rather than endured. Adjustable lumbar support, independent seat and back, and posture mechanisms that people actually use, plus kneeling and sit-stand stools for a change of position.",
        meta_title='Office Chairs for Back Pain | Posture & Ergonomic Seating',
        meta_description='Office chairs for back pain: posture and ergonomic seating with adjustable lumbar support, independent seat and back tilt, and sit-stand stools.',
        focus_keyword='office chairs for back pain',
    ),
    dict(
        slug='office-chairs-with-headrest',
        name='Office Chairs with Headrest',
        description="High back chairs with the headrest included or offered as an option, plus the replacement headrests that bolt onto the chair already under you.",
        meta_title='Office Chairs with Headrest | Mesh & Leather High Back',
        meta_description='Office chairs with headrest: high back mesh, leather and ergonomic seating with headrests fitted or optional, plus replacement headrests.',
        focus_keyword='office chairs with headrest',
    ),
    dict(
        slug='leather-office-chairs',
        name='Leather Office Chairs',
        description="Bonded, faux, vegan and the real thing. Executive chairs, cantilever visitor chairs and task seating in wipeable leather and leather-look, for anyone who would rather not shop for fabric swatches.",
        meta_title='Leather Office Chairs | Executive, Visitor & Faux Leather',
        meta_description='Leather office chairs: bonded, faux and vegan leather executive chairs, cantilever visitor chairs and task seating in wipe clean finishes.',
        focus_keyword='leather office chairs',
    ),
    dict(
        slug='big-and-tall-office-chairs',
        name='Big and Tall Office Chairs',
        description="Seating tested well past the usual 110kg, and up to 250kg on some models. Wider seats, deeper padding and heavy duty mechanisms, for anyone who has heard a gas lift give up mid-sentence.",
        meta_title='Big and Tall Office Chairs | Heavy Duty Seating to 250kg',
        meta_description='Big and tall office chairs rated from 140kg to 250kg: heavy duty and 24 hour seating with wider seats, deeper padding and stronger mechanisms.',
        focus_keyword='big and tall office chairs',
    ),
    dict(
        slug='lockable-office-storage',
        name='Lockable Office Storage',
        description="Everything here takes a key. Lockable cupboards, filing cabinets, pedestals, lockers, key cabinets and safes, for the paperwork that should not be readable by whoever happens to be nearest.",
        meta_title='Lockable Office Storage | Cupboards, Filing Cabinets & Safes',
        meta_description='Lockable office storage: locking cupboards, filing cabinets, under desk pedestals, staff lockers, key cabinets and fireproof office safes.',
        focus_keyword='lockable office storage',
    ),
    dict(
        slug='stacking-space-saving-furniture',
        name='Stacking & Space Saving Furniture',
        description="Furniture that gets out of the way. Chairs that stack, tables that fold or flip, a trolley to move them, and mobile tops on castors for rooms asked to do three different jobs a week.",
        meta_title='Stacking & Space Saving Office Furniture | Folding Tables',
        meta_description='Space saving office furniture: stacking chairs, folding and flip-top tables, mobile tables on castors, chair trolleys and linking clips.',
        focus_keyword='space saving office furniture',
    ),
    dict(
        slug='recycled-sustainable-office-furniture',
        name='Recycled & Sustainable Office Furniture',
        description="Only the listings that actually say so. Chairs with recycled content in the shell, mesh or fabric, and acoustic screens and baffles made from recycled PET felt. No vague promises, just the ones we can point at.",
        meta_title='Recycled Office Furniture | Sustainable Chairs & Screens',
        meta_description='Recycled office furniture: task, meeting and executive chairs with recycled content, plus acoustic screens, tiles and baffles in recycled PET felt.',
        focus_keyword='recycled office furniture',
    ),
    dict(
        slug='solicitors-accountants-furniture',
        name='Solicitors & Accountants Office Furniture',
        description="The rooms clients get shown into, and the storage sitting behind them. Leather executive seating, boardroom tables, filing cabinets, tall cupboards and fireproof safes for the files that cannot be reprinted.",
        meta_title='Solicitors & Accountants Office Furniture | Boardroom & Filing',
        meta_description='Accountants office furniture and solicitors office furniture: executive leather chairs, boardroom tables, filing cabinets, cupboards and fire safes.',
        focus_keyword='accountants office furniture',
    ),
    dict(
        slug='church-village-hall-furniture',
        name='Church & Village Hall Furniture',
        description="For halls that are a coffee morning at ten and a committee meeting at seven. Chairs that stack high, folding and flip-top tables, a trolley to shift them, and a noticeboard for the rota.",
        meta_title='Church & Village Hall Furniture | Stacking Chairs & Trolleys',
        meta_description='Village hall furniture and church hall seating: stacking and folding chairs, folding and flip-top tables, chair trolleys and noticeboards.',
        focus_keyword='village hall furniture',
    ),
    dict(
        slug='executive-office-furniture',
        name='Executive Office Furniture',
        description="The corner office, fully catered for. High back leather seating, boardroom and meeting tables, credenzas and tall cupboards, in finishes that suggest the business has been going a while.",
        meta_title='Executive Office Furniture | Leather Chairs & Boardroom Tables',
        meta_description='Executive office furniture: high back leather chairs, boardroom and meeting tables, credenzas, tall cupboards and matching visitor seating.',
        focus_keyword='executive office furniture',
    ),
    dict(
        slug='training-room-furniture',
        name='Training Room Furniture',
        description="Rooms that get rearranged twice a day. Flip-top and folding tables, trapezium tops that group up, chairs that stack and link together, whiteboards, and a writing tablet for the note-takers.",
        meta_title='Training Room Furniture | Folding Tables & Stacking Chairs',
        meta_description='Training room furniture: flip-top and folding tables, mobile trapezium tables, stacking and linking conference chairs, whiteboards and trolleys.',
        focus_keyword='training room furniture',
    ),
    dict(
        slug='budget-office-furniture',
        name='Budget Office Furniture',
        description="The affordable end of every category, gathered in one place. Task and visitor seating, desk screens, small storage and tables for offices being fitted out against a number rather than a mood board.",
        meta_title='Budget Office Furniture | Affordable Desks, Chairs & Storage',
        meta_description='Budget office furniture: affordable task and visitor chairs, desk screens, small storage, tables and whiteboards for offices fitting out to a budget.',
        focus_keyword='budget office furniture',
    ),
]

if __name__ == '__main__':
    seen = set()
    for c in COLLECTIONS:
        assert c['slug'] not in seen, c['slug']
        seen.add(c['slug'])
        # The scored title is meta_title, so the keyword has to live inside it.
        assert c['focus_keyword'] in c['meta_title'].lower(), c['slug']
        print(f"{len(c['meta_title']):3d} {len(c['meta_description']):3d}  {c['slug']}")
    print(len(COLLECTIONS), 'collections')
