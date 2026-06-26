# Architecture overview

## Request flow

```
Browser request
      │
      ▼
proxy.ts  (Node.js runtime - NOT Edge)
      │
      ├── Always pass: /api/health, /api/webhooks/, /_next/, /favicon.ico
      │
      ├── Setup gate: if SiteConfig.setupCompleted = false
      │     → only /_setup and /api/setup/* pass through
      │     → everything else redirects to /_setup
      │
      ├── Admin path enforcement
      │     → request matches /<adminPath>[/*] ?
      │         yes → rewrite to /_cactus_admin[/*]
      │               (validate session; redirect to /<adminPath>/login if missing)
      │         no  → falls through (404 from Next.js for unknown routes)
      │
      └── Site status gate (public routes only)
            → status = live?  → pass through
            → status ≠ live and requester has admin session? → pass through
            → status = comingSoon → rewrite to /_status/coming-soon
            → status = maintenance → rewrite to /_status/maintenance
```

**Why `proxy.ts` instead of `middleware.ts`?** Next.js 16 moved the request-interception layer from the Edge runtime to Node.js and renamed the file. Running on Node.js means Prisma works directly - no edge-compatible ORM, no edge Config only as a fallback. The admin path and site status checks can use real database reads.

## Admin path and Edge Config

The admin path is a secret URL prefix chosen during setup. It's stored in `SiteConfig.adminPath` and mirrored to **Vercel Edge Config** whenever it changes (via the Vercel REST API). `proxy.ts` reads it from Edge Config first (fast, no database round-trip), falling back to a Prisma read cached briefly in memory if the Edge Config write credentials are absent. Same pattern for site status.

## Automatic database provisioning (setup wizard)

When `DATABASE_URL` is absent at setup time and `NEON_API_KEY` is configured, the setup wizard can provision a Postgres database automatically:

1. **Neon API call** - `POST https://console.neon.tech/api/v2/projects` creates a new Neon project. The response includes both a direct and a **pooled** connection string. Cactus uses the pooled one (`connection_parameters.pooler_host`) to satisfy the pooling requirement.
2. **Vercel API write** - `POST https://api.vercel.com/v10/projects/{projectId}/env` writes `DATABASE_URL` (pooled) and `NEON_PROJECT_ID` (for idempotency) as project environment variables.
3. **Triggered redeploy** - writing new env vars to a Vercel project causes Vercel to queue a new deployment. During that build, the existing `build` script (`prisma migrate deploy && node scripts/run-module-migrations.mjs && next build`) applies the full schema.
4. **Readiness poll** - the wizard polls `/api/health` every 5 seconds. Once the database is reachable (redeploy complete, schema applied), the wizard advances to the next step.

**Migrations are never triggered from the wizard.** Provisioning only creates the Neon project and writes the env var. The schema reaches the database exactly as it always does: via the `build` script, run by Vercel during the triggered deployment. The wizard cannot continue in the same page load; the redeploy is the mechanism, not a side-effect.

**Idempotency** - the provisioning action checks for an existing Neon project named `cactus-{VERCEL_PROJECT_ID}` before creating a new one. It also checks the Vercel project's env vars for an existing `DATABASE_URL` to detect a prior successful provision that is still awaiting a redeploy. Double-clicks and page refreshes are safe.

## Authentication and sessions

- **Passkey-first**: WebAuthn registration and authentication via `@simplewebauthn/server`. The relying party ID is derived from `SITE_URL` in production, `localhost` in development. Credentials are stored in the `Passkey` table (public key, counter, transports).
- **Sessions**: Database-backed (not JWTs). A session token is hashed with `SESSION_SECRET` before storage. Suspending a user invalidates their session immediately.
- **Password + OTP fallback** (when email is configured): bcrypt, Pwned Passwords k-anonymity check on registration, mandatory 6-digit email OTP as second factor.
- **Trust this browser**: a `TrustedDevice` cookie skips the OTP step for a configurable number of days.
- **Recovery**: offline single-use recovery code (generated at setup), or email link (30-minute expiry). Both land on the login page's recovery UI.

## Media pipeline

Cactus supports ten media providers across two shapes.

### Proxied providers (B2, R2, S3, Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage)

Private object storage. The Cloudflare Worker sits between the browser and the bucket, fetching, resizing, and caching the image. The Worker URL is the serving URL for every proxied item regardless of which bucket holds the bytes.

```
Browser ──── Next.js <Image> ────▶ Custom loader (lib/media/loader.ts)
                                          │
                                          │  builds Worker URL: https://worker.example.com/<key>?w=<width>&q=<quality>
                                          ▼
                               Cloudflare Worker (workers/media-worker/)
                                          │
                                          ├── key format: media/<PROVIDER>/<id>.ext
                                          │   (legacy B2 keys: media/<id>.ext - no provider segment)
                                          ├── resolves provider from key prefix
                                          ├── fetches from the matching private bucket using stored secrets
                                          ├── applies Cloudflare Image Resizing (width, quality, format=auto)
                                          └── returns with cache headers (1 year, immutable)
```

### Direct providers (Cloudinary, ImageKit)

These have their own CDN and URL-based transformation systems. The Worker is never involved. The Next.js loader detects a Cloudinary or ImageKit URL and builds that provider's own transformation URL directly. Images go: browser → provider CDN.

```
Browser ──── Next.js <Image> ────▶ Custom loader (lib/media/loader.ts)
                                          │
                                          │  Cloudinary: inserts /w_N,q_N/ into /upload/ segment
                                          │  ImageKit:   appends ?tr=w-N,q-N
                                          ▼
                               Provider CDN (res.cloudinary.com / ik.imagekit.io)
```

### Provider selection and migration

The active provider is `SiteConfig.mediaProvider`. Changing it in Settings → Media affects new uploads immediately but does not move existing objects. `Media.provider` on each row records where that specific item actually lives. A `MediaMigrationJob` (cursor-based, batch-driven, admin-initiated) converges all rows onto the active provider. The Worker holds credentials for every proxied provider it has ever had configured so it can serve items that have not yet been migrated.

**Why not proxy through Vercel?** Vercel bills GB-hours of serverless execution. A 10 MB image served through a Next.js route handler on every page view burns real money at scale. The Cloudflare Worker sits outside Vercel's billing, caches resized variants at Cloudflare's edge, and never touches Vercel's function runtime for image bytes.

## Module system

Modules are git submodules living under `modules/<name>/`. Installing one:

1. `POST /api/admin/modules` fetches `cactus.module.json`, validates the manifest, acquires the deploy lock, and commits the submodule via the GitHub Git Data API (no `git` CLI, no shell calls).
2. The commit triggers a Vercel deployment through the standard GitHub integration.
3. During Vercel's build step, `scripts/run-module-migrations.mjs` runs **after** `prisma migrate deploy`. It finds all active modules' SQL migration files, checks the `ModuleMigration` table for already-applied ones, and executes the rest in lexicographic order.
4. The deploy lock is released when the Vercel webhook fires (`deployment.succeeded`) or lazily on the next Modules page load (for Hobby-plan users without webhooks).

Module database tables are **prefixed** (`tablePrefix` field, e.g. `forum_`). They never touch Prisma's migration history. The core Prisma client knows nothing about module tables - modules query their own tables directly.

## Info pages and the Puck builder

Info pages (`InfoPage` model) always use the Puck builder. `bodyFormat` is always `'builder'` for new pages - the admin UI offers no markdown option. Legacy rows with `bodyFormat: 'markdown'` are auto-migrated to `'builder'` the first time they are opened in the admin editor (a PATCH is sent in the background; the public render still falls back to the markdown pipeline for any rows that haven't been migrated yet).

- **`builder`**: content stored in `builderData` (JSON), rendered via Puck's `<Render>` component (`@puckeditor/core/rsc`).
- **`markdown`** (legacy): content stored in `body`, rendered through the sanitized-markdown pipeline (`marked` + `DOMPurify`). No new pages are created in this mode.

### Editor

The Puck editor (`@puckeditor/core`) is lazy-loaded - it ships no bundle to any route that isn't the specific page-edit admin screen. The editor is mounted with the full component config (`lib/puck/config.tsx`) extended with custom field renderers (media pickers, menu selector).

### Available blocks

All blocks are defined in `lib/puck/config.tsx` and are safe for server-side rendering (no hooks, no browser APIs). Most blocks expose a **Padding** field so editors can add breathing room without needing an extra Spacer block.

Blocks are organised into categories that appear as collapsible groups in the Puck left panel.

#### Layout

| Block | Purpose |
|---|---|
| **Grid** | CSS grid container (2–4 columns) with configurable gap, padding, and space below. New fields: **Column widths** (preset ratios for 2-col - equal, auto+fill, 30/70 … 70/30), **Vertical align** (stretch / top / middle / bottom across all cells), **Col N: horizontal align** (left / centre / right per column), **Space below** (replaces the hardcoded 1.5rem bottom margin). In header templates the Grid render is overridden (`GridBlockHeader`) to force `spaceBelow: none`. |
| **Flex** | Flexbox container with direction, justify, align, wrap, and gap controls; single droppable slot |
| **Columns** | Two-column layout with 50/50, 60/40, or 40/60 ratio; each column is a droppable slot |
| **Spacer** *(displayed as "Space")* | Fixed vertical gap (8 px → 96 px) |
| **Divider** | Horizontal rule - solid, dashed, or dotted; thin / medium / thick |

#### Typography

| Block | Purpose |
|---|---|
| **Heading** | Standalone heading (H2–H5) with alignment, colour, and padding |
| **TextBlock** *(displayed as "Text")* | Paragraph text with left / centre / right alignment |
| **RichTextBlock** *(displayed as "Rich Text")* | Full WYSIWYG rich text editor (bold, italic, lists, blockquote, links); stores HTML |
| **Quote** | Styled blockquote with optional attribution |

#### Actions

| Block | Purpose |
|---|---|
| **ButtonLink** *(displayed as "Button")* | Standalone button link - primary, secondary, or outline style |
| **CTABanner** | Call-to-action banner - white / light-gray / brand background |

#### Media

| Block | Purpose |
|---|---|
| **ImageBlock** *(displayed as "Image")* | Full-width image with alt text and optional caption |
| **VideoEmbed** *(displayed as "Video")* | YouTube or Vimeo embed (paste the watch URL; 16:9 / 4:3 / 1:1) |
| **Embed** | Generic `<iframe>` embed (maps, forms, etc.) |

#### Content

| Block | Purpose |
|---|---|
| **Hero** | Large hero section with heading, sub-heading, and CTA button |
| **Card** | Image + heading + body text + optional CTA button |
| **Callout** | Alert/notice box - info, success, warning, or error |
| **Badge** | Small coloured pill label |
| **Accordion** | Collapsible FAQ using native `<details>`/`<summary>` - no JS required |
| **FeatureList** | List of features with emoji icon, title, and description |
| **Stats** | Row of statistic items (value + label) |
| **Logos** | Horizontal strip of logo images with configurable height and alignment |

#### Site

| Block | Purpose |
|---|---|
| **SiteLogo** | Site logo or name - auto-reads `logoMediaId` from SiteConfig; falls back to site name text. Template block. |
| **MenuBlock** *(displayed as "Menu")* | Navigation menu - pick any menu; horizontal or vertical orientation, configurable spacing and dropdown behaviour. Template block. |
| **Copyright** | Copyright line - auto-renders © current year + site name from SiteConfig. Template block. |
| **LoginButton** | Auth-aware login/register buttons - shows "My Account" and "Sign out" when the visitor is logged in. Template block. |

Blocks marked **Template block** are most useful in Header/Footer templates but are available everywhere. Blocks that need an image use a custom media-picker field in the editor; the MenuBlock uses a custom menu-selector field (`MenuSelectField`). These custom renderers are declared in `config.tsx` as plain fields and overridden with the full custom renderer in `PuckEditor.tsx` and `TemplateEditor.tsx`.

### Admin sidebar

The admin left sidebar is collapsible. Clicking the `‹` / `›` toggle button collapses it to icon-only mode (56 px wide), freeing horizontal space. The preference is persisted in `localStorage`. The sidebar **auto-collapses** whenever a page or template editor is opened, so the Puck canvas always has maximum width on load.

### Reconciliation

`InfoPage`'s real columns (`title`, `slug`, `status`, `metaDescription`, `ogImageId`) are canonical. `builderData.root.props` is a working copy. On every load, root props are overwritten from the DB row. On every save, those four fields are split back out and written to their real columns. This split happens in exactly one server-side location (the save handlers), never client-side.

### Save / publish split

| Endpoint | Required permission | Status |
|---|---|---|
| `POST /api/admin/pages/[id]/autosave` | `pages.write` | Always `draft` |
| `POST /api/admin/pages/[id]/publish` | `pages.publish` | Always `published` |

The autosave endpoint ignores any `status` field the client sends - it always writes `draft`. Only the publish endpoint can flip status to `published`, and it re-checks `pages.publish` on the server on every call.

### Public render

The public `[slug]/page.tsx` route branches on `bodyFormat`. Both branches share the same draft gate (one check at the top). Builder pages use `<Render config={puckConfig} data={builderData} />` from `@puckeditor/core/rsc` - a server component. The editor bundle is never included in the public-page response.

Page content is rendered directly from `builderData` using `<Render config={puckRscConfig} data={pageData} />`. If the page has an assigned layout, the layout's Puck data is rendered via `layoutPuckRscConfig` and a ContentSlot block marks where page content appears.

## Appearance & Layouts

Cactus has no hardcoded frontend design. All visual aspects are user-configurable through three concerns:

### Header and Footer (Appearance)

The site-wide header and footer are each stored as Puck builder data in `SiteConfig.headerBuilderData` and `SiteConfig.footerBuilderData`. Edited in **Admin → Appearance → Header / Footer**.

- Uses `headerPuckConfig` / `footerPuckConfig` in the editor canvas and `headerPuckRscConfig` / `footerPuckRscConfig` for server-side rendering.
- The header config's Puck root has editable fields: background mode (solid / transparent / transparent-on-scroll), background colour, height, sticky, border bottom, content max-width.
- The footer config's Puck root has: background colour, vertical padding, border top, content max-width.
- Both use `SiteLogoRsc` (no hooks, inline styles) in the RSC render path and `SiteLogoClient` in the editor.
- Context values (site name, logo URL, auth state) are injected server-side in `app/(public)/layout.tsx` before calling `<Render>`.

### Design Tokens

Stored as JSON in `SiteConfig.designTokens`. Edited in **Admin → Appearance → Design Tokens**.

Keys include: `primaryColor`, `primaryFg`, `bgColor`, `fgColor`, `mutedColor`, `borderColor`, `fontHeading`, `fontBody`, `borderRadius`, `linkColor`, `linkHoverColor`, `h1Size`–`h3Size`, `bodySize`, `bodyLineHeight`, `containerMaxWidth`.

`app/(public)/layout.tsx` injects these as a `<style>` tag with `:root { --color-primary: …; … }` CSS variables, which all Puck blocks reference via `var(--color-primary)` etc.

### Layouts

Layouts define body structure (sidebar, max-width, etc.) using structural blocks plus a special **ContentSlot** block. Multiple layouts can exist; which one applies follows a three-level fallback:

1. `InfoPage.layoutId` — explicit page-level override
2. `ModuleLayoutDefault.moduleName` — module default (e.g. `infopages`)
3. `SiteConfig.defaultLayoutId` — site-wide default

Edited in **Admin → Layouts**. Uses `layoutPuckConfig` / `layoutPuckRscConfig`.

Three starter layouts are seeded on fresh install: Full Width, Boxed, With Right Sidebar.

### Puck config exports

| Export | Used in |
|---|---|
| `puckConfig` / `puckRscConfig` | Page builder (editor / RSC render) |
| `headerPuckConfig` / `headerPuckRscConfig` | Header editor / public header render |
| `footerPuckConfig` / `footerPuckRscConfig` | Footer editor / public footer render |
| `layoutPuckConfig` / `layoutPuckRscConfig` | Layout editor / public layout render |

RSC variants replace `richtext` fields with `textarea` (prevents `React.lazy` in RSC) and replace `SiteLogoClient` with `SiteLogoRsc`.

### Template protection

Deleting a template that is currently assigned as the active header or footer is blocked with a `409` error explaining which slot it occupies. The admin must reassign the slot in Settings → General first.

## Theme system

Themes live under `themes/<name>/`. Activating a theme is a pure database flag flip (`Theme.isActive`) with no redeploy. Installing a new theme follows the same submodule-commit pattern as a module.

The Prickly theme is bundled in `themes/prickly/` - it is not a submodule. No install step is needed for it.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
