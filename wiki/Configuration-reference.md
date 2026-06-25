# Configuration reference

The config page lives at `/<adminPath>/config`. All settings are persisted in the `SiteConfig` table. Secrets (API keys, passwords) stay in environment variables — they are never stored in the database.

## General tab

| Field | Description | Default |
|-------|-------------|---------|
| Site name | Displayed in the admin sidebar, browser title, emails | `My Cactus Site` |
| Tagline | Short description, appears on the public homepage | — |
| Description | Longer description, used in metadata | — |
| Homepage | The info page served at the root URL (`/`) | — |
| Main menu | The menu passed to the theme's built-in header Nav (used when no header template is assigned) | — |
| Site header template | A published **Header**-type template that replaces the theme's built-in Nav. Falls back to the theme Nav if unset or if the template is still in draft. | — |
| Site footer template | A published **Footer**-type template that replaces the theme's built-in Footer. Falls back to the theme Footer if unset or if the template is still in draft. | — |
| Timezone | All UTC timestamps are displayed in this zone in the admin UI | `UTC` |
| Locale | Sets the `lang` attribute and date formatting. Does not translate the UI. | `en-GB` |
| Date format | Display format for dates (e.g. `DD/MM/YYYY`) | `DD/MM/YYYY` |
| Time format | Display format for times (e.g. `HH:mm`) | `HH:mm` |

**Site URL** is shown read-only. It comes from the `SITE_URL` environment variable. Changing it requires updating the variable and redeploying — and registering new passkeys, since WebAuthn credentials are bound to the RP ID (the domain).

## Branding tab

Upload a logo and favicon. Requires a media provider to be configured in the Media tab. Until set, generic Cactus placeholders are used.

## Auth & Access tab

| Field | Description | Default |
|-------|-------------|---------|
| Admin path | The secret URL prefix for the admin area. Changing this triggers an Edge Config update automatically (if `VERCEL_API_TOKEN` is set) or takes effect on next cold start. | (set during setup) |
| Public registration | Whether new accounts can be created by anyone. Off shows a closed message, not a 404. | On |
| Default role | Role assigned to new registrations | — (no default) |
| Trust this browser (days) | Duration of the "trust this browser" trusted device cookie | `28` |

## Email tab

| Field | Description |
|-------|-------------|
| From name | Display name on outgoing emails |
| From address | `From` header on outgoing emails |

Provider (Brevo or SMTP) is set by which credentials are present in environment variables — `BREVO_API_KEY` wins if both are set.

## Media tab

Select the active media provider from a dropdown grouped by kind:

- **Object storage (proxied via your Cloudflare Worker)**: B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage. Images are fetched from the private bucket by the Worker, resized, and served from `CLOUDFLARE_WORKER_URL`.
- **Image CDN (direct)**: Cloudinary, ImageKit. Images are served straight from the provider's CDN; the Worker is not involved.

Selecting a provider scopes the credentials checklist beneath it to only that provider's environment variables (✓/✗ per var). No credentials are stored in the database — they live in Vercel project environment variables.

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

| Field | Description |
|-------|-------------|
| Privacy policy page | Info page linked in the public footer and required at registration (once set). |
| Terms of service page | Info page linked in the public footer and required at registration (once set). |
| Purge expired sessions after (days) | Stale sessions older than this are deleted. | `30` |
| Purge unused recovery requests after (days) | Unused recovery tokens older than this are deleted. | `7` |

The **Third-party data processors** list is auto-generated from whichever email/media/hosting providers are actually configured, so it never drifts out of sync.

## Integrations tab

Shows the configuration status of:
- GitHub API token (for module/theme installs)
- Vercel API token and project ID (required for Edge Config writes, deployment status checks, and writing `DATABASE_URL` during automatic database provisioning)
- Neon API key (for automatic database provisioning during setup only — not shown after setup is complete)

These are read from environment variables. Values are never shown.

### Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string. Provisioned automatically if `NEON_API_KEY` is set. |
| `SESSION_SECRET` | Yes | Min 32 random characters for signing session tokens. |
| `SITE_URL` | Yes | Canonical public domain. WebAuthn relying party ID — immutable after first passkey. |
| `VERCEL_API_TOKEN` | Yes | Vercel REST API token. Create at Vercel → Account Settings → Tokens. |
| `VERCEL_PROJECT_ID` | Yes | Vercel project ID. Find at Vercel → your project → Settings → General. |
| `NEON_API_KEY` | No | Neon API key for one-click DB provisioning during setup. Leave unset if supplying own `DATABASE_URL`. |
| `BREVO_API_KEY` | No | Brevo email API key (gates email login, verification, recovery). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | No | SMTP fallback for email (alternative to Brevo). |
| `CLOUDFLARE_WORKER_URL` / `CLOUDFLARE_WORKER_HOSTNAME` | No | Shared Cloudflare Worker URL for all proxied media providers. |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | No | Backblaze B2 — object storage. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | No | Cloudflare R2 — object storage. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | No | AWS S3 — object storage. |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | No | DigitalOcean Spaces — object storage. |
| `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | No | Wasabi — object storage. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | No | MinIO — self-hosted object storage. |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob — managed object storage. |
| `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | No | Supabase Storage — object storage. Use the service role key, not the anon key. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | Cloudinary — direct image CDN (no Worker involvement). |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | No | ImageKit — direct image CDN (no Worker involvement). |
| `GITHUB_API_TOKEN` | No | GitHub token (needs `repo` scope) for module/theme install and update. |
| `EDGE_CONFIG` | No | Vercel Edge Config read connection string for fast path lookups. |
| `VERCEL_EDGE_CONFIG_ID` | No | Edge Config ID for writes via Vercel REST API. |
| `VERCEL_WEBHOOK_SECRET` | No | Webhook secret for automatic deployment status updates (Pro/Enterprise only). |
| `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile bot protection. |
| `SENTRY_DSN` | No | Sentry error reporting DSN. |

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a theme](Authoring-a-theme) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
