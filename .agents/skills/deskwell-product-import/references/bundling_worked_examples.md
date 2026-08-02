# Bundling: worked examples

Real cases from the July 2026 import of 9,694 variations. Each was got wrong first and
corrected, so they are the cases most worth checking a new plan against.

## Width is a choice, not a product

**Supplier gives**, as eleven groups:

```
Impulse 800mm Slimline Desk Cable Managed Leg
Impulse 1000mm Straight Desk Cable Managed Leg
Impulse 1000mm Slimline Desk Cable Managed Leg
... 1200 / 1400 / 1600 / 1800, Straight and Slimline
```

**Wrong:** eleven listings, or two (Straight, Slimline) each with a Width option.

**Right:** one listing.

```
Impulse Cable Managed Rectangular Desk
  Width       80cm, 100cm, 120cm, 140cm, 160cm, 180cm
  Depth       60cm, 80cm            <- "Slimline" is the 60cm one
  Finish      Beech ... White        (7)
  Leg Finish  Silver, Black, White
```

The Depth option is the whole reason "Slimline" disappears from the name. Four options,
one listing, 200+ variations. The catalogue already did this before the import; the
import initially produced *two* listings and had to be rebuilt.

## The measurement that stands in for the choice

**Supplier gives** two groups:

```
Italia Round Poseur Table Black Leg                    (heights 720mm, 1145mm)
Italia Round Poseur Table With Cross Base Black Leg    (heights 750mm, 1170mm)
```

**Wrong:**

```
Italia Round Poseur Table
  Width, Height (720 / 750 / 1145 / 1170mm), Finish, Frame Colour
```

Every SKU is distinct and nothing is duplicated, yet the buyer cannot tell that 750mm
means a cross base. The height difference is a *consequence* of the base and it silently
replaced the choice - because "Cross Base" was named by only one of the two groups, so the
axis looked non-varying and got dropped.

**Right:** fill the absent value (`Base: Standard Base`), which makes Base a real axis. The
listing then needs five options, so it splits on Base - exactly how the supplier grouped
it and how the site separates products:

```
Italia Round Poseur Table With Standard Base   Width, Height (720/1145), Finish, Frame Colour
Italia Round Poseur Table With Cross Base      Width, Height (750/1170), Finish, Frame Colour
```

The general lesson: order the axes so a thing a buyer picks is considered before a
measurement that follows from it, and treat "not mentioned" as a value in its own right.

## Splitting on the right axis

`Impulse Crescent Desk Workstation` needs six axes to keep 588 SKUs distinct: Width,
Pedestal Depth, Finish, Frame Colour, Hand, Leg Type. Two too many.

**Wrong:** split on Finish or Width. A buyer wanting a 160cm desk in oak finds seven
listings that each offer one finish.

**Right:** split on Leg Type first, then Hand - both read as different products, and the
site already keeps leg types apart:

```
Impulse Crescent Desk Workstation Cable Managed Leg Left Crescent
Impulse Crescent Desk Workstation Cable Managed Leg Right Crescent
Impulse Crescent Desk Workstation Cantilever Leg Left Crescent
...
Impulse Crescent Desk Workstation Panel End Leg     (frame colour is constant here, so
                                                     Hand stays an option - 4 in total)
```

Split preference, most-splittable first: Leg Type, Base, Power Data Module, Hand, Shape,
Frame Colour, Range, Height, ... and Finish last of all.

## Volta is an option, not a range

```
Impulse Boardroom Table With Silver Leg Frame
Impulse Volta Boardroom Table With Pop-up Power Module With Silver Leg Frame
```

**Right:** one listing with the module as a choice, matching what
`impulse-arrowhead-leg-boardroom-table` already does:

```
Impulse Boardroom Table With Leg Frame
  Width              180cm, 240cm
  Power Data Module  None, Pop-up Power Module
  Finish             (6)
```

Two traps. If the lift records "Power Data Module" but leaves the word "Volta" in the
stem, the groups never merge - strip the version word *and* record the option. And the
standalone `Volta Round Power Unit Module 1x Socket` accessories are their own products,
so only strip "Volta" mid-name; a name that starts with it is untouched.

## Attributes hiding in the product name

Nothing in the spec columns distinguishes these; the name is the only source.

| Supplier name | Option |
|---|---|
| `Sch! Acoustic Wall Panel - Bubbles - Buttercup Yellow` | Design: Bubbles |
| `... Workstation 600 Deep Desk High Pedestal` | Pedestal Depth: 60cm Deep |
| `Impulse 2000mm Open Shelves Cupboard Oak and White with Oak Doors` | Doors: Oak Doors |
| `Qube Locker 4 Door 1800mm High` | Doors: 4 Door |
| `Air ... B2B 4 Person Office Bench Desk` | Seats: 4 Person |
| `Phoenix Titan FS1283K Size 3 ... with Key Lock` | Size: Size 3, Locking: Key Lock |
| `Phoenix Commercial Key Cabinet KC0603E 100 Hook with Electronic Lock` | Hooks: 100 Hook |
| `Sch! Acoustic Wall Tile - Set of 4 - Bevelled Edge - Circle` | Edge: Bevelled Edge |

Two notes. A bench desk's `Width` column is the whole run (3620mm for six people) while
the name states the per-desk size - lift Width and Depth from the name for those, or the
buyer picks from a list mixing 1200mm with 4820mm. And Phoenix safes are sold by the
maker's own "Size 3", which beats the millimetres it works out to.

## Residue as a last resort

Anything in the name that no column and no lift explains can become a `Design` axis - this
is what catches the SCH! patterns (Blossom, Bubbles, Cube, Drift, Fan, ...).

Only trust it when **every** SKU in the listing has a residue. A residue that is blank for
some rows is leftover wording, not a choice, and produces options like `Design: (blank),
Edge, Edge Black`. Named lifts are always better; if residue is doing real work for a
whole listing, that is a hint to add a proper lift rule.

## The duplicate that a SKU check misses

The sheet spells one group `Impulse 1800mm Panel End Straigh Desk With Single Fixed
Pedestal`. Its 26 SKUs were genuinely absent from the site, so a SKU comparison found
nothing - but `impulse-panel-end-rectangular-desk-with-storage` already offers Width 180cm
and both pedestal options, and those 26 combinations were simply empty in its grid.

The right outcome is neither a new listing nor dropping the SKUs: it is 26 child rows
added to the existing listing, reusing option values that already exist. Same for `Impulse
Plus Oblong Screen With Rounded Corners - 300mm High`, a missing Height on a shape the
existing screens listing already sold.

So: normalise typos before matching, compare product families rather than SKUs, and when a
family collides, check whether the target listing's grid has room before deciding anything.

## Sanity checks on a finished plan

- Any listing whose name contains a width, where a sibling listing has a different one?
- Any option named for a measurement where two values differ by a hair (47.5 / 49.5cm)?
- Two listings differing only by a colour, a frame, or one word?
- Names with a dangling "With", or a word clearly eaten by a lift?
- Any option value blank, or reading `120 x 60cm` instead of separate Width and Depth?
- Every listing four options or fewer, every SKU on its own combination?
