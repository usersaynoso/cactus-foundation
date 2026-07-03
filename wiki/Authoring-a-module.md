# Authoring a module

This guide covers everything you need to build, migrate, and ship a real Cactus module from scratch. If you follow it end to end you'll have a module that installs, migrates its database tables, and registers its permissions - all without touching the core Cactus codebase.

## What is a module?

A module is a git submodule living under `modules/<name>/` in the Cactus repo. It adds:

- Its own **prefixed database tables** (plain SQL migrations, applied at build time)
- Its own **admin pages** (Next.js routes in the module's directory, surfaced via nav entries)
- Its own **permissions** (declared in the manifest, appear in the Roles matrix)
- Optionally: **public routes**, **cookie categories**, and **required environment variables**

The core never imports from a module. A module imports from core utilities but never modifies core tables or the Prisma schema.

## The manifest: `cactus.module.json`

Every module repo must contain `cactus.module.json` at its root:

```json
{
  "name": "forum",
  "version": "1.0.0",
  "tablePrefix": "forum_",
  "description": "Discussion forums for Cactus Foundation.",
  "requiredEnvVars": [
    { "name": "FORUM_MAX_THREADS", "required": false }
  ],
  "navEntries": [
    {
      "label": "Forum",
      "path": "/forum",
      "icon": "💬",
      "permission": "forum.threads.read"
    }
  ],
  "permissions": [
    "forum.threads.read",
    "forum.threads.write",
    "forum.threads.delete_any",
    "forum.threads.delete_own",
    "forum.posts.write",
    "forum.posts.delete_any",
    "forum.posts.delete_own",
    "forum.moderate"
  ],
  "cookieCategories": []
}
```

### Manifest fields in detail

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` (required) | Unique, lowercase kebab-case (`^[a-z][a-z0-9-]*$`). Used as the folder name and as the key in `ModuleMigration`. |
| `version` | `string` (required) | Semver, e.g. `1.0.0`. Must match the latest tagged GitHub release. |
| `tablePrefix` | `string` (required) | Short unique namespace for this module's tables. Must end with underscore (`^[a-z][a-z0-9_]*_$`). Example: `forum_`. **Two modules cannot share a prefix.** |
| `description` | `string` | Short description shown in the admin. |
| `requiredEnvVars` | `Array<{name: string, required: boolean}>` | Env vars this module needs. `required: true` vars block installation if missing; `required: false` vars show a warning but don't block. |
| `navEntries` | `NavEntry[]` | Admin navigation entries to add for this module. |
| `navGroupLabel` | `string` | Optional. If set, this module's `navEntries` get their own sidebar section heading (e.g. `"Gazette"`) instead of being bucketed into the shared "Modules" section with every other module's entries. Use this if your module contributes several distinct admin areas (Gazette: Posts/Tags/Series/Authors/Comments/Templates) rather than one single link. |
| `permissions` | `string[]` | Permission keys this module declares. They're seeded into the `Permission` table on install and appear in the Roles matrix. |
| `cookieCategories` | `string[]` | Non-essential cookie categories this module sets (e.g. `["analytics"]`). These are surfaced as one-click suggestions in the admin consent banner editor. Declaring a category here does **not** automatically add it to the site's category list - that remains the admin's decision. See the consent gate contract below. |
| `teardown` | `string[]` | PascalCase names of database tables owned by this module (e.g. `["ForumThread", "ForumPost"]`). Required if you want admins to be able to choose "Remove code and data" during uninstall. Without it, only "Remove code only" is available. |
| `puckBlocks` | `PuckBlock[]` | Optional. Registers Puck blocks provided by this module. See [Module Puck blocks](#module-puck-blocks) below. |
| `settingsTabs` | `SettingsTab[]` | Optional. Registers tabs your module contributes to the core admin's **Settings** (`/config`) page. See [Module settings tabs](#module-settings-tabs) below. |
| `extensionPoints` | `ExtensionPoint[]` | Optional. Registers components your module contributes to extension points published by *another* module's own pages (typically a hard dependency from `requiresModules`). See [Module extension points](#module-extension-points) below. |
| `requiresModules` | `Array<{name: string, minVersion: string}>` | Optional. Other modules that must already be installed and active, at or above `minVersion`, before this one can be installed. The install route rejects the install with a clear message if a dependency is missing or too old. Uninstalling a module that another active module still depends on is blocked the same way, in reverse. |
| `cronJobs` | `Array<{path: string, schedule: string}>` | Optional. Vercel Cron entries this module needs. `path` must be under `/api/m/<your-module-name>/...` (it's dispatched through the same generic module router as any other module API route). `schedule` is a standard cron expression. Every installed module's `cronJobs` are collected into a single generated `vercel.json` at build/dev time - see [Module cron jobs](#module-cron-jobs) below. **Vercel's Hobby plan caps cron invocations to once per day per job**, however often you write the schedule. |

### Permission key convention

Use `_own` / `_any` suffixes for operations that can be scoped: `forum.posts.delete_own` (delete your own posts) vs `forum.posts.delete_any` (delete anyone's posts). This is a convention, not enforced by the framework - but it makes role configuration predictable.

## The module database model

This is the most important section. Get it wrong and migrations become painful.

### Rules

1. **Every table your module creates must start with `tablePrefix`.**
   - Correct: `forum_threads`, `forum_posts`
   - Wrong: `threads`, `forum_thread`
2. **Migrations are plain SQL files**, not Prisma migrations.
3. **The module migration runner applies them during Vercel's build step**, in lexicographic filename order. They are never applied at runtime.
4. **Already-applied migrations are tracked in `ModuleMigration`** (a core table): `(moduleName, migrationName, checksum)`. The runner skips any migration already recorded there.
5. **Modules query their own tables directly** - raw SQL or a lightweight query layer - not through the core Prisma client.

### Migration file structure

```
modules/forum/
├── migrations/
│   ├── 001_create_tables.sql
│   ├── 002_add_pinned_column.sql
│   └── 003_add_indexes.sql
└── ...
```

Files are applied in lexicographic (alphabetical) order. Use numeric prefixes to control order: `001_`, `002_`, etc.

### Example migration file

**`migrations/001_create_tables.sql`:**
```sql
CREATE TABLE forum_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pinned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE forum_posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX forum_threads_author ON forum_threads(author_id);
CREATE INDEX forum_posts_thread ON forum_posts(thread_id);
```

### Example query (module code)

Since the core Prisma client doesn't know about `forum_threads`, modules use a raw database connection:

```ts
// modules/forum/lib/db.ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function getThreads(limit = 20, offset = 0) {
  const { rows } = await pool.query(
    'SELECT * FROM forum_threads ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  )
  return rows
}
```

Or, for more ergonomic queries, use any lightweight ORM that doesn't depend on a generated Prisma schema.

## Nav entries

Each `navEntry` in the manifest becomes a link in the admin sidebar when the module is active:

```json
{
  "label": "Forum",
  "path": "/forum",
  "icon": "💬",
  "permission": "forum.threads.read"
}
```

- `path` is relative to the admin root (the internal `/_cactus_admin` prefix).
- If `permission` is set, the nav entry is only shown to users with that permission (or admins).
- Nav entries from disabled modules are hidden immediately when the module is disabled.
- Without `navGroupLabel`, your entries render as plain links directly under **Dashboard**, no section heading - not bucketed with other modules, not at the bottom of the sidebar. With `navGroupLabel`, your entries get their own named, collapsible section instead, rendered after **System**.

## Linking between admin pages

Build every admin link inside your module from the **real** admin path, never the internal `/cactus-admin/` prefix. Each site sets its own admin path during setup (the default is `/cactus-admin/`, but it might be `/cacti/` or anything else), and `proxy.ts` rewrites `/<adminPath>/*` to the internal `/cactus-admin/*` while **blocking** direct access to the internal prefix. A hardcoded `/cactus-admin/...` link therefore bypasses the real path, hits a blocked route, and renders a blank page.

- **Client components:** read the path with `useAdminPath()` from `@cactus/components/admin/AdminPathContext`, then build links as `` `/${adminPath}/m/<module-name>/...` ``. The context is provided by the admin shell, so the hook works on any module admin page with no prop drilling.
- **Server components:** read the request header instead - `const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''`.
- **Exceptions:** API routes (`/api/m/<module-name>/...`) are not under the admin path and stay as-is, and nav-entry `path`s in the manifest are already prefixed with the real path by core, so they need no change.

## Permissions in module code

To check permissions from your module's server components or API routes:

```ts
import { getSessionFromCookie } from '@cactus/lib/auth/session'
import { hasPermission } from '@cactus/lib/permissions/check'

const user = await getSessionFromCookie()
if (!user || !await hasPermission(user, 'forum.threads.write')) {
  // Redirect or return 403
}
```

Disabled module permissions remain visible in the Roles matrix but are visually marked "module inactive". This means re-enabling a module doesn't silently wipe existing role assignments - admins who had `forum.threads.write` before the module was disabled still have it when it's re-enabled.

## Raising admin notifications

Your module can raise notifications in the admin bell (the same bell core uses for deferred deployments). Import the generic helpers from core:

```ts
import { upsertAlert, clearAlert } from '@cactus/lib/notifications/alerts'
```

- `upsertAlert({ type, dedupeKey, title, link })` - raises (or re-surfaces) a single notification keyed by `dedupeKey`. If one with that key already exists and the `title` (or `link`) changed, it re-surfaces as unread; if the title is unchanged it's a no-op, so you never nag an admin about a notice they've already read. `type` is a `NotificationType` (modules typically use `'message'`); `link` is an admin-relative path (e.g. `/m/<module-name>/inbox`) rendered as `` `/${adminPath}${link}` ``.
- `clearAlert(dedupeKey)` - deletes the notification(s) with that key. Call this when the condition clears.

**Rolling-count pattern (recommended for inbox-style modules).** Keep one notification in step with a count rather than raising one-per-event. The contact-form module does this in `lib/notify.ts`:

```ts
import { upsertAlert, clearAlert } from '@cactus/lib/notifications/alerts'
import { countUnreadSubmissions } from './db'

export async function syncMessagesNotification() {
  const n = await countUnreadSubmissions()
  if (n > 0) {
    await upsertAlert({
      type: 'message',
      dedupeKey: 'contact-form:messages',
      title: `${n} unread message${n === 1 ? '' : 's'}`,
      link: '/m/contact-form/inbox?tab=unread',
    })
  } else {
    await clearAlert('contact-form:messages')
  }
}
```

Call it (fire-and-forget, `.catch(...)`) after **every** mutation that changes the count - on create, on status change, on delete - so the badge stays honest and clears itself at zero. Wrap the call so a notification failure never breaks your endpoint. Use a `dedupeKey` namespaced to your module (e.g. `<module-name>:<concern>`) to avoid colliding with core or other modules.

## The install/update/disable lifecycle (from author's perspective)

### Install

1. Site admin enters your GitHub URL in **Admin → Modules → Install a module**.
2. Cactus fetches `cactus.module.json` from your repo.
3. Validates: manifest schema, `tablePrefix` uniqueness, required env vars, and `requiresModules` (every declared dependency must already be installed, `active`, and at or above `minVersion` - install is rejected with a clear message otherwise).
4. Finds your latest tagged release and its commit SHA.
5. Commits your repo as a git submodule at `modules/<name>` via the GitHub API.
6. Vercel builds → `generate-module-router.mjs` wires admin pages and API routes, then `run-module-migrations.mjs` applies `001_create_tables.sql`, etc.
7. Module row flips to `active` (via webhook or lazy polling).

### Update

1. Commit changes to your module, add a migration if the schema changed.
2. Tag and release: `git tag v1.1.0 && git push --tags`, create a GitHub Release.
3. The Cactus admin sees "Update available" with your release notes.
4. After they click **Update**, Vercel builds → migration runner applies only new `.sql` files (already-applied ones are recorded in `ModuleMigration` and skipped).

### Disable

Disabling a module is a database flag flip - no redeploy, no data loss. The module's tables remain intact. Nav entries disappear immediately. Permissions remain in the Roles matrix but are marked inactive.

### Uninstall

1. Admin clicks **Uninstall** on the installed module.
2. A modal offers two options:
   - **Remove code only** - removes the submodule git entry and the `Module` DB row. Database tables are preserved.
   - **Remove code and data** - same as above, plus drops every table listed in `teardown`. Only available if the module declares `teardown` in its manifest.
3. On confirmation, Cactus commits the submodule removal to the main repo, Vercel rebuilds, and the admin is redirected to the redeploying page.
4. Uninstall is blocked if another active module's `requiresModules` still points at this one - remove the dependent module first.

## Structuring per-version migrations

For the update flow to apply only new migrations correctly, follow this convention:

- Each version that changes the schema adds a new `.sql` file. Never modify an existing migration file after it has been deployed - the `ModuleMigration` table records a checksum and the runner will detect tampering.
- Use a naming scheme that sorts in the order migrations should run: `001_`, `002_`, `003_`, etc.
- A migration file should be idempotent where practical (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE IF NOT EXISTS`, etc.) to survive edge cases.

## Publishing to the module directory

Modules hosted in the `cactus-foundation-modules` GitHub organisation appear automatically in the **Admin - Modules - Available** directory. To list your module:

1. Create a public repo under `cactus-foundation-modules/your-module-name`.
2. Push your code there.
3. Tag a release: `git tag v1.0.0 && git push --tags`.
4. Create a GitHub Release for the tag. The release body becomes the "Update notes" shown in the admin.

Modules hosted elsewhere can still be installed manually if the admin knows the repo URL - the directory only shows `cactus-foundation-modules` repos as a curated shortlist.

## Module Puck blocks

A module can register Puck blocks that appear in both the page builder and the layout builder. Declare them in `cactus.module.json`:

```json
"puckBlocks": [
  {
    "type": "MyWidget",
    "import": "./components/puck/MyWidgetBlock",
    "component": "myWidgetPuckComponent",
    "rscComponent": "myWidgetPuckRscComponent"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | yes | The Puck component name (PascalCase). Must be unique across all installed modules. |
| `import` | yes | Module-relative path to the file exporting the component objects (no `.ts` / `.tsx` extension). |
| `component` | yes | Named export for the editor (synchronous) version of the block config object. |
| `rscComponent` | no | Named export for the RSC render version. If omitted, `component` is used for both. |

`scripts/generate-module-puck.mjs` runs on every `npm run build` and `npm run dev`. It rewrites `lib/puck/module-components.ts` with the correct import statements. The resulting `moduleComponents`/`moduleRscComponents` records are spread into `puckConfig`, `layoutPuckConfig`, and their RSC variants so your block appears under the **Modules** category in the block picker. `lib/puck/module-components.ts` is gitignored and never committed to the core repo - it mirrors `lib/modules/router.ts` in this respect.

### Block design rules

- **All settings live in the block's Puck fields.** Do not create a separate settings page for per-form configuration - every block instance on the site can carry different settings.
- **Keep security-sensitive settings server-authoritative.** For example, a contact form block's notification email and CAPTCHA toggle should be stored in the page's `builderData`, never sent by the browser. The submit handler must re-derive the config by looking up the saved `builderData` using the page/layout slug and block `id`.
- **Use `puck?.id`** in the RSC render function to get the block's unique Puck identifier (available as `props.puck.id` in all render functions).
- **Gate settings behind real config status with `resolveFields`.** If your block depends on integrations that may not be configured (e.g. email delivery, a third-party API), add an async `resolveFields` function to your editor component object. It receives `(data, { fields })` and returns the fields to display. When the required integration is absent, return a single custom field that renders a warning banner instead of the normal controls - this prevents editors from configuring features that can't work. Use `fetch('/api/auth/config')` to check email and Turnstile status; cache the promise at module scope with a short TTL (60 s) so the function doesn't refetch on every panel keystroke.

## Module settings tabs

A module can add a tab to the core admin's **Settings** (`/config`) page instead of shipping its own standalone settings screen. Declare it in `cactus.module.json`:

```json
"settingsTabs": [
  {
    "id": "my-module",
    "label": "My Module",
    "permission": "my-module.manage",
    "import": "./components/SettingsTab",
    "component": "MyModuleSettingsTab"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique tab id, used as the `?tab=` query value and as the key modules key off (e.g. in OAuth-callback redirects back to `/config?tab=<id>`). |
| `label` | yes | Tab label shown in the settings tab bar. |
| `permission` | no | Permission key required to see the tab. Omit for a tab visible to anyone who can reach `/config`. |
| `import` | yes | Module-relative path to the file exporting the tab component (no `.ts` / `.tsx` extension). |
| `component` | yes | Named export for the tab's React component. Must be a client component (`'use client'`) - it's rendered directly inside the client-side settings page. It receives no props and manages its own state/fetching, exactly like a standalone admin page would. |

`scripts/generate-module-settings-tabs.mjs` runs on every `npm run build` and `npm run dev`. It rewrites `lib/modules/settings-tabs.ts` (gitignored, same pattern as `lib/puck/module-components.ts`) with a `moduleSettingsTabComponents` record keyed by `id`. The core settings page (`app/cactus-admin/config/page.tsx`, a server component) reads every active module's `settingsTabs` live from `Module.manifest`, permission-filters them the same way `navEntries` are filtered for the sidebar, and passes the visible list into the client page - which looks up each visible tab's component from the generated record.

Your tab's content renders with no extra chrome - no page title, no wrapping card - since it sits directly under the shared tab bar. Add your own heading only if the tab label alone wouldn't be enough context.

## Module extension points

`settingsTabs` and `puckBlocks` are extension points *core* publishes. Core's own `/cactus-admin/roles` page publishes one too - `core.roles-page` - for modules that need their own per-user role assignment UI outside the core `Role`/permission model (Gazette's Contributor/Author/Editor roles are the example: they're assigned per-user in a module table, not built from core permission keys, so they don't fit `settingsTabs` or the Roles page's own permission matrix). A module can publish its own extension points too, for other modules to contribute to - most commonly a module extending the pages of a hard dependency it declares in `requiresModules`. Core never learns the point's name; it only runs the generic collection mechanism described below.

**Publishing a point (in the host module, e.g. `contact-form`):** pick a namespaced string id for the point (convention: `<your-module-name>.<page-or-area>`, e.g. `contact-form.submission-detail`), document what data your components receive, and read/render contributions from `lib/modules/extension-points.ts` in your own page - live permission-filtering happens in your page code, exactly like `navEntries` are filtered in `layout.tsx`:

```tsx
// modules/contact-form/app/cactus-admin/contact-form/inbox/[id]/page.tsx
import { prisma } from '@/lib/db/prisma'
import { hasPermission } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// ...inside the page component, after loading `user`:
const activeModules = await prisma.module.findMany({
  where: { status: { in: ['active', 'update_available'] } },
  select: { manifest: true },
})
const visibleIds: string[] = []
for (const mod of activeModules) {
  const manifest = mod.manifest as { extensionPoints?: Array<{ point: string; id: string; permission?: string }> } | null
  for (const entry of manifest?.extensionPoints ?? []) {
    if (entry.point !== 'contact-form.submission-detail') continue
    if (!entry.permission || await hasPermission(user, entry.permission)) visibleIds.push(entry.id)
  }
}
const components = moduleExtensionPointComponents['contact-form.submission-detail'] ?? {}

// ...in the JSX, wherever the contributed content should render:
{visibleIds.map((id) => {
  const Extra = components[id]
  return Extra ? <Extra key={id} submissionId={id} /> : null
})}
```

The props your point passes (`submissionId` above) are your own contract - document them so contributors know what to expect. Contributed components can be plain (even async) server components if your page is a server component, or client components if you render them from a client page - match whatever your own page already is.

**Contributing to a point (in the contributing module, e.g. `contact-form-reply-catcher`):** declare an `extensionPoints` entry in `cactus.module.json`:

```json
"extensionPoints": [
  {
    "point": "contact-form.submission-detail",
    "id": "my-module-contribution",
    "permission": "my-module.manage",
    "import": "./components/MyContribution",
    "component": "MyContribution"
  }
]
```

| Field | Required | Description |
|-------|----------|--------------|
| `point` | yes | The extension point id, as documented by the module that publishes it. |
| `id` | yes | Unique id for this contribution within the point (a point can have contributions from more than one module). |
| `permission` | no | Permission key required for the contribution to render. Omit to always render when the point itself is reachable. |
| `import` | yes | Module-relative path to the file exporting the component (no `.ts` / `.tsx` extension). |
| `component` | yes | Named export for the contributed React component. |

`scripts/generate-module-extension-points.mjs` runs on every `npm run build` and `npm run dev`. It collects `extensionPoints` from every installed module's manifest, groups them by `point`, and writes the gitignored `lib/modules/extension-points.ts` (`moduleExtensionPointComponents: Record<point, Record<id, Component>>`) - same generated-file pattern as `lib/puck/module-components.ts` and `lib/modules/settings-tabs.ts`.

## Module cron jobs

A module can register Vercel Cron jobs by declaring `cronJobs` in `cactus.module.json`:

```json
"cronJobs": [
  { "path": "/api/m/my-module/cron/sync", "schedule": "0 6 * * *" }
]
```

`path` is dispatched through the same generic `/api/m/[module]/[...path]` router as any other module API route - just create `app/api/cron/sync/route.ts` in your module and it's reachable at that path. `schedule` is a standard cron expression. **Vercel's Hobby plan caps cron invocations to once per day per job**, regardless of what the schedule says, so design for "runs roughly daily" rather than anything finer-grained. Pair a daily cron with a manual "Check now" admin button for anything time-sensitive.

`scripts/generate-module-cron.mjs` runs on every `npm run build` and `npm run dev`. It collects `cronJobs` from every installed module's manifest into a single generated `vercel.json` at the project root - gitignored, never committed, same pattern as `lib/modules/router.ts`.

**Authenticating cron requests.** Set a `CRON_SECRET` environment variable and Vercel automatically appends `Authorization: Bearer $CRON_SECRET` to its own cron requests - no custom secret scheme needed. Your cron route just checks that header:

```ts
const secret = process.env.CRON_SECRET
if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)
```

Note that module route files **cannot** export their own `maxDuration` - the generated router imports every route file as a plain object of HTTP-method handlers, and a `maxDuration` export breaks that structural type. The shared dispatcher at `app/api/m/[module]/[...path]/route.ts` sets one `maxDuration` (currently 60s) for every module route instead.

## Public routes

Most modules only need admin pages and API routes. A module that also needs a public-facing area of the site (a blog, a forum, a directory) can declare a single top-level URL segment it owns:

```json
"publicBasePath": "gazette"
```

`publicBasePath` must be a single lowercase URL segment (letters, digits, hyphens). It is validated for uniqueness at install time against every other installed module's `publicBasePath`, and against existing InfoPage slugs - installing a module whose base collides with an existing page, or creating/renaming a page to match an installed module's base, is rejected with a 409. **An InfoPage always wins a collision that slips through** (e.g. a page created before the module was installed) - this never causes data loss, it just hides the module's public index until the page is renamed or removed.

### Conventions

Place public pages and routes under `app/public/<base>/` in your module, mirroring the Next.js App Router conventions you'd use for `app/`:

```
modules/my-module/app/public/my-module/
├── page.tsx                # /my-module (index)
├── [slug]/page.tsx         # /my-module/<slug>
├── archive/[year]/page.tsx # /my-module/archive/<year>
└── feed.xml/route.ts       # /my-module/feed.xml (RSS or similar)
```

- `page.tsx` files export a default React component and may export `generateMetadata`, same as any Next.js page.
- `route.ts` files export `GET`/`POST`/etc, same as any Next.js route handler.
- `scripts/generate-module-router.mjs` scans this directory and generates `resolveModulePublicPage`, `dispatchModulePublicRoute` and `getModulePublicBases` in `lib/modules/router.ts` (gitignored, regenerated on every build/dev start - same pattern as the admin/API router).
- Core resolves `/<base>` via `app/(public)/[slug]/page.tsx`'s fallback path (InfoPage lookup first, module index second) and `/<base>/<...rest>` via the generic catch-all `app/(public)/[slug]/[...path]/page.tsx`. A literal `app/(public)/[slug]/feed.xml/route.ts` delegates `/<base>/feed.xml` specifically, since a `route.ts` can't share a folder with a `page.tsx`.

### Rendering is always dynamic

Every module public page renders per-request (`force-dynamic`) - there is no static generation or ISR for module public routes. This is deliberate: modules like Gazette need scheduled content to appear exactly on time with no cron job, which only works if the page is never cached. Budget for this when designing a public page that does expensive work; cache within your own module's DB queries rather than relying on route-level caching.

### Sitemap entries

If your module has public pages worth indexing, add `lib/sitemap.ts` to your module exporting:

```ts
export async function getPublicSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  // return an array of { url, lastModified, changeFrequency, priority }
}
```

The generator wires this into `collectModuleSitemapEntries()`, which core's `app/sitemap.ts` calls and appends to the site sitemap. Errors are swallowed per-module so one broken module's sitemap code can't take down the whole sitemap.

## Local development loop

1. Clone your module into a local Cactus install's `modules/` directory:
   ```bash
   git clone https://github.com/you/cactus-module-forum modules/forum
   ```
2. Apply your migrations directly:
   ```bash
   # From the repo root:
   node scripts/run-module-migrations.mjs
   ```
3. If your module needs a `Module` database row:
   ```sql
   INSERT INTO "Module" (id, name, "repoUrl", version, "tablePrefix", status, "installedAt")
   VALUES ('dev-forum', 'forum', 'https://github.com/you/cactus-module-forum', '0.0.1', 'forum_', 'active', NOW());
   ```
4. Start `npm run dev` - it automatically runs `generate-module-router.mjs` first, wiring your admin pages and API routes. Visit `/cacti/m/forum/<page>` (or wherever your nav entry points).

## Cookie consent gate for modules

If your module sets non-necessary cookies (analytics, advertising, third-party embeds, etc.), you must follow the consent gate contract.

### 1. Declare the category in your manifest

```json
{
  "cookieCategories": ["analytics"]
}
```

This tells the admin consent banner editor that your module uses these categories and surfaces them as one-click suggestions. The admin still decides whether to add the category to their site's list.

### 2. Gate scripts that set non-necessary cookies

Never load tracking scripts unconditionally. Use the gate utility:

```ts
import { loadIfConsented, onConsentChange } from '@/lib/consent/gate'

// Run fn immediately if consent exists, else defer until the visitor consents
loadIfConsented('analytics', () => {
  // inject your script here
})

// Or subscribe to changes (e.g. if the visitor upgrades from reject to accept)
onConsentChange((decision) => {
  if (decision.analytics) {
    // inject
  }
})
```

You can also check `window.__cactusConsent.analytics` directly, but `hasConsent()` from `gate.ts` is safer (handles SSR and missing window).

### 3. What Cactus cannot gate for you

If operators paste third-party script tags directly into page HTML (e.g. a raw Google Analytics snippet), Cactus cannot suppress them. Document this clearly if your module encourages such patterns.

## Known constraints

- **Public repos only.** The install flow fetches the manifest from GitHub. Private repos aren't supported.
- **No shelling out to git.** All installs and updates go through the GitHub REST API. There is no filesystem mutation at runtime.
- **Migrations run during the build step, never at runtime.** An API route that calls the migration runner will throw in production - Vercel's filesystem is read-only.
- **Declare `teardown` to enable full uninstall.** Without it, admins can only remove the code - database tables are left behind. Declare the exact PascalCase table names Prisma created (e.g. `"ForumThread"`, not `forum_threads`).
- **`tablePrefix` is permanent.** Once installed, the prefix cannot be changed. Choose it carefully - it's used in every table name and in `ModuleMigration` records.
- **Render markdown in client components with the browser-safe renderer, never `@cactus/lib/sanitize`.** The server sanitiser pulls in jsdom, which must never reach the client bundle - importing it into a `'use client'` component throws at render in the serverless runtime. Use a `window`-backed renderer (`marked` + `DOMPurify(window)`) that shares the same allow-list, so its output matches the server sanitiser. Server components and API routes keep using `@cactus/lib/sanitize`.
  - **Vendor it inside your module - do not import `@cactus/lib/markdown-client`.** Core ships that file, but it only exists in cores from `0.5.114` onwards. A module that imports it fails to build on any install whose core predates it (the build clones the latest module against whatever core that install happens to be on). Keep your own copy under `lib/` so your module is portable across core versions. The contact-form module's `lib/markdown-client.ts` is the reference implementation.

## Minimal complete example

Here is the smallest possible working module:

**`cactus.module.json`:**
```json
{
  "name": "announcements",
  "version": "1.0.0",
  "tablePrefix": "ann_",
  "description": "Site-wide announcements.",
  "requiredEnvVars": [],
  "navEntries": [
    { "label": "Announcements", "path": "/announcements", "permission": "ann.manage" }
  ],
  "permissions": ["ann.manage"]
}
```

**`migrations/001_create_announcements.sql`:**
```sql
CREATE TABLE ann_announcements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`app/cactus-admin/announcements/list/page.tsx`** — admin page, reachable at `/cacti/m/announcements/list`:
```tsx
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export default async function AnnouncementsPage() {
  const user = await getSessionFromCookie()
  if (!user || !await hasPermission(user, 'ann.manage')) {
    return <div>Access denied.</div>
  }

  const { rows } = await pool.query('SELECT * FROM ann_announcements ORDER BY created_at DESC')
  return (
    <div>
      <h1>Announcements</h1>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>{r.title} - {r.published ? 'Published' : 'Draft'}</li>
        ))}
      </ul>
    </div>
  )
}
```

Admin pages live at `app/cactus-admin/<module-name>/<page>/page.tsx` inside the module repo. API routes live at `app/api/admin/<module-name>/<endpoint>/route.ts`. The build step runs `generate-module-router.mjs` which scans these directories and wires them into the core's catch-all routes automatically - no changes to core code required.

That's a complete, installable module. Tag it, release it, and any Cactus site can install it.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
