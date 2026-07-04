# Handover: implement X-RAY / TRANSPARENCY + TICKER home sections

**Date:** 2026-07-04
**Author:** prior Claude session
**Goal:** Build the next two sections of the Deskwell concept onto the tester home page: the `<!-- X-RAY / TRANSPARENCY -->` section and the `<!-- TICKER -->` band. Match the concept (`deskwell-home-concept.html` in repo root) using Puck blocks + tester data, exactly as the hero was done.

---

## 1. Where things stand

The **hero** is done and committed (`9f73bb8`, local only, NOT pushed). It is assembled from core Puck blocks on the home page, not the monolith `Hero` block:

- `Section` (green gradient bg) → `Grid` 60/40 → left column: `Eyebrow` (pulse dot) · `Heading` (level `display`, `highlightText: "homework"`, `highlightMark: underline`) · `TextBlock` (size `md`, maxWidth `prose`) · `Group` of two `ButtonLink` · `Trustline`; right column: `ImageChipPanel` (holo frame: `framePadding md`, `frameBg gradient`, `gridPattern subtle`, `scanEffect on`, 3 chips).

Block settings added this round (all in `lib/puck/config.tsx`, render identically on editor + RSC paths):
- **Heading**: `highlightText` + `highlightMark` (recolour a word in `--color-primary` + solid mustard underline via `text-decoration`, colour `var(--color-heading-mark, #E3A857)`).
- **ImageChipPanel**: `framePadding` / `frameBg` / `gridPattern` / `scanEffect` (reuses the `Section` block's `cactus-section-grid-scan` + `cactus-section-scan-beam` CSS classes from `app/globals.css`).
- **TextBlock**: `size` (base/md/lg) / `maxWidth` (none/prose 46ch/wide 60ch) / `color` (secondary/muted/dark).

Styles token change already applied to the tester DB: `themeStyle.display` = Fraunces / weight `900` / size `clamp(2.75rem, 5.6vw, 4.25rem)` / line-height `1.05` / tracking `-0.02em` (this is what makes the headline scale fluidly - the site had no responsive typography before).

### ⚠️ Critical gotcha before you commit anything
`lib/puck/config.tsx` and `FIELD_NOTES.md` currently hold a **different agent's** uncommitted work: an RSC-config split (new untracked `lib/puck/config.rsc.tsx`, plus edits to `renderInfoPage.tsx` / `renderLayoutWithContent.tsx` and module pages that import `@/lib/puck/config.rsc`). **Do not `git add lib/puck/config.tsx` wholesale** - you would either drag in or break that refactor. This is a live multi-agent tree (`git worktree list` showed two other agent worktrees). To commit only your hunks, use the surgical recipe in the memory file `reference_config_tsx_parallel_refactor.md` (splice your changed regions onto `git show HEAD:file`, then `git apply --cached`). Better: **ask the user whether the RSC refactor has landed** before your commit, so you can just branch off a clean state.

---

## 2. The concept, extracted

Design tokens the concept uses (already mostly mirrored in the site's Styles): teal `#1A5F5A` = `--color-primary`; teal-dark `#12443F`; mustard `#E3A857`; n100 `#F2F1EE` (subtle bg); n300 `#D8D6D1` (border); n600 `#6B6A66` (muted); n900 `#2B2D30` (fg); Fraunces display, Inter body. **Use the site tokens (`--color-*`), never raw hex, in any new block chrome.**

### 2a. X-RAY / TRANSPARENCY section

Markup (concept lines ~302-338):

```html
<section class="xray" id="why">
  <div class="wrap">
    <div class="sec-head">
      <div class="sec-eyebrow">Full transparency</div>
      <h2>The whole spec sheet, before you even ask.</h2>
      <p>We came from inside this industry, where detail was held back to force a sales call. Deskwell publishes everything: dimensions, materials, load ratings, lead times, and one honest price. If we would not print it on the page, we should not be selling it.</p>
    </div>
    <div class="xray-grid">   <!-- 2 columns 1fr 1fr, gap 56px -->
      <div class="xcard">      <!-- product data panel -->
        <div class="xhead"><span class="dot t"></span><span class="dot"></span><span class="dot"></span><b>Aria Ergonomic Task Chair · full record</b></div>
        <table>
          <tr><td>Price (ex VAT)</td><td><b class="price">£249.00</b> <span class="same">✓ identical for every buyer</span></td></tr>
          <tr><td>Seat height</td><td>44 to 56cm, gas lift</td></tr>
          <tr><td>Weight capacity</td><td>150kg, tested BS 5459-2</td></tr>
          <tr><td>Materials</td><td>Recycled polyester mesh, PA frame</td></tr>
          <tr><td>Lead time</td><td>3 to 5 working days, live from supplier</td></tr>
          <tr><td>Warranty</td><td>5 years, mechanical parts</td></tr>
        </table>
      </div>
      <div class="beliefs">     <!-- 3 icon+title+text rows -->
        <div class="belief"><div class="glyph"><svg.../></div><div><h3>Everything shared</h3><p>Full specs and honest pricing on every product page. Buying stops being homework.</p></div></div>
        <div class="belief">... <h3>One price for all</h3><p>A ten person startup and a bluechip pay the same number. Nobody gets sized up.</p></div>
        <div class="belief">... <h3>Advice that serves you</h3><p>Space planning on every project, one desk or a whole floor, so you know it works before you buy.</p></div>
      </div>
    </div>
  </div>
</section>
```

Key CSS (concept lines ~119-138):
- `.xray` bg `--color-bg-subtle` (n100), border-top + border-bottom 1px `--color-border`.
- `.xcard` white bg, 1px border, radius 16px, shadow `sh2` (`0 4px 12px rgba(0,0,0,.1)`), overflow hidden.
  - `.xhead` row: 3 dots (first teal `.dot.t`, rest `--color-border`), then bold title; padding 14/20; border-bottom; faint teal gradient bg `linear-gradient(90deg, rgba(26,95,90,.05), transparent)`.
  - `table` full width; `td` padding 12/20, border-bottom `--color-bg-subtle`; first `td` muted, 44% width; last row no border. `.price` teal 16px bold. `.same` = green pill: bg `rgba(46,125,79,.1)`, colour `--color-success`, radius full, 3/10 padding, 12px 600.
- `.belief` flex gap 18, padding 22/24, radius, hover bg white + border. `.glyph` 46×46 teal rounded square, white icon, centred. `h3` Fraunces 500 22px. `p` muted 15px maxWidth 48ch.

### 2b. TICKER band

Markup (concept lines ~340-346):

```html
<div class="ticker-band">
  <div class="ticker">
    <span>One price for all</span><span>Every answer on the page</span><span>Direct from supplier to door</span><span>First click to long after delivery</span>
    <!-- same four repeated once more for a seamless loop -->
  </div>
</div>
```

CSS (concept lines ~140-145):
- `.ticker-band` teal bg (`--color-primary`), white text, border top+bottom 1px `--color-border`, padding 16px 0, `overflow:hidden`.
- `.ticker` flex, `white-space:nowrap`, `width:max-content`, `animation: tick 30s linear infinite`.
- `.ticker span` Fraunces 500 22px, padding 0 34px; `::after { content:"·"; color: mustard; }` as separator.
- `@keyframes tick { to { transform: translateX(-50%); } }` (needs the items duplicated so -50% loops seamlessly).

---

## 3. Block mapping - advance existing before creating new

Inspect these existing blocks first (`lib/puck/config.tsx`, render fns + field defs) and reuse/advance where close, only create new where there is no fit:

- **Section head** (`sec-eyebrow` + `h2` + `p`): reuse `Caption` (plain small label - the concept `sec-eyebrow` is plain text, NOT the pill `Eyebrow`) + `Heading` (h2) + `TextBlock` (size md, maxWidth wide). No new block needed.
- **Beliefs list** (icon + title + text rows): check **`FeatureList`** first - it likely already does icon+heading+body rows. If it supports a teal glyph square, reuse it; otherwise advance it (add a `glyph`/icon-style option). Avoid a brand-new block if FeatureList is close.
- **Spec data panel** (`.xcard`): no existing block fits (it is a windowed table with a dot title-bar + a "same price" pill). **New block, e.g. `SpecPanel`**: fields for panel title, an array of `{ label, value, badge? }` rows, optional "identical price" pill toggle, plus the same shadow/border/radius knobs `ImageChipPanel` already exposes. Model the array-of-rows on `ImageChipPanel.chips` / `Trustline.items` (array field, not a Puck slot).
- **Ticker**: no existing marquee block. **New block, e.g. `Ticker`/`Marquee`**: array of phrases, speed select, teal band. Add a `@keyframes cactus-ticker` + `.cactus-ticker*` classes to `app/globals.css` (same pattern as `cactus-scan-sweep`/`cactus-stagger-*` already there, ~line 1780+). Duplicate the items in render for the seamless -50% loop. Respect `prefers-reduced-motion` (globals.css already has a reduce block).

Any new block: register it in `puckConfig.components`, add to the right `categories` group (around line 1106), and remember `rscComponents` spreads `puckConfig.components` so a pure-presentational block gets the RSC path for free (only module/members blocks need explicit RSC overrides).

---

## 4. Workflow (reuse exactly what the hero pass used)

### Playwright compare
Dev server runs on `http://localhost:3000` (the user starts it; you may restart it). The public site is in **coming-soon** mode for anonymous visitors, so authenticate with the session cookie the user provided:

```
cactus_session = 962648f142f43862112925dabd89cc2a443d2861830ebbeec7723c2ce9acd087
```

(Domain `localhost`, path `/`, sameSite `Lax`. If it has expired and you get "Coming Soon", ask the user for a fresh `cactus_session` cookie.)

Playwright isn't in the project `node_modules`; symlink the npx cache into the scratchpad:
`ln -sfn /Users/chris/.npm/_npx/361ceb562f3b3235/node_modules <scratchpad>/node_modules` (v1.61.1, chromium already installed).

The compare script is at `<scratchpad>/shot.mjs` - it screenshots the concept (`file://…/deskwell-home-concept.html`) and the live site at 1280 / 900 / 480 widths with `reducedMotion: 'reduce'`, injecting the cookie for the live target and cache-busting the URL. Read the PNGs back to compare. There is also `shotpanel.mjs` for a tight element crop.

### Read / write tester data
The home page is `InfoPage` slug `home` (`bodyFormat: builder`); the Styles live in `SiteConfig.designTokens.themeStyle`. `DATABASE_URL` (`.env.local`) points at the **shared live Tester Neon DB** - editing home page content + Styles is sanctioned by the user, but do NOT run destructive DB actions or finish the setup wizard.

Prisma scripts must run **from the project root** (scratchpad can't resolve `@prisma/client`). Pattern used: write a `.mjs` in the repo root, run it, `rm` it. Read: dump `siteConfig.designTokens` + `infoPage(home).builderData`/`publishedData` to JSON. Write: `patchTree(data.content)` recursing all object keys (Puck slots are nested inline in props: `col1..col4`, `items`, `content`), patching nodes by `node.type`, then `prisma.infoPage.update` **both** `builderData` and `publishedData` (public render reads `publishedData`). Example patch scripts were `_tmp_update.mjs` / `_tmp_update2.mjs` (deleted; reconstruct from this pattern).

To add whole new blocks to the page you will need to append correctly-shaped nodes (`{ type, props: {…} }`, each with a unique `props.id` in Puck's `Type-xxxx` style) into the right slot array - copy the shape of an existing sibling node from the dumped JSON.

---

## 5. Constraints (from CLAUDE.md + project memory - all still apply)

- **No build / commit / push / release unless the user explicitly asks that turn.** `tsc --noEmit` and `eslint .` must still pass zero errors/warnings before you report done.
- **No local browser testing beyond the Playwright compare** (shared live DB). No Vercel deploy/poll.
- **Colours are tokens, never hex** in block chrome (`--color-*`). New text/surfaces must pass AA in light + dark.
- **Editor and RSC paths must produce identical markup** - keep new render fns in `lib/puck/config.tsx` so both paths share them (as the hero blocks do).
- Never hand-edit generated `lib/modules/router.ts` / `lib/puck/module-components.ts`.
- **Module isolation**: this is core work (home page + core blocks), so fine - but do not add module-specific code to `app/` or core.
- Update `FIELD_NOTES.md` (affected sections + Last-updated date) after adding blocks - surgically, given the entanglement above.
- British spelling, no em dashes, dry wit in any user-facing copy.
- Send Telegram progress pings at each checkpoint via `/Users/chris/.claude/telegram-bridge/send.sh "<plain text>"` (start / findings / fixes / done), short and jargon-free.

## 6. Suggested order
1. Playwright-screenshot the concept's X-RAY + TICKER regions for reference.
2. Inspect `FeatureList` / `Stats` / `Accordion` - decide reuse vs new.
3. Build the `SpecPanel` + `Ticker` blocks (+ globals.css ticker keyframe). tsc + eslint.
4. Append the section blocks to the home page `builderData`/`publishedData` and set Styles as needed (the xray section wants a subtle-bg `Section`; the belief glyph colour = primary).
5. Playwright compare desktop / tablet / mobile, iterate.
6. Update FIELD_NOTES. Report; do not commit/push unless asked.
