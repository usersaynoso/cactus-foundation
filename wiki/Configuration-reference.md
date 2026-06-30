# Configuration reference

The config page lives at `/<adminPath>/config`. All settings are persisted in the `SiteConfig` table. Secrets (API keys, passwords) stay in environment variables - they are never stored in the database.

## General tab

### Updates panel

At the top of the General tab, Cactus checks whether your install is on the latest version of Cactus Foundation. The check is made against the upstream GitHub repository (`usersaynoso/cactus-foundation` by default, overridable with `CACTUS_CORE_REPO`) and is cached for 10 minutes.

**States:**

- **Up to date** - green badge; shows the current version number.
- **Update available** - shows the version jump (e.g. v0.5.97 → v0.5.100), aggregated release notes for every release since your installed version (newest first), and an **Update now** button.
- **Not configured** - shown when GitHub is not set up; links to Settings → Integrations.

**What the Update button does:**

1. Fetches the list of files changed between your installed version tag and the latest release tag on the upstream repo.
2. Copies each changed file (excluding `modules/`, `.gitmodules`, and the database) into your GitHub repo via the Git Data API.
3. Commits the change as `chore: update Cactus Foundation to vX.Y.Z [cactus-core-update]`.
4. Triggers a Vercel redeploy - the full-screen redeploying view appears immediately (same as other redeploy flows).

Modules, content, user accounts, and user-created files are never touched. Core files in your repo that you have hand-edited will be overwritten; the Cactus model for customisation is modules and themes, not editing core files directly.

If the upstream repo does not have a matching tag for your current version, the update falls back to a full overlay of the latest upstream tree (all core files are replaced).

| Field | Description | Default |
|-------|-------------|---------|
| Site name | Displayed in the admin sidebar, browser title, emails | `My Cactus Site` |
| Tagline | Short description, appears on the public homepage | - |
| Description | Longer description, used in metadata | - |
| Homepage | The info page served at the root URL (`/`) | - |
| Main menu | Default menu shown in the site header. MenuBlock components can override this per-instance. | - |
| Timezone | All UTC timestamps are displayed in this zone in the admin UI | `UTC` |
| Locale | Sets the `lang` attribute and date formatting. Does not translate the UI. | `en-GB` |
| Date format | Display format for dates (e.g. `DD/MM/YYYY`) | `DD/MM/YYYY` |
| Time format | Display format for times (e.g. `HH:mm`) | `HH:mm` |

**Site URL** is shown read-only. It comes from the `SITE_URL` environment variable. Changing it requires updating the variable and redeploying - and registering new passkeys, since WebAuthn credentials are bound to the RP ID (the domain).

### Danger zone - Reset Everything

At the bottom of the General tab is a **Reset Everything** button. Pressing it shows a confirmation dialog; confirming will permanently delete all environment variables managed through the admin UI (email, media, integration credentials) from your Vercel project. Core infrastructure variables (`DATABASE_URL`, `SESSION_SECRET`, `SITE_URL`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`) are **not** touched. A redeploy is triggered automatically after the reset via Vercel's REST API, and the admin is taken straight to the full-screen redeploying view (see below).

## Branding tab

Upload a logo and favicon. Requires a media provider to be configured in the Media tab. Until set, generic Cactus placeholders are used.

## Auth & Access tab

| Field | Description | Default |
|-------|-------------|---------|
| Admin path | The secret URL prefix for the admin area. Changing this triggers an Edge Config update automatically (if `VERCEL_API_TOKEN` is set) or takes effect on next cold start. | (set during setup) |
| Public registration | Whether new accounts can be created by anyone. Off shows a closed message, not a 404. | On |
| Default role | Role assigned to new registrations | - (no default) |
| Trust this browser (days) | Duration of the "trust this browser" trusted device cookie | `28` |

## Email tab

| Field | Description |
|-------|-------------|
| From name | Display name on outgoing emails |
| From address | `From` header on outgoing emails |

Provider (Brevo or SMTP) is set by which credentials are present in environment variables - `BREVO_API_KEY` wins if both are set.

Saving credentials writes them to Vercel project environment variables and triggers a redeploy automatically via Vercel's REST API. The admin is then taken straight to the full-screen redeploying view (see below).

### The redeploying view

Whenever an admin action triggers a redeploy (saving env-var credentials, or Reset Everything), the API writes a `pending` sentinel to the site config **synchronously** - before the HTTP response is sent - and the browser hard-reloads. The proxy sees the pending marker and rewrites every admin page to the full-screen `/cactus-status/redeploying` view, so the admin lands on it immediately rather than having to navigate or wait for a cache to expire.

That screen shows a spinner while the real Vercel deployment ID is being recorded (this happens just after the response, via Next's `after()`), then polls the deployment logs and walks through Initialising → Building → Done before redirecting back to the admin. If the redeploy never actually starts, the sentinel is cleared and the screen bounces straight back to the admin instead of stranding the user.

**Escape hatch:** if the page is still showing the spinner after 2 minutes, a "Dismiss and continue" button appears. Clicking it sends `DELETE /api/admin/redeploy-status`, clears the `pendingRedeployId` sentinel, and returns to the admin. Polling keeps running underneath, so a genuinely long build still completes on its own - the button is simply always available once things are taking an unreasonable amount of time.

**Server-side time-box (the permanent fix):** alongside `pendingRedeployId`, the site config now records `pendingRedeployAt` - the moment the sentinel was written. The proxy and the redeploy-status API both run the flag through a resolver that treats it as released - and actively nulls it in the database - once it is older than 2 minutes, or immediately if the timestamp is `NULL` (which covers any flag that predates this column or was set by a previous version). Deploys here never exceed 2 minutes, so the gate is guaranteed to release on its own within that window. This path needs no browser tab, no webhook (never delivered on Vercel Hobby), and no valid `VERCEL_API_TOKEN`. A stuck flag self-heals on the next admin request with no manual database surgery required.

**Proxy confirmation on dismiss:** the proxy caches the `pendingRedeployId` flag in memory for up to 5 seconds per serverless isolate. Because a dismiss DELETE runs in a different isolate than the one serving the next admin request, the proxy could still see a stale non-null value and bounce the admin back to the redeploying page. To prevent this, whenever the cached value appears set, the proxy does one additional uncached DB read to confirm before rewriting. If the flag was just cleared, that read returns null and the admin page renders immediately - no 5-second wait, no ping-pong.

**Server-side release on success:** when Vercel fires the `deployment.succeeded` webhook, the handler clears `pendingRedeployId` unconditionally (for any non-null value, not just the `pending` sentinel). This means a successful deployment always releases the proxy gate, even if the client never reached the log-polling flow.

## Media tab

Select the active media provider from a dropdown grouped by kind:

- **Object storage (proxied via your Cloudflare Worker)**: B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage. Images are fetched from the private bucket by the Worker, resized, and served from `CLOUDFLARE_WORKER_URL`.
- **Image CDN (direct)**: Cloudinary, ImageKit. Images are served straight from the provider's CDN; the Worker is not involved.

Selecting a provider scopes the credentials checklist beneath it to only that provider's environment variables (✓/✗ per var). No credentials are stored in the database - they live in Vercel project environment variables. Saving credentials triggers a redeploy automatically and takes the admin straight to the full-screen redeploying view (see the Email tab section above).

**Changing the active provider** opens a confirmation dialog showing how many existing media items live on other providers. You can either **Migrate now** (moves all items to the new provider in batches while the page is open) or **Switch without migrating** (new uploads go to the new provider; existing items keep serving from wherever they currently are until you run a migration later).

The per-provider breakdown is always visible on the tab, along with a **Migrate now** action if any rows are on a provider other than the active one.

**Worker secrets**: for proxied providers, the same credential values must also be configured as Cloudflare Worker secrets via `wrangler secret put`. See [Self-hosting and operations](Self-hosting-and-operations.md) for the exact commands. The app cannot push Worker secrets automatically.

## Site Status tab

| Field | Description |
|-------|-------------|
| Status | `live`, `comingSoon`, or `maintenance`. Non-live statuses lock all public routes for non-admin visitors. |
| Coming soon page | Info page shown to visitors when status is `comingSoon`. Falls back to a generic template. |
| Maintenance page | Info page shown to visitors when status is `maintenance`. Falls back to a generic template. |
| Hide from search engines | Adds `noindex` to all pages and disallows all crawlers in `robots.txt`. Forced on whenever status ≠ live. |

A **Preview as visitor** link opens the status page exactly as a real visitor would see it.

## GDPR & Legal tab

### Legal pages and data retention

| Field | Description | Default |
|-------|-------------|---------|
| Privacy policy page | Info page linked in the public footer and required at registration (once set). | — |
| Terms of service page | Info page linked in the public footer and required at registration (once set). | — |
| Purge expired sessions after (days) | Stale sessions older than this are deleted. | `30` |
| Purge unused recovery requests after (days) | Unused recovery tokens older than this are deleted. | `7` |

The **Third-party data processors** list is auto-generated from whichever email/media/hosting providers are actually configured, so it never drifts out of sync.

### Cookie consent banner

| Field | Description | Default |
|-------|-------------|---------|
| Enable cookie consent banner | Master toggle. When off the banner never appears and no consent records are logged. | Off |
| Banner style | `bottom-bar` renders a strip at the foot of the viewport; `modal` renders a centred overlay with a backdrop. | `bottom-bar` |
| Banner title | Heading text shown to the visitor. | `Cookie preferences` |
| Banner body text | Explanatory copy. Use `{privacyPolicy}` to insert a hyperlink to the configured privacy policy page. | — |
| Accept all label | Button label for accepting all categories. | `Accept all` |
| Reject all label | Button label for rejecting all non-necessary categories. | `Reject all` |
| Manage label | Link/button label that opens the per-category toggle panel. | `Manage preferences` |
| Cookie categories | Admin-editable list. Each category has a **key** (slug, stable identity), **label**, **description**, and a **default-on** toggle. The **Necessary** category is always present, always on, and cannot be removed. Categories declared by active modules (via their `cookieCategories` manifest field) are surfaced as one-click suggestions. | Necessary, Analytics, Marketing |
| Re-prompt after (days) | Visitors whose consent is older than this are shown the banner again. | `365` |
| Keep consent records for (days) | Consent log rows older than this will be purged. Blank keeps records indefinitely (recommended - proof of consent should outlive the processing it authorises). | Indefinite |

**Category versioning** - the server tracks `categoriesVersion` internally. It increments automatically whenever you add or remove a category, or change a category's `required` or `defaultOn` flag. A returning visitor whose stored version is older than the current version will be re-prompted. Purely cosmetic changes (renaming a category's label, editing copy) increment `copyVersion` instead and do not trigger re-consent.

**Consent log** - every visitor decision (accept all, reject all, custom, withdraw) is written to the `ConsentRecord` table. Anonymous visitors are identified by a first-party `cactus-consent-id` UUID cookie. When a visitor is authenticated their `userId` is linked at write time. On account deletion, `userId` is nulled on the visitor's records (the rows themselves survive as proof-of-consent). Records are included in the self-service data export (GDPR Art. 20).

**Programmatic access** - after a visitor makes their choice, `window.__cactusConsent` is populated with the per-category decision and `window.cactusConsent.open()` re-opens the preferences panel. Use the `CookieSettingsLink` Puck block in your footer to give visitors a persistent entry point.

## Integrations tab

Shows the configuration status of:
- GitHub API token (for module/theme installs)
- Vercel API token and project ID (required for Edge Config writes, deployment status checks, and writing `DATABASE_URL` during automatic database provisioning)
- Neon API key (for automatic database provisioning during setup only - not shown after setup is complete)

These are read from environment variables. Values are never shown.

### Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string. Provisioned automatically if `NEON_API_KEY` is set. |
| `SESSION_SECRET` | Yes | Min 32 random characters for signing session tokens. |
| `SITE_URL` | Yes | Canonical public domain. WebAuthn relying party ID - immutable after first passkey. |
| `VERCEL_API_TOKEN` | Yes | Vercel REST API token. Create at Vercel → Account Settings → Tokens. |
| `VERCEL_PROJECT_ID` | Yes | Vercel project ID. Find at Vercel → your project → Settings → General. |
| `NEON_API_KEY` | No | Neon API key for one-click DB provisioning during setup. Leave unset if supplying own `DATABASE_URL`. |
| `BREVO_API_KEY` | No | Brevo email API key (gates email login, verification, recovery). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | No | SMTP fallback for email (alternative to Brevo). |
| `CLOUDFLARE_WORKER_URL` / `CLOUDFLARE_WORKER_HOSTNAME` | No | Shared Cloudflare Worker URL for all proxied media providers. |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | No | Backblaze B2 - object storage. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | No | Cloudflare R2 - object storage. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | No | AWS S3 - object storage. |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | No | DigitalOcean Spaces - object storage. |
| `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | No | Wasabi - object storage. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | No | MinIO - self-hosted object storage. |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob - managed object storage. |
| `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | No | Supabase Storage - object storage. Use the service role key, not the anon key. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | Cloudinary - direct image CDN (no Worker involvement). |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | No | ImageKit - direct image CDN (no Worker involvement). |
| `GITHUB_API_TOKEN` | No | GitHub personal access token (needs `repo` scope). Legacy fallback - prefer connecting a GitHub App via Config → Integrations. |
| `ENCRYPTION_KEY` | No | 64-character hex string (32 bytes) for encrypting GitHub App credentials in the database. Required for the GitHub App connect flow. Generate with `openssl rand -hex 32`. The format is validated before GitHub redirects begin - connecting will fail immediately with a clear error if the value is wrong. Must not change once an App is connected (re-encryption would be required). |
| `EDGE_CONFIG` | No | Vercel Edge Config read connection string for fast path lookups. |
| `VERCEL_EDGE_CONFIG_ID` | No | Edge Config ID for writes via Vercel REST API. |
| `VERCEL_WEBHOOK_SECRET` | No | Webhook secret for automatic deployment status updates (Pro/Enterprise only). |
| `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile bot protection. |
| `SENTRY_DSN` | No | Sentry error reporting DSN. |

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
