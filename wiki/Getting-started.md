# Getting started

## Prerequisites

- Node.js ≥ 22
- A Vercel account (Hobby is fine for most features; Pro/Enterprise unlocks Vercel webhooks for automatic deployment status updates)
- `npm` — this project uses npm only. Do not use yarn or pnpm.
- A PostgreSQL database **or** a Neon API key to have one created automatically (see below)

## Clone and install

```bash
git clone https://github.com/usersaynoso/cactus.git my-site
cd my-site
npm install
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

### Required — setup blocks without these

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL **pooled** connection string. Can be provisioned automatically — see below. |
| `SESSION_SECRET` | At least 32 random characters. Generate: `openssl rand -base64 32` |
| `SITE_URL` | The canonical public domain, e.g. `https://example.com`. **This is also the WebAuthn relying party ID and cannot be changed after the first passkey is registered.** |
| `VERCEL_API_TOKEN` | Vercel REST API token. Create at: Vercel dashboard → Account Settings → Tokens. Required for Edge Config writes, deployment status checks, and writing `DATABASE_URL` during automatic provisioning. |
| `VERCEL_PROJECT_ID` | Vercel project ID. Find it at: Vercel dashboard → your project → Settings → General. Must be set and the project redeployed before setup can proceed. |

### Optional — feature is disabled until set

| Variable | Gates |
|----------|-------|
| `NEON_API_KEY` | Automatic database provisioning during setup. Leave unset if you supply your own `DATABASE_URL`. |
| `BREVO_API_KEY` | Email (password login, verification, recovery). Alternative: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` |
| `CLOUDFLARE_WORKER_URL`, `CLOUDFLARE_WORKER_HOSTNAME` | Media serving via Cloudflare Worker (required for all proxied providers) |
| **Backblaze B2** — `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | Media uploads to B2 |
| **Cloudflare R2** — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Media uploads to R2 |
| **AWS S3** — `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | Media uploads to S3 |
| **DigitalOcean Spaces** — `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | Media uploads to Spaces |
| **Wasabi** — `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | Media uploads to Wasabi |
| **MinIO** — `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | Media uploads to MinIO |
| **Vercel Blob** — `BLOB_READ_WRITE_TOKEN` | Media uploads to Vercel Blob |
| **Supabase Storage** — `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | Media uploads to Supabase Storage |
| **Cloudinary** — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media uploads to Cloudinary (direct CDN, no Worker) |
| **ImageKit** — `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Media uploads to ImageKit (direct CDN, no Worker) |
| `GITHUB_API_TOKEN` | Module and theme install/update (needs `repo` scope) |
| `EDGE_CONFIG`, `VERCEL_EDGE_CONFIG_ID` | Fast Edge Config reads |
| `VERCEL_WEBHOOK_SECRET` | Automatic deploy status (Pro/Enterprise only) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile bot protection |
| `SENTRY_DSN` | Error reporting |

## Local development

```bash
# Apply the database schema (creates a migration file and updates the database)
npm run db:migrate
# Equivalent to: prisma migrate dev

# Start the dev server
npm run dev
```

Open http://localhost:3000. If the database is empty (no `SiteConfig` row), you'll be redirected to `/_setup` to run the setup wizard.

## First deploy to Vercel

1. Push your repo to GitHub.
2. Import the project in the Vercel dashboard.
3. Add all required environment variables in Vercel's project settings (`SESSION_SECRET`, `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`). You do **not** need to set `DATABASE_URL` yet if you plan to use automatic provisioning.
4. Deploy. The build runs `prisma migrate deploy` automatically — but if `DATABASE_URL` isn't set yet, the build will fail at that step. If you're using automatic provisioning, let setup handle the database creation first (see below), then the next redeploy will succeed.
5. Visit your production URL — you'll be redirected to `/_setup`.

## The setup wizard

The wizard runs once, at `/_setup`, and completes in five steps:

1. **Connect your project** — confirms required variables are set and your Vercel project is linked. If `DATABASE_URL` is absent, you will be offered one of the three paths below.
2. **Admin account** — enter a username and email, then register a passkey (fingerprint, Face ID, or security key). No password at this step. The account is exempt from email verification.
3. **Admin path** — choose a secret URL prefix for the admin area. A suggestion is pre-filled (e.g. `lemon-4f8a2c`). Anyone who doesn't know this path gets a plain 404.
4. **Name your site** — site name and timezone. Site URL is shown read-only (it comes from `SITE_URL`).
5. **Recovery code** — a single-use offline recovery code is generated and shown **once**. Save it somewhere safe (password manager, printed paper). Only a hash is stored.

When you click "I've saved it", the setup marks `setupCompleted = true` and redirects you to the admin dashboard.

Optional features (email, image storage, bot protection, etc.) are not configured during setup. After setup, the dashboard shows an **Additional features** checklist with friendly descriptions and direct links to the relevant settings section.

## Database setup: three paths

### Path 1 — `DATABASE_URL` already set (bring your own)

If `DATABASE_URL` is present in your environment, the wizard proceeds normally. No change from the standard flow.

### Path 2 — Automatic provisioning via Neon (recommended for new installs)

If `DATABASE_URL` is **absent** and `NEON_API_KEY` is present, the wizard offers three options:

#### Option A — Create a fresh database automatically (recommended)

1. Cactus calls the Neon API to create a new free-tier Neon Postgres project in your chosen region.
2. The **pooled** connection string is written as `DATABASE_URL` to your Vercel project's environment variables via the Vercel REST API.
3. Writing that env var triggers a **Vercel redeployment**. During that build, `prisma migrate deploy` runs automatically and applies the database schema. **The wizard cannot continue in the same page load** — this is unavoidable.
4. The wizard shows a "redeploying" state and polls `/api/health` every 5 seconds. Once the database is reachable, it advances you automatically.

**Idempotency:** if the page refreshes or the deployment fails mid-flight, the wizard detects the existing Neon project by name and reuses it. The project name follows the pattern `cactus-{VERCEL_PROJECT_ID}`.

#### Option B — Use an existing Neon project

1. The wizard lists all Neon projects in your account. Select the one you want to connect.
2. Before connecting, Cactus checks whether the selected project already has database tables. If it does, you'll see a warning with two choices:
   - **Use existing data** — Cactus connects the project as-is. Any existing admin settings (site name, admin path, timezone) are pre-filled in the setup wizard. Prisma applies only pending migrations, leaving existing rows intact.
   - **Destroy all existing data** — Cactus drops and recreates the `public` schema before connecting. This gives Prisma a clean slate and is the right choice if you want a fresh Cactus install in a project that previously held other data.
3. Cactus fetches the pooled connection URI, (optionally drops the schema), writes it to Vercel, then redeploys.

> **Warning:** "Destroy all existing data" is irreversible — it permanently deletes everything in the database's public schema. Only choose this if you are certain you no longer need the existing data.

#### Option C — Supply your own `DATABASE_URL`

Paste any PostgreSQL connection string. Cactus writes it to Vercel and triggers a redeploy.

> **Why does the page pause?** Vercel applies new environment variables only at redeploy time. The redeploy is the mechanism by which the build picks up the new variable and runs migrations. This is by design — the architecture guarantees migrations only ever run in the build step, never from the live app.

**To use Path 2:**

1. Create a free Neon account at [console.neon.tech](https://console.neon.tech).
2. Go to Account Settings → API keys and generate a key.
3. Add `NEON_API_KEY` to your Vercel project's environment variables and redeploy (or add it before the initial deploy).
4. Ensure `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` are also set — they are required for Cactus to write `DATABASE_URL` back to your project.
5. Visit `/_setup`. The wizard will offer the three options above.

### Path 3 — Manual (no Neon API key)

If `DATABASE_URL` is absent and `NEON_API_KEY` is also absent, the wizard shows manual instructions:

1. Create a Postgres database anywhere (Neon, Supabase, self-hosted, etc.).
2. Copy the **pooled** connection string.
3. Add it as `DATABASE_URL` in your Vercel project's environment variables.
4. Trigger a redeploy. Migrations run during the build automatically.
5. Return to `/_setup` — setup continues from where it left off.

The wizard also shows a hint that setting `NEON_API_KEY` would allow automatic provisioning.

## After setup

The site defaults to `comingSoon` status. To go live:

1. Go to **Settings → Site Status** and set it to **Live**.
2. Add optional credentials (email, media, GitHub, etc.) via the **Additional features** checklist on the dashboard, or navigate directly to **Settings** and the relevant tab.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a theme](Authoring-a-theme) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
