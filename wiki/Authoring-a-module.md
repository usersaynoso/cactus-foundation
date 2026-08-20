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
| `requiresCoreVersion` | `string` | Optional. Minimum Cactus core version (semver, no leading `v`) this module needs. Install and update are refused with an "update Cactus first" message when the running core is older. Set this whenever your module imports a core helper introduced in a specific core release - without it, installing on an older core commits the module and breaks the site's next build. |
| `requiredEnvVars` | `Array<{name: string, required: boolean}>` | Env vars this module needs. `required: true` vars block installation if missing; `required: false` vars show a warning but don't block. Declaring a var here is also what lets your settings tab write it through `/api/admin/env` - that route only accepts keys the installed modules have declared. Adding a new one in a later version of your module works from Cactus 0.5.875 onwards, which refreshes the stored manifest when a module updates; before that the manifest was frozen at install time and the new key was silently ignored. If a site's copy of your module is behind, `/api/admin/env` answers with the unaccepted keys in `skipped` (or a 400 if it accepted none), so surface that rather than showing a bare "Saved". |
| `navEntries` | `NavEntry[]` | Admin navigation entries to add for this module. **Keep it to one.** The sidebar is shared with every other module and it does not scale: register a single link and make everything else a tab on that page (see `TabStrip`, and the `*Nav.tsx` components in gazette, boards, ultimate-seo and space-planner-for-shop for the pattern). Settings belong in a `settingsTabs` entry, not a link. A screen that belongs inside another module's page - or core's Inbox or Media - should publish into that page's tab extension point and register no link at all. Two links is for a module the size of Shop; more than two wants a very good reason. |
| `navGroupLabel` | `string` | Optional. If set, this module's `navEntries` get their own sidebar section heading (e.g. `"Gazette"`) instead of being bucketed into the shared "Modules" section with every other module's entries. Use this if your module contributes several distinct admin areas (Gazette: Posts/Tags/Series/Authors/Comments/Templates) rather than one single link. | **Only worth setting when a module keeps two or more links - a section heading over a single link is noise. Shop is the only module that still uses one.**
| `navGroupOrder` | `number` | Optional, only meaningful alongside `navGroupLabel`. Lower numbers sort earlier among labelled module sections; modules that omit it sort after any that set it, in their existing order. Use this if your module's section should appear above another module's, rather than wherever install order happens to put it. |
| `permissions` | `string[]` | Permission keys this module declares. They're seeded into the `Permission` table on install and appear in the Roles matrix. |
| `cookieCategories` | `string[]` | Non-essential cookie categories this module sets (e.g. `["analytics"]`, `["live-chat"]`). Declare them as **keys**, not prose: lowercase, starting with a letter, letters/numbers/hyphens/underscores only - that is the shape the banner stores and your code checks. Anything looser is folded into a valid key when the admin clicks the suggestion (`"Live chat"` → key `live-chat`, label `Live chat`), so an older manifest still works, but the key your code checks must match what actually lands in the site's list. These are surfaced as one-click suggestions in the admin consent banner editor. Declaring a category here does **not** automatically add it to the site's category list - that remains the admin's decision. See the consent gate contract below. |
| `teardown` | `string[]` | PascalCase names of database tables owned by this module (e.g. `["ForumThread", "ForumPost"]`). Required if you want admins to be able to choose "Remove code and data" during uninstall. Without it, only "Remove code only" is available. |
| `puckBlocks` | `PuckBlock[]` | Optional. Registers Puck blocks provided by this module. See [Module Puck blocks](#module-puck-blocks) below. |
| `settingsTabs` | `SettingsTab[]` | Optional. Registers tabs your module contributes to the core admin's **Settings** (`/config`) page. See [Module settings tabs](#module-settings-tabs) below. |
| `extensionPoints` | `ExtensionPoint[]` | Optional. Registers components your module contributes to extension points published by *another* module's own pages (typically a hard dependency from `requiresModules`). See [Module extension points](#module-extension-points) below. |
| `smsProviders` | `Array<{id, label, import, export}>` | Optional. Registers an SMS delivery provider with core auth, used to send login codes by text message (admin password login and member SMS 2FA). `import`/`export` name a module file exporting an object satisfying core's `SmsProvider` type (`lib/auth/sms.ts`): `{ isConfigured(): boolean \| Promise<boolean>, sendSms(to, body): Promise<void> }`. Collected by `scripts/generate-module-sms-providers.mjs` into the gitignored `lib/modules/sms-providers.ts` (same generated-file pattern as `settingsTabs`). Core uses the first configured provider from an active module and silently falls back to email delivery when none is available - a provider must never be load-bearing for login. The Twilio module is the reference implementation. |
| `emailTemplates` | `{groupLabel, import, export}` | Optional. Registers this module's emails with core's single email editor (**Settings → Email → Templates**), alongside core's own and every other module's. `import`/`export` name a module file exporting an `EmailTemplateDef[]` (`lib/email/registry.ts`): `{key, label, subject, bodyHtml, mergeTags, requiredTags?, rawTags?, transactional}`. **Every key must be prefixed with your module's own name** (`shop.order-confirmed`) - core skips any that is not, which is what stops two modules claiming one email. `groupLabel` is the heading they sit under in the editor. Collected by `scripts/generate-module-email-templates.mjs` into the gitignored `lib/modules/email-templates.ts` (same generated-file pattern as `settingsTabs`). Send with core's `renderEmailTemplate(key, vars)` + `sendEmail(...)`, or `sendTemplateEmail(to, key, vars)`; a null render means the owner has switched that email off, so skip it quietly. In return you get the owner's copy edits, the on/off switch, the merge-tag chips, preview, test-send and the site's email wrapper design for free - do not build a template table of your own. `requiredTags` names merge tags an edit may not drop (a link the email is useless without); `rawTags` names values your own code assembles as markup (an item table) so core does not escape them - never list a tag whose value comes straight from a form. |
| `smsTemplates` | `{groupLabel, import, export}` | Optional. The same seam one channel over: registers this module's **text messages** with core's message registry, which whichever SMS-provider module is installed puts an editor on (with Twilio, that's **Settings → Twilio → Templates**). `import`/`export` name a module file exporting an `SmsTemplateDef[]` (`lib/sms/registry.ts`): `{key, label, body, mergeTags, requiredTags?, transactional}`. No subject and no wrapper - a text is one plain-text body. **Every key must be prefixed with your module's own name** (`shop.order-shipped`), same rule and same reason as the emails. Collected by `scripts/generate-module-sms-templates.mjs` into the gitignored `lib/modules/sms-templates.ts`. Send with core's `sendSmsTemplate(to, key, vars)`, which never throws and answers `{sent:false, reason}` when there is no provider, no number or the owner has switched that message off - check `isSmsAvailable()` before offering a text as a choice anywhere in your UI. Keep defaults inside 160 characters: texts are charged per segment, and anything outside the plain-text set drops that to 70. |
| `requiresModules` | `Array<{name: string, minVersion: string}>` | Optional. Other modules that must already be installed and active, at or above `minVersion`, before this one can be installed. The install route rejects the install with a clear message if a dependency is missing or too old, and the update route re-checks the incoming release's dependencies the same way, so raising a `minVersion` in a new release refuses to land on a site whose dependency is still behind. Uninstalling a module that another active module still depends on is blocked the same way, in reverse. |
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
- Without `navGroupLabel`, your entries render as plain links directly under **Dashboard**, no section heading - not bucketed with other modules, not at the bottom of the sidebar. With `navGroupLabel`, your entries get their own named, collapsible section instead, rendered right after **Content** - use `navGroupOrder` to control ordering relative to other modules' labelled sections.

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
4. When they click **Update**, Cactus re-reads your `cactus.module.json` and checks the incoming release's `requiresCoreVersion` and `requiresModules` against the site. An update needing a newer core, or a newer version of a module the site hasn't updated yet, is refused with a message naming what to update first - it would otherwise break the site's next build on an import that doesn't exist there yet. (If your manifest can't be fetched at that moment, the check is skipped rather than blocking the update.)
5. Vercel builds → migration runner applies only new `.sql` files (already-applied ones are recorded in `ModuleMigration` and skipped).

### Disable

Disabling a module is a database flag flip - no redeploy, no data loss. The module's tables remain intact. Nav entries disappear immediately. Permissions remain in the Roles matrix but are marked inactive.

### Uninstall

1. Admin clicks **Uninstall** on the installed module.
2. A modal offers two options:
   - **Remove code only** - removes the submodule git entry and the `Module` DB row. Database tables are preserved.
   - **Remove code and data** - same as above, plus drops every table listed in `teardown`. Only available if the module declares `teardown` in its manifest.
3. On confirmation, Cactus commits the submodule removal to the main repo, Vercel rebuilds, and the admin sees live deploy status in the notification bell.
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

Modules hosted elsewhere can still be installed if the admin knows the repo URL - the directory only shows `cactus-foundation-modules` repos as a curated shortlist. See the next section.

## Writing a module for your own site

A module does not have to live in the module organisation, and does not have to be public. A site-specific module - something only one business would ever want - belongs in that owner's own GitHub account, where it never appears in anyone else's directory. The mechanics:

1. **Host it in your own account.** Any `https://github.com/you/your-module` repo works, public or private. The manifest, migrations, release tagging and versioning rules are all exactly as described on this page - nothing about authoring changes.
2. **Publish a GitHub release.** The install reads the manifest *at the release tag*, so an untagged repo cannot be installed. Pre-releases install through the Beta channel.
3. **For a private repo, grant the site's GitHub App access to it.** The same App the site already uses to commit its module registry can fetch private module code at deploy time - on GitHub: **Settings → Applications →** the app **→ Configure**, add the module repository. No new secret is involved. If you would rather not use the App (or the site is configured with a personal access token instead), set the `MODULE_CLONE_TOKEN` environment variable to a fine-grained PAT with read-only **Contents** access on the module repo; `GITHUB_API_TOKEN` is also tried as a last resort.
4. **Install it from Admin → Modules → "Add a custom module".** Paste the repo URL, pick a channel, press Install. The same checks run as for a directory install - manifest validation, `requiresCoreVersion`, `requiresModules`, table-prefix uniqueness - and a private repo the site could not fetch at deploy time is refused up front rather than breaking the next deploy.

Once installed, a custom module behaves exactly like a directory one: it shows in the Installed list (top of the Modules page), gets update badges when you publish a new release, updates with one click, and uninstalls the same way.

Worth saying plainly to anyone pasting a URL: a module runs inside the site's own runtime with full database access. Install code you trust.

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

## Module layout types

A module with its own public "listing" and "single item" pages (Directory's category/entry pages, Gazette's post listing/post pages, Boards' board/thread pages) can let site owners design those pages through the core Puck-based **Appearance → Layouts** editor, the same mechanism used for Header/Footer/Page Layout/404/Status Page - instead of a fully hardcoded page. Declare the group and its sub-types in `cactus.module.json`:

```json
"layoutTypes": {
  "groupLabel": "My Module",
  "types": [
    { "key": "myModuleCategory", "label": "Category", "starterImport": "./lib/starterLayouts", "starterExport": "myModuleCategoryStarters" },
    { "key": "myModuleEntry", "label": "Entry", "starterImport": "./lib/starterLayouts", "starterExport": "myModuleEntryStarters" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `groupLabel` | yes | Label for the top-level tab shown on the admin Layouts list/wizard (e.g. "Directory"). |
| `types[].key` | yes | camelCase layout type string, convention `<moduleName><Kind>` (e.g. `directoryCategory`). Becomes the value stored in `Layout.type`. |
| `types[].label` | yes | Sub-tab label (e.g. "Category"). |
| `types[].starterImport`/`starterExport` | no | Module-relative path (no extension) and named export of a `() => Array<{id, name, description, data}>` function providing starter templates for this type. Omit if you don't want to ship any starters. |
| `types[].editorPreview` | no | `{ "className"?: string, "maxWidth"?: number }`. Only for a **block-internal** layout type - one your own surface stamps into a container of its own rather than rendering as a whole page. Describes that container so the standalone editor and the preview page can reproduce it. See below. |

### Block-internal layout types and `editorPreview`

Most layout types render as a page: whatever the author builds is the whole output. A **block-internal** type is different - the layout is a flat list of parts, and one of your surfaces stamps it into a container of its own, once per item. Shop's Product Card is the worked example: `renderCards` wraps each stamped card in `<a class="shop-card">`, and that anchor is what arranges the parts - image on top, image beside the text, or image filling the card, chosen by a class on the parts and applied by the container with `:has()` and child selectors.

The catch is that the container only exists on your surface. Open the same layout in **Appearance → Layouts** and there is nothing around the parts, so every template of the type renders identically and any part positioned against the container escapes across the canvas. `editorPreview` closes that gap: name the class (and optionally a width, so a card previews at card size rather than full-bleed) and the editor and preview page draw the same container your surface does.

```json
{ "key": "shopProductCard", "label": "Product Card", "editorPreview": { "className": "shop-card", "maxWidth": 340 } }
```

Two rules make this work, and both matter if your CSS uses child combinators (`.shop-card > :not(.shop-card-img)`):

- **Emit the container's stylesheet from the parts themselves** when there's no context to say a surface already did. The core knows the class name, never the CSS.
- **Declare each part `inline: true` and attach `puck.dragRef` to its own root element.** Otherwise the editor wraps every part in a `<div>` of its own, which lands between the container and the part: the part stops being a grid item, `~` stops seeing siblings, and the wrapper (which Puck gives `position: relative`) becomes the containing block an absolutely-positioned part stretches to. Your live page has no such wrapper, so this is also what keeps editor and storefront markup identical. Note Puck also sets `position: relative` inline on that element, which outranks a stylesheet rule - a part that must position against the container needs `!important`.

Then tag any `puckBlocks[]` entries this layout type should offer, in addition to the usual page-builder palette:

```json
"puckBlocks": [
  { "type": "MyModuleCategoryHeader", "import": "./components/puck/MyModuleCategoryHeaderBlock", "component": "myModuleCategoryHeaderPuckComponent", "rscComponent": "myModuleCategoryHeaderPuckRscComponent", "layoutTypes": ["myModuleCategory"] }
]
```

`scripts/generate-module-layout-types.mjs` runs on every `npm run build`/`npm run dev`, alongside the Puck block generator. It writes two gitignored files: `lib/layout/module-layout-types.ts` (pure data - the groups list and a flat type→group lookup, consumed by the admin Layouts list/picker, `LayoutPuckEditor.tsx`, `app/layout-preview/[id]/page.tsx`, and `DisplayConditionsPanel.tsx`) and `lib/setup/module-starter-layouts.ts` (the starter-template loader functions, merged into core's catalogue by `lib/layout/starter-templates.ts`). Your tagged blocks additionally appear in `moduleComponentsByLayoutType`/`moduleRscComponentsByLayoutType` (from `lib/puck/module-components.ts`), scoped per layout type - core's `getModuleLayoutPuckConfig(type)`/`getModuleLayoutPuckRscConfig(type)` build an editor config from those blocks plus the shared layout/typography/actions/media/content categories (no site/members chrome, which doesn't make sense on a module content page).

**Keep your starter file pure data.** It must not import anything server-only (no prisma, no `next/headers`): the admin's new-layout picker imports the merged catalogue directly in the browser to draw a preview of each template. Plain object literals and local helpers, nothing more - which is what every existing module's `lib/starterLayouts.ts` already is.

**You get previews for free.** The picker draws each template's structure from its own `data` - containers (`Grid`, `Split`, `Section`, `Group`) give it the shape, and your blocks become boxes inside it. `components/admin/LayoutPreview.tsx` names no module and needs no registration; a block type it has not heard of falls back to a plain box, and the structure around it still tells the owner whether they are picking the sidebar variant or the full-width one. Nothing to ship, nothing to maintain.

**Rendering your public page with the published layout.** Your page fetches its data as normal, keeps its existing `notFound()`/visibility gating, and only then tries the layout:

```ts
const layout = await resolveThemeLayout('myModuleCategory', { moduleName: 'my-module', slug: category.slug })
if (layout?.builderData) {
  const data = injectCategoryContext(layout.builderData as PuckData, { categorySlug: category.slug /* ...whatever your blocks need */ })
  return <Render config={getModuleLayoutPuckRscConfig('myModuleCategory') as any} data={data as any} />
}
// else: fall through to your existing hardcoded JSX, unchanged
```

`injectCategoryContext` is your own small helper (`lib/inject-category-context.ts`), one per layout type - clone the stored Puck `Data`, walk `content`/`zones` recursively, and for any block whose `type` is in a fixed `Set` of your context-consuming block names, `Object.assign` your live request values into that block's `props`. This mirrors Shop's pre-existing `injectProductContext` (`modules/shop/lib/inject-product-context.ts`) - copy that file's shape rather than inventing a new one. Each context-consuming block should be a self-contained "anchor" (`permissions: { delete: false, duplicate: false }` for anything core to the page, e.g. the entry list or a reply list) that re-fetches its own data from the injected props - blocks don't share a data-fetch, each is independently sufficient.

**Every layout type you declare is seeded a default, and never at site setup.** One template per type is created as a published `<template-id>-live` Layout **when your module is installed**, not when the site is set up. The seeding runs in `markModulesDeploySucceeded()` (`lib/deploy/reconcile.ts`) as your install deploy lands, guarded by `Module.layoutsSeededAt` so a later *update* redeploy cannot re-mint a layout the owner has deleted.

Which template, per type (`planModuleSeedTemplates()` in `lib/setup/starterLayouts.ts`):

- one or more templates of that type marked **`publishByDefault: true`** - those are seeded. Mark the one that best matches the page your module renders without a layout;
- **none marked** - the **first** template of that type is seeded. Forgetting the flag no longer means the owner opens Layouts to an empty tab;
- **at least one marked `publishByDefault: false`** and none marked true - **nothing** is seeded for that type. Say it out loud like that when you genuinely want the owner to choose, and expect to justify it: a designable page type with no design is a puzzle, not a feature.

This was not always so. `publishByDefault` used to be a precondition, so a module that never set it got nothing - and because the install stamped `layoutsSeededAt` regardless, no later release of that module could put it right. Gazette shipped six starters, flagged none, and every site that ever installed it had an empty Gazette tab that no update could fill. Hence both halves of the fix: the flag is a preference rather than a precondition, and a stamped module owning **not one layout across every type it declares** is treated as never seeded and gets another go (`planModuleSeeds()`). A module with layouts for some of its types and none for others is left alone - deleting one type's layout to fall back to your hardcoded page is a decision, and re-minting it behind the owner's back would change a live site unasked.

That reconcile is **not guaranteed to run on the deploy it is reconciling**: the Vercel webhook or status poll is served by whichever instance is live at the time, which is routinely the previous build - one with no copy of your module's code, and therefore no copy of your starter templates. Seeding there would write nothing and stamp `layoutsSeededAt` regardless, turning "seed once" into "never"; that is exactly how a live Shop lost its product, index, checkout and confirmation layouts and 404ed every product URL. So the seed is also gated on `isModuleInBuild(name)`, which checks the generated `modulesInBuild` list rather than asking whether any templates were found (an empty list cannot tell "this module has no starters" from "this module's code is not here yet"). A module absent from the build is skipped **unstamped**, so the deploy that does carry its code seeds it - and the stamp now goes on only when the seed actually created something (or when your module declares no layout types at all), rather than on the mere fact of having tried. Anything that still slipped through - including installs stamped before any of these gates existed - is recovered by `seedPendingModuleLayouts()` on the next request, which picks up both a NULL `layoutsSeededAt` and a stamped module with no layouts whatsoever. None of this needs anything from you: ship your starters and the platform sorts out when they can honestly be seeded. Seeding module templates at setup used to be core's behaviour and was a bug: a fresh site has no modules, so it stamped every module's default layouts into sites that did not have the module. Correspondingly, if your module is uninstalled - or was never installed on a given site - its layouts are pruned by `pruneUninstalledModuleLayouts` (kept across a `code_only` uninstall, which preserves your tables and migration ledger for a reinstall; removed by `code_and_data`).

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
| `host` | no | Name of another module's settings **slot** to render this panel inside, instead of as a top-level Settings tab. See [Hosted settings panels](#hosted-settings-panels) below. When set, the panel does not appear as its own tab and is not a `/config?tab=` destination. |
| `import` | yes | Module-relative path to the file exporting the tab component (no `.ts` / `.tsx` extension). |
| `component` | yes | Named export for the tab's React component. Must be a client component (`'use client'`) - it's rendered directly inside the client-side settings page. It receives no props and manages its own state/fetching, exactly like a standalone admin page would. |

`scripts/generate-module-settings-tabs.mjs` runs on every `npm run build` and `npm run dev`. It rewrites `lib/modules/settings-tabs.ts` (gitignored, same pattern as `lib/puck/module-components.ts`) with a `moduleSettingsTabComponents` record keyed by `id`. The core settings page (`app/cactus-admin/config/page.tsx`, a server component) reads every active module's `settingsTabs` live from `Module.manifest`, permission-filters them the same way `navEntries` are filtered for the sidebar, and passes the visible list into the client page - which looks up each visible tab's component from the generated record.

Your tab's content renders with no extra chrome - no page title, no wrapping card - since it sits directly under the shared tab bar. Add your own heading only if the tab label alone wouldn't be enough context.

### Hosted settings panels

Sometimes a settings panel belongs *inside another module's* settings, not as its own top-level tab. A GoCardless payment provider, for example, should sit on the Shop's **Payments** tab next to Stripe and PayPal, not float as a separate "Instant Bank Pay" tab. Set `host` on the `settingsTabs` entry to the name of the slot to render into:

```json
"settingsTabs": [
  {
    "id": "gocardless-ibp",
    "label": "Instant Bank Pay",
    "permission": "shop.manage",
    "host": "shop.payments",
    "import": "./components/admin/SettingsTab",
    "component": "GoCardlessSettingsTab"
  }
]
```

The core settings page (`app/cactus-admin/config/page.tsx`) renders every hosted panel server-side, permission-filtered exactly like top-level tabs, and groups them by `host` into **two** shapes (both in `lib/modules/hosted-settings.ts`), threaded through `ConfigPageClient` to **every** module settings tab as optional props:

- `hostedSettingsSlots: Record<slotName, ReactNode>` - the slot's panels merged into one node. For a host that just drops them into a section of its own UI and needs nothing else about them.
- `hostedSettingsPanels: Record<slotName, { id, label, node }[]>` - the same panels kept separate, each still carrying the `id` and `label` from its manifest entry. For a host that has to say something *about* each panel first, which in practice means giving each one a tab, since a tab strip needs the labels up front and cannot recover them from a merged node.

Both are always passed, so a host can change its mind without a core change. The panel component itself is unchanged either way - it still receives no props of its own and manages its own fetching, saving and permission checks.

**To expose a slot from your own settings tab** (i.e. become a *host*), accept whichever prop suits and drop the nodes in where they belong:

```tsx
// Merged: everything contributed to the slot, under a heading the host wrote.
export function SomeSettingsTab({ hostedSettingsSlots }: ModuleSettingsTabProps = {}) {
  return <>{hostedSettingsSlots?.['some.slot']}</>
}

// Labelled: one tab per contributed panel. Shop's Payments tab does this - each
// payment method a module adds gets a button of its own beside the built-in ones.
export function ShopSettingsTab({ hostedSettingsPanels }: ModuleSettingsTabProps = {}) {
  const panels = hostedSettingsPanels?.['shop.payments'] ?? []
  // ...one tab per panel, labelled panel.label, rendering panel.node when active
}
```

A hosted panel saves through its own module's API, so a host showing one should stand its own Save button down while it is on screen - otherwise the button is there to be pressed and does nothing to what is under it.

The slot name (`shop.payments`) is a free string owned by the hosting module - core never knows or checks it, so a contributing module and a hosting module simply have to agree on the name (document your slot names in the host module's README). A hosted panel that targets a slot no host renders is silently invisible, so keep the contributing module's `requiresModules` / `requiresCoreVersion` in step with the version that introduced the slot.

## Module extension points

`settingsTabs` and `puckBlocks` are extension points *core* publishes. A few core pages publish generic points of their own that any module can contribute to:

| Point | Where it renders | Notes |
|-------|------------------|-------|
| `core.inbox-tabs` | **Inbox** (core screen) | A tab on the shared Inbox, for a module that receives messages (contact form, live chat). Entries take `label` and `order` on top of the usual fields. The panel is a **server** component and receives the page's query string as `searchParams`, so it can filter and page itself. Core hides the Inbox link entirely when nothing publishes into this point. |
| `core.media-tabs` | **Media** page | A tab beside Library and Video, for a media-adjacent tool (the watermark remover). Same `label`/`order` fields. |
| `core.roles-page` | **Users → Roles** | For modules needing per-user role assignment UI outside the core `Role`/permission model (Gazette's Contributor/Author/Editor tiers were the original example). |
| `core.admin-dashboard-widgets` | Admin dashboard | Summary widgets (e.g. Boards' thread/post counts). |
| `core.menu-entity-provider` | Menu editor | Data contract, not a component - lets a module's content appear as menu link targets. |
| `core.media-reference-rewriters` | Nowhere visible - runs on media edits | Data contract, not a component. A module that stores media urls in its **own** tables registers one async rewriter `({oldUrl,newUrl,oldKey,newKey}) => Promise<void>`; core runs every registered one as the final step of a media reference rewrite, so when the library moves a blob (optimise to WebP, rename, resize, crop, replace) the module's url columns follow it instead of 404ing. Shop uses it for product images (`shp_product_media`), shop-variations for image swatches (`svr_option_values`). Contract in `lib/media/reference-rewriters.ts`. A rewriter may throw: it runs **before** the old blob is deleted, so a failure aborts with the old url still serving. |
| `core.media-usage-providers` | Nowhere visible - feeds the media library's **Unused** count | Data contract, not a component. A module that references media from its **own** tables registers one async provider `() => Promise<string[]>` returning the raw reference strings those columns hold - media urls, storage keys or `Media` ids, in any mixture, and JSON columns can be returned whole as text. Core folds them into the same haystack it scans page and layout builder JSON with, so the item counts as in use. Register one whenever your module stores a media reference anywhere, or every image your module owns is counted as unused and offered up for bulk deletion. Contract in `lib/media/usage-providers.ts`. If a provider throws, core logs it and treats the **entire** library as in use rather than trusting a half-built index. |
| `admins.account-section` | Admin **Account settings** page | Per-admin self-service sections, rendered above the Delete account card (e.g. Twilio's SMS login codes card). Omit `permission` for self-service features every admin should see. |
| `members.account-section` | Member account overview page | Per-member sections (e.g. Shop's latest-order card, Twilio's text-message sign-in codes). No permission filtering - members have no permission keys. |
| `members.account-nav` | Member account **tab bar** | A **data contract**, not a component: export an async function `(member: {id, email, emailVerified}) => MemberAccountNavItem[]`, where an item is `{ key, label, href, badge? }`. `href` is a full public path, because the pages belong to your module and live under your own routes (Shop contributes `/shop/account/orders` and `/shop/account/addresses`). `badge` is a small count pill - use it for things waiting on the member, not for a total. Contract in `lib/members/account-nav.ts`. Return `[]` when your module has nothing to offer this member (switched off, gated, not applicable): a tab that leads to a "not available" notice is worse than no tab. A provider that throws is logged and dropped rather than taking the account area down, but do not rely on that - a member locked out of their own security settings by your bad day is not a good look. |

**Member pages your module owns.** A tab from `members.account-nav` points at a page under your own routes, and that page is *not* inside `app/(public)/cactus-account`, so it never sees the member area's layout - left alone it renders bare, with no tabs and no way back to the account. Wrap it in core's shell instead:

```tsx
// modules/<you>/app/public/<you>/account/things/page.tsx
import MemberAccountShell from '@/components/members/account/MemberAccountShell'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMemberAreaPath } from '@/lib/members/paths'

export default async function ThingsPage() {
  const member = await getMemberFromCookie()
  // Your gate, not core's: only you know where to send them back to.
  if (!member) redirect(`/${getMemberAreaPath()}/login?redirect=/<you>/account/things`)

  return (
    <MemberAccountShell member={member} maxWidth={880}>
      {/* your page */}
    </MemberAccountShell>
  )
}
```

Pass `member` when you have already loaded it (you will have, for the gate) and the shell skips a second session lookup. `notice` takes a page-level banner rendered above the tab bar; `maxWidth` defaults to 720. The shell deliberately does **not** redirect - a signed-out visitor gets your children rendered bare, because core does not know which of your paths to send them back to afterwards.

A module can publish its own extension points too, for other modules to contribute to - most commonly a module extending the pages of a hard dependency it declares in `requiresModules`. Core never learns the point's name; it only runs the generic collection mechanism described below.

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

A point may define **extra fields of its own** on top of these. The generator only ever reads `point`/`id`/`import`/`component`, and the host page reads the manifest out of the database itself, so anything else a point documents rides along for free with no generator change. `shop.product-editor-sections` uses this for `label` (the tab's name) and `order` (where it sits among the editor's own tabs) - see below. Always give such a field a sensible fallback in the host: a manifest written before the field existed simply will not have it.

`scripts/generate-module-extension-points.mjs` runs on every `npm run build` and `npm run dev`. It collects `extensionPoints` from every installed module's manifest, groups them by `point`, and writes the gitignored `lib/modules/extension-points.ts` (`moduleExtensionPointComponents: Record<point, Record<id, Component>>`) - same generated-file pattern as `lib/puck/module-components.ts` and `lib/modules/settings-tabs.ts`.

### Points that aren't components

A contribution doesn't have to be a React component. `component` just names an exported binding, so a point can equally collect a plain function (`contact-form.thread-messages`, `shop.cart-line-resolver`) or an object of several exports (`core.menu-entity-provider`, `shop.product-detail-parts`). The host module declares the contract as a TypeScript type in its own `lib/`, and the contributing module imports that type and satisfies it - `modules/shop/lib/line-meta.ts` and `modules/shop-variations/lib/line-resolver.ts` are the shortest example of the pair.

A `shop.cart-line-resolver` may also return an optional `control` - a small, declarative per-line picker (a `key`, a `label`, the current `value`, and a list of `options`). Shop renders it generically as a `<select>` on each basket line and, when it changes, writes the choice back into that line's meta and re-validates - so the contributing module never ships a React component into shop's cart, only data. `advanced-shipping-for-shop`'s delivery-tier picker (`modules/advanced-shipping-for-shop/lib/line-resolver.ts`) uses this: the same resolver call prices the chosen tier, snapshots the promised date onto the order line, and describes the picker the shopper changes.

Each option may additionally carry a numeric `priceAdjust` - the same figure already baked into its label. When present, a new-enough shop moves the line price and subtotal the instant the shopper picks the option, then reconciles with the server's re-validate; the server-calculated price remains the only one that is ever charged. The field is optional both ways: a resolver that omits it simply leaves the price to catch up when the round-trip returns, and an older shop ignores it.

`renderAs` picks the presentation: `'select'` (the default dropdown), `'radios'`, or `'summary'` - the chosen option confirmed in place as a ticked bar with every other option beneath it as a one-click chip. `'summary'` asks more of the resolver, because shop will not take a label apart to find the date or the price inside it: every option must also carry a `summary` of `{ headline, secondary?, switchLabel?, priceLabel? }`, which shop displays verbatim. Miss it off any one option and shop quietly falls back to the radio group rather than render half a card. `advanced-shipping-for-shop`'s `tierOptionSummary` is the worked example - the same delivery service split into "Arrives by Thu 6 Aug", "Flat-pack", "Flat-pack by Friday" and "Free".

A per-line resolver can only speak about its own line, so there is a companion point for the thing only the whole basket knows: `shop.cart-summary`. A provider takes every cart line (`{ product, quantity, meta }` - the shopper's raw meta, so it applies its own defaults exactly as its line resolver does) and returns one short `{ id, text }` note, or null when it has nothing to say. Shop shows the notes in the cart's sticky checkout bar beside the item count and never composes or interprets the wording. It runs after the lines resolve, so the request-scoped caches the prefetcher warmed are already full - a provider should be arithmetic over those, not a fresh round of queries. A provider that throws is skipped rather than allowed to fail the validate: these notes are chrome, and no shopper should lose their basket display over a decorative line. `advanced-shipping-for-shop`'s `summariseCartDelivery` is the worked example - it walks the lines for the latest promised date and returns "everything by Fri 4 Sep".

A resolver runs once per basket line, so if it does its own database reads it will fan out across a whole cart. A resolver that reads the database should therefore also register the companion `shop.cart-line-resolver-prefetch` point (same `id`, a function taking the full `ShpProduct[]` for the cart). Shop calls every prefetcher once, up front, before it folds the lines, so the module can resolve the whole cart in one batched pass and stash the result in a request-scoped `cache()` store that the per-line resolver then reads. The prefetch is optional and additive: a resolver without one, or an older shop that predates the point, simply falls back to the resolver's own per-line lookups. `advanced-shipping-for-shop` (`lib/delivery-cache.ts`) and `shop-variations` (`lib/addon-cache.ts`) are the worked pair - batching the delivery-estimate and add-on lookups this way is what keeps a multi-line cart a handful of queries rather than a handful per line.

### Restating a snapshot when the facts change: `shop.order-payment-state`

A cart-line resolver writes its line snapshot once, at the moment the order is placed, and every surface afterwards - the thank-you page, the confirmation email, the account's order history, the admin - reads that prose back verbatim. That is exactly right for a personalisation ("Engraving: For Dad") and wrong for anything whose truth depends on the money having arrived. `shop.order-payment-state` is the seam for the second kind. Shop calls every provider with `{ order, items }` at the two moments an order's payment state moves: straight after the order is created (the first point at which it knows which method it is on) and again inside `fulfillPaidOrder` before any email is composed. A provider returns `{ items?, note? }` - replacement `LineMetaField`s for named order items, which shop merges into the stored `line_meta` **by label** so a module restates its own field and nothing else on the line moves, plus one optional sentence shop prints under the chosen method on the checkout's payment step. Returning `null` is the normal answer and costs nothing.

There is a third moment, and it is the one the shopper actually needs: **the instant they pick the method**, before an order exists at all. `POST /api/m/shop/public/checkout/payment-note` takes `{ lines, paymentMethod }` and calls every provider with the same `{ order, items }` shape plus `preview: true` (`previewOrderPaymentNotes`, `lib/order-payment-state.ts`). The payment method and the resolved line meta are real; every other figure on that order is a placeholder and the ids point at nothing, because at that point in the checkout the address may be half-typed and the totals are not settled. Only `note` is used - line restatements are dropped, since there is no line to restate - and nothing is written or created. A provider that reads only what it is handed can ignore the flag entirely; one that goes back to the database for its own order row, or writes anything of its own, must return `null` when it sees it. Without this the sentence arrived from the order-creating route instead, which cannot be called until the whole checkout is filled in and every compulsory box is ticked - so the shopper was told what bank transfer does to their delivery dates some way past the point they were deciding.

Two supporting details make it work. `LineMeta` carries an optional `data` bag - opaque, namespaced per module, never read by shop - so a resolver can stash the machine-readable version of its promise (a service key, a working-day count) rather than having to parse its own sentence back apart later. And a provider that throws is caught and skipped: the order is already written and the payment is the next thing to happen, so a module having a bad day must not cost the shopper their checkout.

`advanced-shipping-for-shop`'s `restateDeliveryForPayment` is the worked example, and its first cut is the cautionary tale. It keys on `order.paymentStatus` and nothing else - never on a method id, and no longer on the provider's `confirmMode: 'manual'` either. Keying on `confirmMode` sounds right and reads as "the money has not moved yet", but it is really "the shopper has a job to do", and the two come apart: Instant Bank Pay is an `'auto'` method whose payment is merely submitted at the checkout and collects a working day or two later, so orders on it sat unpaid promising dates counted from a starting gun that had not fired. The rule is now the plain one - while the order is unpaid every delivery line states a lead time instead of a date; the moment it is paid, each line is re-dated from `order.paidAt` using the service the shopper actually bought. `confirmMode` is still the right key for the checkout `note`, which genuinely is about a job the shopper has to go and do.

### Keeping your own rows in step with a product: `shop.product-saved`

A module that mirrors part of a product into rows of its own has a standing problem: it hears about the copy it makes, and never about the original changing afterwards. `shop.product-saved` (`modules/shop/lib/product-saved.ts`) is the seam for that. A hook is `(productId: string, changed: readonly string[]) => Promise<void> | void`, where `changed` names only the fields that write actually carried - so the usual answer is to look at the array and return.

The important part is **where it fires**: at the end of `updateProduct` in shop's own `lib/db`, not in the admin route. A product is written from at least three places that never meet a route handler - the editor's PUT, the CSV upload, and the Google-Sheet Pull, the last two by the hundred in a loop - and hooking the route would have covered one of them. The registry read is memoised for the same reason, and skipped altogether when the build carries no module that declares the point, so a shop-only site pays nothing.

Two rules. The hook is awaited, so whatever it writes has landed before the caller reads the product back - but every hook is also try/caught and its failure logged rather than raised, because a listener falling over must never lose the owner's edit. And a hook should be cheap on the fields it does not care about: it runs on every save, of every product, including the middle of an import.

`shop-variations`' `syncVariationsOnProductSaved` is the worked example, and shows what the point is for. Each variation is a hidden child product row of its own, so shop rates a basket line from the **child's** tax class while the product page prices from the **parent's**. The children copied the class when they were created and nothing put them back in step, so a shop that set up VAT after generating its matrices quoted the same chair with tax on the page and without it in the basket. The listener gates on `changed.includes('taxClassId')` and runs one `UPDATE` that moves only the children that disagree.

### Enhancing one field the host owns: `shop.checkout-address-lookup`

Sometimes the contribution is behaviour on top of a field shop already renders, not a new surface. `shop.checkout-address-lookup` collects a **client** component that shop mounts in place of the checkout's plain Address line 1 field - first registered provider wins, in manifest order. The contract (`modules/shop/components/public/checkout-address-lookup.ts`) is `{ value, onSelect, renderInput }`, and `renderInput` is the point of it: the provider calls it to render **shop's own** labelled input, passing whatever extra input props it needs (ARIA combobox attributes, `autoComplete: 'off'`), so the field can never drift visually from its siblings and keeps working untouched when the provider does nothing. The provider layers its own dropdown, keyboard handling and fetches around that input, and calls `onSelect` with a complete `{ line1, line2, city, county, postcode }` when the shopper picks a suggestion - shop applies it as a single state update. Two rules learned the hard way: the resolver lives server-side only (`modules/shop/lib/checkout-address-lookup.ts` reads the generated extension registry, which statically imports Prisma-touching module code - it must never reach a client bundle, which is also why the shipping block's RSC half sits in its own `rscImport` file), and a provider must degrade to nothing on any failure - a checkout that breaks because an address API is down is worse than no lookup at all. `address-lookup-for-shop` is the worked example.

### One point for one decision: `shop.commerce-mode`

Some questions cannot be answered a piece at a time. "Does this shop take money?" is one: the wording on the buy button, where the basket's forward button leads, whether a price may be printed at all, and whether `/shop/checkout` serves a page are four consequences of a single decision, and a shop that has switched its checkout off while still saying "Add to basket" everywhere reads as broken rather than as either mode.

So `shop.commerce-mode` collects a provider that hands back **the whole shape or nothing**:

```ts
import type { ShopCommerceMode, ShopCommerceModeProvider } from '@/modules/shop/lib/commerce-mode'

export const quoteCommerceModeProvider: ShopCommerceModeProvider = {
  resolve: async (): Promise<ShopCommerceMode | null> => {
    const config = await getQuoteConfigCached()
    if (config.mode !== 'QUOTE_ONLY') return null   // no opinion: shop behaves exactly as before
    return {
      mode: 'quote',
      addLabel: config.addToQuoteLabel,
      cartCtaLabel: config.cartCtaLabel,
      cartCtaHref: '/quote',
      hidePrices: config.hidePrices,
      hiddenPriceLabel: config.hiddenPriceLabel,
      blockedMessage: 'This shop works by quote.',
    }
  },
}
```

Three things in that shape are worth copying into any point of your own:

- **Returning `null` means "no opinion", not "no".** A provider that only cares in one of its own modes returns nothing in the others, and the host's own default stands. Answering `'cart'` would be claiming a decision the module has not made.
- **The first provider with an answer wins.** Two modules disagreeing about whether the shop takes money would leave the storefront half in each, so shop does not merge them.
- **A provider that throws is ignored.** An add-on with a broken settings read must not take a storefront down with it, and the host always has a safe answer of its own.

The pure half of the contract - the types, the defaults and the two helpers that decide what a surface prints (`commerceModeMoney`, `commerceModeButtonLabel`) - lives in `modules/shop/lib/commerce-mode-shared.ts`, apart from the resolver that reads the database. That split is what lets shop's client cart components honour the same mode with the same defaults; a client component importing the resolver would drag Prisma into the browser bundle. If you publish a point whose answer both server and client surfaces need, do the same.

### Putting a control where a shopper will find it: `shop.cart-header-actions`

`shop.cart-header-actions` collects components shop renders on the basket page's own heading row, to the right of "Your basket". `quote-for-shop` contributes two ("Save basket as a quote" and "Retrieve quote"), each a server component that reads its own settings and returns `null` when the owner has switched it off.

It exists for a specific problem: a control a shopper has to be able to **find without having been told it exists** cannot depend on the site owner having dragged a block onto a layout. The right answer is usually both - the point for the default placement, a Puck block for owners who want it somewhere else, and a setting that turns the automatic one off so they never get two.

### Contributing a tab that saves with the host's form

`shop.product-editor-sections` is the worked example of a point whose contributions are not a panel bolted underneath, but a **tab inside the host's own form**, saved by the host's own Save button. It is worth copying whenever a host page is a form and a contributor needs to add fields to it, because the obvious alternative - every contributor growing its own save button - gives the user three buttons and no idea which one did what.

Two halves make it work:

- **Server components, rendered by the host page, handed to the client shell.** The page renders each contributed server component and passes it as a `ReactNode` prop into the client shell (`ProductEditor`), which renders it inside a client context provider. Context flows into server-rendered children perfectly well - they are just elements by the time the provider renders them - so a *client* component nested inside a contributed *server* component can still call the host's hooks. That is what lets a contribution stay a server component (and do its own data loading) while still taking part in a client-side form.
- **The contributor registers, the host orchestrates.** `modules/shop/components/admin/product-editor/context.tsx` exports the contract: `useProductEditorSave({ dirty, save })` hands a tab's unsaved edits to the single Save button (throw an `Error` from `save` to fail it - the message is shown against the tab's name); `useProductEditorTabBadge(text)` puts a count on the tab; `useProductEditorCurrency()` shares state the host has already loaded so the contributor need not fetch it again. Registration keys off `useId()` plus the scope's tab id, so a contribution never has to name itself or know where it was mounted.

Rules worth keeping if you build one of these:

- **Make the hooks inert outside the host.** They read a context that is simply absent elsewhere, so the same component can be used on a standalone page without branching.
- **Only form fields belong on the Save button.** Structural actions (shop-variations' "add an option", "generate variants") still apply immediately, because they are jobs rather than typed-in details. Holding an action back behind Save reads as broken.
- **Contributions save independently, so report per-tab.** They are separate endpoints; one failing cannot roll the others back. Say which tab failed rather than a blanket "could not save", and leave the failed tab dirty so nothing is silently lost.
- **Bump `requiresModules` when you use one of these APIs.** A contributor importing `@/modules/shop/components/admin/product-editor/context` depends on a specific shop version, exactly as `requiresCoreVersion` works for core APIs. `shop-variations` and `product-attributes-for-shop` both pin `shop >= 0.1.38` for this reason.

A sibling point, `shop.product-editor-media-sections` (shop v0.1.216), does the same for a contribution that does **not** deserve a tab: it renders at the foot of the editor's own **Images** tab, under the picture grid. `shop-variations` uses it to contribute the variations it has promoted with "Image up front", which belong beside the pictures they are arranged among and would be absurd as a tab of their own. Everything above still applies (server component, rendered by the page, `useProductEditorSave` for the save), with two differences worth copying if you add a point like it:

- **No label, no order in the strip.** A contribution here is not a destination, so it carries no name of its own; it borrows the host section's heading style and the manifest's `order` only decides which contribution comes first when there is more than one.
- **The tab scope does the work.** Because the panel is rendered *inside* the Images tab, `useProductEditorSave` registers against that tab with no extra plumbing - the unsaved dot lands on **Images**, which is where the admin just clicked, and the failure message names it too.

The general shape: when a contribution is *about* something the host already shows, put it next to that thing rather than in a tab where the user must go looking for the connection.

#### Putting your own pictures in the host's grid

Sitting *under* the grid is still a second place to look. Where a contribution is not commentary on the host's pictures but more pictures of the same gallery, it belongs *in* the grid, dragged about with the rest. Shop's `product-editor/gallery-extras.tsx` (shop v0.1.259) is how: a client component rendered inside the Images tab calls `useRegisterGalleryExtras(items, handlers)`, and shop draws those tiles among the product's own, one set of arrows for the lot. `shop-variations` uses it for the variations promoted with "Image up front".

- **One ordinal space, not two piles.** Each contributed tile carries a `position`: its index in the *finished* gallery, the host's own pictures counted in. `null` means "after the host's own", which is where a new one starts. That is the whole reason for the point - a tick box saying which pile goes first cannot express "the oak one, then our two studio shots, then the walnut".
- **Read the order back forgivingly.** Reconstruct with the same insert-at-index rule both sides use (`modules/shop-variations/lib/gallery-order.ts`), so a tile that asked for slot 7 of a four-picture gallery lands at the end rather than being stranded past it. Anything stricter needs the two owners to write to each other every time either changes.
- **The host never decides what a gesture means.** It reports a drag, a typed description and a press of the **×**; the contributor decides. shop-variations' **×** is "off the gallery, still on the variation", which shop has no way of knowing and no business guessing - so the tile carries a `removeLabel` saying so in words.
- **`items` need not be memoised, handlers must not be depended on.** The registration is keyed off the items' *contents*, and handlers are held in a ref - they close over the contributor's state and change on every keystroke, and re-registering for that would put the grid in a loop.

### Replacing a part rather than adding to one

Most points are additive: the host renders its own page and contributions land alongside. Sometimes a contributor instead needs to *take over* a part the host already renders, because the host's version would be wrong. Shop's `shop.product-detail-parts` point is the worked example - a product with options has no single price or stock level of its own, so shop's static price and add-to-cart would contradict what the shopper actually chose. Rendering both is not an option; the shopper would see two prices.

The pattern, in `modules/shop/lib/detail-slot.ts`:

- **The provider claims, the host decides.** The contract's `claimsProduct(product)` runs server-side, once per page, and answers "do you own this one?". The host resolves it once and passes the result down, so a claimed product renders the provider's components and an unclaimed one renders the host's own, untouched. On a site without the contributing module the point is empty and nothing changes at all - which is what keeps the host's defaults honest for everyone who doesn't have the module.
- **The host keeps owning the look.** It hands its own CSS class names down as props and the provider renders into them, so a replaced part still looks like the layout it sits in. Otherwise the swap is visible to the shopper as a style change, and the host stops being the single owner of its own chrome.
- **The host hands over its server-loaded data.** Shop passes the product's images and price along, so the provider paints immediately from server data rather than flashing empty while it fetches its own.
- **Whoever renders the part owns all of it.** Shop deliberately does *not* apply its own out-of-stock gate to a claimed product: stock lives on the chosen combination, not the parent row. Splitting the decision between host and provider is how you get a button that disagrees with the price above it.
- **Stand down where the author has already done the job by hand.** A take-over point assumes the host's part is the only thing doing that job. It often isn't: a layout written before the point existed does the same job with the provider's own granular blocks, dropped in by hand. Take the slot over *as well* and the page shows the answer twice. So the contract's `coveredSlots(blockTypes)` hands the provider the block types present in the layout and asks which slots are already covered; the host renders **nothing** for those. Note it renders nothing rather than falling back to its own part - a layout holding both shop's Price and the provider's price block would otherwise show the parent's static price next to the chosen combination's, and the shopper reads two different prices for one product. The author placed the provider's block deliberately; it wins outright. For pieces the host has no part for at all (an options picker), there's nothing to stand down, so the host instead passes `layoutBlockTypes` to every slot component and the provider drops those pieces itself.

This is what lets a module change a host's default layout without either one hard-coding the other: shop's starter layout never mentions variations, and shop-variations never edits shop's starter layout. Note which way the knowledge runs - the host passes block-type *strings* it attaches no meaning to, and the provider is the only side that knows `ShopVariantPrice` means "price".

### Additive contributions to a part that is already claimed

A take-over point has a hard edge: only one provider can win, so once it is claimed, a *second* module has nowhere to stand. Shop hit exactly this. `shop.product-detail-parts` hands the whole gallery to shop-variations on any product with options, so a module wanting to add a 3D model to the gallery could not reach the products that most needed it - the ones with variations.

The answer was a second, **additive** point beside the claim-and-replace one, not a second claimant: `shop.gallery-media` (`modules/shop/lib/gallery-media.ts`), whose live consumer is `product-3d-views-for-shop`. It is worth copying whenever a host part is already claimable but contributions to it should still stack.

- **Additive means every provider resolves, not just the first.** The two-prices failure that forces claim-and-replace to pick a winner does not exist here: nothing replaces a part of the host's, so several contributors simply mean several extra thumbnails.
- **A contribution is a bonus, so it must not be able to take the page down.** A provider whose `load` throws is dropped and logged, and the product still sells. Weigh this the other way for a point the page cannot do without.
- **Every renderer of the part must honour it, including the claimant.** Shop resolves the contributions once and passes them to *whichever* gallery renders - its own, the slot provider's replacement, and the provider's granular block that covers the slot. Miss one and installing the contributing module silently does nothing on exactly the layouts that use it.
- **Only client components cross to a client host, and functions never do.** The host's gallery is a client island, so `Thumbs`/`Stage` carry their own `'use client'` boundary and travel as client references; `load` is server-only and stays behind. This is why a contributor filters its own items rather than the host calling a predicate into it - a function prop would not survive the RSC boundary at all.
- **Give the contributor the knowledge only the host has.** Shop cannot know which variation a shopper picked, so it passes `null`; shop-variations' gallery passes the chosen child product's id. The contract is the same either way, and the contributor narrows itself.
- **Resolve it where the host builds its context, not inside the part.** `wrapResponsiveRender` calls a block's `render` as a plain function, so a part that awaits is handing it a promise rather than markup. Shop resolves in `ShopProductDetail.rsc.tsx` alongside the slot and carries the result on `DetailPartContext`.

The general lesson: when a point is winner-takes-all and you find yourself wanting a second winner, the answer is usually a second point with different semantics, not a bigger claim.

### The same contribution as data, for a view that cannot render components

`shop.product-detail-images` (`modules/shop/lib/detail-images.ts`) is the additive point above with the components taken out: a provider's `load(productId)` returns plain image URLs and a placement (`'before'` or `'after'` the product's own), and the host does the rendering. Its live consumer is `shop-variations`, which contributes the variations an owner has promoted onto the parent's gallery, and its live host is the chrome-free `/shop/products/<slug>/details` view that a companion module's "Learn more" modal iframes.

It exists because `shop.gallery-media` could not serve that view. That point hands over a thumbnail strip and a stage, both of which assume an interactive gallery with a notion of what the shopper has picked; the details view is a row of `<img>`s inside someone else's modal, with no stage and no selection, so there was nothing for those components to render into.

- **Ask for data when the host has more than one kind of renderer.** A component contribution binds the contributor to one host UI. The same facts as data serve a gallery, a bare strip, and whatever the host builds next.
- **Placement is the contributor's to state, not the host's to guess.** Whether promoted variations sit in front of or behind the product's own photographs is a per-product setting the contributor owns; the host would have to learn about variations to work it out, which is the thing these points exist to avoid.
- **Reproduce the host-visible rule, not just the data.** The provider applies the product page's own rules - enabled and promoted only, matrix order, one representative picture each - so the two views cannot drift apart. A second implementation of the *selection* is the part worth being careful about; the rendering was never the risk.
- **De-duplicate at the join.** A promoted variation may carry a photograph the parent also has, and the same picture twice in a short strip reads as a fault. First occurrence wins, so the requested order survives.

### A tab in a host's tab strip

`shop.product-detail-tabs` (`modules/shop/lib/detail-tabs.ts`, shop v0.1.50) lets a module add a tab to the product page's own strip, beside Description and Specification. Its live consumer is `product-downloads-for-shop`, whose **Downloads** tab lists a product's manuals and spec sheets.

It is `shop.gallery-media` copied almost line for line, and that is the point of mentioning it: once a host has one additive point, the next one is a known shape rather than a design problem. The same rules apply - every provider resolves, a throwing `load` is dropped and logged, the `Panel` is a client component, and it is resolved in `ShopProductDetail.rsc.tsx` onto `DetailPartContext` rather than inside the part. Three things it does differently are worth stealing:

- **Returning null means "no tab".** A contributor with nothing for this product says so, and the strip renders exactly as it did before. Without that, installing a module would put an empty tab on every product in the catalogue - the additive point's version of the two-prices failure.
- **`label` and `order` live on the provider object, not the manifest entry.** This is the opposite of `shop.product-editor-sections`, and deliberately. The manifest's `label` is stripped by the install-time zod schema (`lib/modules/manifest.ts` declares only `point`/`id`/`permission`/`import`/`component`, and zod drops the rest) and is only restored when `scripts/sync-module-manifests.mjs` writes the raw JSON back on the next deploy. So a manifest-labelled tab spends its first week named after its own id, behind a `fallbackLabel()` that exists solely to make that survivable. A provider *object* is always fully present, so its label always is too. Put metadata on the manifest when the contribution is a bare component that cannot describe itself; put it on the provider when the contribution is an object that can.
- **Number the host's own items when you open them to contributions.** Shop's tabs had no order at all until this point existed; they were an array in source order. `TAB_ORDER` in `detail-parts.tsx` gives them 10/20/30/40 so a contributor can land *among* them rather than only after them, and an unordered contribution defaults to 50. Spacing by tens is the cheap part; the expensive part is remembering that "after everything" is a poor default when the host's own items have a meaningful order.

One trap this point had to design around, which any host with a dual-compiled file will hit: `detail-parts.tsx` is imported by both the RSC config *and* the client Puck editor bundle, so it cannot import `lib/modules/extension-points` at all - that module's static imports reach prisma, and dragging prisma into the editor bundle breaks the build. The registry is therefore only ever touched from `ShopProductDetail.rsc.tsx`, which is server-only by construction, and the resolved contributions ride to the part as data. If a host part renders in the editor as well as on the page, resolve elsewhere.

### Taking over a host's tab body (not a whole part)

`shop.product-detail-spec` (`modules/shop/lib/detail-spec.ts`, shop v0.1.100) sits between the two shapes above: it is a *take-over* point like `shop.product-detail-parts`, but it replaces the **body of one tab** rather than a whole part. Its live consumer is `product-attributes-for-shop`, which swaps shop's own Specification facts table (SKU, type, weight, dimensions) for the product's attributes grouped into headed sections. A provider's `load(productId)` returns null when it has nothing for a product, and shop keeps its own facts table - the same "returning null means no take-over" rule the additive points use, which is what stops installing the module changing a product until an attribute is actually flagged for the page.

It is single-winner, like `shop.product-detail-parts` and unlike `shop.product-detail-tabs`, and for the same reason: two modules both answering "what is this product's specification" would contradict each other, so the first provider with a non-null payload wins and the rest stand down. But it does **not** claim the whole product the way `shop.product-detail-parts` does - the tab, its name, its place in the strip and its styling all stay shop's, so this take-over composes cleanly with a variation product that shop-variations has already claimed for pricing. When a take-over is scoped tightly enough (one tab body, not the page's identity), the single-winner edge that bites the parts point never comes up. Resolved in `ShopProductDetail.rsc.tsx` onto `DetailPartContext.specOverride` and consumed in `buildDetailSections`, for the same dual-compile reason as the tabs point above.

The panel props also carry an optional layout hint, `autoSort?: boolean`, fed from the Sections block's **Auto-sort specification groups** field. It is a hint, not a contract: a provider whose body is a set of groups may re-order them for the tightest column fill, and a provider with no notion of groups ignores it.

### Answering a metadata question for the host's page

`shop.product-social-image` (`modules/shop/lib/product-social-image.ts`) is the smallest shape yet: a single-winner point whose provider is a plain server-safe function answering one question - *which picture will this product's page open on for THIS request?* Shop's `generateMetadata` asks it before falling back to the product's own first photograph, and the answer becomes the page's `og:image`, so a shared link's social preview shows the configuration the link carries rather than the stock photo. Its live consumer is `shop-variations`, whose provider replays the gallery's own opening-image derivation against the request's picks.

Two request-scoped conventions make it work, both the same `cache()` slot trick as shop-variations' bootstrap:

- **`modules/shop/lib/product-page-params.ts`** - shop parks the product page's raw `searchParams` here (from `generateMetadata` *and* the page component, whichever runs first), and any companion module reads back the parameters it owns. Shop never learns what `seat-colour=oxford-blue` or `pad=...` mean; it only holds the map. This is also how a shared link's selection reaches `getVariationBootstrap` during the page render, so the option controls arrive in the first HTML already set.
- **The deep-link preselection slot** (`rememberPreselectOptionValues`) - already written by the `shop.product-page-resolver` provider before the social-image point is asked, so a variant's own URL and a parametered parent URL resolve through one code path.

The provider runs inside `generateMetadata`, so everything it touches must be server-safe, and it must never throw for a malformed parameter - an unreadable pick means "no answer", never a broken page. Note the resolution order in shop's `generateMetadata`: park the search params, resolve the product (running the page resolver for a deep link), *then* ask this point - a provider asked before the deep link is recorded would answer for the wrong configuration.

`shop.products-tabs` (`modules/shop/app/cactus-admin/shop/products/page.tsx`, shop v0.1.92) lets a module add a whole-page tab beside the built-in list on the Products admin page. Its live consumer is `shop-variations`, whose **Variations** tab lists every variation across the shop with per-product and missing-image/missing-file filters. Use it when a module has a *catalogue-wide* view that belongs next to Products rather than as its own sidebar entry.

It is the simplest tab point of the lot, because there is no shared form to save into (unlike `shop.product-editor-sections`): a contribution is just a self-contained screen.

- **The host resolves the tabs, the client screen owns the strip.** `resolveProductsTabs` reads each active module's manifest, permission-filters per entry, and builds `ProductsTab[]` (`{id, label, order, node}`) passed into the client `ProductsScreen` with `initialTab` (from `?tab=`). The `node` is the contributed component already rendered - a client component here, since it is interactive and self-fetching, but a server component would work exactly as `shop.product-editor-sections` does.
- **Render only the active tab.** `ProductsScreen` shows a `TabStrip` only when at least one tab is contributed (a plain shop is byte-for-byte unchanged), keeps "Products" as the first tab, and mounts *only* the active tab's node - so a contributed screen does not fetch until it is opened, and the host's own products fetch is skipped while a contributed tab is active.
- **`label`/`order` on the manifest entry, with a fallback.** Like `shop.product-editor-sections`, these ride as extra manifest fields the generator ignores; the install-time schema strips them until the next deploy restores them, so the host derives a tidy label from the entry id in the meantime. Pick an id that reads well on its own (`variations`, not `shop-variations-list`) so that fallback window is invisible.

### A column in a host's table

`shop-variations.variant-columns` (`modules/shop-variations/components/admin/ProductVariationsSection.tsx`) hangs an extra column on the variants table, one cell per variant. Its live consumer is `product-3d-views-for-shop`, whose **3D** column sits beside the Image column and takes a dropped model file for that variation.

It exists because the alternative was worse in a way worth spelling out. Setting a variation's picture and setting its 3D model are the same errand, but the picture lives in shop-variations' table and the model belongs to a module shop-variations has never heard of and does not depend on. Teaching the table about 3D would have put one module's UI inside another's - the exact thing module isolation is for - so the table learned about *columns* instead, and knows nothing about what any of them are for.

- **The host leaves a gap; it does not describe the contents.** A cell gets `productId`, `variantId`, `childProductId` and `label`, and owns everything after that: its own storage, its own fetching, its own saving. shop-variations has no 3D code in it, and a site without the 3D module installed has no such column.
- **`childProductId` is the knowledge only the host has.** A variation is a hidden child product, and its id is what a contributor needs to attach anything to it. Passing it is the whole point of the contract - the same lesson as `shop.gallery-media` above.
- **A contributed cell must be a client component.** The table is a client island that fetches its own variants, so the cell renders in the browser once per row; only client references cross that boundary. `ProductVariationsSection` is a server component and resolves the manifests, the permissions and the registry, because none of that can happen in the browser.
- **Contributed cells save themselves.** The rest of the table registers its edits with the product editor's single Save button, and this deliberately does not. The columns this point exists for carry uploads, and holding a 40 MB file in memory as a pending edit - lost on a tab change, applied later - would be a lie that costs the admin their upload. Weigh it the other way for a column of typed-in text.
- **`label` and `order` ride along on the manifest entry.** Same trick as `shop.product-editor-sections`, with the same fallback rule: a manifest written before the field existed will not have it.

## Module cron jobs

A module can register Vercel Cron jobs by declaring `cronJobs` in `cactus.module.json`:

```json
"cronJobs": [
  { "path": "/api/m/my-module/cron/sync", "schedule": "0 6 * * *" }
]
```

`path` is dispatched through the same generic `/api/m/[module]/[...path]` router as any other module API route - just create `app/api/cron/sync/route.ts` in your module and it's reachable at that path. `schedule` is a standard cron expression. **Vercel's Hobby plan caps cron invocations to once per day per job**, regardless of what the schedule says, so design for "runs roughly daily" rather than anything finer-grained. Pair a daily cron with a manual "Check now" admin button for anything time-sensitive.

`scripts/generate-module-cron.mjs` runs on every `npm run build` and `npm run dev`. It collects `cronJobs` from every installed module's manifest into a single generated `vercel.json` at the project root - gitignored, never committed, same pattern as `lib/modules/router.ts`.

**Authenticating cron requests.** Vercel automatically appends `Authorization: Bearer $CRON_SECRET` to its own cron requests - no custom secret scheme needed. Your cron route just checks that header:

```ts
const secret = process.env.CRON_SECRET
if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)
```

**Do not declare `CRON_SECRET` in `requiredEnvVars`.** Core owns that variable and mints it itself (`lib/vercel/cron-secret.ts`): it is generated during setup, and installing any module whose manifest declares `cronJobs` provisions one on a site that has none, writing it to the Vercel project before the install's redeploy. Declaring it required only risks dead-ending an install on a value the platform was going to create anyway. It arrives in `process.env` with the deploy the install triggers, never during the install request itself - which is why the 503 guard above still belongs in the route.

Note that module route files **cannot** export their own `maxDuration` - the generated router imports every route file as a plain object of HTTP-method handlers, and a `maxDuration` export breaks that structural type. The shared dispatcher at `app/api/m/[module]/[...path]/route.ts` sets one `maxDuration` (currently 60s) for every module route instead.

## Public routes

Most modules only need admin pages and API routes. A module that also needs a public-facing area of the site (a blog, a forum, a directory) can declare a single top-level URL segment it owns:

```json
"publicBasePath": "gazette"
```

`publicBasePath` must be a single lowercase URL segment (letters, digits, hyphens). It is validated for uniqueness at install time against every other installed module's `publicBasePath`, and against existing InfoPage slugs - installing a module whose base collides with an existing page, or creating/renaming a page to match an installed module's base, is rejected with a 409. **An InfoPage always wins a collision that slips through** (e.g. a page created before the module was installed) - this never causes data loss, it just hides the module's public index until the page is renamed or removed.

### Putting content on a bare slug

A module that wants its content at `/<slug>` rather than `/<base>/<slug>` - a blog whose posts sit at the top level, say - can additionally declare:

```json
"publicRootSlug": {
  "page": "./app/root/[slug]/page",
  "claimImport": "./lib/root-slug",
  "claimExport": "myModuleClaimsRootSlug"
}
```

`claimExport` names a `(slug: string) => Promise<boolean>` that answers whether your module owns that slug; `page` names the page component core renders when it says yes, receiving `params: { slug }` like any other page. Both are imported lazily, so neither may pull client code in at the top level.

Core asks the claim **last** - after it has ruled out an `InfoPage` and a module index at that slug - so core content always wins and your claim only ever runs on what would otherwise be a 404. Keep it cheap and make it return `false` fast when the feature is switched off.

Two things to get right:

- **Put the page outside `app/public/<base>/`.** Everything in that directory is also mounted under `/<base>/`, so a page kept there would answer at both addresses. Gazette uses `app/root/[slug]/page.tsx`.
- **Keep the old address alive.** Leave a page at `app/public/<base>/[slug]/page.tsx` that `permanentRedirect`s to the new one, or every link already out in the world breaks the day you switch.

Because a bare slug shares its space with pages and other modules' bases, your slug generator should treat `getInstalledPublicBasePaths()` and the existing `InfoPage` slugs as taken - otherwise a colliding slug simply never resolves to your content.

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

**In module code, prefer the window event.** `onConsentChange` keeps its subscribers in a module-level `Set` inside core's `gate.ts`, and a separately bundled module cannot assume it shares that instance. Core announces every decision on `window` as well, which crosses bundles and needs no import:

```ts
window.addEventListener('cactus:consent-change', (e) => {
  const granted = (e as CustomEvent<Record<string, boolean>>).detail['live-chat'] === true
})
```

For a React component that must appear and disappear with the decision, read it as an external store rather than mirroring it into state:

```tsx
const granted = useSyncExternalStore(
  (cb) => { window.addEventListener('cactus:consent-change', cb); return () => window.removeEventListener('cactus:consent-change', cb) },
  () => (window as unknown as { __cactusConsent?: Record<string, boolean> }).__cactusConsent?.['live-chat'] === true,
  () => false,          // server snapshot - never granted during SSR
)
```

### 3. Gate the UI too, not only the script

If your module's visible control *is* the processing - a chat launcher, a video embed, a third-party map - do none of that processing until the category is granted, rather than showing the control and gating what it loads. A visitor who has not answered the banner yet has no decision recorded, so a single `=== true` check covers both "has not chosen" and "chose no". Decide server-side whether the gate applies at all (banner enabled **and** the site's category list actually carries your key), because the client cannot tell "no banner" from "not granted" - core defines `window.__cactusConsent` either way. The live-chat module's `WidgetLoader` is the reference implementation.

Rendering nothing is the safe default, but consider an **inert placeholder** where the visitor might come looking for the feature: a control that simply vanishes reads as "this site does not have that", and someone who declined is left with no route back. Say what is missing and offer `window.cactusConsent.open()` underneath - it reopens the banner's manage view on the visitor's existing choices (core v0.5.1098+; older core opens it on the site defaults, so saving from there would reset their other categories). The placeholder must stay inert: no script, no cookie, no request. To word it differently for "not asked yet" versus "asked and declined", check whether the `cactus-consent` cookie exists - `window.__cactusConsent` flattens both to `false`. Read its existence only; the payload inside is core's to shape.

### 4. What Cactus cannot gate for you

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
