---
name: deskwell-sequence-description
description: >-
  Build or update a Deskwell / Cactus shop product's designed (Puck) description
  featuring a scroll-sequence animation with a title and supporting text -
  animation on one side, text on the other on desktop (either way round),
  stacking to text-above-animation on phones. Use whenever the user asks to add
  a scroll sequence / animation to a product description, put text beside a
  sequence, swap which side the sequence sits on, or replace a product
  description with "the same treatment as the Eclipse Plus chair". Covers the
  exact JSON, offsets, database writes and multi-viewport verification.
---

# Deskwell sequence-with-text product description

Produces a `shp_products.description_puck` document whose whole body is **one
ScrollSequence block**: animation one side, title + text the other, vertically
centred against each other, collapsing to text-above-animation on phones. Copy
and animation fade in and out together because they live inside the block's
one faded stage.

Data only - no code changes. The block does the layout.

## Do NOT build this out of a Grid

Tempting and wrong. Text in a Grid column beside the block cannot fade with
the animation (the fade belongs to the block's own stage element), and on a
phone ordinary blocks above a pinned sequence scroll away within about 55px of
travel, so they read as invisible. `textSide` exists precisely so neither
happens. One block, every viewport.

## Inputs to collect

1. **Product**: slug or id in `shp_products`.
2. **Sequence manifest URL**: `https://media.deskwell.co.uk/media/.../manifest.json`
   (made via Media > video > Convert to scroll sequence). Verify it resolves
   with a GET - the CDN answers 405 to HEAD - and note `width`/`height`.
3. **Title** and **body text** (verbatim from the user).
4. **Side**: `textSide: "right"` (animation left, text right - the default
   house style) or `"left"` (animation right, text left). Swapping sides later
   is a one-word edit to this single prop; nothing else moves.

## Deskwell constants

- Sticky chrome = header (96px) + product tab bar (62px) = **158px**. Use
  `topOffset: "10.5rem"` (168px) - one value works on every viewport.
- **`scrubScreens: 1` always.** House rule, not a default worth revisiting.
- `maxWidth: "600px"` caps the animation on desktop; it self-limits to the
  column on narrower screens (the block applies `min(cap, 100%)`).
- DB: root `.env` `DIRECT_URL`, psql at `/opt/homebrew/opt/libpq/bin/psql`.
- Live worked example: Eclipse Plus Deluxe
  (`eclipse-plus-deluxe-mesh-back-task-operator-office-chair`).

## Recipe

### 0. Safety first

- Read the product's current `description` and `description_puck`; save both
  to the scratchpad before touching anything.
- If `description_puck` already has content, show the user what is there and
  confirm replacement.
- If the plain `description` is junk (old iframe embeds and the like), replace
  it with a clean sentence or two of `<p>` - it is the fallback and feeds
  JSON-LD when `short_description` is empty. Never leave garbage in it.

### 1. The block

One `ScrollSequence` in `content`, no Grid, no visibility duplicates:

```json
{
  "type": "ScrollSequence",
  "props": {
    "id": "ScrollSequence-<product>-<hash>",
    "sequenceUrl": "<manifest url>",
    "scrubScreens": 1,
    "loop": true,
    "fade": true,
    "maxWidth": "600px",
    "title": "<title>",
    "body": "<body>",
    "textSide": "right",
    "topOffset": "10.5rem",
    "ariaLabel": "<what the animation shows>",
    "visibility": { "desktop": "false", "tablet": "false", "mobile": "false" },
    "animationType": "none",
    "animationDuration": "normal",
    "animationDelay": "none"
  }
}
```

Document shape: `{ "root": {"props": {}}, "zones": {}, "content": [ ...that block ] }`.
Ready-made in `references/description-template.json`. Add further blocks
(Heading, SpecPanel, more sequences) after it as ordinary content.

Note `visibility` strings: `"true"` means HIDE on that device - all `"false"`
here, since the one block serves every screen.

### 2. Apply

Write the JSON to the scratchpad, validate with `python3 -m json.tool`, then:

```bash
cd "/Users/chris/Git Local/Cactus" && export $(grep "^DIRECT_URL" .env | head -1) && \
/opt/homebrew/opt/libpq/bin/psql "$DIRECT_URL" -v puck="$(cat <file>)" <<'SQL'
UPDATE shp_products SET description_puck = :'puck'::jsonb
WHERE slug='<slug>'
RETURNING jsonb_array_length(description_puck->'content');
SQL
```

psql variables do not interpolate through `-c`; use stdin/heredoc as above.
Product pages render fresh - no cache purge.

### 3. Verify - real screenshots, all three viewports

`scripts/verify-viewports.mjs <productUrl>` drives Playwright at desktop,
tablet and mobile, computes the mid-pin scroll position from the live spacer
height (so it holds at any scrub length), and writes four screenshots. **Look
at them** - the in-app browser pane returns solid black whenever it is hidden
on the user's side, and numbers alone have already missed content sitting
behind the sticky bars once.

What to expect:

- **Desktop/tablet**: animation top >= 158px; text midpoint level with the
  animation midpoint; text on the requested side; animation not wider than its
  half of the stage.
- **Mobile**: text above the animation, everything within one screen height.
- Dim copy while the block is scrolling into place is the shared fade working.

## Gotchas

- The animation's frames are background-free but the product usually fills the
  frame edge to edge - never plan to overlay text on the canvas. Check the
  poster's alpha bbox (`magick poster.webp -alpha extract -format "%@" info:`)
  before assuming otherwise.
- An admin opening the product's pop-out description builder later edits this
  same document; the block round-trips fine, and **Title and text position** is
  right there in the sidebar if they want to flip sides by hand.
- Telegram progress pings per the standing instruction: start, applied,
  verified.
