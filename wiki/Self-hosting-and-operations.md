# Self-hosting and operations

> This page is for technical operators and developers. It covers database backups, the Cloudflare Worker, monitoring, and recovery procedures. If you're looking to manage your site's content or settings, see the [site owner guides](Home) instead.

## Database backups

Cactus is stateful in two places: PostgreSQL and your media bucket. Back both up.

**Recommended approach for PostgreSQL on Neon or Supabase:**

- Enable Point-in-Time Recovery (PITR) - both providers offer it on paid plans. PITR lets you restore to any second in the past within your retention window, which is far more useful than a daily snapshot when debugging a bad migration.
- For self-hosted Postgres: use `pg_dump` scheduled via cron, ship the dump to an off-server location (another cloud storage bucket), and test restores occasionally.
- **Manual one-off backup**: admin > Settings > General has a "Download Backup" button that generates a full SQL dump (schema + data + sequence counters) on demand and downloads it straight to the browser. No object storage provider needed - it's independent of whatever media provider (B2 or otherwise) you have configured, or none at all. Good for a quick copy before a risky change; PITR/cron `pg_dump` is still the right answer for ongoing, unattended backups.

The backup covers the database only. It does **not** contain your media files - those live in your bucket, and are covered separately below. Restoring a backup onto a site whose bucket has been emptied gives you all your pages and settings back, pointing at images that no longer exist.

**If the download fails with "Cactus doesn't know how to back up" a particular column**, that is deliberate. Rather than write a backup file that would silently fail months later when you actually needed it, Cactus refuses to write one it cannot guarantee. Report it - the fix is to teach the backup that column's type.

## Restoring from a backup

A `.sql` file from the Download Backup button can be restored in two places:

- **admin > Settings > General** on a running site.
- **The setup wizard**, on a brand-new install that hasn't been set up yet - useful for moving a site to a new host, or rebuilding after losing the database.

Restoring is **destructive and complete**: every existing row is wiped and replaced with the backup's contents, so the result is a faithful point-in-time copy rather than a merge. It runs in a single transaction - if anything fails partway, nothing is changed at all.

Things worth knowing:

- **Modules.** If the backup came from a site with a module you don't have installed here (the shop, say), that module's data is skipped and reported rather than aborting the whole restore. Install the module first if you want its data back.
- **Sequence counters** - such as the shop's order numbers - are restored along with the data, so the next order after a restore carries on from where the old site left off rather than re-issuing numbers that already exist.
- **Version mismatches are refused, not fudged.** If the backup was taken on a newer version of Cactus than the site you're restoring onto, the restore stops and tells you to update the site first. It won't quietly drop the data it has nowhere to put. Nothing is changed when it refuses.
- **Some things cannot travel between sites, and are cleared rather than faked.** See below.

### What a backup can't carry across to a different site

A few things are locked to the site that made the backup. Every install has its own encryption key, generated when it is set up, and the backup file deliberately does not contain it - a backup that carried the keys to everything it protects would be a poor sort of secret. So a handful of items are unlocked by a key the new site simply doesn't have.

Rather than restore them and let you find out the hard way, the restore tries to read each one, clears anything it can't, and lists what it cleared on the screen when it finishes. Restoring onto the **same** site (rebuilding a lost database, say) keeps everything - the key hasn't changed, so nothing needs clearing.

What you'll need to set up again on the new site:

- **The GitHub App connection**, under admin > Settings > Integrations. Until you do, updates and the module directory won't work - they need GitHub access, and the old site's credentials are just so much noise here. If you're looking at a site restored before this behaviour existed, the Integrations tab now says so plainly and offers a Reconnect button, instead of insisting everything is fine while nothing works.
- **Authenticator-app sign-in** for admins, if anyone was using it. Sign in with your password and the code sent to your email, then set the authenticator up again from your account settings.
- **Members' two-factor authentication.** Nobody is locked out: any member whose authenticator or phone came across gets a code by email at sign-in instead, until they re-enrol from their own account settings.

Your pages, media, settings, users, orders and everything else come across exactly as they were.

**Media backups:**

- Backblaze B2 and Cloudflare R2 support bucket replication. Enable it for production.
- For other providers, use the provider's own snapshot or replication feature, or ship periodic exports to a secondary bucket.
- If you delete a media file via the admin, it's deleted from the provider immediately. There's no soft-delete or trash. Your bucket backup is the recovery path.

## Cloudflare Worker deployment

There are two ways to stand up the media Worker.

**Automatic (recommended for non-technical operators).** The admin **Settings → Media** panel has a **Set up the Worker automatically** box. The admin supplies a Cloudflare credential and Cactus deploys the Worker via the Cloudflare API - uploading the script, setting the provider secrets, enabling the `*.workers.dev` URL, and (when possible) attaching a `media.<your-domain>` Custom Domain - then writes the best public URL into `CLOUDFLARE_WORKER_URL` for them. No terminal required.

- Credential: either a scoped **API token** (recommended) with `Account · Workers Scripts · Edit` + `Account · Account Settings · Read` + `Zone · Zone · Read`, or the legacy **Global API Key** + account email. Both are obtained at <https://dash.cloudflare.com/profile/api-tokens>. `Zone · Zone · Read` is only needed for the Custom Domain step; without it the deploy still succeeds on the `*.workers.dev` URL.
- The credential is stored back as Vercel env vars for future re-deploys: `CLOUDFLARE_API_TOKEN` **or** `CLOUDFLARE_GLOBAL_API_KEY` + `CLOUDFLARE_EMAIL` (the two keys are stored *sensitive*), plus `CLOUDFLARE_ACCOUNT_ID`.
- The account must have a `workers.dev` subdomain claimed once (Cloudflare dashboard → Workers & Pages). If it doesn't, the deploy returns a clear error asking you to set one.
- **Custom domain.** When `SITE_URL`'s host sits in a zone on the same Cloudflare account, the deploy attaches `media.<zone-apex>` to the Worker (Cloudflare provisions the DNS record and TLS certificate), stores that as `CLOUDFLARE_WORKER_URL`, and rebases every existing proxied `Media.url` onto it - via `rebaseProxiedMediaUrls()` in `lib/media/upload.ts` - so old and new images share one address. Direct-provider images (Cloudinary, ImageKit) are left on their own CDN. If no zone matches (domain managed elsewhere, or the token lacks `Zone · Zone · Read`), it falls back to the `*.workers.dev` URL and surfaces the reason. The certificate can take up to a minute to go live after the next site redeploy.
- Worker script name: `cactus-media-worker`. Re-running the deploy overwrites it in place.

**Manual (wrangler).** The Cloudflare Worker reads credentials from **Worker secrets**, not from Vercel environment variables. Configure these manually whenever you add or change a proxied provider.

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

The **Admin - Modules** page checks each installed module for available updates once per page visit, throttled per module via a `sessionStorage` timestamp (`cactus-module-update-check-{id}`, 10s window) so a reload or quick navigate-away-and-back doesn't refire the check. For every installed module not already throttled, it fires a background `GET /api/admin/modules/{id}` call; if a newer GitHub release exists on that module's configured channel, the "Update" button appears without any manual action required. A per-module refresh icon (↻) forces an immediate re-check, bypassing the throttle. The check is a no-op when GitHub is not configured.

Each module has its own update channel (`Module.updateChannel`, `'public'` or `'beta'`), set independently via the Public/Beta buttons on its row - there is no longer a site-wide module update channel.

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

> **Changed:** deleting the `Passkey` row no longer lets you register a replacement from the sign-in page. That shortcut trusted nothing but the email address you typed, so anyone who knew an admin's address could attach their own authenticator to that account and sign in as them. Enrolling a passkey now always requires an authenticated session first.

**If the account has an authenticator app (TOTP):**

1. Go to `/<adminPath>/login` and choose **Use authenticator app instead**.
2. Enter your email address and the 6-digit code. TOTP sign-in does not send email, so it works on a site with no email configured.
3. Once in, add a new passkey from **Account settings → Security**, and remove the old one.

**If it does not**, you need a second factor to exist before you can prove the account is yours - which means configuring email:

1. Add email credentials to your environment variables and redeploy.
2. Go to `/<adminPath>/login`, click **Lost access?**, and request a recovery link (expires in 30 minutes, single use).
3. Complete recovery - you are signed in and can register a new passkey from **Account settings → Security**.

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
4. Add email credentials to your environment variables (if not already set). This is required, not optional: the password fallback issues a one-time code by email or SMS, so it cannot complete on a site with no email configured.
5. Sign in via the password fallback and register a new passkey from **Account settings → Security**.
6. Once your passkey is registered, change the temporary password to a strong one from **Account settings → Password** (passkeys remain your primary sign-in).

### Adding or changing your password

A signed-in admin can add or change their password from **Account settings → Password** (`/<adminPath>/account`), without touching the database.

- The section only appears when email is configured (Brevo or SMTP). The password sign-in relies on email to send a one-time code, so a password set without email would be useless. If email is not configured, the section shows a warning with a link to **Settings** instead of the form.
- If you have no password yet, the form takes a new password. If you already have one, it also asks for your current password before changing it.
- Passwords must be at least 12 characters and are checked against the Pwned Passwords breach list; breached passwords are rejected.
- A notification email is sent to your address whenever the password is added or changed.
- Removing a password is not yet supported from the UI; set a strong one and rely on passkeys for day-to-day sign-in.

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

The **Settings → General** tab shows an Updates panel that checks the upstream Cactus Foundation repo for newer releases. It auto-checks once per visit (throttled client-side via `sessionStorage` for 10 seconds, so a reload doesn't refire it) and shows "Checking for updates..." while a check is in flight; a **Refresh** button forces an immediate re-check, bypassing both that 10-second window and the server's 10-minute cache. Two buttons at the top of the panel let you choose the **update channel**: **Public** (stable releases only, the default) or **Beta** (pre-releases included). The preference is stored in the database and takes effect immediately. If an update is available on the active channel, an **Update now** button appears. Clicking it:

1. Uses the GitHub API to diff between your installed version tag and the latest release tag on `usersaynoso/cactus-foundation`.
2. Copies changed core files into your GitHub repo (your `GITHUB_REPO` env var), skipping `modules/`, `.gitmodules`, and all database content.
3. Commits the changes and triggers a Vercel redeploy automatically.

Module code is pinned to the version recorded in your site's module registry - a build never fetches newer module code than that on its own. If any installed module has an update available, the confirmation dialog shows an **"Also update"** checkbox (ticked by default) listing the affected modules and their target versions: ticked, those modules are updated in the same deploy as core; unticked, core updates alone and your modules stay exactly as they are, with their "update available" flag left for you to apply later from the Modules page.

**Checking for updates** reads the public upstream releases directly and does not require your GitHub App installation to include the upstream repo. The check tries your authenticated GitHub connection first (so a private upstream fork the installation can reach still works) and falls back to an unauthenticated read of the public `usersaynoso/cactus-foundation` repo. As a result, the panel correctly shows the update card (or "Up to date") even when your App is only installed on your own deployment repo. If the check itself fails for some other reason, the panel says "Couldn't check for updates right now" rather than falsely reporting that GitHub is not configured.

**Applying an update** still requires GitHub to be configured (a GitHub App or `GITHUB_API_TOKEN`) with write access to your `GITHUB_REPO`. The upstream repo must publish GitHub Releases whose tags correspond to `package.json` versions (e.g. `v0.5.97`).

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

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
