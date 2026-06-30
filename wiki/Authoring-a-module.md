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
| `permissions` | `string[]` | Permission keys this module declares. They're seeded into the `Permission` table on install and appear in the Roles matrix. |
| `cookieCategories` | `string[]` | Non-essential cookie categories this module sets. If non-empty, a cookie consent banner will appear until the visitor consents. |
| `teardown` | `string[]` | PascalCase names of database tables owned by this module (e.g. `["ForumThread", "ForumPost"]`). Required if you want admins to be able to choose "Remove code and data" during uninstall. Without it, only "Remove code only" is available. |

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

## The install/update/disable lifecycle (from author's perspective)

### Install

1. Site admin enters your GitHub URL in **Admin → Modules → Install a module**.
2. Cactus fetches `cactus.module.json` from your repo.
3. Validates: manifest schema, `tablePrefix` uniqueness, required env vars.
4. Finds your latest tagged release and its commit SHA.
5. Commits your repo as a git submodule at `modules/<name>` via the GitHub API.
6. Vercel builds → `run-module-migrations.mjs` applies `001_create_tables.sql`, etc.
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
4. Start `npm run dev` and visit `/_cactus_admin/forum` (or wherever your nav entry points).

## Known constraints

- **Public repos only.** The install flow fetches the manifest from GitHub. Private repos aren't supported.
- **No shelling out to git.** All installs and updates go through the GitHub REST API. There is no filesystem mutation at runtime.
- **Migrations run during the build step, never at runtime.** An API route that calls the migration runner will throw in production - Vercel's filesystem is read-only.
- **Declare `teardown` to enable full uninstall.** Without it, admins can only remove the code - database tables are left behind. Declare the exact PascalCase table names Prisma created (e.g. `"ForumThread"`, not `forum_threads`).
- **`tablePrefix` is permanent.** Once installed, the prefix cannot be changed. Choose it carefully - it's used in every table name and in `ModuleMigration` records.

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

**`app/_cactus_admin/announcements/page.tsx`** (inside the module's own directory, auto-registered via Next.js App Router when the module is a submodule):
```tsx
import { getSessionFromCookie } from '@cactus/lib/auth/session'
import { hasPermission } from '@cactus/lib/permissions/check'
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

That's a complete, installable module. Tag it, release it, and any Cactus site can install it.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
