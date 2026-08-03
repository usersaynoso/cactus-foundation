---
name: deskwell-sequence-description
description: >-
  Build or update a Deskwell / Cactus shop product's designed (Puck) description
  featuring feature videos with a title and supporting text - opening with a
  full-width video of the whole product above the short description, then video
  on one side, text on the other on desktop (sides alternate on their own, video
  right first), stacking to text-above-video on phones, with rounded corners
  matching the product image. Works out which clip belongs to each section from
  the video filenames alone, so only titles and copy need supplying. Use whenever the
  user asks to add a video / animation to a product description, put text beside
  a video, swap which side the video sits on, add several feature sections to a
  product, or replace a product description with "the same treatment as the
  Eclipse Plus chair". Covers the exact JSON, database writes and multi-viewport
  verification.
---

# Deskwell feature-video product description

Produces a `shp_products.description_puck` document built from **FeatureVideo
blocks**: a full-width video of the whole product at the top with the short
description under it, then one block per feature - video one side, title + text
the other, vertically centred against each other, collapsing to text-above-video
on phones. Features run in the order the user gives them.

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
2. **Title** and **body text** per section (verbatim from the user).

That is the lot. Everything else is worked out here, not asked for: which clip
belongs to each section, which side it sits on, and the opening video. Only
chase the user when a title matches no video, or matches two.

**The opening video is not optional and is never asked about.** Every product
description opens with the whole-product clip running full width, with the
product's `short_description` underneath it - see step 1a. That is the house
style (Eclipse Plus, Academy), not a per-product decision. It is the clip whose
`originalName` is the plain product name with no feature words after it -
`Academy Visitor Chair.mp4`, `Eclipse Plus III Deluxe Mesh Back.mp4`. Only
skip it if no such clip exists, and say so.

### Which video goes with which section

**Filenames decide this. Nothing else.** Do not download a clip, do not extract
frames, do not open one to see what it shows. Read `originalName` out of the
database, match it against the section title, done. Fetching five videos to
squint at thumbnails costs minutes and disk to answer a question the filename
already answered - and where the filename genuinely does not answer it, looking
at frames is not the fix either. **Ask.**

Match on **`originalName`**, and take the url from the same row. Never build a
url by hand from a filename, and never reuse one from a previous version of the
document:

```sql
SELECT "originalName", url FROM "Media"
WHERE url ILIKE '%/<product-slug>/%'
  AND (url ILIKE '%.mp4' OR url ILIKE '%.webm')
ORDER BY "originalName";
```

`originalName` is the supplier's own filename, whole and readable. The **url is
not** - re-uploading or moving a clip gives it a nanoid prefix and truncates the
name to fit the key, so the same video reads as
`…/video/Qwc646TXZRBE9bWLuMQKU-eclipse-plus-iii-deluxe-mesh-backrest-ti.mp4`.
Matching on that stem would put the tilt clip and the height clip within two
characters of each other, which is a coin toss, not a match.

Slugify the title (lower case, spaces to hyphens, drop punctuation) and match
it against `originalName`:

- `Backrest Tilt Adjustment` → `Eclipse Plus III Deluxe Mesh Backrest Tilt Adjustable.mp4`
- `Gas Height Adjustment` → `Eclipse Plus III Deluxe Mesh Height Adjustable.mp4`
- `Optional Height Adjustable Armrests` → `Eclipse Plus III Deluxe Mesh Arm Height Adjustable.mp4`

Filenames use the supplier's adjective form (`adjustable`) where titles use the
noun (`adjustment`), and words like "Optional" appear in titles only, so match
on the **distinctive** words - `backrest tilt`, `arm height`, `seat tilt`,
`lumbar` - rather than demanding the whole string. Two rules:

- **Never guess, and never go looking.** No confident single match, or two clips
  look equally likely → **stop and ask the user which one**, quoting the
  candidate filenames. Do not try to break the tie by downloading them and
  inspecting frames. A wrong clip beside the right words is worse than a
  question, and a question costs one message.
- Verify each chosen url resolves with a GET - the CDN answers 405 to HEAD.
  `curl -s -o /dev/null -w "%{http_code}" -r 0-1 <url>` requests one byte, not
  the file. Costs a second, catches a moved library before the customer does.

**Moved or re-uploaded clips break the description silently.** The page keeps
rendering, each block just 404s its video. If sections have gone blank, or the
owner mentions tidying the media library, re-run the query above and rewrite
every `videoUrl` from `originalName` - do not patch the paths by hand. A
`video/` (or any other) subfolder appearing in the middle of the key is exactly
this, and the old urls will be answering 404.

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

### 1. The feature block

One `FeatureVideo` per feature, no Grid, no visibility duplicates. These follow
the two opening blocks from step 1a - `content` always ends up as:

```
[0] FeatureVideo  - whole-product clip, full width, no copy
[1] TextBlock     - short_description
[2] FeatureVideo  - feature 1, textSide "left"
[3] FeatureVideo  - feature 2, textSide "right"
…
```


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

### 1a. The opening video - ALWAYS, and always first

**Every description opens with it.** The first two blocks of `content` are the
whole-product clip running full width, then the product's `short_description`
underneath it. Feature sections start at block index 2. This is not a thing to
ask about or offer; it is what a Deskwell product description looks like.

It is the same `FeatureVideo` block with the copy left out and the cap removed,
followed by a `TextBlock`:

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
  `100%`. `padding: "none"` too - the TextBlock below carries the spacing.
  Leave `title`/`body` empty so no two-track row is built at all.
- Read the copy from `shp_products.short_description` and paste it verbatim -
  it is the same sentence that greets people higher up the page, so it should
  not be reworded here. Tidy double spaces, nothing else. If the product has
  no short description, skip the TextBlock rather than inventing copy.
- Wide hero clips are the heavy ones (16:9 masters run to tens of megabytes
  against a few MB for a square feature clip). If you want the number, read it
  off the `Content-Range` header of a one-byte request - never by downloading
  the file:
  `curl -s -o /dev/null -D - -r 0-0 <url> | grep -i content-range`
  Worth mentioning to the user if it is fat, but not worth blocking on: the
  block's lazy preload keeps it off the first paint either way.

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
- **Never download the clips.** Not to match them to sections, not to check
  their opening frame, not to measure them. The verification step already looks
  at the real page in a real browser, which is where a genuinely black or broken
  clip shows up anyway - and it shows up in context, at the right size, on the
  right background. Pulling 20MB of mp4 to the scratchpad to answer questions
  the filename and the screenshots already answer is wasted time.
- If a section does read as a black or blank box in the verification
  screenshots, that clip fades up from black. Fix it with a `posterUrl`: grab a
  representative frame, upload it to the media library, paste its url. Do not
  swap the clip out on your own initiative - tell the user which one it is.
- An admin opening the product's pop-out description builder later edits this
  same document. **Feature video** sits in the Media category, and **Title and
  text position** is right there in the sidebar if they want to flip sides by
  hand.
- Telegram progress pings per the standing instruction: start, applied,
  verified.
