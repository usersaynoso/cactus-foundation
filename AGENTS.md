# Agent context - Cactus

**Last updated:** 2026-07-25

This file is a portable, self-contained briefing for any AI coding agent working on Cactus on this machine. It consolidates two things another agent would otherwise never see:

1. **The persistent memory** Claude Code has built up for this project (60-odd hand-written facts about traps, live infrastructure, and standing rules), which lives outside the repo at `~/.claude/projects/-Users-chris-Git-Local-Cactus/memory/` and is only auto-loaded by Claude Code.
2. **Machine-level context** (notification bridge, tooling) that is not in the repo at all.

If you read nothing else, read the **Non-negotiable rules** and **Traps that have already cost real money** sections. Most of these were learned by breaking a live customer site.

## Canonical in-repo docs (read these too)

- **`CLAUDE.md`** (repo root) - the authoritative project instructions. Everything here defers to it. Read it in full.
- **`FIELD_NOTES.md`** (repo root) - flat factual inventory of every route, Prisma model, permission key, API handler, module, env var, Puck block, component, script and config key. Update it after any substantive change.
- **`/wiki`** - a *separate* git checkout (the GitHub wiki repo) mirrored into the main repo's `wiki/` folder. Site-owner pages are plain English; developer pages may use technical language.
- **`README.md`** - includes the "Available modules" list; keep it current when modules are added.

---

## What Cactus is

Cactus is a self-hostable website platform (Next.js app + Prisma/Postgres + a Puck page builder + an optional-module system). A site owner clicks "Deploy to Vercel", runs a setup wizard, and gets a CMS-driven site they administer through an admin UI (admin path is configurable, e.g. `/cactus-admin`, `/hq`, `/cacti`).

**Important nuance:** the project was historically treated as "fresh installs only, no live sites". **That is no longer true.** There is at least one real live customer site (Deskwell / `deskwell.co.uk` - see "The live customer site" below for where its own working notes live). Schema changes are still designed as fresh-install end-states, but existing installs are real and must be reached by the deploy path (see Database section). Never assume "no live data".

---

## Non-negotiable rules (these are how the human wants work done)

### Git, commits, releases

- **Never commit, push, or create a release unless explicitly asked this turn.** Finish the work, run checks, leave it in the working tree, stop, report. "Feels done" is not permission.
- **When asked to commit/push:** always work on `main`, never branch. Push to `origin` (`usersaynoso/cactus-foundation`) only.
- **NEVER push to the Tester remote (`usersaynoso/Cactus-Foundation-Tester`)** as part of a normal commit/push. It is a separate, explicit, in-the-moment ask only.
- **Stage only the files this session touched.** Never `git add .` / `-A` / `git commit -a`. Multiple agents share this working tree simultaneously (`git worktree list` often shows several). Before staging a "hot" shared file (route files, manifest/schema files, `package.json`, `FIELD_NOTES.md`, `modules.json`), run `git diff <file>` and `git log -3` / `git show HEAD --stat` to confirm you're not sweeping up or sitting on another agent's in-flight work. This has shipped a live crash before (a half-merged `requiresModules` change).
- **"Commit and push" *includes* the GitHub release - it is not a separate ask.** The task is not done until `gh release create` has run and returned a URL. Mechanical gate: after every push, run `gh release list --repo <owner>/<repo> --limit 1` and confirm the release exists before writing any "done" message. This rule has been violated repeatedly; treat push-without-release as an incomplete task, every repo, every time.
- **Releases are always `--prerelease`.** Never `--latest`. Promoting to Latest is a manual human-only action.
- **Version bumps are PATCH only** by default (`0.5.2` -> `0.5.3`). Never bump minor/major without explicit say-so.
- **Release tag/title is the plain version only:** `v0.5.109`. Never `v0.5.109-hotfix`, `(PATCH)`, etc.
- **Git identity: every repo commits as `airings.snug-0m@icloud.com` / `Chris Taylor-Guest`.** Never `chris@taylor-guest.co.uk`. The core repo already has this set locally; every other repo should have NO local override and inherit the global default - do not set one. Before committing in any non-core repo, run `git config user.email` and confirm it's the icloud address.

### Build & checks

- **Standing checks are `tsc --noEmit` and `eslint .` only.** Both must be zero errors AND zero warnings.
- **NEVER run `npm run build` / `next build` / `vercel build` on your own initiative** - not in the work loop, not during commit/push/release, not delegated to a subagent. Only run a build if the human explicitly asks for a "build" that exact turn. This is strict and has no carve-outs.
- **npm only.** Never yarn or pnpm.

### Running / testing / deploying

- **Never run the app locally** (`npm run dev`, `dev:warm`, browser automation, curl against localhost) unless explicitly asked this turn. Reason: `.env.local`'s `DATABASE_URL` points at a shared live DB; running write paths risks wrecking it. This overrides any default "verify UI changes in a browser" behaviour.
  - (Aside: the correct local dev script is `npm run dev:warm`. `dev:fresh` is referenced in CLAUDE.md but the actual script name to check in `package.json` is `dev:warm`.)
- **Never touch Vercel unless explicitly asked** - no deploy, no polling deploy status, no reading Vercel logs, no verifying on the live URL. Vercel auto-deploys on push to `main`; that's the human's concern.
- If a change genuinely needs live verification, stop and ask the human to test it, or ask permission to run locally.

### The work loop (every task)

1. Implement. 2. Run `tsc --noEmit` + `eslint .` + relevant tests - all pass, not "mostly". 3. Re-read the requirements line by line, confirm each clause. 4. Fix anything failing, back to 2. 5. Update wiki + `FIELD_NOTES.md` if user-facing behaviour / env vars / APIs / architecture / routes / models / modules / etc. changed. 6. Stop and report - no auto-commit.

**Escape valve:** if the same check fails three times on genuinely different attempts, stop, write down what you tried and the errors, surface the blocker, move on. Don't loop forever, don't bury blockers.

### Copy & tone (applies to ALL written output: UI text, README, wiki, release notes, commits)

- **British spelling always:** colour, favour, organise, recognise, licence (noun), practise (verb).
- **No em dashes, ever.** Use a spaced hyphen ( - ) or restructure.
- **British idiom and dry wit** - understatement, self-deprecation (aimed at Cactus, never the user). "faff", "does what it says on the tin", "kitchen drawer" (not "junk drawer"), "quite firm", "rather the point". Not American-cheerful, not robot-neutral.

### Release notes (written for site owners, not developers)

- No technical jargon at all. There's a hard banned-word list (Neon, Prisma, schema, migration, API, route, component, hook, JWT, Puck, React, RSC, any filename, any CSS class, any version number, etc.). If a word from that world appears, rewrite.
- British humour and gentle self-directed sarcasm are mandatory, not optional.
- Format: `## What's new in vX.Y.Z`, one wry summary line, then `### ✨ New stuff`, `### 🐛 Fixed`, `### 🔧 Under the hood` (only if user-noticeable), `### ⚠️ Anything you need to do` (bold, upfront, omit if nothing).
- Describe the *symptom* a user felt, not the bug or the fix mechanism. One sentence per item.
- **Core release that is only a module-pin bump** (`modules.json` change, no core code): keep the module detail to ONE vague line - core release notes are shown to *every* install regardless of which modules they have.
- **Never name a specific customer site, page, or its content** - core notes ship to every install; describe the generic block/behaviour that changed.

### Asking questions

Number each question; letter each option; put the recommended answer first as option a. Ask the fewest questions possible.

### "tidy" command

When the human says "tidy": first run the checks for real and record counts; if clean, report "already tidy" and stop. Otherwise run seven workstreams in order (build hygiene, dark mode/theming, Puck parity, styling polish, correctness & accessibility, optimisation [flag only], docs). Never touch auth/sessions/permissions, new deps, framework upgrades, public-API or schema changes, or anything that removes a feature/route/prop/export without explicit sign-off. Commit per workstream once green, push `origin` only.

### Standing design invariants (hold on every change)

- **Colours are semantic tokens, never hardcoded hex** in component chrome (`--color-text`, `--color-border`, `--color-surface`, etc.). Only genuine data (user-editable swatches) may be hex.
- **Every new text/interactive surface works in both light and dark mode** at AA contrast (focus rings, disabled, hover, placeholder, borders visible in both).
- **Puck blocks render identically** on the editor path and the RSC/frontend path - same markup, same classes.
- **`lib/modules/router.ts` and `lib/puck/module-components.ts` are auto-generated and gitignored** - never hand-edit, never commit. Change the generator scripts and regenerate.
- **Never delete "unused" code on static evidence alone** - module wiring is referenced by string at runtime.
- **No new `eslint-disable` / `@ts-ignore`** without a one-line justification on the same line. Never remove a feature/route/prop/export to silence a warning; root-cause it.

---

## Module architecture (core cleanliness)

Cactus core must contain **zero module-specific code** so a fresh clone works with no modules installed. Two failure modes, both have happened:

1. **Shim files in `app/`** - never put a module-specific one-liner in `app/`; it exists on every install even when the module is absent.
2. **Committed generated files with module content** - `lib/modules/router.ts` and `lib/puck/module-components.ts` are regenerated at build/dev and MUST stay gitignored.

**Core routing pattern:** `app/api/m/[module]/[...path]/route.ts` and `app/cactus-admin/m/[module]/[...path]/page.tsx` are generic catch-alls that delegate to `lib/modules/router.ts` (which may name modules because it's gitignored).

**Verify test - run before any commit touching module wiring:**
```
git grep "modules/contact-form" -- ':!modules' ':!wiki' ':!.gitmodules'
```
Must return empty. Any hit in core = a leak.

**Module isolation rules:**

- **Module work defaults to zero diffs outside the module's own directory.** Every diff to core (or to a base module you `requiresModules`) needs a "we genuinely have to" justification. Prefer solving it inside the module, then a documented behaviour trade-off, then core - and only if the core change is so generic it would be written identically if this module never existed (named after the capability, not the module). A generic core addition with no live consumer is dead code wearing a justification; re-audit and remove it the same turn a design changes or reverts.
- **Module-to-module isolation:** a dependent module (B) that `requiresModules` a base module (A) must own 100% of its own schema/UI. Never add columns/tables/migrations/UI to A to support B - not even "one nullable column". B may *read* A's tables via raw SQL and its own migration may declare an FK into A's table, but B must never *edit* A's schema or pages. Litmus test: would a site owner running only A ever notice or pay for this change?
- **Module settings** live on their own tab on the admin Settings page, never scattered into core settings or a standalone page.
- **Module admin sidebar:** ≤2 links stay flat; 3+ get their own named nav section with a "Pages" sub-link.
- **New module manifests must set `requiresCoreVersion`** (semver, no leading `v`) whenever the module imports a core helper/hook/field added in a specific core release. Missing this broke a live site's deployment once (Twilio module imported `lib/auth/sms.ts` which only existed from core v0.5.295; a site on an older core failed its next build outright). The install/update endpoints enforce it from core v0.5.297, but older cores have no defence - so getting the manifest right is the real safety net.
- **New module built** -> add it to the README "Available modules" list (name, repo link, one-line description) unless the repo is empty/non-functional.

---

## Database & migrations (read before touching any schema)

- **Core gets ONE Prisma migration file, forever:** `prisma/migrations/20260626000000_init/migration.sql`. Schema change = edit that init SQL in place (keeps fresh installs correct). Never create a second Prisma migration. Never `prisma db push`.
- **Existing core installs are reached via `prisma/core-reconcile/*.sql`** (run by `scripts/reconcile-core-schema.mjs` on every deploy, after `migrate deploy`, before module migrations). `prisma migrate deploy` never re-applies an edited-in-place init migration, so an additive core change reaches already-provisioned sites ONLY through a reconcile file. So a core additive change = **edit the init SQL in place AND add/extend an idempotent `prisma/core-reconcile/NNN_*.sql`** (`ADD COLUMN IF NOT EXISTS`, `pg_constraint`-guarded FKs, etc.). Missing this broke `/hq/media` on the live Deskwell site.
- **Module schema changes ship as a NEW numbered migration file** (`002_description.sql`, `003_...`), NOT by editing `001_initial.sql` in place. `scripts/run-module-migrations.mjs` records applied files per module in the `ModuleMigration` table and only runs new ones; editing 001 in place only reaches fresh installs. This broke the live Deskwell site (`relation "tw_site_numbers" does not exist`). Keep 001 correct for fresh installs too - idempotent DDL makes the overlap a harmless no-op.
- **NEVER hand-apply DB changes to the Tester/shared/live DB** (no `psql ALTER`, no Neon-API DDL, no seed scripts against a real DB). All schema/data changes reach a database ONLY through the deploy path. To prove a DDL works, run it against a throwaway Neon branch (create -> test -> delete), never a real branch. (This reversed an older rule that said to hand-apply to the test DB - that rule is dead.)
- **Diagnostic pattern:** an admin page throwing vague "Failed to load X" errors with working auth usually means schema drift. Introspect the DB read-only (`SELECT ... FROM information_schema.columns/tables`), diff against `prisma/schema.prisma`, and fix via a core-reconcile/module-migration file that self-heals on deploy - NOT a hand ALTER.
- `prisma migrate deploy` runs only in the Vercel build step, never from runtime code.
- **`jsdom` must stay pinned to `^26`.** `^29` pulls `html-encoding-sniffer@6` -> `@exodus/bytes` ESM-only -> `ERR_REQUIRE_ESM` crash in Vercel serverless (surfaces as "Couldn't check for updates" and only when an update is available, so local builds hide it). Do NOT swap to linkedom (it passes input through unsanitised - a security regression).

### Backup / restore (STRICT gate)

Backup/restore is the one feature whose bugs stay invisible until the worst moment - a bad export writes plausible SQL, downloads fine, and only fails at RESTORE, months later, in an emergency. `tsc`/`eslint`/`npm test` say nothing about it.

**Gate:** any change touching `prisma/schema.prisma` / the init migration / any module migration SQL / `lib/backup/**` / `app/api/admin/backup/**` / `app/api/setup/import-backup/**` must run `npm run test:backup-roundtrip` and get a **real PASS**. A **skipped** round-trip is a **FAIL**, not a pass (the suite is gated on `RUN_BACKUP_ROUNDTRIP=1` plus VPS env vars; missing them = silent skip = false green). If it skips, fix the env, don't close the task. The test provisions and drops its OWN throwaway `cactus_rt_*` databases on the OVH Postgres VPS over SSH (needs `sshpass`; `brew install sshpass`); it never touches the live `neondb`.

**Backstop that never skips:** `lib/backup/schema-coverage.test.ts` runs in plain `npm test`, statically parses every column type out of every migration, and asserts the serialiser (`isSupportedUdtName`) has a branch for it - catches a brand-new column type on the PR that adds it.

**Serialisation invariants (each one already broke it once):**

- **The COLUMN's Postgres type (`information_schema.udt_name`) decides the SQL literal - NEVER the JS value's shape.** Prisma returns a plain JS array for BOTH a `text[]` column and a `jsonb` column holding a JSON array; they need totally different literals. Branching on `Array.isArray` wrote `text[]` literals into jsonb columns and restore died (`column "history" is of type jsonb but expression is of type text[]`).
- **Never guess - throw.** No "least-worst rendering" fall-through. Unknown udt, or a value shape contradicting the column type -> `UnsupportedColumnError`, abort the whole dump. A loud failure at download is recoverable; a quiet poison is not.
- Prisma `$queryRawUnsafe` return-type traps: `bytea` -> **`Uint8Array`, not always `Buffer`** (`Buffer.isBuffer` is false; test `value instanceof Uint8Array` - this corrupted every passkey); `jsonb`/`json` -> the parsed JS value (can be a bare scalar; handle before any `typeof` check); `numeric` -> `Prisma.Decimal` (quote it to keep precision and allow NaN/Infinity); array columns have udt starting `_` (`_text` = `text[]`); enum element types are mixed-case and must be quoted in the cast (`::"NotificationChannel"[]`).
- **Sequences are not tables** - `information_schema.tables` never sees them; dump them separately as `setval(...)`. Missing them reset the shop's `shp_order_number_seq` to 1 on restore and the next checkout hit a UNIQUE violation.
- Generated/identity columns can't be inserted into - exclude them (`is_generated = 'NEVER' AND identity_generation IS NULL`).
- Version skew is checked BEFORE the TRUNCATE and refused in plain English - never silently drop a column.

---

## Core update mechanism (self-updating installs)

`syncCoreFromUpstream` in `lib/updates/core.ts` pushes core files into each install's own GitHub repo via the Git Data API so installs can self-update. Hard-won invariants:

- **Reconcile toward the target tree; never replay a diff.** Decide every write/delete against the install repo's ACTUAL base tree (content-addressed sha compare), never assume `base == upstream-from-tag` - it's false whenever the repo drifted. The pure planner is `lib/updates/core-plan.ts` (`planCoreSync`): equal blob sha = identical content = "already correct"; a deletion is emitted only when the path is core-managed, removed upstream, AND still present in base; deletions are skipped if the base tree read was truncated.
- **Bootstrap hazard: the deployed updater cannot be fixed remotely.** An install runs the update code from its last good build; a bug there can't be patched by shipping a new release (the install runs the old buggy code and can't update past it). So `lib/updates/core.ts` changes are extreme-care, and the pure decision logic MUST stay covered by `lib/updates/core.plan.test.ts` (dependency-free vitest). Never fold the planner back into `core.ts`.
- Decided *not* built: auto-rollback of a failed deploy (Vercel already serves the last good build, so a failed update is non-fatal) and tree-reconcile defence against hand-edited installs (drift seen on Tester was self-inflicted by manual git surgery + version bumps, not a sync bug).
- Diagnosing a failing Tester deploy: do a blob-level tree-diff of core files vs the matching upstream tag to pinpoint stranded files (skip `modules/`, `.gitmodules`, `modules.json`).

---

## Puck page builder gotchas

- **Editor DOM ≠ RSC DOM (Puck 0.22).** In the editor, non-`inline` components get a wrapper `<div>` (with a forced inline `position:relative`, so overriding needs `!important`), and the root zone renders a `<div>` in the editor but a Fragment in RSC. This breaks any `>` / `~` / grid / positioned-ancestor CSS in the editor only. Parts of a block-internal layout type must be `inline: true` + use `puck.dragRef`.
- **Never name a Puck block field `visibility`.** Core injects a same-named responsive "hide" field and strips it from render props, silently disabling your field. Use `audience`, etc.
- **Block-internal layout types** (`editorPreview`) let a layout type declare the container class/width its host surface stamps it into; RSC wrapping is opt-in via `standalone` (only `app/layout-preview/[id]` passes it) or cards double-wrap. Core learns only a class name and a width, never CSS.
- **Take-over extension points** (`coveredSlots`) let a layout that already renders a job by hand tell a provider extension point to stand down, so you don't get two prices / two option pickers. Shop passes opaque block-type strings; only the provider knows what they mean (keeps module code out of core).
- **Lesson:** the stale Tester DB pointed the wrong way on both of those bugs; the live customer DB held the layout that actually proved them. Check a real install before theorising.

---

## Signed media URLs are never lookup keys

Admin/gallery APIs sign media URLs (`?t=<expiry>.<token>`) while the DB stores plain URLs/keys. Persisting a signed URL as a lookup key matches nothing and rots when the token expires. This cost the product-3d-views feature a whole release cycle. Always store/compare the plain key, never the signed URL.

---

## Module route time ceiling

Every module API route is served through the single core dispatcher `app/api/m/[module]/[...path]/route.ts`, which sets `maxDuration = 60`. Module route files **cannot** set their own `maxDuration` (it breaks the generated router's typing), so 60s is the hard ceiling for ALL module routes, including any `after()` background work (which runs within the same invocation). Consequences and rules:

- In an `after()` pass, order steps cheapest/most-important first. Never strand a critical cheap write (e.g. a delete) behind a slow import - if the function is torn down at 60s, the delete never runs and the UI may still show "success" (it only reflects the fast job the client polls).
- A google-sheet import ground through ~921 variations then died before the variation delete; three prior "fixes" all fixed the delete *logic* while the delete never *ran*. Real fix: cheap delete BEFORE slow import, and make the import O(n) not O(n²).
- On the OVH VPS DB (public-internet hop, not co-located), N+1 loops that were invisible on Neon now blow the 60s ceiling and hard-fail. When a read-only "preview" twin mirrors a write path, it must mirror its caching too.
- Ground truth for these jobs is in the DB's own sync-log tables (e.g. `gsp_sync_log`), not the UI.

---

## Live infrastructure (real, operational)

**Secrets themselves are NOT in this file.** The repo-root `.env` is deliberately **blank** (since 2026-08-23): the platform carries no credentials. Every key below lives in `/Users/chris/Git Local/Deskwell/Claude/.env` and is exported into the shell per run when a task needs it - never written back into this repo. This section records *names* only.

### Keys / tokens (all in the Deskwell folder's `.env`)

- `VERCEL_API_TOKEN` - Vercel API token. **Note the name is `VERCEL_API_TOKEN`, not `VERCEL_TOKEN`** (older docs/memory say `VERCEL_TOKEN` and are wrong).
- `DATABASE_URL` / `DIRECT_URL` - **the live Deskwell customer database**, not a sandbox. Not set in this repo; if exported for a run: reads fine, writes only when asked that turn, nothing destructive, no DDL by hand (reconcile files only).
- `OVH_SERVER` / `OVH_USER` / `OVH_PASSWORD` - the OVH VPS SSH credentials (used by the backup round-trip test, which provisions throwaway `cactus_rt_*` databases there).
- `B2_BUCKET_NAME` / `B2_ENDPOINT` / `B2_KEY_ID` / `B2_KEY` - Backblaze B2 media storage credentials.
- `psql` binary lives at `/opt/homebrew/opt/libpq/bin/psql`.

### The live customer site

One real site runs on this platform today: **Deskwell** (`deskwell.co.uk`, install repo `usersaynoso/deskwell-office-furniture`). Everything about running that site - its VPS, backups, media naming, catalogue, suppliers, content, 3D models - lives in its own working folder, **`/Users/chris/Git Local/Deskwell/Claude`** (`CLAUDE.md`, `notes/`, skills, and that folder's own Claude memory). Site work happens there. This repo is the platform: nothing Deskwell-specific belongs in core, in a public module, or in this file. Anything a site needs that the platform cannot do yet becomes a setting, a module, or an option that any site could switch on.

---

## Modules

- **contact-form** - lives at `https://github.com/cactus-foundation-modules/contact-form` (the old `usersaynoso` origin is dead/404). Two version fields: `package.json` and `cactus.module.json`, patch-bump both per release. The **GitHub release tag tracks the `cactus.module.json` manifest version**, not `package.json`.
- **Module checkout:** `/modules` is gitignored and cloned at build time by `scripts/checkout-modules.mjs` at the **tag pinned in root `modules.json`** (not latest `main`). Pushing a module's `main` does not feed the deploy; the pin must be bumped. Bumping one module's pin alone can break the build via another module's `requiresModules`.
- **Local checkout gotcha:** `checkout-modules.mjs` reverts uncommitted working-tree edits to tracked module files on a local build. Commit module changes first, or verify with just the generator + build.
- The **shop** module ecosystem is substantial (shop, shop-variations, advanced-shipping-for-shop [`ash_` prefix], product-attributes-for-shop, google-sheet-products-for-shop, product-3d-views). Shop added a generic declarative per-line cart picker (`control` on cart-line-resolver + `setLineMeta`) in v0.1.104 for the advanced-shipping module.

---

## The "About" dialog credits

The admin About dialog (click the sidebar version number) shows a hand-curated credits roll in `lib/about/credits.ts` (`CREDITS` groups + `ABOUT` blurb), NOT auto-generated from `package.json`. When a user-recognisable dependency (framework, storage/media/auth/email/payment/maps library) is added or removed, update that file. The release-history half of the dialog auto-pulls from GitHub releases and needs no upkeep.

---

## Machine-level context (not in the repo)

### Telegram progress notifications (standing behaviour for Claude Code)

The human wants proactive progress pings through every non-trivial live session, at each checkpoint (task start, each finished sub-part, real findings/root-causes, fixes applied, completion) - not one summary at the end. Sent via `/Users/chris/.claude/telegram-bridge/send.sh "<plain text>"`. Short, factual, no jargon, no markdown - it's a phone message. Bot is `@Claude4ChrisBot`, chat id `6622165257`. Never wire this as a Stop hook (inline sends only). If a run is headless via `claude -p` (invoked by the bridge daemon), do NOT call `send.sh` - the daemon sends the reply automatically, and calling it too double-sends. A human tapping "reply" on a ping routes back to that exact session via `--resume`. (This is a Claude-Code-specific workflow; a different agent won't have the bridge wired in and shouldn't try to use it.)

### RTK (Rust Token Killer)

A CLI proxy the human uses to cut token usage on dev commands. A Claude Code hook transparently rewrites commands like `git status` -> `rtk git status`. Meta commands: `rtk gain` (savings), `rtk discover`, `rtk proxy <cmd>` (run raw, unfiltered - use this when you need exact byte output, because rtk rewrites git/grep/eslint output). Again, Claude-Code-specific tooling.

### Claude Fleet

A local dashboard (`~/claude-fleet`, LaunchAgent on `127.0.0.1:7878`) for watching multiple Claude Code sessions, wired into the Telegram bridge (`/agents`, `/fork`, `/new`). Local-only, three local patches not upstream. Not relevant to code work; noted for completeness.

---

## Where the full detail lives

This file is a faithful distillation, but the original per-fact notes (with dated incident write-ups and more nuance) are Claude Code's memory files at:

```
~/.claude/projects/-Users-chris-Git-Local-Cactus/memory/
```

Deskwell site knowledge (catalogue, 3D, suppliers, content) was split out on 2026-08-23 into the Deskwell working folder and its own memory:

```
/Users/chris/Git Local/Deskwell/Claude/
~/.claude/projects/-Users-chris-Git-Local-Deskwell-Claude/memory/
```

`MEMORY.md` there is the index; each `*.md` is one fact. On this machine another agent can read them directly. They are in Claude Code's own format (frontmatter + body) but the prose is plain. If this repo is moved to another machine, those files do not travel - this `AGENTS.md` is the portable copy.
