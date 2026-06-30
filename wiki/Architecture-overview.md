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

1. `POST /api/admin/modules` fetches `cactus.module.json`, validates the manifest, acquires the deploy lock, and commits the submodule via the GitHub Git Data API (no `git` CLI, no shell calls). GitHub credentials are resolved by `lib/github/client.ts`: prefers a connected GitHub App installation token; falls back to `GITHUB_API_TOKEN`. The App manifest defines no webhook, so GitHub returns `webhook_secret: null`; Cactus stores it as NULL and never reads it - only the private key (`pem`) is used for API authentication.
2. The commit triggers a Vercel deployment through the standard GitHub integration.
3. During Vercel's build step, `scripts/run-module-migrations.mjs` runs **after** `prisma migrate deploy`. It finds all active modules' SQL migration files, checks the `ModuleMigration` table for already-applied ones, and executes the rest in lexicographic order.
4. The deploy lock is released when the Vercel webhook fires (`deployment.succeeded`) or lazily on the next Modules page load (for Hobby-plan users without webhooks).

Module database tables are **prefixed** (`tablePrefix` field, e.g. `forum_`). They never touch Prisma's migration history. The core Prisma client knows nothing about module tables - modules query their own tables directly.

### Module Puck blocks

Modules can register Puck blocks that appear in both the page builder and the layout builder. Declare them in `cactus.module.json` under `puckBlocks`:

```json
"puckBlocks": [
  {
    "type": "ContactForm",
    "import": "./components/puck/ContactFormBlock",
    "component": "contactFormPuckComponent",
    "rscComponent": "contactFormPuckRscComponent"
  }
]
```

During each build and dev start, `scripts/generate-module-puck.mjs` scans all installed modules' manifests and rewrites `lib/puck/module-components.ts` with the correct import statements. The generated `moduleComponents` and `moduleRscComponents` records are then spread into `puckConfig.components`, `layoutPuckConfig.components`, and their RSC variants so the blocks appear under a **Modules** category in the block picker.

Block settings should live entirely in the block's Puck field definitions - not in a separate settings page. This gives each instance of the block its own independent configuration. Abuse-sensitive settings (API keys, rate limits, notification emails) must be kept server-authoritative: the submit handler should re-derive the block's config from the page or layout's saved `builderData` using the block's `id`, never trusting values sent by the browser.

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
| **Section** | Full-width container with background (colour, gradient, image), vertical padding, max-width, sticky positioning, border, box-shadow, and AOS scroll animation controls. Content rendered via an inline slot (`content` prop). |
| **Grid** | CSS grid container (2-4 columns) with configurable gap, padding, column-width ratios (30/70, 40/60, etc.), per-column horizontal alignment, vertical alignment across all cells, and space below. Each column (`col1`-`col4`) is an inline slot. |
| **Group** | Flexbox container with direction (row / column), justify-content, align-items, wrap, gap, and padding controls. Children rendered via an inline slot (`items` prop). Replaces the old Flex and Row blocks. Available in all configs; Split is preferred when you need independently droppable zones. |
| **Split** | Two-column layout (50/50, 60/40, 40/60, 70/30, 30/70) using `renderDropZone` - each column is a live Puck drop zone backed by `data.zones`. Shows an 80 px placeholder when empty so editors can always see and drag into the column. Not available in `headerPuckConfig`. |
| **Spacer** *(displayed as "Space")* | Fixed vertical gap (8 px - 96 px) |
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

Page content is wrapped inside a layout resolved by `resolveThemeLayout('infoPage', { pageId, slug })`. The layout is rendered via `renderLayoutWithContent(layoutData, pageContent)`, which patches the Puck config to replace the `ContentSlot` component's render function with one that returns the real page content. This happens entirely server-side with no hydration overhead.

## Theme Builder

Cactus has no hardcoded frontend design. All visual aspects are user-configurable through the Theme Builder and Style Guide.

### Layout types

Every layout record has a `type` field (stored as a plain `String` on the `Layout` model, not a database enum, so new types can be added without a migration). The five built-in types are:

| Type | Purpose |
|---|---|
| `header` | Site-wide header. Rendered above every public page. |
| `footer` | Site-wide footer. Rendered below every public page. |
| `infoPage` | Body wrapper for info pages. The `ContentSlot` block marks where page content appears. |
| `notFound` | Rendered by `app/not-found.tsx` when a URL matches no page. |
| `statusPage` | Rendered by the coming-soon / maintenance status routes. |

Headers and footers are full `Layout` records edited in **Admin → Theme Builder**, not JSON blobs on `SiteConfig`. The `SiteConfig` columns `headerBuilderData`, `footerBuilderData`, `defaultLayoutId`, `comingSoonPageId`, and `maintenancePageId` were removed.

### Display conditions

Each layout can carry a `displayConditions` JSON field with `include` and `exclude` rule lists:

```ts
type ConditionRule = { type: ConditionType; value?: string }
type DisplayConditions = { include: ConditionRule[]; exclude: ConditionRule[] }
```

`ConditionType` values and their specificity scores:

| Condition type | Score |
|---|---|
| `page_id` | 100 |
| `page_slug` | 90 |
| `homepage` / `not_found` / `coming_soon` / `maintenance` | 80 |
| `module` | 50 |
| `path_prefix` | 40 |
| `entire_site` | 10 |

`resolveThemeLayout(type, renderContext)` in `lib/layout/resolveThemeLayout.ts` fetches all published layouts of the requested type, scores each one's include rules against the current render context, eliminates any layout that matches an exclude rule, and returns the highest-scoring layout. Ties are broken by `priority` then `updatedAt`. A layout with no include rules scores 0 and is only used as a last resort.

`matchesRule` and `scoreConditions` live in `lib/layout/displayConditions.ts`.

### ContentSlot injection

`renderLayoutWithContent(layoutData, pageContent)` in `lib/puck/renderLayoutWithContent.tsx` patches the Puck config at render time: it overrides the `ContentSlot` component's `render` function to return the real page React node, then calls `<Render>` with the patched config. This means layouts are ordinary Puck builder data; the ContentSlot is just a positioned placeholder that gets swapped at render time with no special data format needed.

### Puck config exports

| Export | Used in |
|---|---|
| `puckConfig` / `puckRscConfig` | Page builder (editor / RSC render) |
| `headerPuckConfig` / `headerPuckRscConfig` | Header layout editor / public header render |
| `footerPuckConfig` / `footerPuckRscConfig` | Footer layout editor / public footer render |
| `fullPagePuckConfig` / `fullPagePuckRscConfig` | 404 and status page layout editors |
| `layoutPuckConfig` / `layoutPuckRscConfig` | infoPage layout editor / public layout render |

RSC variants replace `richtext` fields with `textarea` (prevents `React.lazy` in RSC) and replace `SiteLogoClient` with `SiteLogoRsc`. The layout editor selects which config to use via a `getConfig(type)` switch in `LayoutPuckEditor.tsx`.

### Starter templates

`app/api/setup/complete/route.ts` seeds a library of starter layouts on first setup. The same function (`refreshStarterLayouts`) is called when an admin clicks **Settings → General → Refresh Starter Templates**, so templates are always resettable to their canonical state.

| Type | Count | IDs |
|---|---|---|
| `header` | 9 | `starter-header`, `-nav-centre`, `-logo-centre`, `-full-width`, `-logo-name`, `-tall`, `-minimal`, `-transparent`, `-compact` |
| `footer` | 4 | `starter-footer`, `-logo-links`, `-three-col`, `-social` |
| `infoPage` | 4 | `starter-full-width`, `starter-boxed`, `starter-sidebar-right`, `starter-sidebar-left` |
| `notFound` | 3 | `starter-404-hero`, `starter-404-minimal`, `starter-404-branded` |
| `statusPage` | 3 | `starter-status-coming-soon`, `starter-status-maintenance`, `starter-status-minimal` |

All starter layouts have `isStarter: true`, `status: published`, and `displayConditions: entire_site`. They are upserted (never duplicate-inserted), so re-running setup or the refresh button is idempotent.

### `resolveLayout` vs `resolveThemeLayout`

`lib/layout/resolveLayout.ts` is the original three-tier fallback (`InfoPage.layoutId` → `ModuleLayoutDefault` → `SiteConfig.defaultLayoutId`). It is kept for backwards compatibility with any module that calls it directly but is no longer used by the core public routes. New code should use `resolveThemeLayout`.

## Style Guide

**Admin → Style Guide** (formerly "Appearance") controls all visual design tokens.

### Colour palette

Up to six colour slots, each with a name, a light-mode hex value, and an optional dark-mode hex. Stored as `SiteConfig.designTokens.colours` (a `ColourSlot[]` array).

`app/(public)/layout.tsx` emits a `<style>` tag via `buildTokenStyles(tokens)` that generates:

```css
:root, [data-theme="light"] { --color-1: #hex; --color-2: #hex; … }
[data-theme="dark"] { --color-1: #dark-hex; … }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --color-1: #dark-hex; … } }
```

All Puck block colour fields use the `SiteColourField` custom field renderer (`lib/puck/SiteColourField.tsx`). It fetches the palette from `/api/admin/appearance` and renders named swatches. Selecting a swatch stores `var(--color-N)` as the field value, so colour changes in the Style Guide propagate to all blocks automatically without re-saving pages.

### Other tokens

`designTokens` also carries `typography` (heading/body font families, size scale), `spacing` (9-step scale mapped to `--sp-1` through `--sp-9`), `radius` (sm/md/lg), and `shadows` (sm/md/lg). These are edited in the Style Guide and exposed as CSS variables by the same `buildTokenStyles` call.

### Dark mode

Cactus supports three dark-mode states: **Auto** (follows the OS), **Light**, and **Dark**. The preference is stored in `localStorage` as `cactus-theme`.

To prevent flash-of-wrong-theme on load, `app/layout.tsx` includes an inline `<script>` that runs before paint: it reads `cactus-theme` and always sets `data-theme="dark"` or `data-theme="light"` on `<html>` before the first paint. In `auto` mode it checks `window.matchMedia('(prefers-color-scheme: dark)')` to decide which to apply. A `@media (prefers-color-scheme: dark)` block in `globals.css` acts as a CSS-only fallback for SSR.

The `ThemeToggle` component (`components/ThemeToggle.tsx`) is a client component that renders Auto / Light / Dark buttons and calls `applyTheme(mode)`. A compact variant is mounted in the admin sidebar above Sign out.

The admin UI uses the Cactus Design System. Primitive palette tokens (`--cactus-*`, `--spine-*`, `--sand-*`) are defined in `globals.css` and mapped to semantic aliases (`--color-bg`, `--color-text`, `--color-primary`, `--color-destructive`, `--color-border`, etc.) in `[data-theme="light"]` and `[data-theme="dark"]` blocks. The UI typeface is Instrument Sans; developer content (slugs, paths, keys, code) uses JetBrains Mono. Admin-specific variables use `--admin-*` prefixes. All reusable UI classes (`.card`, `.btn-*`, alerts, badges, tables) reference these variables so they automatically adapt to both themes. Hardcoded hex values must not appear in component inline styles - always use CSS variable references (`var(--color-text-muted)`, `var(--color-destructive)`, etc.).

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
