# Handover: Google Sheet Pull reports "no changes" when the sheet clearly differs

## The task
On the Cactus platform, the `google-sheet-products-for-shop` module mirrors the shop
catalogue into a Google Sheet, then a **Pull** imports edits back. A site owner edits a
product row in the sheet and Pulls; the Pull's confirm dialog says **"Your sheet already
matches your shop - nothing to pull"** (zero updates), even though the row was edited.
This persists after pressing **"Check again"**. Diagnose properly and fix.

The previous agent (me) shipped three module releases that did NOT fix it. Treat my
conclusions as unverified. Reproduce from scratch.

## Exact symptom
- Owner flow: **Push** the sheet, **edit** a product row, **Pull** -> "zero updates".
- Test product: `chiro-plus-high-back-ergonomic-posture-24-hour-office-chair`
  (id `7f8c06e7-b2cc-49bb-bea8-33f9e08e3e57`), a variable product (~575 variations across
  4 parent products in this catalogue).
- Edits the owner made in the sheet: cleared `price`, `retail_price`, `cost_price`,
  `image_alt`; set `tax_class=VAT`, `Markup=6`.

## Ground truth (verified 2026-07-26, live Deskwell site)
- **DB** (`db.dwoffice.furniture`): price=`499.00`, retail_price=`999.00`,
  cost_price=`456.00`, tax_class_id=`NULL`, catalogue_hidden=`false`, sku empty.
- **Sheet** (public, gid `1454525855` = Products tab; confirmed via CSV export AND gviz):
  price=`null`, retail_price=`null`, cost_price=`null`, image_alt=`null`,
  tax_class=`"vat"`, Markup=`6`.
- So the sheet genuinely differs from the DB -> a correct Pull MUST detect an update
  (tax_class set, retail/cost cleared, image_alt cleared, Markup set).
- `gsp_connection.last_pull_at` = **2026-07-25 13:04** and has NOT advanced -> every
  recent "Pull"/"Check again" the owner ran hit the **read-only preview** (`/pull/preview`)
  and reported nothing; no pull job ran. `last_push_at` = 2026-07-25 22:13:58.

## THE CRUX - an unexplained contradiction
- Running the **actual** `diffProductRows` (working-tree code) against the **live DB** +
  **live sheet grid** returns `kind:'update'` with changes
  `[retail_price 999->'', cost_price 456->'', tax_class ''->vat, image_alt '|'->'']`.
  (Repro harness below - it works and prints this.)
- The **live site's** Pull preview returns **zero** on the same DB + same sheet.
- Owner says all deployments are up to date, and the "Check again" button is present.

Same data, opposite results. The most likely explanation is **the code executing on the
owner's environment is not the code I verified.** Nail this down FIRST.

## Module deploy mechanism (read this before touching anything)
- `/modules` is gitignored. At build, `scripts/checkout-modules.mjs` clones each module at
  the **tag pinned in root `modules.json`** - NOT `main`, NOT the working tree.
- Current pins in `modules.json`: `google-sheet-products-for-shop v0.1.37`, `shop v0.1.118`.
- I RELEASED `gsp v0.1.38/0.1.39/0.1.40` and `shop v0.1.120` but did **not** bump the
  `modules.json` pins. So a normal core build still ships the OLD `v0.1.37 / v0.1.118` code.
- **Contradiction to resolve:** the "Check again" button only exists from `gsp v0.1.38+`.
  If the owner sees it, their environment is running newer-than-pinned code (local dev off
  the working tree? a manual pin bump on another checkout? a preview deploy?). Figure out
  exactly which `gsp` version is executing and against which `DATABASE_URL`.

## What the deployed (pinned v0.1.37) diff does with this row
`lib/pull-diff.ts` at v0.1.37 checks `price` for EVERY row before the existing-product
lookup: a blank price -> `kind:'error'` ("Missing or invalid price"). In `preview.ts` an
error row goes to `rowErrors`, not `toUpdate`. The dialog's `nothingToDo` test
(`ProductsToolbar.tsx`) ignored `rowErrors`, so a row whose only "work" is an error read as
"your sheet already matches" with just a Close button - the error was **hidden**. That fully
explains "zero updates" IF v0.1.37 is what's running. Verify that it is.

## What I changed (committed + released, NOT pinned in modules.json)
- **shop v0.1.120** - `modules/shop/lib/import-engine.ts`: price required only on CREATE;
  a blank price on an EXISTING product is omitted from the update (leaves stored value).
  Rationale: price column is `NOT NULL`; a variable product priced "from £x" off its
  cheapest variation has no meaningful parent price.
- **gsp v0.1.38** - `ProductsToolbar.tsx`: preview re-checks on tab focus; "Check again"
  button added.
- **gsp v0.1.39** - `ProductsToolbar.tsx`: `nothingToDo` now excludes `rowErrors`, so
  errors surface in the confirm view instead of being hidden.
- **gsp v0.1.40** - `lib/pull-diff.ts`: blank price on an existing product is neither an
  error nor a flagged change (+ regression tests in `lib/pull-diff.test.ts`).
- All committed/pushed to each module's `origin main` and GitHub-released (prerelease),
  identity `airings.snug-0m@icloud.com`.
- NOTE: `modules/google-sheet-products-for-shop/lib/pull-diff.ts` / `.test.ts` also carried
  an earlier session's uncommitted hunk (move price check to the create branch) - I folded
  it into v0.1.40. The tree is multi-agent; re-check `git status` in each module.

## My blind spots (do not inherit these)
- I never read the sheet via the **real** `readGrid` (Sheets `values.get`,
  UNFORMATTED_VALUE) with the module's OAuth token. I used the public CSV export + gviz as
  a proxy. Both confirm the cell values above, so the grid is very likely faithful - but
  prove it on the real path.
- I never reproduced the **deployed** preview path end-to-end on the live site. I only ran
  `diffProductRows` locally against the live DB. I did not confirm the live site runs my
  fixes.
- I assumed `.env` `DIRECT_URL` (db.dwoffice.furniture) is the DB the failing environment
  uses. `.env.local` has no `DATABASE_URL` override, so local dev uses the same one - but
  confirm the failing environment's DB.

## Prioritised diagnostic plan
1. **Identify the executing code + DB.** Add a temporary field to the `/pull/preview`
   response (or a `console.log` in `preview.ts` / `pull-diff.ts`) that returns, for the
   chiro row: the module version, `existing` values from `buildProductCsvRows`, and each
   compared column's `from`/`to`/`equal`. Hit it from the owner's environment. This settles
   whether it's pinned-v0.1.37 or released-v0.1.40, and shows where the diff diverges.
2. **If v0.1.37 is live:** the fix simply isn't deployed. Bump `modules.json` pins
   (`gsp -> 0.1.40`, `shop -> 0.1.120`), commit core, deploy, re-test. This alone likely
   resolves it. (Confirm `gsp` v0.1.40's `requiresModules` shop `>=0.1.120` is satisfied.)
3. **If v0.1.40 is live and still zero:** the divergence is real - instrument
   `diffProductRows` on the live path and compare to the repro. Suspect, in order:
   a. `readGrid` (`values.get`) returning a different grid than CSV/gviz for this row
      (e.g. the Products tab the pull reads via `TAB.PRODUCTS` is a renamed/duplicate tab,
      not gid 1454525855 - a Pull reading an unedited tab would see no changes).
   b. `buildProductCsvRows` returning different `from` values (caching? a different DB?).
   c. Next.js data caching wrapping `readGrid` or the product reads in the deployed build.
4. **Confirm the tab mapping:** verify `TAB.PRODUCTS` resolves to the tab the owner edited
   (gid 1454525855). Check `lib/workbook.ts`.

## Repro harness (run from repo root; read-only against live Deskwell DB)
Write this as `scratch-repro.test.ts` at repo root and run
`npx vitest run scratch-repro.test.ts --reporter=basic`. It loads the live DB from `.env`
`DIRECT_URL`, pulls the live sheet as CSV, and runs the real `diffProductRows`:

```ts
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { test } from 'vitest'
const env = readFileSync('.env', 'utf8')
const pick = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim()
process.env.DATABASE_URL = pick('DIRECT_URL') || pick('DATABASE_URL')
const csv = execSync(`curl -sL "https://docs.google.com/spreadsheets/d/1TuZSr1STsQ_dVsjYhvIGZb03eZ93-cCrtuebqjDNJUw/export?format=csv&gid=1454525855"`).toString()
function parseCsv(t: string){const rows:string[][]=[];let row:string[]=[],f='',i=0,q=false;while(i<t.length){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i+=2;continue}q=false;i++;continue}f+=c;i++;continue}if(c==='"'){q=true;i++;continue}if(c===','){row.push(f);f='';i++;continue}if(c==='\r'){i++;continue}if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue}f+=c;i++}if(f!==''||row.length){row.push(f);rows.push(row)}return rows}
test('live diff', async () => {
  const { diffProductRows } = await import('@/modules/google-sheet-products-for-shop/lib/pull-diff')
  for (const r of await diffProductRows(parseCsv(csv))) console.log(r.kind, (r as any).name ?? '', JSON.stringify((r as any).changes ?? (r as any).reason ?? ''))
})
```

Inspect raw sheet cell types/nulls (blank vs empty vs formula) via gviz:
```
curl -sL "https://docs.google.com/spreadsheets/d/1TuZSr1STsQ_dVsjYhvIGZb03eZ93-cCrtuebqjDNJUw/gviz/tq?tqx=out:json&gid=1454525855&headers=1"
```

## Access / tools / constraints
- Live DB (read-only): `.env` `DIRECT_URL` = `db.dwoffice.furniture:5432`. psql at
  `/opt/homebrew/opt/libpq/bin/psql`. **Never mutate** - real customer site.
- Sheet is public view-only. CSV export: `.../export?format=csv&gid=1454525855`.
  gviz JSON: `.../gviz/tq?tqx=out:json&gid=1454525855`.
- `ENCRYPTION_KEY` is NOT in local `.env` - needed to decrypt the stored OAuth token to
  call `values.get` directly. Pull it from Vercel (`VERCEL_TOKEN` in `.env`) or add a
  temporary debug route on the deployed site (owner is authenticated).
- Module repos: `github.com/cactus-foundation-modules/{shop,google-sheet-products-for-shop}`.
  Commit identity `airings.snug-0m@icloud.com`; releases `--prerelease`.
- No local `npm run dev` / browser testing by default (shared live DB). `tsc --noEmit` +
  `eslint .` are the gates. Never run `npm run build` unless explicitly asked.
- Releasing a module does NOT deploy it: the live build uses the tag pinned in root
  `modules.json`, so a fix is not live until that pin is bumped and core is deployed.
- Key file paths:
  - `modules/google-sheet-products-for-shop/lib/pull-diff.ts` (the diff)
  - `.../lib/preview.ts` (`buildPullPreview` - what the confirm dialog calls)
  - `.../app/api/admin/pull/preview/route.ts` (reads both tabs via `readGrid`, calls preview)
  - `.../lib/sheets.ts` (`readGrid` = `values.get` UNFORMATTED_VALUE)
  - `.../lib/workbook.ts` (`TAB` names)
  - `.../components/ProductsToolbar.tsx` (the dialog, `nothingToDo`, "Check again")
  - `modules/shop/lib/csv-rows.ts` (`buildProductCsvRows` = the `from` side)
  - `modules/shop/lib/import-engine.ts` (applies the pull; price handling)
  - root `modules.json` (the deploy pins)

## Strong hypothesis to test first
The fixes are correct in isolation (repro proves the diff detects the update) but the live
environment is running the **pinned v0.1.37** code, where a blank `price` makes the whole
row an error that the old dialog hides as "nothing to pull". If so: bump `modules.json`
pins to `gsp 0.1.40` + `shop 0.1.120`, deploy, done. Confirm the executing version before
assuming this - the "Check again" button's presence is evidence against it and must be
explained.
