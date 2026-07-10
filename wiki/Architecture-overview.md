# Architecture overview

> This page is a technical reference for developers building on or contributing to Cactus Foundation. If you're looking to manage your site day-to-day, see the [site owner guides](Home) instead.

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
      ├── Member area rewrite
      │     → request matches /<memberAreaPath>[/*] ?
      │         members system disabled → 404
      │         yes → rewrite to /_cactus_member_area[/*]
      │               (sets x-cactus-member-full-path so the layout can build
      │                an accurate post-login redirect target)
      │
      ├── Site status gate (public routes only)
      │     → status = live?  → pass through
      │     → status ≠ live and requester has admin session? → pass through
      │     → status = comingSoon → rewrite to /_status/coming-soon
      │     → status = maintenance → rewrite to /_status/maintenance
      │
      └── Members-only site access gate (public routes only)
            → resolve route tier: site-wide members-only setting, OR a
              module-declared route tier (PUBLIC / MEMBER / TRUSTED_MEMBER)
              for this path
            → tier = PUBLIC and site-wide gate off → pass through
            → path is a declared site-wide exception → pass through
            → requester has an admin session → pass through
            → requester has a valid member session (trusted, if required)?
                yes → pass through
                no  → guest preview enabled? → pass through, flagged
                      no member session at all? → redirect to member login
                      signed in but insufficiently privileged? → 404
```

**Why `proxy.ts` instead of `middleware.ts`?** Next.js 16 moved the request-interception layer from the Edge runtime to Node.js and renamed the file. Running on Node.js means Prisma works directly - no edge-compatible ORM, no edge Config only as a fallback. The admin path and site status checks can use real database reads.

## Admin path and Edge Config

The admin path is a secret URL prefix chosen during setup. It's stored in `SiteConfig.adminPath` and mirrored to **Vercel Edge Config** whenever it changes (via the Vercel REST API). `proxy.ts` reads it from Edge Config first (fast, no database round-trip), falling back to a Prisma read cached briefly in memory if the Edge Config write credentials are absent. Same pattern for site status.

## Vercel project and domain connection (setup wizard)

Before database provisioning, the wizard connects to Vercel and attaches a domain to the project:

- **Add/attach domain** - `POST /v10/projects/{projectId}/domains` adds a new domain, or an already-owned account domain can be attached directly. Either way the response is followed by `GET /v6/domains/{domain}/config` to read Vercel's `misconfigured` flag and the recommended DNS record.
- **DNS confirmation gate** - if the domain comes back `misconfigured`, the wizard shows the required DNS record and disables "Configure project →" until it resolves. It re-checks automatically every 10 seconds (plus a manual "Check now" button) and unlocks the button the moment Vercel reports the domain as configured. This stops the user being carried forward to a custom domain that doesn't resolve yet.
- Domains already attached to the project use their `verified` flag from the initial project listing to decide whether the gate applies.
- **Redirect to the custom domain** - once the combined bootstrap redeploy (below) picks up `SITE_URL`, the browser needs to move from the Vercel-assigned URL to the real domain before Step 3 (WebAuthn's rpId is derived from `SITE_URL`, so passkey registration fails across a mismatched origin). The check (`checkSiteUrlAndRedirectIfNeeded`) runs at the point the wizard is about to advance from Step 2 to Step 3 - before Step 3 ever renders, not reactively after - so there's no flash of Step 3 on the wrong domain. It compares the current origin against a fresh `GET /api/setup/env-check` (`siteUrl` field, read server-side from `process.env.SITE_URL` on every request, never the client's build-time-inlined `NEXT_PUBLIC_SITE_URL`, which would still hold the pre-redeploy value in an already-open tab). If it redirects, it appends `?autocontinue=1` (and `existingData=1` if that flow was in progress) so the reloaded wizard on the new domain skips straight past Step 2's "Database connected" click-through and lands on Step 3 immediately, rather than making the user click Continue again.

## Automatic database provisioning (setup wizard)

When `DATABASE_URL` is absent at setup time and `NEON_API_KEY` is configured, the setup wizard can provision a Postgres database automatically:

1. **Neon API call** - `POST https://console.neon.tech/api/v2/projects` creates a new Neon project. The response includes both a direct and a **pooled** connection string. Cactus uses the pooled one (`connection_parameters.pooler_host`) to satisfy the pooling requirement.
2. **Vercel API write** - `POST https://api.vercel.com/v10/projects/{projectId}/env` writes `DATABASE_URL` (pooled) and `NEON_PROJECT_ID` (for idempotency) as project environment variables.
3. **Triggered redeploy** - the wizard explicitly triggers a new production deployment via the Vercel API (a redeploy of the latest production deployment, passing `teamId` when the project is team-owned). During that build, the existing `build` script (`prisma migrate deploy && node scripts/run-module-migrations.mjs && next build`) applies the full schema. If the trigger fails, the failure is surfaced in the wizard with a "Retry redeploy" button and a pointer to the Vercel dashboard - it is never silently swallowed.
4. **Readiness poll** - the wizard polls `/api/health` every 5 seconds. Once the database is reachable (redeploy complete, schema applied), the wizard advances to the next step. It also streams the deployment's state and build log while waiting; a deployment that ends in ERROR or CANCELED is shown as failed with its log and a retry, not left spinning.

**Migrations are never triggered from the wizard.** Provisioning only creates the Neon project and writes the env var. The schema reaches the database exactly as it always does: via the `build` script, run by Vercel during the triggered deployment. The wizard cannot continue in the same page load; the redeploy is the mechanism, not a side-effect.

**Idempotency and self-healing** - the provisioning action checks for an existing Neon project named `{VERCEL_PROJECT_NAME}-{VERCEL_PROJECT_ID}` (falling back to `cactus-{VERCEL_PROJECT_ID}` if the Vercel project name can't be looked up) before creating a new one, and env-var writes are upserts, so a stale `DATABASE_URL` from an earlier attempt is overwritten rather than turning the request into a no-op. When the wizard loads and finds `DATABASE_URL` already written to the Vercel project but not yet in the runtime (the "provisioned, awaiting redeploy" state), it calls the `ensure-redeploy` action: if a production deployment is already in flight it attaches to that one, otherwise it triggers a fresh redeploy - so a reload after a failed or errored deploy recovers on its own instead of waiting forever. Double-clicks and page refreshes are safe.

## Authentication and sessions

- **Passkey-first**: WebAuthn registration and authentication via `@simplewebauthn/server`. The relying party ID is derived from `SITE_URL` in production, `localhost` in development. Credentials are stored in the `Passkey` table (public key, counter, transports).
- **Authenticator app (TOTP)**: equal-strength alternative to a passkey, not stacked on top of it. RFC 6238 via the `otpauth` library, QR rendering via `qrcode`. The secret is stored on `User.totpSecretEncrypted` (AES-256-GCM via `lib/crypto/secrets.ts`, same `ENCRYPTION_KEY` pattern as `GithubAppConnection`), unset until `User.totpVerifiedAt` is set by a successful verify. Routes: `POST /api/auth/totp/setup-options` and `/setup-verify` (dual-mode - `userId` in body during setup wizard, session cookie from account settings; the `userId` body param is only honoured while setup is genuinely incomplete, both routes reject it once `setupCompleted` is true), `POST /api/auth/totp/verify` (login step, email + code, rate-limited under `totp_verify`; `setup-verify` shares the same rate limit). `User.totpLastStep` records the last accepted 30s time-step so a code can't be replayed within its validity window. `GET`/`DELETE /api/account/totp`. `DELETE` refuses to disable it if the account has no password and no passkeys (would lock the admin out).
- **Sessions**: Database-backed (not JWTs). A session token is hashed with `SESSION_SECRET` before storage. Suspending a user invalidates their session immediately.
- **Password + OTP fallback** (when email is configured): bcrypt, Pwned Passwords k-anonymity check on registration, mandatory 6-digit email OTP as second factor. When the user has enrolled a phone number (`User.smsOtpPhoneEncrypted`, AES-256-GCM) and an active module contributes a configured SMS provider (manifest `smsProviders` field → generated `lib/modules/sms-providers.ts`, consumed via `lib/auth/sms.ts`), the same OTP is delivered by text message instead of email, falling back to email automatically if the text fails or the provider disappears. Verification is unchanged - both channels share the `EmailChallenge` record. Members get the equivalent via an `SMS` `TwoFactorMethod` on `MemberTwoFactor` (phone in `phoneEncrypted`), which takes priority over other configured methods when deliverable, shares the member email-challenge store, and has the same silent email fallback.
- **Trust this browser**: a `TrustedDevice` cookie skips the OTP step for a configurable number of days.
- **Recovery**: offline single-use recovery code (generated at setup), or email link (30-minute expiry). Both land on the login page's recovery UI.

## Members system

The Members system is a parallel, independent account system for site visitors - entirely separate from the admin `User` model above. A `Member` never has admin permissions and a `User` never appears in the member directory; the two tables, sessions, and cookies never mix. See [Members](Members) for the site-owner-facing explanation.

### Configuration

All settings live in a single `SiteConfig.membersConfig` JSON column (`lib/members/config.ts`, `MembersConfigSchema`, Zod-validated with safe defaults on parse failure - a corrupted column never takes the site down). `getMembersConfigCached()` gives proxy.ts a 5-second in-memory cache, matching the existing `getAdminPathCached` pattern. The member area's own URL prefix (default `account`) is set separately, via the `MEMBER_AREA_PATH` env var (`lib/members/paths.ts`), since - like the admin path - changing it needs a redeploy.

### Registration and verification

`lib/members/registration.ts` and `lib/members/tokens.ts` handle username/email validation, invite-token validation (invite-only mode), and email verification tokens (`sha256(token)`, single-use, short-lived - see the token-hashing convention below). `deriveInitialStatus`/`deriveActivatedStatus` compute a member's status (`PENDING_VERIFICATION`, `PENDING_APPROVAL`, `ACTIVE`, etc.) from the registration mode and verification requirement, so the same deterministic status is reachable from multiple code paths (a genuine registration, and the enumeration-safe branch below) without ever hardcoding it.

**Enumeration safety:** every member-facing auth endpoint (registration, verification resend, magic link, username availability) returns the same response shape regardless of whether an account or email actually exists, so a visitor can't use response differences to discover who is registered.

### Sessions and sign-in

`lib/members/session.ts` mirrors the admin session module but is entirely separate: its own table (`MemberSession`), its own cookie (`cactus_member_session`), its own trusted-browser cookie (`cactus_member_trusted`). Session validation only ever succeeds for `ACTIVE` members; a suspended, deleted, or not-yet-approved member's session token stops working immediately even if the cookie is still present.

Three sign-in methods, each independently toggleable in config: **passkeys** (`lib/members/passkey.ts`, mirrors the admin passkey module against `Member`/`MemberPasskey`), **magic links** (`lib/members/magic-link.ts`, single-use emailed token), and **password + mandatory two-factor** (email code or TOTP via `otpauth`, same as the admin password fallback - a password alone is never sufficient). Token hashing follows the existing project convention: long-lived credentials (sessions, trusted browsers) are hashed as `sha256(token + SESSION_SECRET)`; short-lived single-use tokens (verification, magic links, invites) are plain `sha256(token)`.

Security-sensitive changes (passkey added/removed, password changed, 2FA changed, new trusted browser) trigger an email via `lib/members/security-alerts.ts`, independent of whatever notification preferences the member has set for module-driven notifications.

### Account area and public profile

The member-facing account area (`/<memberAreaPath>/...`, e.g. `/account`) has five independently-toggleable sections: Profile, Security, Notifications, Activity, Danger Zone. Its layout gate reads the `x-cactus-member-full-path` header set by proxy.ts to build an accurate post-login redirect.

Every member gets a public profile at `/members/<username>`, whose visibility (`PUBLIC` / `MEMBERS_ONLY` / `HIDDEN`) is config-driven, plus an optional member directory. Avatars resolve through `lib/members/avatar.ts` (`resolveEffectiveAvatarChoice`) across three sources - an uploaded photo, Gravatar (proxied server-side through `/api/members/avatar-proxy/[id]` so a member's email is never exposed to a client-side Gravatar request), or a generated initials avatar - respecting the `avatarUploadsEnabled`/`gravatarEnabled` config toggles even if a member's stored choice predates a toggle being switched off.

### GDPR and email

Members can request a full data export (assembled server-side, downloadable for 48 hours, `lib/members/export.ts`) or delete their account (soft-deleted with a config-driven grace period before a cron job purges it, `lib/members/deletion.ts`). Every member-facing email (verification, magic link, security alerts, digests, and any module-contributed notification) flows through a single template registry (`lib/email/templates.ts`, `MEMBER_EMAIL_TEMPLATES`) that admins can customise per-key from **Settings → Users → Email templates**, with a merge-tag list, test-send, and reset-to-default.

### Puck blocks

Six member-aware Puck blocks (login, register, account link, member gate, trusted-member gate, profile) are defined in `lib/puck/config.tsx` alongside the rest of the block library, but their actual render logic lives in a separate `lib/puck/components/MembersBlocksRsc.tsx` - each an async Server Component starting with `await connection()` to force per-request dynamic rendering (so a gate block always reflects the current visitor's session, never a cached render). This mirrors the existing `moduleComponents`/`moduleRscComponents` editor/RSC split used for module-contributed blocks, keeping session-dependent code out of the shared editor-bundle file.

### Module extension points

Modules declare member-related extensions declaratively via an optional `memberExtensions` manifest field (`lib/modules/manifest.ts`) - `activityTypes`, `notificationCategories`, `dataExportPath`, and `routeTiers`. Unlike `extensionPoints`/`settingsTabs`, this is pure data (no static component imports, no codegen step): `lib/modules/member-extensions.ts` reads installed modules' manifests directly, and proxy.ts's site-access gate consults a 5-second-cached `getModuleRouteTiersCached()` to resolve whether a given path is `PUBLIC`, `MEMBER`, or `TRUSTED_MEMBER`, independent of the site-wide members-only toggle - either trigger can gate a path, so a module can lock one route tier down without the site owner switching on site-wide members-only mode.

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

## Notifications and deferred deployment

Env-var changes accumulate into a single **deployment notification** instead of redeploying on every save. The admin can keep working and click "Redeploy now" when ready, avoiding repeated build cycles. Module install / update / uninstall and core updates do **not** use this notification: pushing a commit (`modules.json` for modules, the upstream sync for core) is what ships their code, so they redeploy immediately and send the admin straight to the redeploying screen (see below).

**What accumulates into a deployment notification (deferred):**
- Saving email or API-key env vars (`POST /api/admin/env`)
- Applying a Cactus core update **only when Vercel creds are missing** (fallback path)

**What redeploys immediately:**
- Installing, updating, or uninstalling a module - commits `modules.json` (the git push auto-deploys) and redirects to `/cactus-status/redeploying`.
- Applying a Cactus core update - `syncCoreFromUpstream` pushes a fresh commit to `main` (the git push auto-deploys) and the admin is sent to `/cactus-status/redeploying`.
- Factory reset (`DELETE /api/admin/env`) - keeps its immediate redeploy to ensure a clean wipe.

### Notification data model

`Notification` table, `NotificationType` enum: `deployment`, `core_update`, `module_update`, `message`. The nav bell badge counts **any** unread notification (`getUnreadCount` = `count({ readAt: null })`), so new types light the bell automatically.

| Field | Purpose |
|---|---|
| `type` | `deployment` (deferred deploy) or one of the on-demand alert types (`core_update`, `module_update`, `message`). |
| `title` | Human-readable title shown in the UI. For alerts the title carries the version/count, e.g. `Cactus update available - v0.5.110`. |
| `reasons` | JSON array of `{ label, detail?, at }` - each change that contributed to a deployment notification. `null` for alerts. |
| `link` | Admin-relative "View X" target for alerts (e.g. `/config?tab=general`). `null` for deployment notifications. Rendered as `/${adminPath}${link}`. |
| `dedupeKey` | Idempotency handle for on-demand alerts: `core-update` (one ever), `module-update:{moduleId}` (one per module), `contact-form:messages` (one rolling). `null` for deployment notifications. Indexed. |
| `readAt` | `null` = unread (drives the nav bell badge). Set when the admin manually marks read, clicks Redeploy, or clicks a "View …" button. |
| `deployInitiatedAt` | `null` = deploy not yet initiated (the "open" deployment notification that new reasons append to). Set when Redeploy is clicked. Always `null` for alerts. |

**"Open" notification** - a deployment notification where `deployInitiatedAt IS NULL`. New reasons always append here. If the admin manually marked it read but hasn't deployed yet, `readAt` is cleared so the notification re-surfaces when the next change comes in.

### On-demand alerts (core/module updates, contact messages)

Beyond deployment, three alert types are raised **on demand** by the existing update checks - no cron or new infrastructure, matching the app's on-demand pattern. The bell badge then persists the reminder across the admin until the underlying state clears.

`lib/notifications/alerts.ts` provides the generic helpers, keyed by `dedupeKey`:

- `upsertAlert({ type, dedupeKey, title, link })` - creates the alert if none exists; if one exists and the **title** (or link) changed, it re-surfaces it (`readAt: null`); if the title is unchanged it's a no-op (don't nag a notice the admin already read). Re-surfacing keys off the version-bearing title, so a notice only re-lights the bell when the available version actually changes.
- `clearAlert(dedupeKey)` - `deleteMany({ where: { dedupeKey } })`.

Wrappers `recordCoreUpdate(latestVersion)` and `recordModuleUpdate({ moduleId, name, latestVersion })` set the type/dedupeKey/title/link.

**Where they're raised and cleared:**

| Alert | Raised | Cleared |
|---|---|---|
| `core_update` (`core-update`) | `GET /api/admin/updates` when `updateAvailable` (the Settings → General check). Links to `/config?tab=general`. | Same GET when no update. The apply (`POST /api/admin/updates`) deliberately does **not** clear it: the core version is `pkg.version` baked into the running build, so the GET re-derives it truthfully - cleared once the new build is live, left lit if the deploy fails. |
| `module_update` (`module-update:{id}`) | `GET /api/admin/modules/[id]` update-found branch (the Modules page check). Links to `/modules`. | The GET no-update branch; on a **successful** update deploy (`markModulesDeploySucceeded`) or the no-creds optimistic apply; and on uninstall (`DELETE`). A failed update keeps the alert (the update is still available). |
| `message` (`contact-form:messages`) | `syncMessagesNotification()` (contact-form `lib/notify.ts`) when unread > 0. One rolling `N unread messages` notification linking to `/m/contact-form/inbox?tab=unread`. | Same helper when the unread count hits zero. |

All triggers are wrapped in try/catch (or fire-and-forget `.catch`) so a notification failure never breaks the endpoint. The contact-form helper is called after every mutation that changes the unread count: submit, the bulk status/delete PATCH, the single-submission status PATCH / DELETE / open-marks-read, and reply (which marks read).

On the Notifications page, alerts render a leading icon by type (⬆️ core, 📦 module, ✉️ message, 🚀 deployment) and a primary "View Update" / "View Messages" button. Clicking it PATCHes the notification `read: true` then navigates to `link` - viewing marks it read. Deployment notifications keep their `canRedeploy`-gated "Redeploy now" action instead.

### Deferred deploy flow (env vars; core-update fallback)

1. Admin saves an env var (or applies a core update on an install with no Vercel creds).
2. The change handler calls `recordDeploymentNeeded({ label })` (`lib/notifications/deployment.ts`).
3. The helper upserts the open deployment notification, appending the reason (deduped by label).
4. The nav bell badge shows the unread count. A dismissible banner appears across admin pages.
5. When the admin is ready, they visit Notifications and click "Redeploy now".
6. `POST /api/admin/notifications/[id]/redeploy`:
   - Marks the notification `readAt = now, deployInitiatedAt = now`.
   - Flips any `pending_deploy` modules to `deploying`.
   - Calls `startDeferredRedeploy()` (`lib/deploy/redeploy.ts`) - see "Shared redeploy helper" below.

### Immediate deploy flow (modules and core updates)

Module install / update / uninstall and core updates ship their code by pushing a commit, so there is nothing to defer. After the DB work:

1. The module row is set to `deploying` (install/update) or deleted (uninstall). For a core update there is no row - `syncCoreFromUpstream` (`lib/updates/core.ts`) has already committed and pushed the new core files to `main`, which auto-deploys.
2. The handler calls `startDeferredRedeploy()` and returns `{ redeployTriggered: true }`. The core-update route (`POST /api/admin/updates`) passes `startDeferredRedeploy({ committedSince })` - the timestamp captured just before the sync push - so the helper captures that build instead of triggering a second one.
3. The client redirects to `/cactus-status/redeploying`, where the admin watches the build through to completion.
4. If Vercel creds are missing, `startDeferredRedeploy()` returns `{ triggered: false }` and the handler falls back to the deferred-notification flow (`pending_deploy` + `recordDeploymentNeeded` for modules, `recordDeploymentNeeded` for core updates) so non-Vercel installs still work.

### Module checkout is pinned to the registry version

`scripts/checkout-modules.mjs` clones each module at the tag recorded in its `modules.json` entry (`git clone --depth=1 --branch <version>`), falling back to the repo's default-branch HEAD only if an entry has no `version` or the pinned clone fails (e.g. a deleted tag). This applies on every build, Vercel or local.

This matters because `modules.json` is committed independently of any specific admin action - a core update, a different module's install/update/uninstall, or a plain "Redeploy now" can all trigger a build. Before the pin was enforced, the clone ignored `version` entirely and always fetched upstream HEAD, so **any** deploy silently advanced every installed module to whatever was on its default branch, regardless of what `Module.version` (and the Modules page) claimed was installed. Now the registry's `version` field is authoritative: a module's code only changes when something explicitly updates its `modules.json` entry.

### Core update: bundling module updates into the same deploy

The core-update confirm dialog (`app/cactus-admin/config/page.tsx`) offers a checkbox, ticked by default when any installed module has an update, to bundle those module updates into the same deploy:

- `GET /api/admin/updates` calls `findModuleUpdates()` (`lib/modules/updates.ts`) - a pure, non-persisting live check against each installed module's latest release - only when a core update is available, and returns the list as `modulesWithUpdates` for the dialog to display and default-check.
- `POST /api/admin/updates` accepts `{ updateModules: boolean }`. When true, it re-runs `findModuleUpdates()` and, under the same deploy lock as the core sync, sets each stale module to `status: 'deploying', pendingVersion: <latest tag>` (clearing `updateAvailable`/`updateNotes`) **before** calling `syncCoreFromUpstream`.
- Regardless of `updateModules`, the route always passes the full module list to `syncCoreFromUpstream(fromVersion, toVersion, modulesJson)`, where each entry's version is `pendingVersion ?? version`. `syncCoreFromUpstream` (`lib/updates/core.ts`) now accepts this optional `modulesJson` param and, when given, adds a `modules.json` blob to the **same tree/commit** as the diffed core files (the path is excluded from the upstream diff itself, alongside `modules/` and `.gitmodules`). This is what makes the checkbox actually control module code: modules left off the queue keep their current confirmed version pinned (so checkout-modules.mjs re-clones the *same* code, not upstream HEAD), while queued modules get their target tag pinned - all in one push, so there is still only one build.
- If the push fails, queued modules are rolled back to `update_available` in the `catch` block. If Vercel creds are missing (`triggered: false`), queued modules are promoted optimistically (`pending_deploy` + `version` set) the same way the no-Vercel-creds module-update fallback does, since there's no deploy left to reconcile them.

### Shared redeploy helper

`startDeferredRedeploy(opts?)` (`lib/deploy/redeploy.ts`) is used by the notification redeploy route, the module routes, and the core-update route:

- Sets `SiteConfig.pendingRedeployId = 'pending'` and `pendingRedeployAt` synchronously so the proxy shows the redeploying screen immediately.
- **`committedSince` mode** - when the caller has already pushed a commit that triggered a build (e.g. a core update via `syncCoreFromUpstream`), it passes `{ committedSince }` (the timestamp captured before that push). The `after()` callback then **skips** the module sync and `triggerVercelRedeploy()` fallback entirely and just polls Vercel for the build the existing push created, storing its UID. This avoids a double-deploy. The deploy lock guarantees no other deployment exists in that window, so the `created > committedSince` filter reliably catches the right build.
- Otherwise (no `committedSince`), the `after()` callback calls `syncModulesJson(desired)` (`lib/modules/github.ts`), where `desired` is derived from every `Module` row (`name`, `repoUrl`, and `pendingVersion ?? version` - so an in-flight update ships its target tag, see "Confirmed vs in-flight version" below):
  - If the registry differs from git, it commits `modules.json` once. That push is what triggers the Vercel build, so `triggerVercelRedeploy()` is **not** called (calling it would double-deploy); the helper polls Vercel for the build the push created and stores its UID.
  - If the registry already matches git (e.g. an env-var-only redeploy), no commit is made and `triggerVercelRedeploy()` rebuilds the current HEAD to pick up env-var changes.
- If the deployment-id poll comes up empty, the `'pending'` sentinel is **left in place** rather than nulled (nulling would bounce the admin off the redeploying page mid-build). The server-side 2-minute auto-release in `resolvePendingRedeploy()` (`lib/config/site.ts`) is the backstop.
- From here the proxy gate, `/cactus-status/redeploying` screen, and Vercel webhook take over. The webhook and the other "deploy finished" paths reconcile the module rows (see "Confirmed vs in-flight version" below), and `deployment.succeeded` clears `pendingRedeployId`.

### Confirmed vs in-flight version

A module update must not appear to have landed if the build that ships it fails. Two fields separate intent from reality:

- **`version`** - the **confirmed** installed version: the tag of the build that is actually live. This is what the Modules page shows as the installed version (`installedVersion`).
- **`pendingVersion`** - the **in-flight target** while a deploy is running; `null` otherwise.

Clicking **Update** writes `pendingVersion = release.tag` and `status = 'deploying'` but leaves `version`, `updateAvailable`, and `updateNotes` untouched. The deferred sync ships `pendingVersion ?? version` so the build clones the new code. The confirmed `version` only moves when the deploy is **confirmed successful**.

All three "deploy finished" paths funnel through `lib/deploy/reconcile.ts` so they can't drift:
- **`markModulesDeploySucceeded()`** - promotes `version = pendingVersion ?? version`, clears `pendingVersion`/`updateAvailable`/`updateNotes`/`lastError`, sets `active`, and clears the per-module update alert.
- **`markModulesDeployFailed(reason)`** - drops `pendingVersion`, keeps the live `version`, and reverts a mid-update module to `update_available` (clean retry; the failure was already shown on the redeploying screen) or marks a failed **install** `failed` with the reason.

The callers: the Vercel webhook (Pro), the Modules-page `check-status` poll (Hobby), and the redeploying-screen dismiss (`DELETE /api/admin/redeploy-status`, which now checks `getLatestDeploymentStatus()` instead of blindly activating). `pendingVersion ?? version` leaves install flows (no `pendingVersion`) untouched.

The **no-Vercel-creds** fallback (`pending_deploy`) has no deploy to track, so it stays optimistic: it promotes `version` immediately and clears the alert.

### Module status states

| Status | Meaning |
|---|---|
| `pending_install` | Transient - row created during install, before the DB row is finalised. |
| `pending_deploy` | Fallback only (no Vercel creds): change recorded, awaiting admin Redeploy. The normal module path goes straight to `deploying`. |
| `deploying` | Redeploy initiated; Vercel build in progress. Module install / update / uninstall set this immediately. While here, `pendingVersion` holds the target tag; `version` is still the live one. |
| `active` | Deployed and live. `version` reflects the build that shipped. |
| `inactive` | Manually disabled by admin. |
| `update_available` | Newer release exists and hasn't been applied - or a previous update deploy failed and the row reverted here for a clean retry. |
| `failed` | A previous **install** deploy failed (a failed **update** reverts to `update_available` instead). |

## Module system

Modules are git submodules living under `modules/<name>/`. Installing one:

1. `POST /api/admin/modules` fetches `cactus.module.json`, validates the manifest, acquires the deploy lock, and creates the `Module` row. GitHub credentials (resolved by `lib/github/client.ts`: prefers a connected GitHub App installation token, falls back to `GITHUB_API_TOKEN`) are needed to commit `modules.json` during the redeploy. The App manifest defines no webhook, so GitHub returns `webhook_secret: null`; Cactus stores it as NULL and never reads it - only the private key (`pem`) is used for API authentication.
2. The module status is set to `deploying`, the deploy lock is released, and `startDeferredRedeploy()` commits `modules.json` and captures the build (see Immediate deploy flow above). The handler returns `{ redeployTriggered: true }` and the client redirects to the redeploying screen. Update and uninstall work the same way: they mutate the database (update the row, or delete it) then redeploy immediately. The desired `modules.json` is fully derivable from the `Module` rows.
3. During Vercel's build step (after the redeploy is triggered), `scripts/run-module-migrations.mjs` runs **after** `prisma migrate deploy`. It finds all active modules' SQL migration files, checks the `ModuleMigration` table for already-applied ones, and executes the rest in lexicographic order.
4. Immediately after migrations, `scripts/sync-module-manifests.mjs` rewrites every installed module's `Module.manifest` column from its deployed `cactus.module.json`. The manifest is therefore **no longer install-time only** - it tracks the deployed module code on every build. This self-heals stale data: removed nav entries disappear from the admin sidebar, and changed `teardown` / `cookieCategories` lists stay in sync without any GitHub fetch or runtime cost. It never inserts new rows; a missing or unparseable file is logged and skipped.
5. The Vercel webhook (`deployment.succeeded`) reconciles the module rows via `markModulesDeploySucceeded()` (promoting `pendingVersion → version`) and releases the deploy lock; `deployment.error`/`canceled` calls `markModulesDeployFailed()`. On Hobby plans without webhooks, the Modules page polls `check-status` instead, and dismissing the redeploying screen reconciles against the real deployment state. See "Confirmed vs in-flight version" above.

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

During each build and dev start, `scripts/generate-module-puck.mjs` scans all installed modules' manifests and rewrites `lib/puck/module-components.ts` with the correct import statements. The generated `moduleComponents` and `moduleRscComponents` records are then spread into `puckConfig.components`, `layoutPuckConfig.components`, and their RSC variants so the blocks appear under a **Modules** category in the block picker. `lib/puck/module-components.ts` is gitignored and never committed - it mirrors `lib/modules/router.ts` in this respect.

A module block can also opt into the **header** chrome instead of (or as well as) a content layout: tag it with `layoutTypes: ["header"]` in the manifest and the generator buckets it into `moduleComponentsByLayoutType['header']` / `moduleRscComponentsByLayoutType['header']`, which `headerPuckConfig` and `headerPuckRscConfig` merge into the header's block picker under a **Blocks** category. This is how the shop module's **Shop: Cart Summary** widget reaches **Appearance → Header**. The mechanism is generic - no module-specific code lives in the core header config - and the reserved `"header"` key lines up with the `getConfig` switch, which already treats `header` (and `footer`) as layout types.

Block settings should live entirely in the block's Puck field definitions - not in a separate settings page. This gives each instance of the block its own independent configuration. Abuse-sensitive settings (API keys, rate limits, notification emails) must be kept server-authoritative: the submit handler should re-derive the block's config from the page or layout's saved `builderData` using the block's `id`, never trusting values sent by the browser.

### Module public routes

A module can optionally own a top-level public URL segment by declaring `publicBasePath` in its manifest (e.g. `"gazette"`). This is generic, reusable infrastructure - core has no knowledge of any specific module's public routes, only the mechanism.

`scripts/generate-module-router.mjs` scans every installed module's `app/public/<base>/` directory (same manifest-driven pattern as the admin/API scan) and emits four additional exports into the gitignored `lib/modules/router.ts`:

- `resolveModulePublicPage(base, path)` - resolves a module's `page.tsx` for a given base + path, matching literal segments before dynamic `[param]` segments so resolution is deterministic.
- `dispatchModulePublicRoute(base, path, method, req)` - resolves and invokes a module's `route.ts` handler.
- `getModulePublicBases()` - the list of all installed bases.
- `collectModuleSitemapEntries(siteUrl)` - calls `getPublicSitemapEntries(siteUrl)` from each module's `lib/sitemap.ts` (if present), swallowing per-module errors.

Core resolves requests to a module's public base through three routes, in order:

1. `app/(public)/[slug]/page.tsx` - the existing InfoPage-by-slug route. It looks up an `InfoPage` first (InfoPage always wins a slug collision); on a miss, it falls back to `resolveModulePublicPage(slug, [])` for the module's index page.
2. `app/(public)/[slug]/[...path]/page.tsx` - a generic catch-all for a module's sub-pages (`/<base>/<...path>`), added specifically for this mechanism.
3. `app/(public)/[slug]/feed.xml/route.ts` - a dedicated literal-segment delegate to `dispatchModulePublicRoute(slug, ['feed.xml'], 'GET', req)`, since a `route.ts` can't share a folder with the `[...path]` page catch-all.

All three are `force-dynamic`. The index fallback in particular calls `getSessionFromCookie()` (a dynamic API) before rendering the module component - without that, the route would be cached forever under the InfoPage route's `revalidate = false` after its first render, and content like Gazette's scheduled posts would never go live on time. This was the riskiest part of the mechanism to get right; it's covered by an explicit build-time acceptance check (`/gazette` renders fresh on each request) rather than relying on convention alone.

`publicBasePath` uniqueness is enforced twice: at build time (`generate-module-router.mjs` fails the build if two modules declare the same base) and at module-install time (`POST /api/admin/modules` rejects a colliding base, and also rejects one that matches an existing InfoPage slug). The reverse direction is enforced in the pages API: creating or renaming an `InfoPage` to a slug reserved by an installed module's `publicBasePath` (via `lib/modules/public.ts`'s `getInstalledPublicBasePaths()`) returns 409.

## Info pages and the Puck builder

Info pages (`InfoPage` model) always use the Puck builder. `bodyFormat` is always `'builder'` for new pages - the admin UI offers no markdown option. Legacy rows with `bodyFormat: 'markdown'` are auto-migrated to `'builder'` the first time they are opened in the admin editor (a PATCH is sent in the background; the public render still falls back to the markdown pipeline for any rows that haven't been migrated yet).

- **`builder`**: content stored in `builderData` (JSON), rendered via Puck's `<Render>` component (`@puckeditor/core/rsc`).
- **`markdown`** (legacy): content stored in `body`, rendered through the sanitized-markdown pipeline (`marked` + `DOMPurify`). No new pages are created in this mode.

### Editor

The Puck editor (`@puckeditor/core`) is lazy-loaded - it ships no bundle to any route that isn't the specific page-edit admin screen. The editor is mounted with the full component config (`lib/puck/config.tsx`) extended with custom field renderers (media pickers, menu selector).

### Available blocks

All blocks are defined in `lib/puck/config.tsx` and are safe for server-side rendering (no hooks, no browser APIs). Most blocks expose a **Padding (left/right)** field so editors can add breathing room without needing an extra Spacer block.

Block padding is **horizontal-only** - it acts as a left/right gutter so content doesn't run to the page edges, without stacking vertical gaps on top of each block's own margins. The field's default option, **Default (site spacing)**, resolves to `var(--block-padding, 1.5rem)`, i.e. the site-wide gutter set in **Styles → Spacing & Breakpoints** (`themeStyle.spacing.blockPadding`, emitted by `buildTokenStyles`). Content-flow blocks (Heading, Text, Rich Text, Image, Video, Embed, Quote, Button, Badge, Accordion, Feature List, Stats, Logos, Social Links, and the Contact Form module block) default to this gutter so a bare page never touches the edges. Self-padded or full-bleed blocks (Hero, CTA Banner, Callout, Card) and structural containers (Section, Grid, Group, Split) default to **None**, as does chrome reused inside the header/footer roots (those roots already apply their own 1.5rem gutter, so `noGutterDefault()` resets the reused blocks to avoid doubling up). `getPadding()` maps `default`/unset → the gutter var, `none` → `0`, and `sm`/`md`/`lg`/`xl` → `0 0.5rem`…`0 4rem`.

**Responsive breakpoints:** Grid and Split render fixed CSS grid templates inline (e.g. `repeat(3, 1fr)`), which don't reflow on their own. `buildTokenStyles` also emits two `@media` rules, driven by **Styles → Spacing & Breakpoints** → Tablet/Mobile breakpoint (`themeStyle.spacing.tabletBreakpoint`/`mobileBreakpoint`, default `1024px`/`640px`), that override those templates with `!important` below each width: under the mobile breakpoint, any `.puck-grid`/`.puck-split` collapses to a single column; between mobile and tablet, a `.puck-grid` with 3 or 4 columns (matched via its `data-cols` attribute) drops to 2. These two values can't be exposed as ordinary `var()`-based tokens the way colours/fonts are - a `@media` width can't read a CSS custom property - so `buildTokenStyles` always bakes literal pixel values into the rule, falling back to `1024px`/`640px` even on a fresh install that has never saved a Styles page. Since the same generated stylesheet is injected on the public frontend and into both the Pages and Layouts Puck editor canvases, resizing the editor's viewport preview (Small/Medium/Large in the Puck toolbar) shows the same stacking behaviour live.

Blocks are organised into categories that appear as collapsible groups in the Puck left panel.

#### Layout

| Block | Purpose |
|---|---|
| **Section** | Full-width container with background (colour, gradient, image, or a decorative "Grid + scan beam" preset - a faint graph-paper grid with a looping light sweep, useful as an ambient backdrop panel), vertical padding, max-width, sticky positioning, border, box-shadow, and AOS scroll animation controls. Content rendered via an inline slot (`content` prop). |
| **Grid** | CSS grid container (2-4 columns) with configurable gap, padding, column-width ratios (30/70, 40/60, etc.), per-column horizontal alignment, vertical alignment across all cells, and space below. Each column (`col1`-`col4`) is an inline slot. Renders with a `puck-grid` class and `data-cols` attribute - see Responsive breakpoints below. |
| **Group** | Flexbox container with direction (row / column), justify-content, align-items, wrap, gap, and padding controls. Children rendered via an inline slot (`items` prop). Replaces the old Flex and Row blocks. Available in all configs; Split is preferred when you need independently droppable zones. Already responsive via `flexWrap: 'wrap'`, so it isn't part of the breakpoint stacking below. |
| **Split** | Two-column layout (50/50, 60/40, 40/60, 70/30, 30/70) using `renderDropZone` - each column is a live Puck drop zone backed by `data.zones`. Shows an 80 px placeholder when empty so editors can always see and drag into the column. Not available in `headerPuckConfig`. Renders with a `puck-split` class - see Responsive breakpoints below. |
| **Spacer** *(displayed as "Space")* | Fixed vertical gap (8 px - 96 px) |
| **Divider** | Horizontal rule - solid, dashed, or dotted; thin / medium / thick |

#### Typography

| Block | Purpose |
|---|---|
| **Heading** | Standalone heading (Display, H2–H5) with alignment, colour, and padding. "Display" is the largest level, above H1 - for homepage heroes/campaign banners, styled from the Styles → Headings → Display tokens and rendered as a real `<h1>` tag (builder-format info pages don't auto-inject their own page-title H1). Optional "Reveal animation" (`stagger-lines`) splits the text on line breaks and animates each line rising into place on load, staggered - independent of the separate scroll-triggered animation controls on the same block. |
| **TextBlock** *(displayed as "Text")* | Paragraph text with left / centre / right alignment |
| **RichTextBlock** *(displayed as "Rich Text")* | Full WYSIWYG rich text editor (bold, italic, lists, blockquote, links); stores HTML |
| **Quote** | Styled blockquote with optional attribution |
| **Caption** | Small text styled from the Styles → Fonts & Typography → Caption tokens - for labels, footnotes, or small print anywhere on a page, not just form-field labels |

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
| **Eyebrow** | Small pill label above a heading, with an optional pulsing dot for a "live" feel |
| **Card** | Image + heading + body text + optional CTA button |
| **Callout** | Alert/notice box - info, success, warning, or error |
| **Badge** | Small coloured pill label |
| **Trustline** *(displayed as "Trust Row")* | Row of small icon + text reassurance points (checkmark, delivery, shield, clock, star, or price-tag icon) |
| **Chip** | Small label + value card - sits in the normal flow, or floats over a `position: relative` parent (e.g. a Section) via a corner preset, for callouts pinned over an image or decorative panel |
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
| **CookieSettingsLink** | A button that re-opens the consent management panel. Calls `window.cactusConsent.open()`. Place this in your footer so visitors can change their preferences at any time. Template block. |

Blocks marked **Template block** are most useful in Header/Footer templates but are available everywhere. Blocks that need an image use a custom media-picker field in the editor; the MenuBlock uses a custom menu-selector field (`MenuSelectField`). These custom renderers are declared in `config.tsx` as plain fields and overridden with the full custom renderer in `PuckEditor.tsx` and `TemplateEditor.tsx`.

### Admin sidebar

The admin left sidebar is collapsible. Clicking the `‹` / `›` toggle button collapses it to icon-only mode (56 px wide), freeing horizontal space. The preference is persisted in `localStorage`. The sidebar **auto-collapses** whenever a page or template editor is opened, so the Puck canvas always has maximum width on load. The footer holds the theme toggle, a **My Account** link (to `/{adminPath}/account`), and **Sign out**, in that order. The theme toggle stays available when collapsed: it becomes a single round button showing the active mode's icon that **cycles** Light → Auto → Dark → Light on each click.

Section order top to bottom: **Dashboard** (plus any ungrouped module nav links rendered inline as plain links with no heading - modules with no `navGroupLabel`, currently just contact-form's Inbox), then **Content**, **People**, **System**, then any labelled module nav groups (modules that set `navGroupLabel`, e.g. Gazette, Boards).

Each labelled section (Content, People, System, and any labelled module nav group) is independently collapsible: clicking the section label toggles a chevron and hides/shows that section's links. This is separate from the rail collapse above and only applies when the rail is expanded (icon-only mode always shows every link, ungrouped). Each section's open/closed state is persisted per-label in `localStorage`, so it's remembered across navigation, refreshes, and later visits. Sections default to open (maximised) until the user collapses one. Ungrouped module links have no heading of their own, so they're never independently collapsible - they hide/show along with Dashboard.

The logo + site name at the top of the sidebar (and the site name in the mobile topbar) is a link to `/` with `target="_blank"`, so clicking it opens the live frontend in a new tab without losing the admin session.

### Page lifecycle - draft vs live split

Every `InfoPage` row separates the **working draft** from the **live content**:

| Column | Purpose |
|---|---|
| `builderData` | Working draft. The only target autosave ever writes. What the editor and preview route render. |
| `publishedData` | The current live content. Only the Publish endpoint writes this. What the public sees when `status = published`. |
| `publishedAt` | When the live version was last published. |
| `publishedById` | Who published the live version (plain ID, no Prisma relation). |
| `history` | Capped array (max 10) of past published versions, newest first. Shape: `{ data, title, at, byId }`. |

The consequence: editing a published page never touches what is live. Autosave writes only `builderData`; the slug and the public page keep serving the old content until Publish is clicked.

#### `status` semantics

- `draft` - never published; `publishedData` is null.
- `published` - has live content in `publishedData`; keeps serving it even while a newer draft is being edited.

#### Autosave (`POST /api/admin/pages/[id]/autosave`)

- Always writes `builderData` and menu associations.
- Never writes `publishedData`, `publishedAt`, `publishedById`, or `status`.
- For **draft** pages only: reconciles `title`, `slug`, `metaDescription`, `ogImageId` columns (nothing is live yet, so updating them is harmless).
- For **published** pages: leaves those columns frozen to the published values, so the live page's title, slug, routing, and meta never move on autosave.

#### Publish (`POST /api/admin/pages/[id]/publish`)

Requires `pages.publish`. On each call:
1. Reconciles `title`, `slug`, `metaDescription`, `ogImageId` from the editor state.
2. If `publishedData` is non-null, archives the current live version as `{ data, title, at, byId }` at the front of `history`, capped at 10 entries.
3. Sets `publishedData = builderData`, `publishedAt = now`, `publishedById = user.id`, `status = published`.
4. Calls `revalidatePath` for the old and new slug.

Publishing must always flow through this endpoint. The PATCH route rejects a `draft → published` transition with a message pointing at the Publish button.

#### Version history and restore

`GET /api/admin/pages/[id]/history` returns a lightweight list of published versions, newest first. The **live** version uses `index: "live"`; archived entries use their numeric position in the array (`index: 0` = most recent archive).

Passing `?index=live` or `?index=<n>` to the same endpoint returns the full builder data blob for that version.

**Restore is non-destructive.** "Load into editor" in the version-history panel fetches the chosen version's data, writes it to `builderData` via an immediate autosave (cancelling any pending debounce first), then reloads the editor. The page stays published; the restored content only goes live when Publish is clicked.

#### Frozen published title/slug (intentional)

While editing a **published** page, any title or slug changes you make live in the draft only. The pages list, the browser tab, the public URL, and the site nav all keep showing the **published** title/slug until the next Publish. This is intentional - live metadata must not move on autosave - but it can surprise an editor who renames a page and sees the old name everywhere. It reads as designed, not a bug.

#### Known gap - PATCH and slug changes

`PATCH /api/admin/pages/[id]` can still change the `slug` of a published page directly (with `revalidatePath`), bypassing the Publish flow and the history snapshot. Routing stays correct; it is just an unsnapshotted change. Left out of scope for this feature - follow-on work should funnel slug changes through Publish.

### Reconciliation

`InfoPage`'s real columns (`title`, `slug`, `status`, `metaDescription`, `ogImageId`) are canonical. `builderData.root.props` is a working copy. On every load, root props are overwritten from the DB row. On every save, those four fields are split back out and written to their real columns. This split happens in exactly one server-side location (the save handlers), never client-side.

### Public render

The public `[slug]/page.tsx` route branches on `bodyFormat`. Both branches share the same draft gate (one check at the top). For published pages, the public render uses `publishedData` (with `builderData` as a fallback for any pre-backfill rows); for draft pages it uses `builderData`. Builder pages use `<Render config={puckConfig} data={...} />` from `@puckeditor/core/rsc` - a server component. The editor bundle is never included in the public-page response.

The render logic is shared via `lib/puck/renderInfoPage.tsx` (`renderInfoPageContent`), used by both the public slug route and the preview route.

Page content is wrapped inside a layout resolved by `resolveThemeLayout('infoPage', { pageId, slug })`. The layout is rendered via `renderLayoutWithContent(layoutData, pageContent)`, which patches the Puck config to replace the `ContentSlot` component's render function with one that returns the real page content. This happens entirely server-side with no hydration overhead.

### Preview route (`/page-preview/[id]`)

A login-gated preview route lives at `app/(public)/page-preview/[id]/page.tsx`, inside the `(public)` route group so it inherits the site header/footer. It shows the **current draft** (`builderData`) with a fixed "Draft preview - not live" info bar, and carries `robots: noindex`.

Gate: `getSessionFromCookie` + `hasPermission(user, 'pages.read')`. Visitors who are not logged-in editors receive `notFound()` - there is no public token-based access.

The **Preview** button in the editor toolbar opens `/page-preview/${id}` in a new tab.

`proxy.ts` unconditionally passes both `/page-preview/` and `/layout-preview/` through the site-status gate so a logged-in editor can always reach a preview even when the public site is in coming-soon or maintenance mode.

## Layout Builder

Cactus has no hardcoded frontend design. All visual aspects are user-configurable through the Layout Builder and Style Guide.

### Layout types

Every layout record has a `type` field (stored as a plain `String` on the `Layout` model, not a database enum, so new types can be added without a migration). The five built-in types are:

| Type | Purpose |
|---|---|
| `header` | Site-wide header. Rendered above every public page. |
| `footer` | Site-wide footer. Rendered below every public page. |
| `infoPage` | Body wrapper for info pages. The `ContentSlot` block marks where page content appears. |
| `notFound` | Rendered by `app/not-found.tsx` when a URL matches no page. |
| `statusPage` | Rendered by the coming-soon / maintenance status routes. |

Headers and footers are full `Layout` records edited in **Admin → Layout Builder**, not JSON blobs on `SiteConfig`. The `SiteConfig` columns `headerBuilderData`, `footerBuilderData`, `defaultLayoutId`, `comingSoonPageId`, and `maintenancePageId` were removed.

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

### Styles info page (`style-guide`)

`lib/setup/stylesInfoPage.ts` seeds a **Styles** info page (slug `style-guide`) alongside the starter layouts. It is installed by default as a **draft** (`bodyFormat: 'builder'`, `status: 'draft'`) by both `app/api/setup/complete/route.ts` and the `reset-database` soft-reset seed, via `upsertStylesInfoPage`. Like the starter layouts it is upserted (only ever writes `builderData`, never `publishedData`), so it never overwrites a published copy and is safe to re-run.

The page is a single `RichTextBlock` of raw HTML inside a boxed `Section`. Because the public/RSC render pipes the HTML string straight to the DOM inside `<main>`, its `h1`–`h6`, `a`, `button`, `img`, `input`, `select`, `textarea` and `label` elements pick up the `main …` rules from `buildTokenStyles`, so the page is a **live reference** of every option on Appearance → Styles. A scoped `<style>` (targeting a `.sg` wrapper, later in source order so it wins on equal specificity) restores heading size/colour and link colour that the `.puck-richtext` rules in `globals.css` would otherwise override. Preview it at `/page-preview/<id>` while it stays a draft.

### `resolveLayout` vs `resolveThemeLayout`

`lib/layout/resolveLayout.ts` is the original three-tier fallback (`InfoPage.layoutId` → `ModuleLayoutDefault` → `SiteConfig.defaultLayoutId`). It is kept for backwards compatibility with any module that calls it directly but is no longer used by the core public routes. New code should use `resolveThemeLayout`.

## Styles (Design System + Theme Style)

**Admin → Appearance → Styles** (`/cacti/appearance/styles`) is a seven-tab editor for all visual design tokens, stored as `SiteConfig.designTokens` (nullable JSON, `version: 2`). The shape is defined in `lib/design/tokens.ts`.

### DesignTokens v2 shape

```ts
{
  version: 2,
  designSystem: {
    colours: GlobalColour[]  // { id, name, light, dark }
    fonts:   GlobalFont[]    // { id, name, family, weight, ... }
  },
  themeStyle: {
    background: { colour? }
    body:    Typo & { colour? }
    display?: Typo & { colour? }   // hero/largest heading, above h1 - added post-launch, optional
    caption?: Typo & { colour? }   // small label/footnote text, usable anywhere - added post-launch, optional
    links:   { colour?, hoverColour? }
    headings: { h1..h6: Typo & { colour? } }
    buttons: { typo: Typo, textColour?, bgColour?, borderColour?,
               borderWidth?, borderRadius?, padding?,
               hover: { textColour?, bgColour? } }
    images:     { borderRadius?, borderColour?, borderWidth? }
    formFields: { typo: Typo, labelTypo: Typo, textColour?, bgColour?,
                  borderColour?, borderRadius?, labelColour? }
    spacing?:   { blockPadding?, tabletBreakpoint?, mobileBreakpoint? }   // block gutter (--block-padding) + Grid/Split responsive breakpoints, defaults '1024px'/'640px'
  }
}
```

### Tabs

| Tab | Sections |
|---|---|
| **Colours** | Colour Presets, Global colours (up to 12, with light/dark variants), Page background, Links (colour and hover colour) |
| **Fonts & Typography** | Global fonts (named font definitions), Body text, Caption / small text (for labels, badges, footnotes - used by the Caption Puck block and available anywhere, not just form-field labels) |
| **Headings** | Display (hero/largest, above H1 - used by the Heading block's "Display" level, for homepage heroes and campaign banners), H1-H6 (collapsible, each with full typographic controls and colour) |
| **Buttons** | Typography, text/background/border colours, border width/radius/padding, hover state |
| **Images** | Border radius, border width, border colour |
| **Form Fields** | Label typography and colour, field typography and colours (text, background, border, radius) |
| **Spacing & Breakpoints** | Default block padding (left/right) - the site-wide gutter (`--block-padding`, default `1.5rem`) applied to content blocks so they don't run to the page edges; Tablet/Mobile breakpoint (default `1024px`/`640px`) - screen widths where Grid/Split blocks drop to fewer columns, see Responsive breakpoints above |

Colour fields on every tab show palette swatches from Global colours; selecting a swatch stores the raw hex (not a var reference).

### Colour Presets

The Colours tab opens with a horizontally-scrollable row of ten named presets (Prickly, Bloom, Desert, Dusk, Spine, Mirage, Ember, Mesa, Monsoon, Sagebrush). Applying a preset updates the `primary` palette colour (light and dark variants) and `themeStyle.links.colour` / `themeStyle.links.hoverColour`. All other tokens are unchanged. If the user has unsaved colour edits, a confirmation prompt fires before applying. The active preset is detected by matching the current primary colour, link colour, and link hover colour against the preset definitions; custom values show a "Customised" label instead.

### Unsaved-changes guard

Shared across admin settings pages via the `useUnsavedChanges` hook and `UnsavedChangesModal` component (both in `components/admin/`). The hook owns a `dirtyRef` the page flips true on edit and resets on save. While dirty, leaving the page is guarded two ways: a `beforeunload` handler covers hard navigations (reload, tab close), and a capture-phase document click listener intercepts in-app admin link clicks, setting a `pendingHref` that renders the modal. The modal offers **Save & leave**, **Discard & leave**, and **Cancel**; "Save & leave" only navigates if the save succeeds, so a failed save keeps the admin on the page with the error visible. Pages with no single save action (e.g. Account) render the modal without an `onSave`, so only **Discard & leave** / **Cancel** show.

The guard is wired into **Styles** (dirty on any token edit; also resets on preset apply), **Settings** (`/config` - dirty when the form diverges from the last-saved fingerprint, which excludes `mediaProvider` since that saves immediately on its own), and **Account** (dirty when the display name changes or any email/password field has input).

### Enum-constrained typography inputs

Weight, transform, style, and text-decoration are dropdowns (not free text). If saved data holds a value outside the option list, it is surfaced as a "`<value>` (custom)" option so it is preserved rather than silently dropped. Size, line-height, and letter-spacing remain free-text (arbitrary CSS units).

The **font-family picker** (`FontPickerField`) lists your named global fonts first under a "Your fonts" heading (picking one stores its `family` value), then the built-in `POPULAR_FONTS` list; free text is still accepted for any CSS font-family value. The global-fonts editor's own family field does not list the global fonts (it defines them).

### Validation

`PATCH /api/admin/appearance` requires `appearance.manage` and shape-guards the payload: `designTokens` must be `null` (clear) or an object with `version === 2`; anything else is rejected with 400 rather than persisted.

After a successful save the Styles page calls `router.refresh()`, which re-renders the server admin layout so its injected theme (`buildAdminThemeStyles` - primary colour + font) updates immediately without a manual reload.

### CSS output

`lib/design/tokens.ts` exports `buildTokenStyles(tokens)` and `buildFontHref(tokens)`. Both accept `unknown` and handle null/v1 data gracefully.

`buildTokenStyles` emits:

```css
:root, [data-theme="light"] {
  --color-1..N: <light hex>;          /* from designSystem.colours */
  --color-primary: <primary light hex>;           /* the `primary` colour (or first) */
  --color-primary-hover/-active/-dark/-subtle/-border;  /* derived shades (darken) */
  --color-on-primary: #111111 | #ffffff;           /* legible foreground (WCAG luminance) */
  --sp-1..9: 4,8,12,16,24,32,48,64,96px;  /* fixed */
  --radius-sm: 2px; --radius-md: 6px; --radius-lg: 9999px;  /* fixed */
  --shadow-subtle: ...; --shadow-elevated: ...;  /* fixed */
  --font-body: ...; --font-heading: ...;         /* body.family, else the primary global font */
  --color-link: ...; --color-link-hover: ...;    /* from themeStyle.links */
  --h1-family/-weight/-size/-line-height/-letter-spacing/-transform/-style/-color .. --h6-*;  /* full per-heading typography */
  --display-family/-weight/-size/-line-height/-letter-spacing/-transform/-style/-color;  /* from themeStyle.display */
  --caption-family/-weight/-size/-line-height/-letter-spacing/-transform/-style/-color;  /* from themeStyle.caption */
  --btn-family/-weight/-size/-line-height/-letter-spacing/-transform/-style;  /* button typography */
  /* + btn colour/border/radius/padding/hover, img, field vars */
  --block-padding: 1.5rem;   /* from themeStyle.spacing.blockPadding - default Puck block gutter */
}
[data-theme="dark"] {
  --color-1..N: <dark hex>;
  --color-primary + shades: <primary dark hex>;  /* dark mode lightens for hover/active */
}
@media (prefers-color-scheme: dark) { /* same dark colours + primary */ }
/* scoped defaults: main { body typo } main h1,a,button,img,input,label { ... } */
/* main .cactus-display { ... } main .cactus-caption { ... } - class-based, since neither has one native tag */
@media (max-width: 640px) { .puck-grid,.puck-split { grid-template-columns: 1fr !important } }
@media (min-width: 640px) and (max-width: 1024px) { .puck-grid[data-cols="3"],.puck-grid[data-cols="4"] { grid-template-columns: repeat(2,1fr) !important } }
/* tabletBreakpoint/mobileBreakpoint (default 1024px/640px) - not a var(), since a @media
   width can't read a CSS custom property; always emitted regardless of whether spacing
   is set, unlike the other rules above */
```

`display`/`caption` are optional in the type (unlike the always-present `headings`/`buttons`/etc): they were added after initial launch, so a site's already-stored `designTokens` row - or the fresh-install default before a first Styles save - may not have these keys yet. Every read goes through `ts?.display`/`ts?.caption` with a `?? {}` fallback, both in `buildTokenStyles`/`buildFontHref` and in the Styles page's own React state, so an old row with neither key present renders exactly as before (the Heading block's "Display" level and the Caption block just fall back to their own built-in defaults until a site owner sets real values).

**Why the primary mapping matters:** buttons, links, rich text accents and every Puck component consume the semantic `--color-primary` family (defined for the admin in `globals.css`). Mapping the `primary` design colour onto these variables (rather than only the indexed `--color-N`) is what makes a colour or preset change actually recolour the public site and the Puck editor canvas. The hover/active/subtle/border shades are derived from the single primary hex - darkened in light mode, lightened in dark mode - and `--color-on-primary` is chosen by WCAG relative luminance.

**Why body typography targets `main`:** the body font/size/colour are emitted on `main` itself (not `main p`) so they cascade into rich-text content. `.puck-richtext p` is a class selector that would out-specificity a plain `main p` rule and ignore the chosen body font; setting the font on the `main` ancestor lets it inherit through instead.

**The primary global font is the site default.** The `primary` global font (or the first defined font) provides the default `family`/`weight` for body text: `body.family || primaryFont.family` (same for weight). So changing the primary font actually restyles the site, and leaving the body font-family box empty inherits the primary font rather than the built-in Cactus face (which isn't even loaded on the public frontend, so it falls back to system-ui). This font is emitted as `--font-body`/`--font-heading`, on the scoped `main{}` rule (for rich-text cascade), **and** as `--font-sans` - the base UI typeface - so text outside `<main>` (header, footer) and native form controls (which don't inherit `font-family`) also pick it up. Headings inherit through the `main` cascade unless they set their own family. The admin chrome also adopts this font (see `buildAdminThemeStyles` below).

**Page background:** `themeStyle.background.colour` is emitted only as the `--color-page-bg` variable (no scoped rule). `globals.css` applies it via `body { background: var(--color-page-bg, var(--color-bg)); }`, so it covers the whole page (not just `main`). In the admin the variable is never emitted (`buildAdminThemeStyles` is a primary-only subset), so admin falls back to `--color-bg` and is unaffected.

`buildFontHref` inspects all font-family values across the token tree, skips system stacks (system-ui, Arial, Georgia, Helvetica, Times, sans-serif, serif, monospace, -apple-system), and returns a Google Fonts URL or `null`.

### Where styles are injected

- `app/(public)/layout.tsx` - emits `<link rel="stylesheet">` for Google Fonts and `<style>` with token CSS for every public page.
- `app/layout-preview/[id]/page.tsx` - same injection, so the standalone layout preview matches the live site.
- `app/cactus-admin/layouts/[id]/LayoutPuckEditor.tsx` - injects token styles into `document.head` via `useEffect` so the inline Puck canvas reflects the current theme (best-effort; Puck renders inline, not in an iframe).
- `app/cactus-admin/layout.tsx` - injects `buildAdminThemeStyles(designTokens)` so the admin chrome (sidebar active state, buttons, badges, focus accents) white-labels to the site's primary colour, and overrides `--font-sans` with the site's primary font so the admin UI typeface matches the site (the mono/code font `--font-mono` is left alone). It also emits `buildFontHref(designTokens)` as a `<link>` so that font actually loads in admin. This is still a **narrow** subset - only the `--color-primary` family plus `--font-sans` - so the admin keeps its own spacing, radii and shadows. Injecting the full `buildTokenStyles` here would be wrong: its fixed `--radius-*`/`--sp-*`/`--shadow-*` block and scoped `main …` rules would clash with the admin design system. The login and setup screens are outside this layout and stay on the base Cactus palette.

### Colour palette in Puck blocks

`lib/puck/SiteColourField.tsx` fetches colours from `/api/admin/appearance` (path: `designTokens.designSystem.colours`) and renders named swatches. Selecting a swatch stores `var(--color-N)` as the field value, so colour changes propagate to all blocks automatically without re-saving pages.

### How Buttons / Headings / Images tokens reach Puck blocks

The scoped `main …` rules only reach content with no inline styles (rich text, raw HTML). Puck blocks render with inline styles, which out-specificity any stylesheet rule, so a few blocks read the tokens **as CSS variables inline**, each with a fallback to the original built-in look (untouched sites are byte-identical):

- **Button block** (`ButtonLink`) renders `<a class="cactus-btn">` reading `--btn-family/-weight/-size/-line-height/-letter-spacing/-transform/-style`, `--btn-radius`, `--btn-padding` for shape/type (all variants), and `--btn-bg`/`--btn-text-color`/`--btn-border`/`--btn-border-width` for the primary (default) variant's colours. Hover uses the token hover colours via `main .cactus-btn:hover{…!important}` (the `!important` is required to beat the inline base state). Secondary/outline keep their own colours but still inherit shape/type and the global border.
- **Heading block** reads `--{level}-family/-size/-weight/-line-height/-letter-spacing/-transform/-style` and, when the colour choice is the default "dark", `--{level}-color`. An explicit muted/brand colour choice still wins.
- **Image block** (`ImageBlock`) reads `--img-radius`, `--img-border-width`, `--img-border-color`.
- **Contact-form module** (`ContactFormClient`) styles its public form via a `.cactus-contact-form`-scoped `<style>` reading `--field-*` (fields) and `--field-label-*` (labels) with neutral fallbacks, and its submit button uses the same `.cactus-btn` treatment as the Button block. It deliberately does **not** use the admin `.field`/`.btn` classes, which would out-specificity the site theme and lock the form to the admin (green primary) look.

So `buildTokenStyles` emits full **typography** variable sets for headings (`--h1-…` through `--h6-…`), buttons (`--btn-…`), form fields (`--field-…`) and field labels (`--field-label-…`), not just the colour/size subset. Composite blocks (Hero, CTABanner, Card CTAs) keep their bespoke styling and deliberately do **not** consume the button/heading tokens, so their contextual designs (e.g. a CTA on a brand-colour background) are preserved.

### Dark mode

Cactus supports three dark-mode states: **Auto** (follows the OS), **Light**, and **Dark**. The preference is stored in `localStorage` as `cactus-theme`.

To prevent flash-of-wrong-theme on load, `app/layout.tsx` includes an inline `<script>` that runs before paint: it reads `cactus-theme` and always sets `data-theme="dark"` or `data-theme="light"` on `<html>` before the first paint. In `auto` mode it checks `window.matchMedia('(prefers-color-scheme: dark)')` to decide which to apply. A `@media (prefers-color-scheme: dark)` block in `globals.css` acts as a CSS-only fallback for SSR.

The `ThemeToggle` component (`components/ThemeToggle.tsx`) is a client component styled as a pill-shaped icon segmented control: three icon-only buttons in the order Light (sun) / Auto (split sun-moon disc) / Dark (moon), with a sliding circular knob highlighting the active mode and a custom CSS tooltip on hover/focus. Each button calls `applyTheme(mode)`. The icons are inline SVG (no icon library) and inherit colour via `currentColor`. All styling lives in the `.theme-toggle*` block in `globals.css` and is token-based, so the control inverts correctly between light and dark; the knob slide honours `prefers-reduced-motion`. A `compact` variant (smaller buttons) is mounted in the admin sidebar above Sign out. When the sidebar is collapsed the component takes a `collapsed` prop and renders instead as a single `.theme-toggle-cycle` button showing only the active mode's icon; clicking it cycles Light → Auto → Dark → Light (the `NEXT_MODE` map), so all three modes stay reachable without expanding the sidebar. The three SVG icons are shared between both variants. Accessibility: the segmented control uses `role="group"` with `aria-label="Colour scheme"` on the track, `aria-pressed` on each button, and a text `aria-label` per button (the visual tooltip is `aria-hidden`); the collapsed button carries an `aria-label` naming the current mode and the mode it switches to.

The admin UI uses the Cactus Design System. Primitive palette tokens (`--cactus-*`, `--spine-*`, `--sand-*`) are defined in `globals.css` and mapped to semantic aliases (`--color-bg`, `--color-text`, `--color-primary`, `--color-destructive`, `--color-border`, etc.) in `[data-theme="light"]` and `[data-theme="dark"]` blocks. The UI typeface is Instrument Sans; developer content (slugs, paths, keys, code) uses JetBrains Mono. Admin-specific variables use `--admin-*` prefixes. All reusable UI classes (`.card`, `.btn-*`, alerts, badges, tables) reference these variables so they automatically adapt to both themes. Hardcoded hex values must not appear in component inline styles - always use CSS variable references (`var(--color-text-muted)`, `var(--color-destructive)`, etc.).

## Cookie consent gate

Cactus ships a built-in consent system. When the consent banner is enabled in the GDPR & Legal config tab, the following contract applies across the whole platform.

### Runtime state

An inline `<script>` in `app/layout.tsx` (runs before any body content) reads the `cactus-consent` cookie and populates `window.__cactusConsent` as a flat `Record<string, boolean>`. Non-necessary categories default to `false` until the visitor makes a choice (deny-by-default). The `cactus-consent-id` cookie holds the visitor's anonymous UUID identity, which is linked to a `userId` when the visitor is authenticated.

### Client utilities (`lib/consent/gate.ts`)

```ts
import { hasConsent, onConsentChange, loadIfConsented } from '@/lib/consent/gate'

hasConsent('analytics')           // true | false, reads window.__cactusConsent
onConsentChange(cb)               // subscribe to future decisions, returns unsubscribe fn
loadIfConsented('analytics', fn)  // run fn immediately if consented, else defer until consented
```

### Re-opening the preference panel

```ts
window.cactusConsent.open()       // programmatically re-open the consent banner
```

The `CookieSettingsLink` Puck block calls this for you. Drop it into your footer layout so visitors always have a way to change their mind.

### ConsentRecord table

Every decision is appended to `ConsentRecord` (append-only audit log). Current consent = the latest row for a given `consentId`. The `decision` column is a JSON snapshot of per-category booleans. The `action` column is one of `accept_all | reject_all | custom | withdraw`. Stored metadata is minimal: truncated IP (IPv4 last octet zeroed; IPv6 /48 prefix only) and a SHA-256 hash of the user-agent string. Raw IP and raw UA are never persisted.

### Module contract

Any module that sets non-necessary cookies **must** declare those categories in its manifest `cookieCategories` array. It **must not** load tracking scripts unconditionally - use `loadIfConsented(category, fn)` to gate them. The admin consent banner editor surfaces the module's declared categories as one-click suggestions. See [Authoring a module](Authoring-a-module) for details.

### Known limitation

Cactus can only gate scripts it injects itself. Third-party snippets pasted directly into page HTML (e.g. raw GA `<script>` tags) cannot be suppressed by this system. Document this to site operators.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Members](Members) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
