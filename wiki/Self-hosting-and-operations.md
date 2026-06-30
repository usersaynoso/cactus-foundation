# Self-hosting and operations

## Database backups

Cactus is stateful in two places: PostgreSQL and your media bucket. Back both up.

**Recommended approach for PostgreSQL on Neon or Supabase:**

- Enable Point-in-Time Recovery (PITR) - both providers offer it on paid plans. PITR lets you restore to any second in the past within your retention window, which is far more useful than a daily snapshot when debugging a bad migration.
- For self-hosted Postgres: use `pg_dump` scheduled via cron, ship the dump to an off-server location (another cloud storage bucket), and test restores occasionally.

**Media backups:**

- Backblaze B2 and Cloudflare R2 support bucket replication. Enable it for production.
- For other providers, use the provider's own snapshot or replication feature, or ship periodic exports to a secondary bucket.
- If you delete a media file via the admin, it's deleted from the provider immediately. There's no soft-delete or trash. Your bucket backup is the recovery path.

## Cloudflare Worker secrets

The Cloudflare Worker that serves proxied media reads credentials from **Worker secrets**, not from Vercel environment variables. You must configure these manually whenever you add or change a proxied provider.

```bash
# Set secrets for the providers you use (run from the workers/media-worker/ directory):

# Backblaze B2
wrangler secret put B2_APPLICATION_KEY_ID
wrangler secret put B2_APPLICATION_KEY
wrangler secret put B2_BUCKET_NAME
wrangler secret put B2_ENDPOINT

# Cloudflare R2
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME

# AWS S3
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY
wrangler secret put S3_BUCKET_NAME
wrangler secret put S3_REGION

# DigitalOcean Spaces
wrangler secret put SPACES_ACCESS_KEY_ID
wrangler secret put SPACES_SECRET_ACCESS_KEY
wrangler secret put SPACES_BUCKET_NAME
wrangler secret put SPACES_REGION

# Wasabi
wrangler secret put WASABI_ACCESS_KEY_ID
wrangler secret put WASABI_SECRET_ACCESS_KEY
wrangler secret put WASABI_BUCKET_NAME
wrangler secret put WASABI_REGION

# MinIO
wrangler secret put MINIO_ENDPOINT
wrangler secret put MINIO_ACCESS_KEY_ID
wrangler secret put MINIO_SECRET_ACCESS_KEY
wrangler secret put MINIO_BUCKET_NAME

# Vercel Blob (BLOB_BASE_URL is the base URL of your blob store, e.g. https://xxxx.public.blob.vercel-storage.com)
wrangler secret put BLOB_BASE_URL
wrangler secret put BLOB_READ_WRITE_TOKEN

# Supabase Storage
wrangler secret put SUPABASE_STORAGE_PROJECT_URL
wrangler secret put SUPABASE_STORAGE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_STORAGE_BUCKET_NAME

# Required for all proxied providers
wrangler secret put ALLOWED_ORIGIN   # e.g. https://example.com
```

Configure only the secrets for the providers you actually have items on - unused secrets have no effect. When you switch providers and choose "Switch without migrating", keep the old provider's secrets in place until migration is complete so that existing items continue to serve correctly.

## Stale-row cleanup

Expired tokens accumulate in the database over time. Cactus doesn't run a background job, but the cleanup is a single query that's fast to run from a cron job or Vercel scheduled function:

```sql
-- Sessions expired more than N days ago (default: 30)
DELETE FROM "Session" WHERE "expiresAt" < NOW() - INTERVAL '30 days';

-- Unused recovery requests older than N days (default: 7)
DELETE FROM "RecoveryRequest" WHERE "expiresAt" < NOW() - INTERVAL '7 days' AND used = false;

-- Expired trusted devices
DELETE FROM "TrustedDevice" WHERE "expiresAt" < NOW();

-- Expired WebAuthn challenges (should be very short-lived)
DELETE FROM "WebAuthnChallenge" WHERE "expiresAt" < NOW();

-- Stale rate-limit windows
DELETE FROM "RateLimit" WHERE "windowStart" < NOW() - INTERVAL '1 hour';
```

The retention periods are configurable on the GDPR & Legal tab of the config page. Schedule the cleanup SQL with your Postgres provider's scheduled jobs feature, a Vercel Cron job, or an external cron.

## Module update detection

The **Admin - Modules** page automatically checks for available updates each time it loads. For every installed module it fires a background `GET /api/admin/modules/{id}` call; if a newer GitHub release exists, the "Update" button appears without any manual action required. The check is a no-op when GitHub is not configured.

Enabling or disabling a module refreshes the admin sidebar immediately - nav links for the toggled module appear or disappear without a full page reload.

## What to monitor

- **Database connection pool saturation** - watch `pg_stat_activity` or your provider's pool metrics. If you're near the limit, check `DATABASE_URL` is a pooled connection string.
- **Vercel function errors** - set `SENTRY_DSN` for structured error tracking. Without it, errors go to Vercel's function logs only.
- **Failed modules/themes** - the Modules/Themes admin page shows any item stuck in `failed` status with the error message.
- **Deploy lock stuck** - if a deploy fails uncleanly, `DeployLock` may remain set. Clear it:
  ```sql
  DELETE FROM "DeployLock" WHERE id = 'singleton';
  ```

## Admin recovery procedures

### Lost passkey - email configured

1. Go to `/<adminPath>/login` and click **Lost access?**.
2. Enter your email address and click **Send recovery link**.
3. Check your inbox, click the link (expires in 30 minutes).
4. Complete recovery - you are signed in and can register a new passkey from **Account settings**.

### Lost passkey - email not configured

Access requires a direct database intervention:

1. Open the **SQL editor** in your [Neon console](https://console.neon.tech) and run:
   ```sql
   DELETE FROM "Passkey" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'your@email.com');
   ```
2. Go to `/<adminPath>/login`, enter your email address, and click **Sign in with passkey**.
3. Because no passkey is on record, you will be prompted to register a new one immediately.
4. Complete passkey registration - you are signed in.

### Completely locked out (no passkey, email not configured or inbox compromised)

1. Connect to your PostgreSQL database.
2. Generate a new `bcrypt` hash for a temporary password:
   ```bash
   node -e "const b = require('bcryptjs'); b.hash('TempPass123!', 12).then(console.log)"
   ```
3. Update the admin user's `passwordHash`:
   ```sql
   UPDATE "User" SET "passwordHash" = '<hash>' WHERE email = 'you@example.com';
   ```
4. Add email credentials to your environment variables (if not already set).
5. Sign in via the password fallback and register a new passkey.
6. Remove the temporary password from account settings once your passkey is registered.

### Last admin account accidentally deleted

1. Connect to PostgreSQL.
2. Find the Admin role:
   ```sql
   SELECT id FROM "Role" WHERE "isProtected" = true;
   ```
3. Assign it to an existing user:
   ```sql
   UPDATE "User" SET "roleId" = '<admin-role-id>' WHERE email = 'you@example.com';
   ```

## Module migration failures

If a module migration fails during a build, the build will fail and Vercel will not deploy. The previous deployment stays live. To diagnose:

1. Check Vercel's build logs for the `[module-migrations]` lines.
2. Fix the SQL in your module's migrations folder.
3. If the broken migration was partially applied, you may need to roll it back manually in the database before retrying.
4. Commit the fix and push - this triggers a new build.

## Upgrading Cactus core

### In-product update (recommended)

The **Settings → General** tab shows an Updates panel that checks the upstream Cactus Foundation repo for newer releases. If one is available, an **Update now** button appears. Clicking it:

1. Uses the GitHub API to diff between your installed version tag and the latest release tag on `usersaynoso/cactus-foundation`.
2. Copies changed core files into your GitHub repo (your `GITHUB_REPO` env var), skipping `modules/`, `.gitmodules`, and all database content.
3. Commits the changes and triggers a Vercel redeploy automatically.

This requires GitHub to be configured (a GitHub App or `GITHUB_API_TOKEN`). The upstream repo must publish GitHub Releases whose tags correspond to `package.json` versions (e.g. `v0.5.97`).

**Requirements:**
- `GITHUB_REPO` is set to your repo (e.g. `myorg/my-cactus-site`).
- GitHub App or `GITHUB_API_TOKEN` has write access to `GITHUB_REPO`.
- The upstream repo (`usersaynoso/cactus-foundation` or your `CACTUS_CORE_REPO` override) publishes tagged GitHub Releases.

**What is preserved:** Anything in `modules/`, `.gitmodules`, and all database rows (users, pages, layouts, media, settings). Only core files tracked in the upstream diff are overwritten.

**Override the upstream repo:** If you fork Cactus Foundation, set `CACTUS_CORE_REPO=yourorg/your-fork` so the Updates panel checks your fork instead.

### Manual upgrade (alternative)

Cactus core upgrades can also be done manually: `npm update next @prisma/client prisma` (and other dependencies), followed by a new `prisma migrate dev` if the schema changed, then push. The module migration runner runs before `next build` and is unaffected by core upgrades.

## Environment variable changes

Adding or changing an environment variable requires either:
- A new Vercel deployment (for most variables), or
- Just saving in Vercel's project settings (for variables that aren't compiled into the build, like `DATABASE_URL`)

After changing `SITE_URL`, you **must** also re-register all passkeys - credentials are bound to the relying party ID (the domain). There is no automated migration for this.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Architecture overview](Architecture-overview) · [Configuration reference](Configuration-reference) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
