# Configuration reference

The configuration page lives at `/<your-admin-path>/config`. All settings are saved to the database. Secrets (API keys, passwords) are stored in environment variables and never in the database.

---

## General tab

### Updates

At the top of the General tab, Cactus checks whether a newer version is available. The check runs against the upstream Cactus Foundation repository and is cached for 10 minutes.

**Update channel** - choose which releases to consider:

- **Public** (default) - stable releases only.
- **Beta** - stable and pre-releases. Useful for trying upcoming features before they reach the stable channel.

The preference is saved immediately and the update check refreshes straight away.

**Update states:**

- **Up to date** - shows the current version number.
- **Update available** - shows the version jump (e.g. v0.5.97 → v0.5.100), the combined release notes for every version since yours, and an **Update now** button.
- **Not configured** - shown when GitHub is not set up; links to Settings → Integrations.

**What the Update button does:** Cactus fetches the files that changed between your version and the latest release, copies them into your GitHub repository, and triggers a redeploy. Your content, pages, media, and user accounts are never touched. Only core Cactus files are updated.

### General site settings

| Field | Description | Default |
|-------|-------------|---------|
| Site name | Shown in the admin sidebar, browser title, and any emails your site sends | `My Cactus Site` |
| Tagline | A short description, shown on the public homepage | — |
| Description | A longer description used in page metadata | — |
| Homepage | The page shown at the root of your site (`/`) | — |
| Main menu | The default navigation menu shown in the site header | — |
| Timezone | All timestamps in the admin are shown in this time zone | `UTC` |
| Locale | Sets the language attribute and date formatting. Does not translate the admin interface. | `en-GB` |
| Date format | How dates are displayed (e.g. `DD/MM/YYYY`) | `DD/MM/YYYY` |
| Time format | How times are displayed (e.g. `HH:mm`) | `HH:mm` |

**Site URL** is shown read-only. It comes from your hosting environment and cannot be changed here. Changing it requires updating your hosting settings and redeploying - and re-registering all passkeys, since they're tied to your domain.

### Refresh starter templates

Clicking **Refresh starter templates** resets all the built-in starter layouts (headers, footers, page layouts, 404 pages, and status pages) back to their original designs. Your custom layouts are not affected.

### Danger zone - Reset Everything

At the bottom of the General tab is a **Reset Everything** button. Confirming will permanently remove all the optional credentials you've entered through the admin (email, media, integration keys). Your core settings (`DATABASE_URL`, `SESSION_SECRET`, `SITE_URL`, and your Vercel connection) are not affected. The site redeploys automatically after the reset.

---

## Branding tab

Upload a logo and favicon. Requires a media provider to be configured in the Media tab. Until set, generic Cactus placeholders are used.

See [Managing media](Managing-media) for how to set up a media provider.

---

## Auth & Access tab

| Field | Description | Default |
|-------|-------------|---------|
| Admin path | The secret URL prefix for the admin area. Changing it takes effect automatically. | Set during setup |
| Public registration | Whether new accounts can be created by anyone. When off, visitors see a "registration closed" message rather than a registration form. | On |
| Default role | Role automatically assigned to new registrations | — |
| Trust this browser (days) | How long a "trust this browser" cookie lasts before asking for a one-time sign-in code again | `28` |

---

## Email tab

| Field | Description |
|-------|-------------|
| From name | The display name on outgoing emails (e.g. "My Site") |
| From address | The email address outgoing messages come from |

The email provider is set by whichever credentials you've entered in your environment variables - Brevo takes priority if both Brevo and SMTP are configured.

Saving email credentials triggers a short redeploy. A progress screen appears while the rebuild runs, then returns you to the admin when done.

If the rebuild takes longer than expected, a **Dismiss and continue** button appears after two minutes. Clicking it returns you to the admin while the rebuild continues in the background.

---

## Media tab

Choose your media storage provider from the dropdown. Options are grouped by type:

- **Object storage** (Backblaze B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage) - images are stored in a private bucket and delivered to visitors via a Cloudflare Worker.
- **Image CDN** (Cloudinary, ImageKit) - images are uploaded to and served directly from the provider's own delivery network. No Cloudflare Worker needed.

Choosing a provider shows a checklist of the credentials it needs. Enter them and save. A redeploy runs automatically to apply the new settings.

**Changing provider:** Switching to a new provider immediately sends new uploads there. Existing images stay on the old provider until you migrate them. Click **Migrate now** to move them across in batches. The per-provider breakdown on the tab shows how many images are on each provider before you commit.

For providers that use the Cloudflare Worker, you also need to configure the Worker separately. See [Self-hosting and operations](Self-hosting-and-operations) for the exact steps.

---

## Site Status tab

| Field | Description |
|-------|-------------|
| Status | `live`, `coming soon`, or `maintenance`. Non-live statuses block all public pages for visitors who aren't signed in as admin. |
| Coming soon page | The page shown to visitors when status is `coming soon`. Falls back to a built-in template. |
| Maintenance page | The page shown to visitors when status is `maintenance`. Falls back to a built-in template. |
| Hide from search engines | Adds a "don't index this" instruction to all pages and blocks search engine crawlers. Automatically on whenever status is not `live`. |

A **Preview as visitor** link opens the status page exactly as a real visitor would see it.

---

## GDPR & Legal tab

### Legal pages and data retention

| Field | Description | Default |
|-------|-------------|---------|
| Privacy policy page | The page linked in your public footer. Also shown at registration once set. | — |
| Terms of service page | The page linked in your public footer. Also shown at registration once set. | — |
| Purge expired sessions after (days) | Old sign-in sessions older than this are deleted automatically | `30` |
| Purge unused recovery requests after (days) | Unused password-recovery tokens older than this are deleted | `7` |

The **Third-party data processors** list is generated automatically from the email, media, and hosting providers you've actually configured, so it stays accurate without manual maintenance.

### Privacy policy generator

The **Generate a privacy policy** button opens a six-step wizard that produces a draft privacy policy page in the page builder.

The wizard asks about:

1. **Your site** - name, URL, contact email, business address
2. **Data you collect** - tick the relevant categories. The data Cactus always collects (email addresses, IP addresses, device and browser info for sign-in) is pre-ticked and cannot be removed.
3. **Why you collect it** - purposes such as providing the service, analytics, or legal compliance. The purposes Cactus always has (running the service, managing accounts, security) are pre-ticked.
4. **Third-party services** - pre-filled from your cookie consent categories; you can add others with a name and description.
5. **Jurisdiction** - EU/UK (GDPR), US (CCPA/CPRA), both, or unsure.
6. **Extras** - a cookies clause, minimum age (for children's privacy), and optional data protection officer details.

The wizard pre-fills your site name and contact email from your General and Email settings.

**Output:** A single draft page with the full policy. The page is always saved as a draft - review it and publish it manually when ready.

**Important:** The generated policy is a starting point only and is not legal advice. A notice to this effect appears throughout the wizard and at the top of the generated document. Have a qualified legal professional review it before publishing.

Running the wizard again always creates a new draft - it never overwrites the existing page. If a privacy policy is already linked, the wizard asks whether to update the link to the new draft or keep the existing one.

### Cookie consent banner

| Field | Description | Default |
|-------|-------------|---------|
| Enable cookie consent banner | Master toggle. When off, no banner appears and no consent is logged. | Off |
| Banner style | `bottom-bar` - a strip at the foot of the page. `modal` - a centred overlay. | `bottom-bar` |
| Banner title | Heading shown to visitors | `Cookie preferences` |
| Banner body text | Explanatory text. Use `{privacyPolicy}` to insert a link to your privacy policy. | — |
| Accept all label | Button label for accepting all categories | `Accept all` |
| Reject all label | Button label for rejecting non-essential categories | `Reject all` |
| Manage label | Link/button label that opens the per-category toggle panel | `Manage preferences` |
| Cookie categories | The list of cookie categories visitors can accept or reject. The **Necessary** category is always present, always on, and cannot be removed. | Necessary, Preferences, Analytics, Marketing |
| Re-prompt after (days) | Visitors whose consent is older than this are shown the banner again | `365` |
| Keep consent records for (days) | How long consent records are kept. Leave blank to keep them indefinitely (recommended - proof of consent should outlive the processing it authorises). | Indefinite |

**Category changes:** Adding or removing a category, or changing whether a category is required or on by default, automatically triggers re-consent for returning visitors. Purely cosmetic changes (renaming a label, editing copy) do not.

**Cookie settings link:** To give visitors a persistent way to change their preferences, add a **Cookie settings link** block to your footer. See [Appearance and design](Appearance-and-design).

---

## Integrations tab

Shows the connection status of:

- **GitHub** - needed to install and update modules and themes, and to apply Cactus core updates.
- **Vercel** - needed to save settings that require a redeploy and to check deployment status.
- **Neon** - only shown during initial setup. Used for automatic database provisioning.

Credentials are read from environment variables. Their values are never displayed here.

### Environment variables reference

This table lists every environment variable Cactus recognises. Variables marked **Required** block setup or core features if absent. Everything else is optional and only affects the feature it describes.

| Variable | Required | What it's for |
|----------|----------|----------------|
| `DATABASE_URL` | Yes | Connection string for your PostgreSQL database. Provisioned automatically if `NEON_API_KEY` is set. |
| `SESSION_SECRET` | Yes | A secret key (at least 32 random characters) used to secure sign-in sessions. |
| `SITE_URL` | Yes | Your site's full public address (e.g. `https://example.com`). Tied to passkey sign-in and cannot change after the first passkey is registered. |
| `VERCEL_API_TOKEN` | Yes | Vercel API token. Create one at Vercel → Account Settings → Tokens. |
| `VERCEL_PROJECT_ID` | Yes | Your Vercel project ID. Find it at Vercel → your project → Settings → General. |
| `NEON_API_KEY` | No | Neon database API key. Enables one-click database setup during the setup wizard. Leave unset if you supply your own `DATABASE_URL`. |
| `BREVO_API_KEY` | No | Brevo email API key. Enables email sign-in, verification, and account recovery. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No | SMTP email credentials. Alternative to Brevo. |
| `CLOUDFLARE_WORKER_URL`, `CLOUDFLARE_WORKER_HOSTNAME` | No | Your Cloudflare Worker's URL. Required for all proxied media providers (B2, R2, S3, Spaces, Wasabi, MinIO, Vercel Blob, Supabase). |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | No | Backblaze B2 credentials. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | No | Cloudflare R2 credentials. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | No | AWS S3 credentials. |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | No | DigitalOcean Spaces credentials. |
| `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | No | Wasabi credentials. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | No | MinIO credentials. |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob token. |
| `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | No | Supabase Storage credentials. Use the service role key, not the anon key. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | Cloudinary credentials. |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | No | ImageKit credentials. |
| `GITHUB_API_TOKEN` | No | GitHub personal access token (`repo` scope). Used for module and theme installs when a GitHub App is not connected. |
| `ENCRYPTION_KEY` | No | 64-character hex key for encrypting GitHub App credentials. Required to connect a GitHub App. Generate with `openssl rand -hex 32`. Must not change after a GitHub App is connected. |
| `EDGE_CONFIG`, `VERCEL_EDGE_CONFIG_ID` | No | Vercel Edge Config credentials. Used for faster admin-path and site-status lookups. |
| `VERCEL_WEBHOOK_SECRET` | No | Enables automatic deployment status updates. Requires a Vercel Pro or Enterprise plan. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile credentials. Adds bot protection to public-facing forms. |
| `SENTRY_DSN` | No | Sentry error-reporting address. |
| `CACTUS_CORE_REPO` | No | Override the upstream repository the Updates panel checks. Set this if you maintain a fork of Cactus Foundation. |

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
