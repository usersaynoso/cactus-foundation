---
name: deskwell-sequence-description
description: >-
  Build or update a Deskwell / Cactus shop product's designed (Puck) description
  featuring feature videos with a title and supporting text - video on one side,
  text on the other on desktop (sides alternate on their own, video right
  first), stacking to text-above-video on phones, with rounded corners matching
  the product image. Works out which clip belongs to each section from the
  video filenames, so only titles and copy need supplying. Use whenever the
  user asks to add a video / animation to a product description, put text beside
  a video, swap which side the video sits on, add several feature sections to a
  product, or replace a product description with "the same treatment as the
  Eclipse Plus chair". Covers the exact JSON, database writes and multi-viewport
  verification.
---

# Deskwell feature-video product description

Produces a `shp_products.description_puck` document built from **FeatureVideo
blocks**: video one side, title + text the other, vertically centred against
each other, collapsing to text-above-video on phones. One block per feature,
stacked in the order the user gives them.

Data only - no code changes. The block does the layout.

**Scroll sequences are retired for this job.** The old recipe pinned a canvas
and scrubbed frames as you scrolled; it made each section a screen and a half
tall and needed a conversion pass per clip. Videos play in normal flow instead:
shorter page, no scrolljack, and the source mp4 is the only asset needed. The
`ScrollSequence` block still exists for anything that genuinely wants scrubbing
- just don't build product descriptions out of it any more.

## Do NOT build this out of a Grid

Tempting and wrong. A Grid column beside a video block does not collapse the
way this does (text first, then video, on a phone), and the two halves stop
being vertically centred against each other the moment the copy is longer than
the clip. `textSide` exists precisely so neither happens. One block, every
viewport.

## Inputs to collect

1. **Product**: slug or id in `shp_products`.
2. **Opening video** (optional, only when asked): one wide clip of the whole
   product that runs full width at the top, with the product's short
   description underneath it. See step 1a.
3. **Title** and **body text** per section (verbatim from the user).

That is the lot. The video for each section and the side it sits on are both
worked out here, not asked for - see below. Only chase the user when a title
matches no video, or matches two.

### Which video goes with which section

Match by filename. The clips live in the product's own media folder and are
named after the feature, so the section title is the lookup key:

```sql
SELECT "originalName", url FROM "Media"
WHERE url ILIKE '%/<product-slug-or-range-prefix>/%'
  AND (url ILIKE '%.mp4' OR url ILIKE '%.webm')
ORDER BY url;
```

Slugify the title (lower case, spaces to hyphens, drop punctuation) and match
it against the filename stem with the product/range prefix stripped:

- `Backrest Tilt Adjustment` → `backrest-tilt` → `…-backrest-tilt-adjustable.mp4`
- `Gas Height Adjustment` → `gas-height` → `…-height-adjustable.mp4`
- `Optional Height Adjustable Armrests` → `…-arm-height-adjustable.mp4`

Filenames use the supplier's adjective form (`adjustable`) where titles use the
noun (`adjustment`), and words like "Optional" appear in titles only, so match
on the **distinctive** words - `backrest tilt`, `arm height`, `seat tilt`,
`lumbar` - rather than demanding the whole string. Two rules:

- **Never guess.** No confident single match, or two clips look equally likely
  → stop and ask which one, quoting the candidates. A wrong clip beside the
  right words is worse than a question.
- Verify each chosen url resolves with a GET - the CDN answers 405 to HEAD.
- A scroll-sequence `manifest.json` handed over instead is the same path with
  the trailing folder replaced by `.mp4`; confirm it fetches before using it.

### Which side each video sits on

Alternate automatically, **video on the right first**:

| Section | 1 | 2 | 3 | 4 | 5 | … |
|---------|---|---|---|---|---|---|
| Video   | right | left | right | left | right | … |
| `textSide` | `left` | `right` | `left` | `right` | `left` | … |

The prop names where the **text** goes, so it is always the opposite of where
the video goes. A full-width opening video is not part of the alternation and
does not shift it - section 1 below it still puts its video on the right.

Only depart from this if the user asks for a specific arrangement, in which
case take their word per section. Swapping sides later is a one-word edit to
this single prop; nothing else moves.

## Deskwell constants

- `maxWidth: "600px"` caps the video on desktop; it self-limits to the column on
  narrower screens (the block applies `min(cap, 100%)`).
- `radius: "16px"` - the product image stage's own radius
  (`.spd-stage`, `modules/shop/components/puck/parts/detail-parts.tsx`). Keep
  them equal; the description should look like it belongs to the gallery above
  it.
- `frame: true` - hairline `--color-border` and a subtle background behind the
  clip, again matching the image stage. The studio clips are shot on white, so
  on a dark page the frame is what stops a clip reading as a stray white
  rectangle. Only turn it off for a clip with a genuinely transparent or
  full-bleed background.
- No `topOffset` and no `scrubScreens` - nothing pins any more, so the sticky
  header and tab bar (158px) never overlap the section.
- DB: root `.env` `DIRECT_URL`, psql at `/opt/homebrew/opt/libpq/bin/psql`.
- Live worked example: Eclipse Plus Deluxe
  (`eclipse-plus-deluxe-mesh-back-task-operator-office-chair`), six sections.

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

One `FeatureVideo` per feature in `content`, no Grid, no visibility duplicates:

```json
{
  "type": "FeatureVideo",
  "props": {
    "id": "FeatureVideo-<product>-<feature>-<hash>",
    "videoUrl": "<mp4 url>",
    "posterUrl": "",
    "title": "<title>",
    "body": "<body>",
    "textSide": "left",
    "maxWidth": "600px",
    "radius": "16px",
    "frame": true,
    "loop": true,
    "controls": false,
    "ariaLabel": "<what the video shows>",
    "padding": "default",
    "sticky": "off",
    "stickyOffset": "",
    "visibility": { "desktop": "false", "tablet": "false", "mobile": "false" },
    "animationType": "none",
    "animationDuration": "normal",
    "animationDelay": "none"
  }
}
```

Document shape: `{ "root": {"props": {}}, "zones": {}, "content": [ ...blocks ] }`.
Ready-made in `references/description-template.json`. Add further blocks
(Heading, SpecPanel) around them as ordinary content.

Note `visibility` strings: `"true"` means HIDE on that device - all `"false"`
here, since one block serves every screen.

### 1a. The opening video (when asked for one)

Some products lead with a single wide clip of the whole thing before the
feature sections start - "a full width video at the top". That is the same
block with the copy left out and the cap removed, followed by the product's
own `short_description` as a `TextBlock` sitting underneath it:

```json
[
  {
    "type": "FeatureVideo",
    "props": {
      "id": "FeatureVideo-<product>-hero-<hash>",
      "videoUrl": "<wide mp4 url>",
      "posterUrl": "",
      "title": "",
      "body": "",
      "textSide": "above",
      "maxWidth": "",
      "radius": "16px",
      "frame": true,
      "loop": true,
      "controls": false,
      "ariaLabel": "<what the video shows>",
      "padding": "none",
      "sticky": "off",
      "stickyOffset": "",
      "visibility": { "desktop": "false", "tablet": "false", "mobile": "false" },
      "animationType": "none",
      "animationDuration": "normal",
      "animationDelay": "none"
    }
  },
  {
    "type": "TextBlock",
    "props": {
      "id": "TextBlock-<product>-intro-<hash>",
      "content": "<the product's short_description, verbatim>",
      "align": "center",
      "size": "md",
      "maxWidth": "wide",
      "color": "",
      "padding": "default",
      "sticky": "off",
      "stickyOffset": "",
      "visibility": { "desktop": "false", "tablet": "false", "mobile": "false" },
      "animationType": "none",
      "animationDuration": "normal",
      "animationDelay": "none"
    }
  }
]
```

- Blank `maxWidth` is what makes it full width; the block reads a blank cap as
  `100%`. Leave `title`/`body` empty so no two-track row is built at all.
- Read the copy from `shp_products.short_description` and paste it verbatim -
  it is the same sentence that greets people higher up the page, so it should
  not be reworded here. Tidy double spaces, nothing else. If the product has
  no short description, skip the TextBlock rather than inventing copy.
- Wide hero clips are the heavy ones (16:9 masters run to tens of megabytes
  against ~4MB for a square feature clip). Check the file size before using
  one, and say so if it is fat: the block's lazy preload keeps it off the
  first paint, but it is still a big download for whoever scrolls that far.

### 1b. How playback works

Playback is automatic: muted, inline, looping, played when the section is on
screen and paused when it leaves. Nothing is fetched until the section is
within 400px of the viewport, which is what keeps six 4MB clips off the
critical path. Leave `controls: false` unless the user asks for a scrub bar.

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

`scripts/verify-viewports.mjs <productUrl> [count]` drives Playwright at
desktop, tablet and mobile, walks every video block in turn, and writes a
screenshot per block per viewport. **Look at them** - the in-app browser pane
returns solid black whenever it is hidden on the user's side, so its
screenshots prove nothing, and numbers alone have already missed content
sitting behind the sticky bars once.

Playwright is not a repo dependency. Run the script from a scratchpad dir with
it installed:

```bash
npm i playwright && npx playwright install chromium-headless-shell webkit
```

What to expect:

- **Desktop/tablet**: text midpoint level with the video midpoint; text on the
  requested side; video no wider than its half of the row; corner radius 16px;
  `playing: true` once the section is on screen.
- **Mobile**: text above the video, video full column width.
- Nothing should be pinned, and the page should be roughly a third the height
  of the old scroll-sequence version.

## Gotchas

- The clips are studio footage on white, **not** background-free like the old
  matted sequence frames. Never plan to overlay text on the video, and keep
  `frame: true` so it reads as a framed media card in dark mode.
- Six clips at ~4MB each is 24MB if they all load. The block's lazy preload is
  what stops that; do not "helpfully" set `preload="auto"` or add a poster for
  every section without checking weight.
- iOS only autoplays muted inline video. The block sets both; don't add sound.
- **Check the first frame before shipping a clip.** A video that fades up from
  black shows a black rectangle until playback starts - a second on a fast
  connection, longer on a phone. Test it:
  `ffmpeg -ss 0.2 -i clip.mp4 -vframes 1 f.png && magick f.png -colorspace gray -format "%[fx:mean]\n" info:`
  - a mean near 0 means it opens on black. Give that clip a `posterUrl` (grab a
  representative frame, upload it to the media library, paste its url) rather
  than leaving visitors a black box.
- An admin opening the product's pop-out description builder later edits this
  same document. **Feature video** sits in the Media category, and **Title and
  text position** is right there in the sidebar if they want to flip sides by
  hand.
- Telegram progress pings per the standing instruction: start, applied,
  verified.
