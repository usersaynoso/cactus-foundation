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
  Eclipse Plus chair". Also covers the case where the clips are not on the site
  yet and the user attaches them: optimising each one locally with the site's own
  encoder settings, uploading it to a video folder under the product's media
  folder, filing the library rows, and clearing the local source folder
  afterwards. Covers the exact JSON, database writes and multi-viewport
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

## When the user attaches the video files

Often the clips are not on the site yet - the user attaches them (or points at a
folder) along with the titles and copy. When that happens the job starts two
steps earlier, and **all three of these are part of the job, not extras to offer**:

1. **Optimise locally first, then upload.** Never upload the raw file and reach
   for the library's Optimise button afterwards.
2. **File them in a `video/` subfolder** of the product's own media folder.
3. **Delete the local source folder afterwards** - see step 0d.

The whole path is steps 0a to 0d below. Only then does the description get built.

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
- DB: root `.env` `DIRECT_URL`, psql at `/opt/homebrew/opt/libpq/bin/psql`. The
  size column on `Media` is `sizeBytes`; `size` does not exist.
- Verify against **`https://deskwell.co.uk/shop/products/<slug>`**.
  `dwoffice.furniture` answers 302 and is not worth pointing Playwright at.
- Media library constants: provider `B2`, served from
  `https://media.deskwell.co.uk/<key>`, `uploadedById`
  `cmre0g0qu0002ld04bknhyfy2`.
- Live worked examples: Eclipse Plus Deluxe
  (`eclipse-plus-deluxe-mesh-back-task-operator-office-chair`), six sections;
  Carter (`carter-high-back-black-leather-executive-office-chair-with-arms`),
  three sections, and the first job that uploaded its own clips; Classic
  (`classic-executive-office-chair-with-arms`), four sections, whose back-change
  clip is the reference case for a cross-fade through white reading as blank in
  the verification screenshots.

## Recipe

### 0a. Optimise the attached clips - locally, with the site's own settings

**Optimise before uploading, never after.** The library's Optimise button wakes
a Fly machine to download the file it was just handed, re-encode it and write it
back. Encoding the file already sitting on disk produces the identical bytes with
none of that - and when the encode turns out not to be worth keeping, the fat
version was never uploaded in the first place.

`scripts/optimise-videos.py` is a faithful copy of the worker
(`services/video-worker/video.py`) and the library's own quality ladder
(`lib/media/video-quality.ts`): CRF 23 "balanced", 1920 width cap, 30 fps cap,
x264 `slow`, High/4.1, yuv420p, `aq-mode=3`, faststart, metadata stripped, and a
silent audio track dropped.

```bash
python3 .claude/skills/deskwell-sequence-description/scripts/optimise-videos.py \
  <outDir> "/path/to/Product/"*.mp4
```

**Expect some feature clips to be rejected, and let them be.** The 5% minimum
saving is the worker's own rule: an encode that lands within 5% of its source is
not swapped in, because it trades a generation of quality for nothing. A short,
small, already tightly encoded feature clip comes back *bigger* from CRF 23 -
the report says `optimised: false`, the file is written as `.rejected.mp4`, and
**the original is what gets uploaded** (Carter: all three feature clips grew).

Two things do shrink hard, and the run is worth it for them alone:

- **The long whole-product hero**, every time (Carter 14.1 MB to 7.8 MB; Classic
  Cantilever 25.7 MB to 13.0 MB), usually dropping a silent AAC track with it.
- **Clips shot at 60 fps that also hold a lot of flat frames.** The 30 fps cap
  halves the frames before CRF touches them, and a fade through white or a static
  hold gives the encoder almost nothing to keep, so these fall off a cliff -
  Classic Cantilever's 1400x1400@60 "3 Colours" clip went 4.9 MB to 534 KB, and
  the Classic back-change clip 2.4 MB to 304 KB, both saving ~8x on clips the
  "features don't shrink" rule of thumb would have written off.

  60 fps on its own is **not** enough to predict it: Classic's tilt, height and
  weight-tension clips are the same 1400x1400@60 and all three still came back
  bigger. Do not try to guess which way a clip will go - the point of running the
  whole folder through is that the 5% rule decides, per file, for free.
  The `in`/`out` fields in the report show the fps change, so a source reading
  `@60.0` is a strong hint the encode will be kept.

That is not a failure and does not want reporting as one. The library says
"Already as small as it gets" and marks the item done, which is exactly what the
`optimised: true` flag in step 0c reflects.

### 0b. Upload to the product's `video/` folder

**One query gives you both the folder id and the key prefix.** Do not walk the
`Folder` tree with a recursive CTE and do not assemble the category path by hand
- any existing image on the product already knows both:

```sql
SELECT m."folderId",
       regexp_replace(m.key, '/[^/]+$', '') AS product_prefix
FROM "Media" m
WHERE m.url ILIKE '%/<product-slug>/%'
  AND m."mimeType" LIKE 'image/%'
LIMIT 1;
```

`folderId` is the parent for step 0c's `video` folder, and `product_prefix` +
`/video` is the storage prefix. (The size column is **`sizeBytes`** - a query
selecting `size` errors.)

Key shape, matching what a media-library upload builds today
(`buildLibraryUploadKey` - the **exact-name** form, no nanoid prefix):

```
media/shop/<category-path>/<product-slug>/video/<sanitised-filename>.mp4
```

Lower case, non-alphanumerics to hyphens, runs collapsed. Trim the trailing space
supplier filenames carry before the extension, or the key ends in a stray hyphen.

**The `.env` trap - this bites every time.** Do NOT `set -a && . ./.env`: a value
in there contains an unquoted `&` and zsh dies with `parse error near '&'` before
a single variable is set. Pull out just what is needed, quoted:

```bash
cd "/Users/chris/Git Local/Cactus"
eval "$(grep -E '^(B2_BUCKET_NAME)=' .env \
  | sed -E "s/^([A-Z_]+)=(.*)$/export \1='\2'/")"
rclone copyto "<local>" "b2s3:$B2_BUCKET_NAME/<key>" --no-traverse
```

`b2s3:` is a configured rclone remote (S3 endpoint, `no_check_bucket = true`
baked in) holding the live Deskwell credentials. `b2:` is the same account over
the native B2 backend. Use one of those two names and nothing else.

**Never invent or resurrect another B2 remote name.** The old `b2eu` / `b2old`
remotes belonged to closed accounts and Backblaze answered them with
`403 account_trouble - please log into your b2 account`, which reads like a
billing problem with the live account and is not one. They were removed on
2026-08-08. If a B2 command fails with `account_trouble`, the remote name is
wrong, not the account.

Verify every upload before going near the database - the CDN answers 405 to HEAD,
so ask for one byte and read the total off `Content-Range`:

```bash
curl -s -o /dev/null -D - -r 0-0 "https://media.deskwell.co.uk/<key>" \
  | grep -iE "^HTTP|content-range|content-type"
```

`206`, `video/mp4`, and a total matching the local file. Anything else, stop.

### 0c. File the library rows

`scripts/file-media.mjs` upserts the `video` folder under the product's own
`Folder` row and creates one `Media` row per clip. Read its header for the
manifest shape and why it has to be run from the repo root.

- The column is **`sizeBytes`**, not `size`, and it must be what actually sits in
  the bucket - the re-encoded size for a kept encode, the original size for a
  rejected one.
- `optimised: true` on **all** of them, rejected ones included. The platform does
  the same (`markVideoAlreadyOptimised`), so a done-and-pointless optimise is not
  offered again.
- `uploadedById` `cmre0g0qu0002ld04bknhyfy2`, provider `B2`, mime `video/mp4`.
- `originalName` is what step 1's clip matching reads, so keep it the supplier's
  readable filename (trailing space trimmed) - never the storage key.

### 0d. Delete the local source folder

Once every upload has verified and the rows exist, remove the clips **and the
folder holding them** - for Carter, the whole
`Deskwell/Products/Dynamic/Seating Videos/Carter/` directory. The files are on
the CDN and in the library; a second copy on the laptop is just a fork in the
road for whoever looks next.

Move it to the Trash rather than hard-deleting, so a mistake is recoverable:

```bash
osascript -e 'tell application "Finder" to delete POSIX file "/absolute/path/to/folder"'
```

**Only after the uploads verified.** Never before, and never if any clip came
back anything other than 206.

Do not try to confirm the move by listing `~/.Trash/<folder>` - without Full Disk
Access that answers `Operation not permitted`, which looks like a failure and
is not one. The `osascript` line prints the item's new Trash path on success;
that plus the source directory no longer existing is the confirmation.

**Step 0a's output directory is not part of this and must not be cleared.** The
re-encodes (and the `.rejected.mp4` copies, which are byte-identical encodes of
the clips whose originals got uploaded) stay in the scratchpad, so every clip
is still probeable with `ffmpeg`/`ffprobe` after the source folder has gone -
which is exactly what settles a suspicious-looking verification screenshot in
step 3 without downloading anything back off the CDN.

### 0. Safety first

- Read the product's current `description` and `description_puck`; save both
  to the scratchpad before touching anything.
- If `description_puck` already has content, show the user what is there and
  confirm replacement.
- If the plain `description` is junk (old iframe embeds and the like), replace
  it with a clean sentence or two of `<p>` - it is the fallback and feeds
  JSON-LD when `short_description` is empty. Never leave garbage in it.
  The usual supplier shape is a `cdn.dynamicos.co.uk` iframe plus a jQuery
  `<script>` pair plus an iframe-resizer loader - and then, tacked on the end, a
  `<ul>` of real spec bullets ("Two lever infinite lock any position mechanism",
  "Matching chrome 5 star base"). **Keep the bullets, bin the rest.** They are
  the only content in there, they are what the fallback is for, and they are
  usually one run-on `<li>` that wants splitting into one bullet per feature.

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
- **A short description that stops mid-sentence still gets pasted verbatim.**
  Several were truncated on the way in from the supplier - Classic Cantilever's
  ends "Bring some class to your office with the Classic", no "range." Finishing
  the sentence here would leave the description block and the top of the page
  disagreeing, and inventing supplier copy is not this job's call. Paste it as
  it is, then tell the user which product and quote the dangling end, so they
  can fix the field itself if they want to.
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

**Run it with the scratchpad as the working directory.** The shots are written
to the CWD, and the scratchpad is the one place an agent's sandboxed shell can
actually write. Point the output anywhere else - the skill directory especially
- and the write lands in the sandbox overlay instead: `ls` from that same shell
cheerfully lists the PNGs, the file-reading tools say the path does not exist,
and it reads like a broken script rather than a write you were never allowed to
make. Copy the script over and run it there if that is simpler:

```bash
cp .../scripts/verify-viewports.mjs ./verify.mjs && node ./verify.mjs <url>
```

`npm i playwright` is quick; the browser download usually is not needed at all -
check `ls ~/Library/Caches/ms-playwright/` first, since `chromium_headless_shell-*`
and `webkit-*` are normally already there from a previous product. The `npx
playwright install` line can also come back as
`[RTK:PASSTHROUGH] playwright parser: All parsing tiers failed` with the shell cwd
reset and no other output. That is the rtk wrapper failing to parse the command,
not the install failing. Look in the cache directory rather than re-running it.

**The screenshots land beside the script, inside this repo** - `scripts/d-0.png`
and friends, deliberately (the header explains why: `process.cwd()` comes back
percent-encoded from "Git Local" and the shots end up in a bogus tree). So they
show up in `git status` in a tree several agents share. Look at them, then
**delete them** before reporting:

```bash
rm -f .claude/skills/deskwell-sequence-description/scripts/[dtm]-*.png
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
  This is about *downloading*. Clips the user attached are already on disk and
  cost nothing to probe - `ffprobe` them, pull a first frame out of them, do
  whatever is useful, right up until step 0d clears the folder. Matching a clip
  to a section is still done on the filename either way.
- **A blank video box in the MOBILE screenshots is usually nothing.** WebKit
  reports `playing` while `currentTime` is still `0`, having not painted a frame
  by the time the screenshot fires, so the block renders as an empty rounded
  rectangle. Before chasing it: check whether the same clip has content in the
  desktop shot, and whether any *other* mobile section caught a later timestamp.
  Both true means playback is fine. Only if the clip really does open on an empty
  frame does the `posterUrl` remedy below apply - and while the source is still
  on disk, `ffmpeg -vf "select=eq(n\,0)" -vframes 1` settles it outright.
- **A ghosted, barely-visible product is usually the clip's own cross-fade, and
  is not a defect.** The "two options" / "back change" style clips swap one
  version of the chair for another by fading *through white*, and the studio
  background is white too, so a screenshot that lands mid-fade shows a faint
  outline in an otherwise empty frame - on desktop and mobile alike, since both
  viewports hit a similar timestamp. Two checks, in this order:
  1. Sample frames of the copy still sitting in step 0a's output directory -
     `for t in 0 0.5 1 1.5 2 2.5 3; do ffmpeg -v error -ss $t -i clip.mp4
     -vframes 1 frames/$t.png -y; done`. **The PNG file sizes alone identify it**
     before you open a single image: a near-white frame comes out a fraction of
     the size of a frame with the chair in it (35KB against 140KB on Classic).
  2. Open the biggest and the smallest. Chair solid black in one, ghost in the
     other, means the clip is fine and the fade is the point of it.
  Do not reach for `posterUrl` here - `t=0` has full content, so first paint is
  already correct. Say what it is in the report and move on. And do not blame the
  encoder: the Classic back-change clip legitimately compresses 2.4MB down to
  304KB precisely *because* half of it is nearly flat white.
- If a section does read as a black or blank box in the verification
  screenshots, that clip fades up from black. Fix it with a `posterUrl`: grab a
  representative frame, upload it to the media library, paste its url. Do not
  swap the clip out on your own initiative - tell the user which one it is.
- `PIL` is not installed and `signalstats`/`metadata=print` prints nothing useful
  through the shell here, so don't build a brightness-measuring pipeline. Frame
  PNG size plus reading the image is the whole toolkit.
- An admin opening the product's pop-out description builder later edits this
  same document. **Feature video** sits in the Media category, and **Title and
  text position** is right there in the sidebar if they want to flip sides by
  hand.
- Telegram progress pings per the standing instruction: start, applied,
  verified.
