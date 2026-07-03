# FIELD_NOTES.md
Last updated: 2026-07-03 (Boards module added - discussion forum: boards/sub-boards/threads/replies for registered users with polls, reactions, subscriptions, bookmarks, read tracking, search, moderation (queue/reports/bans/ip-bans/log), phpBB/Discourse importer, RSS feeds and a daily email digest; first consumer of a generic core dashboard-widget extension point (`core.admin-dashboard-widgets`, rendered in `app/cactus-admin/page.tsx`) and of two new generic nested feed.xml delegates (`app/(public)/[slug]/[a]/feed.xml/route.ts`, `app/(public)/[slug]/[a]/[b]/feed.xml/route.ts`) alongside the existing single-segment one; notifications degrade to email-only/no-op pending the separate core per-user notification build (`NOTIFICATIONS_SPEC.md`, still draft); Admin sidebar sections (Content/People/System + module nav groups) are now individually collapsible: section labels in `AdminNav.tsx` are buttons with a chevron, click toggles that section's links, state persisted per-label in `localStorage` key `cactus-sidebar-sections-collapsed` (JSON map, absent key = maximised/default open); this is separate from the existing rail-collapse (`cactus-sidebar-collapsed`) - rail-collapse still hides all labels/icon-only regardless of section state; Gazette admin reshuffle: settings moved from standalone `/cactus-admin/m/gazette/settings` page to a `settingsTabs`-registered "Gazette" tab on core `/cactus-admin/config` (`GazetteSettingsTab.tsx`), with the import wizard appended below it (former `/import` page removed); Roles moved from standalone `/cactus-admin/m/gazette/roles` page to core `/cactus-admin/roles` via a new `core.roles-page` extension point - first core-page (not module-page) publisher of `extensionPoints` (`GazetteRolesSection.tsx`); sidebar changed from one "Gazette" nav entry to six (Posts/Tags/Series/Authors/Comments/Templates) grouped under their own `admin-nav-section-label` via new manifest `navGroupLabel` field (`lib/modules/manifest.ts`, `app/cactus-admin/layout.tsx`, `AdminShell.tsx`/`AdminNav.tsx` `moduleNavGroups` prop, replacing `moduleNavEntries`); contact-form v0.1.24 + contact-form-reply-catcher v0.1.6: new `contact-form.thread-messages` extension point contract - contributing modules export a data function, not a component (`(submissionId) => Promise<ThreadMessageContribution[]>`), so caught replies merge chronologically with contact-form's own replies into one "Replies" thread instead of a fixed always-below block; removed the standalone "Caught replies / REPLY CATCHER" header+blurb and `components/CaughtRepliesPanel.tsx` in favour of a small per-message "Caught" badge; BOARDS_SPEC.md + NOTIFICATIONS_SPEC.md added - spec documents only, no code; Gazette module added - new manifest `publicBasePath` field + generic module public-routes mechanism (`resolveModulePublicPage`/`dispatchModulePublicRoute`/`getModulePublicBases`/`collectModuleSitemapEntries` in the generated router, new `app/(public)/[slug]/[...path]/page.tsx` catch-all + `app/(public)/[slug]/feed.xml/route.ts` delegate, `lib/modules/public.ts` slug-collision helper, `shiki` added as a core dependency; generic module extension points: new manifest `extensionPoints` field + `generate-module-extension-points.mjs` generator; module-registered settings tabs on /cactus-admin/config: new manifest `settingsTabs` field + `generate-module-settings-tabs.mjs` generator, replacing contact-form-reply-catcher's standalone settings page/nav entry; media/[id] DELETE route, admin GET session checks, contact-form retention cron, EnvBanner + resolveLayout removed; module directory beta-only detection); new shared `components/admin/TabStrip.tsx` (underline tab bar, flush edges, scroll fade + arrow overlay on overflow) - replaces bespoke inline tab-bar markup in Settings (`ConfigPageClient.tsx`), Appearance→Styles, Layouts, and (module-side) Gazette/Boards nav + list tabs and Contact-form inbox tabs, for a consistent look; fixed a layout-shift bug on Appearance→Styles' colour-preset carousel where hidden scroll arrows (`visibility: hidden`) still reserved layout space, and fixed the same carousel's arrow buttons rendering as a full-height stretched bar instead of a centred 28px circle
Produced by: Claude Code agent

---

## Core Application

### Routes

Pages (public):

- `/` - `app/(public)/page.tsx` - redirects to `/setup` until setup completes; renders the InfoPage set as `homepageId` (draft only for admins, with draft banner), else a welcome card with siteName/tagline/description. `force-dynamic`.
- `/[slug]` - `app/(public)/[slug]/page.tsx` - renders an InfoPage by slug; drafts 404 for non-admins; `generateMetadata` (title, metaDescription, OG image), `generateStaticParams` for published slugs, `revalidate = false`. On an InfoPage miss, falls back to a module's public index via `resolveModulePublicPage(slug, [])` (InfoPage always wins a collision) - calls `getSessionFromCookie()` first so that fallback path always renders dynamically rather than being cached under `revalidate = false`.
- `/[slug]/[...path]` - `app/(public)/[slug]/[...path]/page.tsx` - generic catch-all for a module's public sub-pages, via `resolveModulePublicPage`. `force-dynamic`.
- `/[slug]/feed.xml` - `app/(public)/[slug]/feed.xml/route.ts` - delegates to a module's `feed.xml` route via `dispatchModulePublicRoute`; a dedicated literal segment because `route.ts` can't share a folder with the `[...path]` page catch-all. `force-dynamic`.
- `/[slug]/[a]/feed.xml`, `/[slug]/[a]/[b]/feed.xml` - `app/(public)/[slug]/[a]/feed.xml/route.ts`, `app/(public)/[slug]/[a]/[b]/feed.xml/route.ts` - generic nested-feed delegates (Boards' per-board and per-sub-board RSS), same passthrough pattern one and two segments deeper. `force-dynamic`.
- `/logged-out` - `app/(public)/logged-out/page.tsx` - client page, 3-second countdown then redirect to `/`.
- `/page-preview/[id]` - `app/(public)/page-preview/[id]/page.tsx` - draft preview of an InfoPage; requires session + `pages.read`; always renders `builderData` with a fixed preview bar; noindex.
- `/layout-preview/[id]` - `app/layout-preview/[id]/page.tsx` - preview of a Layout; requires admin (protected role); renders with the type-matched Puck RSC config plus placeholder content blocks; noindex. Outside the `(public)` group so header/footer are not applied.
- `app/(public)/layout.tsx` - public shell: resolves header/footer Layouts via `resolveThemeLayout`, injects design-token CSS + Google Fonts link, `AosInit`, `ConsentBanner` when enabled, favicon override from `faviconMediaId`.
- `app/layout.tsx` - root layout: Instrument Sans + JetBrains Mono fonts, theme flash-prevention inline script (`localStorage cactus-theme` → `data-theme` attribute), consent-init inline script (`cactus-consent` cookie → `window.__cactusConsent`, deny-by-default), favicon/manifest metadata.
- `app/not-found.tsx` - 404 page; renders the resolved `notFound` Layout via Puck if published, else a plain 404 card. `force-dynamic`.
- `app/robots.ts` - dynamic robots.txt; disallow-all when no site URL, `hideFromCrawlers`, or status ≠ live; else allow with disallows for `/cactus-admin/`, `/setup/`, `/cactus-status/`, `/api/`.
- `app/sitemap.ts` - site URL root plus all published InfoPage slugs.

Pages (status screens, reached only by proxy rewrite):

- `/cactus-status/coming-soon` - `statusPage` Layout (ctx `siteStatus: 'coming_soon'`) or fallback card. `force-dynamic`, noindex.
- `/cactus-status/maintenance` - same with `maintenance`; fallback "Down for maintenance" card.
- `/cactus-status/redeploying` - client page shown while `pendingRedeployId` is set. Polls `/api/admin/redeploy-status` every 2s until the `'pending'` sentinel resolves to a real deployment id, then `/api/setup/deployment-logs` every 4s; renders `DeployLogViewer`; exits on READY (after "Build cache uploaded" or 10 post-READY polls) via `DELETE /api/admin/redeploy-status`; failure UI on ERROR/CANCELED; escape-hatch button after 165s; hard auto-exit at 240s (kept in step with server `REDEPLOY_MAX_MS`).

Pages (setup):

- `/setup` - `app/setup/page.tsx` - client wizard, three steps: `connect` (Vercel token + project selection via `/api/setup/vercel-connect`), `database` (sub-states for Vercel bootstrap, Neon auto-provision, existing-project reuse, manual DATABASE_URL, local mode), `configure` (admin account + passkey or TOTP, admin path, site essentials, optional env vars, complete). Polls `/api/health` and `/api/setup/env-check` across the redeploys it triggers.
- `app/setup/layout.tsx` - `setup-shell` wrapper, noindex, absolute title.

Pages (admin, live under internal `/cactus-admin/*`, reached only via the rewritten `/<adminPath>/*`):

- `/cactus-admin` - dashboard: page/user/media counts, site-status badge, optional-feature checklist (media, email, Turnstile, Edge Config, GitHub, Sentry) with links into Settings tabs. Below that, a generic grid renders any module's contributions to the `core.admin-dashboard-widgets` extension point (permission-filtered live from `Module.manifest.extensionPoints`, same pattern as `/cactus-admin/roles`'s `core.roles-page` section) - currently Boards' `boardsDashboardWidget` (thread/post/open-queue counts, link into the module admin).
- `/cactus-admin/login` - client login page: passkey (default), password → email OTP (trust-device checkbox), authenticator (TOTP), recovery-token completion, no-passkey fallbacks (register new passkey or recovery email), lost-access instructions including Neon console link.
- `/cactus-admin/account` - profile (displayName), change email, passkeys add/remove, TOTP set-up/remove, password add/change (with sign-out-other-sessions), active sessions list/revoke, GDPR JSON export, self-delete account.
- `/cactus-admin/pages` - InfoPage list with pagination, bulk select + delete (`PagesTable.tsx`); gated per `pages.write`/`pages.delete`.
- `/cactus-admin/pages/new` - title/slug form (+ optional menu assignment when `menus.manage`), creates a builder-format draft then opens the editor.
- `/cactus-admin/pages/[id]` - full-screen Puck editor (`PuckEditor.tsx`): 1.5s debounced autosave, Publish (gated on `pages.publish`), version-history panel (live + up to 10 archived versions, restore into editor), preview link, delete. Markdown pages are silently migrated to builder format on open.
- `/cactus-admin/menus` - menu list: create, rename, delete (with main-menu warning), item counts.
- `/cactus-admin/menus/[id]` - menu item editor: add page/external items, nested drag-and-drop reordering with parent changes, edit label/url/new-tab, delete.
- `/cactus-admin/media` - media grid with search, upload (`MediaUpload.tsx`, image types only), delete with confirm (`MediaDelete.tsx`).
- `/cactus-admin/appearance` - server redirect to `/appearance/styles`.
- `/cactus-admin/appearance/styles` - design-token editor (v2 tokens): tabs colours/typography/headings/buttons/images/formFields/spacing, colour presets, ~50 Google-font list, saves via `PATCH /api/admin/appearance`.
- `/cactus-admin/layouts` - layout cards filtered by type tab (all/header/footer/infoPage/notFound/statusPage), display-condition summary, edit/preview/delete (starters undeletable).
- `/cactus-admin/layouts/new` - type picker + per-type starter templates (headers, footers, page layouts, 404s, status pages) built from inline Puck data.
- `/cactus-admin/layouts/[id]` - layout Puck editor (`LayoutPuckEditor.tsx`, 1.2s debounced autosave) with `DisplayConditionsPanel` (include/exclude rules; publish requires ≥1 include rule).
- `/cactus-admin/users` - user table (role, joined, status), role select / suspend / delete per row (`UserActions.tsx`); non-admins cannot act on protected-role users.
- `/cactus-admin/roles` - role list + permission matrix (`RolesClient.tsx`); protected role shows all-granted and is immutable; permissions grouped Core vs module, inactive-module groups disabled. Below the matrix, server component also renders any `core.roles-page` extension-point contributions (permission-filtered live from `Module.manifest.extensionPoints`, same pattern as elsewhere) - currently Gazette's per-user Contributor/Author/Editor assignment (`GazetteRolesSection.tsx`), replacing its former standalone `/cactus-admin/m/gazette/roles` page.
- `/cactus-admin/modules` - module directory (org `cactus-foundation-modules`), install with public/beta channel choice, update / enable / disable / uninstall (code-only or code+data teardown), per-module update channel, release-notes modal, stale-`deploying` reconciliation.
- `/cactus-admin/notifications` - notification list with per-type icon, reasons list, read/unread toggle, delete, "Redeploy now" for open deployment notifications (`NotificationActions.tsx`).
- `/cactus-admin/config` - Settings, 8 core tabs + module-registered tabs (see Admin UI section). Server component fetches active modules' `manifest.settingsTabs`, permission-filters, passes to client `ConfigPageClient`.
- `/cactus-admin/config/privacy-generator` - 6-step privacy-policy wizard; assembles markdown from `lib/privacy/template.ts` and creates a draft InfoPage, optionally linking it as the privacy policy page.
- `/cactus-admin/m/[module]/[...path]` - generic module page host; delegates to `resolveModulePage` in generated `lib/modules/router.ts`.
- `app/cactus-admin/layout.tsx` - admin shell: reads `x-cactus-admin-path` / `x-cactus-is-login` headers, secondary session check, module nav entries from `Module.manifest.navEntries` (permission-filtered), unread notification count, admin white-labelling (primary colour family + sans font only). Nav entries are grouped: a module with no `manifest.navGroupLabel` lands in the shared "Modules" bucket (unchanged behaviour); a module that sets `navGroupLabel` (currently only Gazette, `"Gazette"`) gets its own `admin-nav-section-label` heading with just its own links, rendered via `AdminShell`/`AdminNav`'s `moduleNavGroups` prop (`Array<{label: string|null, links}>`).

API route handlers (core):

- `GET /api/health` - `SELECT 1` liveness check; `{status, database: connected|disconnected}`.
- `GET/POST /api/consent` - GDPR consent record append (action, decision map validated against configured categories, truncated IP, SHA-256 UA hash; sets 2-year `cactus-consent-id` httpOnly cookie); GET returns the latest decision for the cookie's consentId.
- `POST /api/webhooks/vercel` - HMAC-SHA1 signature check against `VERCEL_WEBHOOK_SECRET`; on `deployment.succeeded` for the tracked deployment: promotes `deploying` modules, releases DeployLock, clears the redeploy gate; on error/canceled: rolls modules back and resolves the `'pending'` sentinel to the real deployment id.
- `GET|POST|PATCH|DELETE /api/m/[module]/[...path]` - generic module API dispatcher via generated `lib/modules/router.ts`; `force-dynamic`, `maxDuration = 60`.

Auth API:

- `GET /api/auth/config` - public: `emailConfigured`, `turnstileConfigured`, `turnstileSiteKey`, `neonProjectId`.
- `POST /api/auth/login` - password step of password+OTP login; 503 when email unconfigured; Turnstile; rate limit (`login`, ip+account_email); constant-time-ish hash compare; sends 6-digit `login_otp` EmailChallenge; returns `{step:'otp', userId}`.
- `POST /api/auth/email-code` - verifies the OTP (skipped when trusted-device cookie valid); creates session; optional trusted-device cookie for `trustDeviceDays`.
- `POST /api/auth/logout` - deletes session, clears cookie, redirects `/logged-out`.
- `POST /api/auth/register` - public registration when `publicRegistration`; requires `agreedToPolicy`; Turnstile + rate limit; username blocklist; optional password (min 8 + Pwned Passwords k-anonymity check); default role = `defaultRoleId` or first non-protected role; email auto-verified when email is not configured, else sends `verify_email` challenge.
- `POST /api/auth/passkey/authenticate-options` - rate limited; if the given email's account has zero passkeys returns `{noPasskeys, userId}`; else WebAuthn authentication options (challenge stored in `WebAuthnChallenge`, 5 min TTL).
- `POST /api/auth/passkey/authenticate-verify` - verifies assertion (challenge extracted from `clientDataJSON`), suspended check, creates session, updates passkey counter.
- `POST /api/auth/passkey/register-options` - Origin must match SITE_URL (rpId guard); userId from body only during setup, else from session; excludeCredentials from existing passkeys; stable WebAuthn user handle encoded from userId.
- `POST /api/auth/passkey/register-verify` - verifies attestation; target userId comes from the stored challenge (not spoofable from the body); labels the passkey from the user agent.
- `POST /api/auth/passkey/register-login` - registers a passkey AND creates a session; only permitted when the account has zero passkeys (server re-checks).
- `POST /api/auth/totp/setup-options` - generates a TOTP secret (base32, 20 bytes), otpauth URI and QR data URL; secret stored encrypted (AES-256-GCM via `ENCRYPTION_KEY`), unverified; body userId trusted only pre-setup.
- `POST /api/auth/totp/setup-verify` - verifies the first code (window ±1, replay-guarded via `totpLastStep`), sets `totpVerifiedAt`; setup-wizard mode also creates the session.
- `POST /api/auth/totp/verify` - email+code login; single generic error to prevent account enumeration; rate limited; creates session.
- `POST /api/auth/recovery/request` - always returns 200 (no enumeration); Turnstile; rate limited; emails a recovery link (`/api/auth/recovery/complete?token=…`, 30 min TTL) plus a "recovery requested" notification.
- `GET /api/auth/recovery/complete` - validates the token then redirects to `/<adminPath>/login?recovery_token=…`.
- `POST /api/auth/recovery/complete` - consumes the token, optional new password, invalidates all sessions and trusted devices, creates a fresh session, sends a completion notification email.

Account API (all require session):

- `DELETE /api/account` - self-deletion in a transaction; blocked when it would leave zero active admins; InfoPage/Media/ConsentRecord ownership nulled.
- `GET/PATCH /api/account/profile` - email/username/displayName; PATCH displayName (max 128).
- `POST /api/account/email` - change email; requires current password when one is set; 409 on conflict.
- `GET/POST /api/account/password` - status (`hasPassword`, `emailConfigured`); add/change password (refused when email unconfigured; breached-password check; optional sign-out-other-sessions preserving the current one by token hash).
- `GET /api/account/passkeys`, `DELETE /api/account/passkeys/[id]` - list; deletion of the last passkey blocked unless a password exists.
- `GET/DELETE /api/account/sessions`, `DELETE /api/account/sessions/[id]` - list (current session flagged), revoke all, revoke one.
- `GET/DELETE /api/account/totp` - enabled status; removal blocked when TOTP is the only sign-in method.
- `GET /api/account/export` - GDPR Art. 20 JSON download: profile, role, passkey metadata (no key material), active sessions, consent records.

Admin API:

- `GET/PATCH /api/admin/config` - `config.manage`. GET returns the full SiteConfig row. PATCH validates every field with zod; adminPath blocklist; consent-banner "necessary" category enforced, `categoriesVersion`/`copyVersion` auto-bumped on meaningful changes; Edge Config sync for adminPath/status; a mediaProvider change returns a per-provider Media breakdown.
- `GET/PATCH /api/admin/appearance` - GET requires a valid session (public layout reads design tokens directly via Prisma, not this endpoint - only admin editors call it); PATCH requires `appearance.manage` and accepts only null or a `version: 2` token object.
- `GET/POST/DELETE /api/admin/env` - protected-role only; `maxDuration 60`. GET: boolean set/unset per allowlisted key (Vercel API, or `process.env` read-only in local mode). POST: upserts allowlisted vars to Vercel env, records a deployment-needed notification. DELETE ("Reset Everything"): deletes every project env var, writes the `pendingRedeployId: 'pending'` sentinel, triggers a redeploy in `after()`.
- `GET /api/admin/github-app` - `config.manage` OR `modules.manage`; ENCRYPTION_KEY presence/format, GitHub App connection + installation state, `hasPat`.
- `GET/DELETE /api/admin/redeploy-status` - GET requires only a session (deliberately no permission gate; the redeploying page traps every admin role). DELETE (`config.manage`) clears the gate, releases DeployLock, reconciles `deploying` modules against the actual latest Vercel deployment state.
- `POST /api/admin/reset-database` - protected-role only. `deleteSetupData: true` = TRUNCATE all tables (preserving only adminPath) → setup wizard. Soft mode = truncate content tables, keep the current admin and SiteConfig, delete all other users, re-seed starter content (Home page, Main Menu, starter layouts, Styles page).
- `GET/POST /api/admin/updates` - `config.manage`, `maxDuration 60`. GET: core update status by channel (public/beta), raises/clears the `core-update` notification, lists modules with updates when a core update exists. POST: acquires DeployLock, optionally queues module updates into the same deploy, `syncCoreFromUpstream`, arms the redeploy gate via `startDeferredRedeploy({committedSince})`; falls back to a deferred notification without Vercel credentials.
- `GET/POST /api/admin/layouts`; `GET/PATCH/DELETE /api/admin/layouts/[id]`; `POST /api/admin/layouts/[id]/publish` - list/create/update/delete/publish Layouts. Writes require `layouts.manage`; both GET handlers require a valid session (no further permission gate); publishing requires ≥1 include display condition; starter layouts cannot be deleted.
- `GET/POST/DELETE /api/admin/media` - GET list with `q` search (session only); POST upload (`media.upload`; active provider must be selected AND fully configured; content-sniff validation via sharp); DELETE `?id=&force=` (`media.delete`; 409 with reference list when the item is used as logo/favicon/OG image unless `force=true`; deletes from the provider the row actually lives on).
- `DELETE /api/admin/media/[id]` - path-param twin of the above DELETE, matching what the admin `MediaDelete` component actually calls (`DELETE /api/admin/media/<id>`); same session/permission/reference-check/deletion logic.
- Media migration (`config.manage`): `GET /api/admin/media/provider-breakdown`, `POST migration-start`, `POST migration-batch` (one 15-item batch per call, driven by the open admin tab), `GET migration-status`, `POST migration-cancel`, `POST migration-retry`.
- Menus (`menus.manage`): `GET/POST /api/admin/menus`; `GET/PATCH/DELETE /api/admin/menus/[id]` (delete clears `mainMenuId`, returns `wasMainMenu`); `GET [id]/resolve` (public-shape resolved tree); `POST [id]/items` (PAGE unique per menu / EXTERNAL label+url; order auto-assigned per parent scope); `PATCH/DELETE [id]/items/[itemId]`; `POST [id]/items/reorder` (bulk parentId+order in a transaction).
- Roles (`roles.manage`): `GET/POST /api/admin/roles` (unique name); `DELETE /api/admin/roles/[id]` (protected roles and roles with assigned users blocked); `POST/DELETE /api/admin/roles/[id]/permissions` (RolePermission upsert/remove; protected roles immutable).
- Users (`users.manage`): `GET /api/admin/users` (paginated); `PATCH /api/admin/users/[id]` (roleId / suspend; self-modification blocked; only protected-role actors may act on protected-role targets; last-admin guard on demotion); `DELETE /api/admin/users/[id]` (content ownership nulled; last-admin guard).
- Notifications (`config.manage`): `GET /api/admin/notifications`; `PATCH /api/admin/notifications/[id]` (read/unread); `DELETE [id]`; `POST [id]/redeploy` (409 if already initiated; flips `pending_deploy` modules to `deploying`; `startDeferredRedeploy`; 503 in local mode).
- Pages: `GET /api/admin/pages` (`pages.read`); `POST` (`pages.write`, publish status additionally `pages.publish`, optional menu assignment with `menus.manage`, unique slug); `DELETE` bulk `{ids[]}` (`pages.delete`; blocked for pages referenced as privacy/terms). `GET/PATCH/DELETE /api/admin/pages/[id]` (PATCH cannot flip draft→published - Publish endpoint only). `POST [id]/autosave` (`pages.write`; writes only `builderData` + menu links; draft pages reconcile title/slug/meta/ogImage columns, published pages freeze them). `POST [id]/publish` (`pages.publish`; the only writer of `publishedData`/`status: published`; archives the previous live version into `history`, capped at 10; `revalidatePath`). `GET [id]/history` (`pages.read`; `?index=live|N` for full blobs, no param for the version list). `GET /api/admin/pages/perms` (session; returns canRead/canWrite/canPublish/canDelete/canManageMenus).
- Modules (`modules.manage`, `maxDuration 60`): `GET /api/admin/modules` (list); `POST` (install: GitHub required, DeployLock, fetch + zod-parse `cactus.module.json`, tablePrefix uniqueness, `requiresModules` dependency check with minVersion, latest GitHub release required by channel, `requiredEnvVars` presence check, permission registration, then `deploying` + `startDeferredRedeploy`). `PATCH /api/admin/modules/[id]` - `updateChannel` | `enable` | `disable` | `check-status` (lazy Vercel deploy reconcile for Hobby plan) | `update` (new tag held in `pendingVersion` until the deploy succeeds). `DELETE [id]` `{mode: code_only|code_and_data}` - dependent-module guard; `code_and_data` drops the manifest's `teardown` tables with verification; deletes module permissions and row; redeploy. `GET [id]` - per-module update check against the latest release for its channel; raises/clears the `module-update:{id}` notification. `GET /api/admin/modules/directory` - lists public repos of the GitHub org `cactus-foundation-modules` (5-minute in-memory cache, `?refresh=true` busts), merged with installed state; `directoryUnavailable` flag when GitHub is unreachable; each uninstalled repo probed for a stable GitHub release (`hasPublicRelease`) so the admin UI can hide the Public channel option and force Beta for modules with pre-releases only.

Setup API (each returns 403/404 once setup is complete with users, except deployment-logs):

- `GET /api/setup/env-check` - required/optional env status, `missingRequired`, `databaseState` (`set` | `provisioned-redeploying` [checked via Vercel API] | `missing`), `neonAvailable`, `vercelConfigured`, `localMode`.
- `POST /api/setup/vercel-connect` - `list-projects` (token validation, projects + domains) | `configure` (writes VERCEL_API_TOKEN, VERCEL_PROJECT_ID, generated SESSION_SECRET + ENCRYPTION_KEY, SITE_URL, NEXT_PUBLIC_SITE_URL, optional NEON_API_KEY, GITHUB_REPO from the project's git link; deliberately does not redeploy yet).
- `POST /api/setup/configure-env` - writes optional allowlisted env vars during the wizard.
- `POST /api/setup/provision-db` - actions: `list` (Neon projects incl. org-scoped) | `check-existing` (counts user tables) | `save-url` (user-supplied DATABASE_URL → Vercel + redeploy) | `use-existing` (pooled URI via Neon API, optional `destroyData` = DROP SCHEMA public on the direct endpoint) | `create` (default: Neon project `cactus-<vercelProjectId>`, Postgres 18, chosen region, idempotent by name search; writes DATABASE_URL + NEON_PROJECT_ID; redeploys). Credentials may come from the body pre-redeploy.
- `POST /api/setup/read-state` - wizard resume state; 404 once complete.
- `POST /api/setup/create-admin` - seeds core permissions, ensures the protected Admin role, creates the admin user (email verification exempt); exact-match retry path preserves the WebAuthn user handle and clears stale passkeys.
- `POST /api/setup/set-admin-path` - 3–64 chars `[a-z0-9-]`, blocklisted values rejected; upserts SiteConfig.
- `GET /api/setup/suggest-path` - random `word-suffix` admin path suggestion.
- `POST /api/setup/essentials` - siteName + timezone.
- `POST /api/setup/complete` - seeds Home page (slug `home`, published), Main Menu, all starter layouts, the Styles draft page; sets `setupCompleted`, status `comingSoon`, `hideFromCrawlers`, default design tokens; Edge Config sync; generates missing SESSION_SECRET/ENCRYPTION_KEY (Vercel write + redeploy, returns `needsRedeploy`) or auto-logs the admin in. Re-POST by an authenticated admin after setup = "Refresh Starter Templates".
- `POST /api/setup/reset` - sets `setupCompleted = false`, only when zero users exist.
- `GET /api/setup/deployment-logs` - Vercel deployment state + log lines with a `since` cursor; post-setup requires session + `config.manage` and the server's own token; pre-setup accepts a `?token=` from the wizard.

GitHub App connect flow (under `app/cactus-admin/integrations/github/`, reached via the admin path rewrite):

- `GET start` (`config.manage`) - builds the GitHub App manifest (name "Cactus Foundation - {siteName}", permissions `contents: write` + `metadata: read`); state cookie `cactus_github_app_state` (10 min).
- `GET callback` (session) - state check; converts the manifest code via `POST /app-manifests/{code}/conversions`; encrypts pem/webhook secret/client id/client secret with `ENCRYPTION_KEY`; replaces the GithubAppConnection row; uploads `cactus.svg` as the app logo (non-fatal); redirects with `github=connected|error&reason=…`.
- `GET install` (`config.manage`) - returns `github.com/apps/<slug>/installations/new` URL + state cookie.
- `GET installed` (session) - stores `installation_id` and the installation account login.
- `POST disconnect` (`config.manage`) - deletes the GithubAppConnection rows (the App itself remains on GitHub).

Loading/error boundaries: none exist (no `loading.tsx`, `error.tsx`, or `global-error.tsx` files in `app/`).

### Middleware

There is no `middleware.ts`. `proxy.ts` at the repo root is the Next.js 16 replacement, running on the Node runtime (so it uses Prisma directly).

- Matcher: everything except `_next/static`, `_next/image`, and static file extensions (ico/png/jpg/jpeg/svg/webp/gif/woff/woff2/ttf/eot/css/js).
- Security headers (production only; skipped in development): CSP (`default-src 'self'`; scripts `'unsafe-inline' 'unsafe-eval'`; styles allow Google Fonts; img allows self/data/blob/picsum/the Worker host; `frame-ancestors 'none'`; `form-action 'self' https://github.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy (camera/mic/geolocation off, WebAuthn self), HSTS 2 years preload.
- Always-pass paths: `/api/health`, `/api/webhooks/`, `/_next/`, `/favicon.ico`.
- Direct requests to `/cactus-admin*` return 404.
- First-run gate: until `setupCompleted && userCount > 0`, everything redirects to `/setup` except `/setup`, `/api/setup`, `/api/auth/passkey/`, `/api/auth/totp/`, `/api/health`, `/_next/`, `/favicon.ico`. After setup, `/setup*` returns 404.
- Admin path enforcement: resolves the admin path from Edge Config (when write creds present) else a 5-second-TTL Prisma cache; rewrites `/<adminPath>/*` → `/cactus-admin/*`. The `/login` sub-path is rewritten without an auth check (header `x-cactus-is-login: 1`). All other sub-paths validate the `cactus_session` cookie; on success sets `x-cactus-admin-path`, `x-cactus-user-id`, `x-cactus-role-protected`; while `pendingRedeployId` is set (cache-then-uncached confirm) rewrites to `/cactus-status/redeploying`; unauthenticated requests redirect to `/<adminPath>/login?next=…`.
- API requests pass through, with a CSRF origin check on non-GET/HEAD/OPTIONS: a present-but-mismatched `Origin` header returns 403.
- `/page-preview/` and `/layout-preview/` always pass (so editors can preview while the site is gated).
- Site status gate: when status ≠ `live`, public routes are rewritten to `/cactus-status/coming-soon` or `/cactus-status/maintenance` unless the session's role `isProtected`.

### Environment Variables

Core:

- `DATABASE_URL` - PostgreSQL pooled connection string. Required. Consumed by Prisma (`lib/db/prisma.ts`), build scripts, setup routes.
- `DIRECT_URL` - optional non-pooled connection for migrations; `scripts/build-migrate.mjs` (falls back to stripping `-pooler` from DATABASE_URL).
- `SESSION_SECRET` - HMAC ingredient for session/trusted-device token hashing, min 32 chars. Required (auto-generated on Vercel during setup). `lib/config/env.ts:getSessionSecret`, `lib/auth/session.ts`.
- `SITE_URL` - canonical public URL; also the WebAuthn rpId/origin source. Required. `lib/config/env.ts` (`getSiteUrl`, `getWebAuthnRpId`, `getWebAuthnOrigin`), robots/sitemap, recovery links.
- `NEXT_PUBLIC_SITE_URL` - browser-visible copy of SITE_URL shown in the setup wizard. Optional in code, written by setup.
- `VERCEL` - platform-injected. Its absence defines local-development mode (`isLocalMode()` in `lib/config/env.ts`), which disables env editing, redeploys, and core/module updates.
- `VERCEL_URL` - platform-injected fallback for site URL in robots/sitemap.
- `NODE_ENV` - dev/prod switches (security headers, cookie `secure`, WebAuthn localhost overrides, Prisma logging).
- `NEXT_PUBLIC_APP_VERSION` - injected by `next.config.ts` from `package.json` version.
- `NEXT_TELEMETRY_DISABLED` - set to `1` by `next.config.ts`.
- `PORT` - `scripts/dev-warm.sh` only (default 3000).

Vercel control plane:

- `VERCEL_API_TOKEN` - required on Vercel; env-var writes, redeploys, deployment logs/status, Edge Config writes. `lib/vercel/env.ts`, `lib/vercel/deploy.ts`, `lib/deploy/redeploy.ts`, setup + admin env routes.
- `VERCEL_PROJECT_ID` - required on Vercel; identifies the project for all of the above.
- `EDGE_CONFIG` - optional; Edge Config read connection string (`lib/config/edge-config.ts`, `@vercel/edge-config`).
- `VERCEL_EDGE_CONFIG_ID` - optional; Edge Config item writes via the Vercel REST API.
- `VERCEL_WEBHOOK_SECRET` - optional; verifies `/api/webhooks/vercel` (Pro/Enterprise; Hobby falls back to lazy polling).

Auth:

- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` - optional; Cloudflare Turnstile on login/register/recovery and module forms. `lib/auth/turnstile.ts` fails open when unset, fails closed on network errors when set.

GitHub:

- `GITHUB_API_TOKEN` - optional; PAT fallback for all GitHub operations (`lib/github/client.ts`), `scripts/sync-wiki.mjs`.
- `GITHUB_REPO` - `owner/repo` of the site's own repository; module registry commits and core-update pushes (`lib/modules/github.ts`, `lib/updates/core.ts`).
- `CACTUS_CORE_REPO` - optional upstream override for core updates; defaults to `usersaynoso/cactus-foundation` (`lib/updates/core.ts`).
- `WIKI_SOURCE_REPO` - optional; `scripts/sync-wiki.mjs` (defaults to GITHUB_REPO).

Encryption:

- `ENCRYPTION_KEY` - 64-char hex (32 bytes) AES-256-GCM key. Required for the GitHub App flow, TOTP secret storage, and the reply-catcher module's mailbox credentials. `lib/crypto/secrets.ts`.

Neon:

- `NEON_API_KEY` - optional; automatic database provisioning during setup (`/api/setup/provision-db`).
- `NEON_PROJECT_ID` - written by provisioning; surfaced by `/api/auth/config` for the lost-passkey Neon console deep link.

Media (one provider active at a time; per-provider keys defined in `lib/media/providers.ts`):

- `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` - Backblaze B2.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - Cloudflare R2.
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` - AWS S3.
- `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` - DigitalOcean Spaces.
- `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` - Wasabi.
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` - MinIO.
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob.
- `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` - Supabase Storage.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - Cloudinary (direct).
- `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` - ImageKit (direct).
- `CLOUDFLARE_WORKER_URL` - shared Worker URL for all proxied providers; required by every proxied provider (`envKeysForProvider` appends it).
- `CLOUDFLARE_WORKER_HOSTNAME` - Worker hostname for `next.config.ts` remotePatterns and the proxy CSP img-src.
- `NEXT_PUBLIC_CLOUDFLARE_WORKER_URL` - client-side Worker URL fallback used by the custom image loader (`lib/media/loader.ts`).

Email:

- `BREVO_API_KEY` - Brevo transactional API; takes priority over SMTP. `lib/email/index.ts`.
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS` - nodemailer SMTP fallback.

Other:

- `SENTRY_DSN` - optional. Read only for configured-status display (dashboard, env editor); no Sentry SDK is installed or initialised anywhere.
- `CRON_SECRET` - reply-catcher module; Vercel attaches it as `Authorization: Bearer` on cron invocations of `/api/m/contact-form-reply-catcher/cron/poll`.
- `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` - set to `1` by `scripts/build-migrate.mjs` at build time only.

Cloudflare Worker (separate deployment, `workers/media-worker`): `ALLOWED_ORIGIN`, `BLOB_BASE_URL`, plus the same provider secret sets as above, configured via `wrangler secret put`.

### Database Schema

Single Prisma schema at `prisma/schema.prisma` (PostgreSQL). One init migration: `prisma/migrations/20260626000000_init/migration.sql`. All timestamps UTC.

- `User` - `id` (cuid PK), `email` (unique), `username` (unique), `displayName?`, `passwordHash?`, `roleId` → Role, `emailVerifiedAt?`, `createdAt`, `updatedAt`, `suspendedAt?`, `acceptedPrivacyPolicyAt?`, `totpSecretEncrypted?`, `totpVerifiedAt?`, `totpLastStep? BigInt`. Relations: passkeys, sessions, trustedDevices, emailChallenges, recoveryRequests, infoPages, mediaItems, consentRecords. Indexes: email, username.
- `Passkey` - `id`, `userId` → User (cascade), `credentialId` (unique), `publicKey Bytes`, `counter BigInt default 0`, `transports String[]`, `label?`, `createdAt`. Index: userId.
- `Session` - `id`, `userId` → User (cascade), `tokenHash` (unique; sha256(token + SESSION_SECRET)), `createdAt`, `expiresAt`. Indexes: userId, expiresAt.
- `TrustedDevice` - `id`, `userId` → User (cascade), `tokenHash` (unique), `createdAt`, `expiresAt`. Indexes: userId, expiresAt.
- `EmailChallenge` - `id`, `userId` → User (cascade), `codeHash`, `purpose` (`login_otp` | `verify_email` | `recovery`), `expiresAt`, `attempts Int default 0`, `createdAt`. Indexes: (userId, purpose), expiresAt.
- `RecoveryRequest` - `id`, `userId` → User (cascade), `tokenHash` (unique), `createdAt`, `expiresAt`, `used Boolean default false`. Indexes: userId, expiresAt.
- `Role` - `id`, `name` (unique), `isProtected Boolean default false`, `createdAt`. Relations: users, permissions.
- `Permission` - `key` (PK), `description?`, `module?` (null = core, else the registering module name). Relation: rolePermissions.
- `RolePermission` - composite PK (roleId, permissionKey); both FKs cascade.
- `SiteConfig` - singleton (`id = "singleton"`): `siteName` (default "My Cactus Site"), `tagline?`, `description?`, `timezone` ("UTC"), `locale` ("en-GB"), `dateFormat` ("DD/MM/YYYY"), `timeFormat` ("HH:mm"), `adminPath` (unique), `setupCompleted` (false), `status SiteStatus` (comingSoon), `hideFromCrawlers` (true), `publicRegistration` (true), `defaultRoleId?`, `trustDeviceDays` (28), `emailFromName?`, `emailFromAddress?`, `emailProvider?` ('brevo' | 'smtp'), `mediaProvider MediaProviderType?`, `privacyPolicyPageId?`, `termsPageId?`, `logoMediaId?`, `faviconMediaId?`, `sessionPurgeAfterDays` (30), `recoveryPurgeAfterDays` (7), `mainMenuId?`, `homepageId?`, `pendingRedeployId?`, `pendingRedeployAt?`, `designTokens Json?`, `consentBannerConfig Json?`, `coreUpdateChannel` ("public"), `createdAt`, `updatedAt`.
- `InfoPage` - `id`, `slug` (unique), `title`, `body Text`, `bodyFormat BodyFormat` (markdown), `builderData Json?` (working draft; autosave target), `publishedData Json?` (live content, written only by Publish), `publishedAt?`, `publishedById?` (no relation), `history Json?` (array of `{data, title, at, byId}`, max 10, newest first), `status PageStatus` (draft), `metaDescription?`, `ogImageId?` (Media id, no relation), `createdById?` → User (SetNull), `createdAt`, `updatedAt`. Relation: menuItems. Indexes: slug, status.
- `Media` - `id`, `key` (unique), `provider MediaProviderType`, `url`, `uploadedById?` → User (SetNull), `altText?`, `isDecorative` (false), `mimeType`, `sizeBytes Int`, `createdAt`. Indexes: uploadedById, createdAt, provider.
- `MediaMigrationJob` - `id`, `toProvider MediaProviderType`, `status` (pending | running | completed | failed | cancelled), `totalItems Int`, `migratedItems Int default 0`, `failedItemIds Json default []`, `cursor?`, `startedAt`, `completedAt?`, `lastError?`. Indexes: status, startedAt.
- `Layout` - `id`, `name`, `type` (header | footer | infoPage | notFound | statusPage | module type; default infoPage), `description?`, `builderData Json?`, `displayConditions Json?` (`{include: Rule[], exclude: Rule[]}`), `priority Int default 0`, `isStarter Boolean default false`, `status PageStatus` (draft), `createdAt`, `updatedAt`.
- `Module` - `id`, `name` (unique), `repoUrl`, `version` (confirmed live tag), `pendingVersion?` (in-flight target, promoted only on deploy success), `tablePrefix` (unique), `status ModuleStatus` (pending_install), `installedAt`, `lastError?`, `lastCheckedAt?`, `updateAvailable?`, `updateNotes? Text`, `updateChannel` ("public"), `manifest Json?` (parsed cactus.module.json).
- `Notification` - `id`, `type NotificationType` (deployment), `title`, `reasons Json?` (deployment type: `{label, detail?, at}[]`), `link?` (admin-relative), `dedupeKey?` (core-update, module-update:{id}, contact-form:messages), `readAt?` (null = unread, drives nav badge), `deployInitiatedAt?` (null = open deployment notification), `createdAt`, `updatedAt`. Indexes: (type, deployInitiatedAt), readAt, dedupeKey.
- `ModuleMigration` - `id`, `moduleName`, `migrationName`, `appliedAt`, `checksum` (sha256 of the SQL). Unique (moduleName, migrationName); index moduleName. Tracked separately from Prisma's own history.
- `DeployLock` - singleton: `id = "singleton"`, `lockedAt`, `lockedBy` (module or update identifier). Prevents concurrent installs/updates.
- `GithubAppConnection` - `id`, `appId`, `appSlug`, `installationId?`, `installationAccount?`, `privateKeyEncrypted Text`, `webhookSecretEncrypted? Text`, `clientIdEncrypted? Text`, `clientSecretEncrypted? Text`, `createdAt`, `updatedAt`. Secrets AES-256-GCM encrypted with ENCRYPTION_KEY.
- `Menu` - `id`, `name`, `createdAt`, `updatedAt`. Relation: items.
- `MenuItem` - `id`, `menuId` → Menu (cascade), `parentId?` self-relation (cascade), `type MenuItemType`, `pageId?` → InfoPage (cascade), `label?`, `url?`, `openInNewTab` (false), `order Int`, `createdAt`, `updatedAt`. Unique (menuId, pageId); indexes menuId, pageId.
- `RateLimit` - `id`, `key` (`ip:<addr>` | `account:<id>` | `account_email:<email>` | `consent:<id>`), `action`, `attempts Int default 1`, `windowStart`. Unique (key, action); index windowStart. In-database rate limiting with atomic INSERT … ON CONFLICT.
- `ConsentRecord` - append-only: `id`, `consentId`, `userId?` → User (SetNull), `categoriesVersion Int`, `decision Json`, `action` (accept_all | reject_all | custom | withdraw | acknowledge), `ipTruncated?`, `uaHash?`, `createdAt`. Indexes (consentId, createdAt), userId.
- `WebAuthnChallenge` - transient: `id`, `userId?`, `challenge` (unique), `purpose` (registration | authentication), `expiresAt` (5 min), `createdAt`. Indexes userId, expiresAt.

Enums: `SiteStatus` (live, comingSoon, maintenance); `PageStatus` (draft, published); `BodyFormat` (markdown, builder); `MediaProviderType` (B2, R2, S3, SPACES, WASABI, MINIO, VERCEL_BLOB, SUPABASE_STORAGE, CLOUDINARY, IMAGEKIT); `ModuleStatus` (pending_install, deploying, pending_deploy, active, inactive, failed, update_available); `NotificationType` (deployment, core_update, module_update, message); `MenuItemType` (PAGE, EXTERNAL).

### Authentication

WebAuthn (passkeys):

- `@simplewebauthn/server` v13 in `lib/auth/passkey.ts`; browser side `@simplewebauthn/browser` loaded on demand.
- rpName "Cactus Foundation"; rpId = hostname of SITE_URL (hard-coded `localhost` in development); origin = SITE_URL. rpId cannot change once passkeys exist.
- Challenges persisted in `WebAuthnChallenge` with a 5-minute TTL, deleted on use or expiry; verify calls extract the challenge from the assertion's `clientDataJSON`.
- Registration uses a stable user handle (userId bytes) so Safari/iCloud Keychain retries do not conflict; `excludeCredentials` from existing passkeys; `residentKey: preferred`, `userVerification: preferred`, `requireUserVerification: false`.
- Passkeys store credentialId, COSE public key bytes, signature counter (updated on every authentication), transports, and a label derived from the user agent ("Chrome on macOS").
- Zero-passkey accounts get a register-and-login path (`register-login`) where the fresh attestation itself is the authentication factor.

Sessions:

- Cookie `cactus_session`: httpOnly, SameSite=Lax, secure in production, 24-hour lifetime (`SESSION_DURATION_MS` in `lib/auth/session.ts`).
- Server stores only `sha256(token + SESSION_SECRET)` in `Session.tokenHash`. Validation (`validateSession`): row lookup by hash, expiry check (expired rows deleted on touch), suspended-user check; returns the user with role included.
- Server-side validation happens twice per admin request: in `proxy.ts` and again in the admin layout/route handlers via `getSessionFromCookie()`.
- Trusted devices: cookie `cactus_trusted`, same hashing scheme, N days from `SiteConfig.trustDeviceDays` (default 28), expiry refreshed on valid use; lets password logins skip the email OTP.

Other mechanisms:

- Password login: bcrypt (12 rounds), minimum 8 chars, Pwned Passwords k-anonymity breach check (fails open); always second-factored by a 6-digit email OTP (`EmailChallenge`, 10-minute TTL, 5 attempts, sha256-hashed, timing-safe compare) unless the device is trusted. Unavailable when email is not configured.
- TOTP: otpauth SHA1/6-digit/30s, issuer "Cactus Foundation", secret AES-256-GCM encrypted at rest, ±1 window, replay-protected via monotonically increasing `totpLastStep`.
- Recovery: 32-byte token, sha256-hashed, 30-minute TTL, single-use; completion revokes all sessions and trusted devices.
- Rate limiting: in-database (`RateLimit` table), atomic check-and-record. Limits: login 10/15min, register 5/60min, recovery_request 3/60min, email_code 5/15min, passkey_authenticate 20/15min, consent 30/15min, totp_verify 5/15min.
- Turnstile: applied to login, register, and recovery-request; fail-open when unconfigured, fail-closed on network error when configured.
- CSRF: SameSite=Lax cookie plus an explicit Origin-mismatch 403 for unsafe methods in `proxy.ts`.

Admin path obfuscation:

- The real admin URL prefix is a per-site secret string (`SiteConfig.adminPath`, unique, suggested as e.g. `lemon-x7k2p9`), resolved at the proxy from Edge Config or DB and rewritten to the internal `/cactus-admin/*` tree. Direct `/cactus-admin` access 404s; wrong prefixes fall through to a plain Next.js 404 indistinguishable from any missing route.
- What it hides: the location of the login page and admin UI from casual scanning.
- What it does not protect: it is not an authentication factor. All admin API routes under `/api/admin/*` sit at fixed, guessable URLs and rely entirely on session + permission checks; the admin path leaks to anyone with a valid session.

### Permissions System

Core keys (registered by `seedCorePermissions()` in `lib/permissions/check.ts` at setup):

- `pages.read` - view info pages including drafts (admin page list, page GET/history APIs, page-preview route).
- `pages.write` - create/edit pages (POST/PATCH/autosave).
- `pages.publish` - publish pages (publish endpoint; also required to create a page already published).
- `pages.delete` - delete pages (single + bulk).
- `users.manage` - view and manage users (users page + API).
- `media.upload` - upload media.
- `media.delete` - delete media.
- `roles.manage` - roles page + role/permission APIs.
- `modules.manage` - module list/install/update/uninstall/directory; also grants GitHub App status read.
- `config.manage` - settings GET/PATCH, notifications, updates, media migration, redeploy dismiss, deployment logs, GitHub App flow.
- `menus.manage` - all menu APIs; also gates menu assignment from the page editor.
- `appearance.manage` - design-token PATCH.
- `layouts.manage` - layout create/update/delete/publish.

Module-registered keys currently present: `contact.view`, `contact.reply`, `contact.delete`, `contact.export` (contact-form); `replycatcher.manage` (contact-form-reply-catcher). Stored in `Permission` with `module` set; deleted on module uninstall.

Where checks occur:

- Protected roles (`Role.isProtected`, only "Admin" is seeded) bypass every check (`hasPermission` short-circuits; `isAdmin()` = `role.isProtected`).
- `proxy.ts`: session validity only (plus `isProtected` for the site-status bypass and the redeploy trap); no per-permission checks.
- API routes: `getSessionFromCookie()` + `hasPermission(user, key)` per handler (see the Routes section for each route's key).
- UI: server components branch on `hasPermission`/`isAdmin` (page buttons, nav module entries via manifest `permission`); client editors fetch `/api/admin/pages/perms` for capability flags.
- Cross-cutting guards: `assertProtectedUserWouldRemain` (transactional last-admin invariant on delete/demote/self-delete), `canActOnUser` (only admins act on protected-role users).

### Admin UI

Navigation (defined in `components/admin/AdminNav.tsx`): Dashboard; Content → Pages, Menus, Media, Styles, Layouts; People → Users, Roles; System → Modules, Settings; then module nav entries from manifests; footer: My Account, Sign out, version. Sidebar collapses to a rail (auto-collapses inside Puck editors), mobile drawer with backdrop; toolbar has collapse toggle, ThemeToggle, NotificationBell. Each labelled section is independently collapsible (click the label, chevron flips) - state persisted per-label in `localStorage` (`cactus-sidebar-sections-collapsed`), defaults to all sections maximised; only visible when the rail itself isn't collapsed.

Pages and routes: listed in the Routes section above.

Settings tabs (`/cactus-admin/config`):

- General: siteName, tagline, description, homepageId, mainMenuId, timezone (9 options), dateFormat, timeFormat; core-updates panel (channel toggle, check, update-now with optional module bundling); Refresh Starter Templates; Danger zone (Reset Database soft/hard, Reset Everything for Vercel env vars).
- Branding: placeholder note (logo/favicon require a media provider first).
- Auth & Access: adminPath, trustDeviceDays (1–365), publicRegistration.
- Email: emailFromName, emailFromAddress; Brevo/SMTP credential cards writing to Vercel env vars.
- Media: provider select (grouped Proxied/Direct, saved immediately), per-provider env-var checklist + CLOUDFLARE_WORKER_URL for proxied, per-provider media breakdown, client-driven migration with progress/cancel/retry.
- Site Status: status select (live/comingSoon/maintenance), hideFromCrawlers, link to statusPage layouts.
- GDPR & Legal: privacyPolicyPageId, termsPageId, privacy-generator link, sessionPurgeAfterDays, recoveryPurgeAfterDays, cookie-consent banner editor (enable, style, copy fields, category table with pinned "necessary", module-suggested categories, reConsentDays, consentLogRetentionDays, categoriesVersion display).
- Integrations: GitHub App connect/install/disconnect card; env-var cards for Edge Config, Turnstile, Vercel webhook, Sentry, Neon.
- Module tabs: rendered generically, appended after the core tabs, one per `settingsTabs` entry in an active module's manifest (permission-filtered server-side, same gating as `navEntries`). Currently: `contact-form-reply-catcher` ("Reply Catcher", tab id `contact-form-reply-catcher`) - mailbox provider (IMAP/Outlook OAuth), credentials, folder overrides, last-poll status, check-now, OAuth connect; `gazette` ("Gazette", tab id `gazette`, `GazetteSettingsTab.tsx`) - posts-per-page, RSS feed title/description, comments (enable/visibility/moderation/threading), reactions (enable + emoji set), with the WordPress/Medium/Substack import wizard appended below as its own section, replacing the former standalone `/cactus-admin/m/gazette/settings` and `/cactus-admin/m/gazette/import` pages.

Settings keys stored in the database = the SiteConfig columns (types and defaults listed in the Database Schema section). `designTokens` (Json) holds the v2 design-token object (defaults in `lib/design/tokens.ts:DEFAULT_DESIGN_TOKENS`: primary #2c7558/#459578, secondary white/#0f172a, system-ui font, heading sizes 2.5rem→1rem, link colours, blockPadding 1.5rem). `consentBannerConfig` (Json) holds `ConsentBannerConfig` (defaults in `lib/consent/types.ts`: disabled, bottom-bar, four categories necessary/preferences/analytics/marketing, reConsentDays 365, retention null, versions 0).

Client-side storage keys used by the admin: `localStorage cactus-theme`, `localStorage cactus-sidebar-collapsed`, `sessionStorage cactus-core-update-check`, `sessionStorage cactus-module-update-check-<id>` (both 10-minute throttles).

Credentials/env vars are never stored in the database; they are written to Vercel project env vars via `/api/admin/env` (read-only display in local mode).

### Puck Integration

- Library: `@puckeditor/core` ^0.22. Editor components (`<Puck>`) are client-only, lazy-loaded with `ssr: false`; public rendering uses `<Render>` from `@puckeditor/core/rsc`.
- Central config: `lib/puck/config.tsx` (safe for both editor and RSC paths; no hooks/browser APIs). Exports: `puckConfig` (default, full-page editor), `puckRscConfig`, `footerPuckConfig(+Rsc)`, `layoutPuckConfig(+Rsc)` (adds `ContentSlot`), `headerPuckConfig(+Rsc)`, `fullPagePuckConfig(+Rsc)` (aliases of puckConfig). RSC variants swap `SiteLogo` to an RSC renderer and replace the `richtext` field type with textarea (TipTap JSON is converted to HTML via `@tiptap/html` for RSC rendering).
- Core blocks by category - Layout: Section (background/overlay/padding/max-width/sticky/border/shadow/opacity + slot), Grid (2–4 columns, ratios, per-column align, 4 slots), Group (flex row/column + slot), Split (ratio columns), Spacer, Divider. Typography: Heading, TextBlock, RichTextBlock (TipTap), Quote. Actions: ButtonLink, CTABanner. Media: ImageBlock, VideoEmbed (YouTube/Vimeo), Embed (iframe). Content: Hero, Card, Callout, Badge, Accordion, FeatureList, Stats, Logos, SocialLinks. Site: SiteHeader, SiteLogo, Copyright, MenuBlock, LoginButton, ThemeToggle, CookieSettingsLink. Modules category is populated from generated `lib/puck/module-components.ts` (currently: `ContactForm`).
- Shared field helpers: `paddingField` (padding presets), `aosFields`/`aosDefaults` (AOS scroll-animation type/duration/delay on visual blocks), `SiteColourField` (site-palette colour picker fetching `/api/admin/appearance`).
- Editor-only field overrides applied in the editors (not in the base config): `OgImagePickerField`/`ImageUrlPickerField` (media library modal), `MenuCheckboxField` (page menu assignment), `MenuSelectField` + `MenuBlockEditorPreview` (MenuBlock).
- Data shape read/written: Puck `Data` JSON (`{content: Block[], root: {props}, zones}`). Storage fields - `InfoPage.builderData` (working draft, written by autosave), `InfoPage.publishedData` (live copy, written only by the publish endpoint), `InfoPage.history` (previous published blobs, cap 10), `Layout.builderData` (single blob, draft/published gated by `Layout.status`). Page metadata (title/slug/status/metaDescription/ogImageId/menuIds) is mirrored into `root.props` for editing and reconciled back to real columns on save; `status` in root.props is never trusted from the client.
- Page resolution/rendering: public pages call `renderInfoPageContent` (`lib/puck/renderInfoPage.tsx`) - published pages render `publishedData` (fallback `builderData`), drafts render `builderData`; an `infoPage` Layout is resolved via `resolveThemeLayout` and the page content is injected into the layout's `ContentSlot` (`renderLayoutWithContent`). Markdown-format pages render sanitised HTML inside the same layout mechanism.
- Layout resolution: `resolveThemeLayout(type, ctx)` picks the highest-scoring published Layout whose `displayConditions.include` matches the render context; exclusions veto. Scores: page_id 100, page_slug 90, homepage/not_found/coming_soon/maintenance 80, module 50, path_prefix 40, entire_site 10; ties broken by `priority` then `updatedAt` ordering.
- Server-side data resolution before render: `resolveTemplateData` deep-clones the blob and injects live values - MenuBlock/SiteHeader get resolved menu trees (`resolveMenu`/`resolveMainMenu`), SiteLogo/Copyright get siteName/logoUrl/year, LoginButton gets isLoggedIn/adminPath.
- Autosave: pages 1.5s debounce → `/autosave`; layouts 1.2s debounce → layout PATCH. Publish flows: pages via `/publish` (history snapshot), layouts via PATCH `status: 'published'` (requires include rules).

### GitHub API Integration

Client resolution (`lib/github/client.ts`): GitHub App installation token (from the `GithubAppConnection` row, private key decrypted with ENCRYPTION_KEY) → `GITHUB_API_TOKEN` PAT → throw "not configured". `getGithubToken()` returns a bearer token for raw fetches; `getAppOctokit()` gives app-level JWT auth.

Octokit endpoints called:

- `repos.listForOrg` - module directory listing (org `cactus-foundation-modules`).
- `repos.getLatestRelease`, `repos.listReleases` - module and core update checks (public vs beta channels); `git.getRef`/`git.getTag` to resolve release tags to commit SHAs.
- `repos.getContent` - read `modules.json`, `.gitmodules` existence, upstream file contents during core sync; raw `raw.githubusercontent.com` fetch (with bearer token) for `cactus.module.json` manifests, guarded by strict `parseGitHubRepo` hostname validation.
- `git.getRef`, `git.getCommit`, `git.createBlob`, `git.createTree`, `git.createCommit`, `git.updateRef` - Git Data API commits: module registry sync (`syncModulesJson`, commit message `chore: sync module registry\n\n[cactus-deploy]`, also deletes a legacy `.gitmodules`) and core updates (`syncCoreFromUpstream`: raw tree-diff of upstream tags - no ancestry assumption - copying changed core files into the admin repo, skipping `modules/`, `.gitmodules`, `modules.json`; optional modules.json pin in the same commit; BadObjectState retry with backoff).
- `apps.getInstallation` - resolve the installation account after install.
- Raw REST (fetch): `POST /app-manifests/{code}/conversions` (App creation), `PUT /app/logo` (logo upload with app JWT).

Credential storage/encryption: the GitHub App's private key, webhook secret, client id/secret are AES-256-GCM encrypted (`lib/crypto/secrets.ts`, format `iv:authTag:ciphertext` hex) with `ENCRYPTION_KEY` and stored in the `GithubAppConnection` table - the stated single exception to "secrets live in env vars". The PAT alternative lives in the `GITHUB_API_TOKEN` env var.

### Media Layer

Provider types (`lib/media/providers.ts`):

- PROXIED (served via the Cloudflare Worker): B2, R2, S3, SPACES, WASABI, MINIO, VERCEL_BLOB, SUPABASE_STORAGE.
- DIRECT (own CDN + URL transforms; Worker never involved): CLOUDINARY, IMAGEKIT.
- The PROXIED/DIRECT distinction is app-code only, never a DB column. `SiteConfig.mediaProvider` selects the active provider for new uploads; each Media row records the provider it actually lives on.

Upload path (`lib/media/upload.ts`): 10 MB cap; JPEG/PNG/WebP/GIF only; sharp decodes the bytes and rejects content/type mismatches. S3-compatible providers use `@aws-sdk/client-s3` with per-provider endpoints; Vercel Blob via `@vercel/blob`; Supabase via `@supabase/storage-js`; Cloudinary/ImageKit via their SDKs (key = public_id / fileId). Object keys: `media/<PROVIDER>/<nanoid>-<filename>.<ext>` (legacy B2 keys have no provider segment).

Cloudflare Worker (`workers/media-worker/index.ts`, excluded from tsconfig, deployed separately via wrangler): GET-only; validates `media/…` keys; infers the provider from the key path (unknown segment = legacy B2); fetches from the matching backend (SigV4-signs S3-compatible requests itself; Vercel Blob via BLOB_BASE_URL; Supabase via service-role REST); passes `?w=&q=` through Cloudflare Image Resizing options; responds with 1-year immutable cache headers and `Access-Control-Allow-Origin: ALLOWED_ORIGIN`.

URL construction/resolution: proxied rows store `<CLOUDFLARE_WORKER_URL>/<key>` as the canonical URL; direct rows store the provider CDN URL. The custom Next image loader (`lib/media/loader.ts`, wired via `next.config.ts images.loaderFile`) branches on hostname: Cloudinary gets `/upload/w_<w>,q_<q>/` inserted, ImageKit gets `?tr=w-…,q-…`, everything else gets `?w=&q=` appended for the Worker.

Migration (`lib/media/migration.ts`): one `MediaMigrationJob` at a time; 15-item batches; per item download original bytes → upload to destination → single-row provider/key/url update → best-effort delete of the original; failed items recorded and skipped by later batches; retry clears the failed list. Batches run only while an admin keeps the Settings → Media screen open (client loop), never via cron.

Provider selection control: `SiteConfig.mediaProvider` (admin Settings → Media, persisted immediately); `isMediaProviderConfigured` requires every env var in `envKeysForProvider(provider)` (proxied providers include CLOUDFLARE_WORKER_URL). Uploads are refused until both hold.

### Email

- Provider chain (`lib/email/index.ts`): Brevo HTTP API when `BREVO_API_KEY` is set, else nodemailer SMTP (`SMTP_HOST/PORT/USER/PASS`); throws when neither is configured. From name/address come from `SiteConfig.emailFromName/emailFromAddress` (fallbacks: siteName / `noreply@example.com`). `SiteConfig.emailProvider` exists as a column but the chain is decided purely by env-var presence.
- Notification types sent by core: login OTP (password login), email verification code (registration), recovery link (recovery request), recovery-requested notice (same trigger), recovery-completed notice (recovery completion), password-changed notice (password add/change).
- Module emails (contact-form): submission notification to the configured/admin address ("full" content or "notify"-only modes, optional CCs, reply-to submitter), auto-reply to the submitter (markdown with `{{name}}`/`{{email}}` placeholders), admin reply email (markdown + signature, reply-to the site address).
- In-app admin notifications (not email) live in the Notification table: "Changes awaiting deployment" (rolling, reasons deduped by label), `core-update`, `module-update:{id}`, `contact-form:messages` (rolling unread count).

### Scripts

- `scripts/build-migrate.mjs` - conditional migration runner for Vercel builds. Skips entirely without DATABASE_URL; swaps Neon pooler URL for the direct endpoint (or DIRECT_URL); sets `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`; resolves one known-bad historical migration record; runs `prisma migrate deploy` then `run-module-migrations.mjs`, each with 3 retries and backoff.
- `scripts/checkout-modules.mjs` - clones every `modules.json` entry into `/modules`, pinned to the recorded `version` tag (`git clone --depth=1 --branch`). On Vercel always a fresh clone; locally tries `git checkout HEAD -- .` in the existing clone first (this reverts uncommitted local edits to tracked module files).
- `scripts/generate-module-router.mjs` - scans `modules/*/app/api/**/route.ts` and `modules/*/app/cactus-admin/<name>/**/page.tsx`; writes the gitignored `lib/modules/router.ts` (API dispatch table + lazy page loaders). For any module declaring `publicBasePath` in its manifest, also scans `modules/<name>/app/public/<base>/**/{page.tsx,route.ts}` and emits `resolveModulePublicPage`, `dispatchModulePublicRoute`, `getModulePublicBases`, and (if `modules/<name>/lib/sitemap.ts` exists, exporting `getPublicSitemapEntries(siteUrl)`) wires it into `collectModuleSitemapEntries`; fails the build if two modules declare the same `publicBasePath`. Runs on every dev start and build.
- `scripts/generate-module-puck.mjs` - collects `puckBlocks` from every module manifest; writes the gitignored `lib/puck/module-components.ts` (client + RSC component maps).
- `scripts/generate-module-cron.mjs` - collects `cronJobs` from every module manifest; writes the gitignored `vercel.json` (`{crons: [...]}`).
- `scripts/generate-module-settings-tabs.mjs` - collects `settingsTabs` from every module manifest (`{id, label, permission, import, component}`); writes the gitignored `lib/modules/settings-tabs.ts` (`moduleSettingsTabComponents: Record<id, Component>`). Consumed by `app/cactus-admin/config/ConfigPageClient.tsx` to render module-registered settings tabs generically (id/label/permission list comes from `app/cactus-admin/config/page.tsx`, which permission-filters live from `Module.manifest`, same pattern as `navEntries` in `layout.tsx`).
- `scripts/generate-module-extension-points.mjs` - collects `extensionPoints` from every module manifest (`{point, id, permission, import, component}`); writes the gitignored `lib/modules/extension-points.ts` (`moduleExtensionPointComponents: Record<point, Record<id, Component>>`), grouped by the arbitrary `point` string. Core has no knowledge of any specific point name - a *publishing* module (e.g. `contact-form`) defines its own point names in its own page code and permission-filters live from `Module.manifest` (same pattern as `navEntries`/`settingsTabs`); a *contributing* module (e.g. `contact-form-reply-catcher`) declares entries against that point name in its manifest. See the "Module extension points" section in wiki/Authoring-a-module.md. First core (not module) publisher: `app/cactus-admin/roles/page.tsx` reads `core.roles-page` the same way, letting Gazette contribute its role-assignment UI there.
- `scripts/run-module-migrations.mjs` - build-step-only runner: for modules with status active/deploying/update_available, applies unapplied `modules/<name>/migrations/*.sql` files in lexicographic order, each in a transaction, recording name+checksum in `ModuleMigration`.
- `scripts/sync-module-manifests.mjs` - build-step-only: rewrites `Module.manifest` from each deployed module's `cactus.module.json` so nav entries/teardown stay in step with shipped code. Skips without DATABASE_URL.
- `scripts/sync-wiki.mjs` - `npm run sync-wiki`: pulls all `.md` files from the GitHub wiki repo (`WIKI_SOURCE_REPO` or GITHUB_REPO + `.wiki`) into `/wiki` via the API.
- `scripts/dev-warm.sh` - `npm run dev:warm`: kills anything on the port, clears `.next`, starts `next dev --webpack` (webpack chosen over Turbopack to avoid an HMR chunk-hash reload cascade), and pre-warms `/`, `/home`, `/logged-out`, `/setup`, `/style-guide`, `/privacy-policy` in the background.

Build-time order (from `package.json` `build`): checkout-modules → prisma generate → build-migrate → sync-module-manifests → generate-module-router → generate-module-puck → generate-module-cron → generate-module-settings-tabs → generate-module-extension-points → next build. Dev (`npm run dev`) runs the five generators then `next dev --webpack`.

### Build and Deploy

- Build steps in order: see Scripts above. `npm run build` is the single entry; Vercel runs it on every push.
- Prisma migrations run only inside the Vercel build step (`build-migrate.mjs` → `prisma migrate deploy`), never at runtime; the advisory lock is disabled because Vercel serialises builds and Neon cold starts exceed the lock timeout. One migration file exists, edited in place for schema changes (fresh-install platform, no live sites).
- `prisma db push` is blocked (`npm run db:push` exits 1 with a message).
- Vercel-specific: `vercel.json` is generated (cron entries only) and gitignored; deployments are auto-triggered by pushes to `main`; env-var-only changes use the redeploy API (`POST /v13/deployments?forceNew=1` based on the latest production deployment); module/core changes deploy via Git Data API commits (registry sync / core sync) whose push triggers the build; the redeploy gate (`pendingRedeployId` sentinel → real id → cleared on READY / webhook / dismiss / 4-minute server timeout) traps admin sessions on the redeploying screen meanwhile. Deployment status arrives via webhook (Pro) or lazy polling (`getLatestDeploymentStatus`, Hobby).
- jsdom is pinned to `^26` (jsdom 29 breaks the Vercel serverless update check with ERR_REQUIRE_ESM).
- Tester repo relationship: `usersaynoso/Cactus-Foundation-Tester` is a downstream install of this platform used for live testing; local `.env.local` points at the same Neon database as the live Tester site. Pushes to the Tester repo use the identity `Chris Taylor-Guest <airings.snug-0m@icloud.com>` and version-prefixed commit titles; core code reaches it via the in-app core-update sync (blob-level tree diff of core files vs the matching upstream tag, skipping `modules/`, `.gitmodules`, `modules.json`).
- Release flow (per CLAUDE.md): patch-only version bumps, tag format `vX.Y.Z`, GitHub release created immediately after every push.

### Slash Commands

None. `.claude/commands/` does not exist. `.claude/` contains only `settings.json` (permission allowlist + `caveman@caveman` plugin enablement) and runtime state files. Available slash commands come from installed plugins, not this repo.

### Utilities and Lib

`lib/` root:

- `deploy-log-translator.ts` - `translateLogLine(raw)`: maps Vercel build-log lines to friendly British-humour status messages (null = drop the line). Final line marker: "Bish bash bosh. You're live."
- `deploy-log-translator.test.ts` - vitest unit tests for the translator (run via `npm test`; no vitest config file exists).
- `markdown-client.ts` - browser-only markdown → sanitised HTML (marked + DOMPurify on `window`); identical allow-list to the server renderer.
- `sanitize.ts` - server/browser markdown → sanitised HTML; lazy-requires jsdom on the server; strips raw angle brackets pre-parse; also `markdownToPlainText`.
- `sanitize-config.ts` - shared `ALLOWED_TAGS`/`ALLOWED_ATTR` constants for both renderers.
- `utils.ts` - `generateSlug`, `generateId` (nanoid), `parsePaginationParams` (page/perPage/skip, perPage ≤ 100), `errorResponse`, `successResponse`, `truncate`, `formatInTimezone`.

`lib/auth/`:

- `session.ts` - session + trusted-device create/validate/delete, cookie helpers, `listUserSessions`, `revokeSessionById`, `safeCompare` (timing-safe).
- `passkey.ts` - WebAuthn registration/authentication challenge creation and verification, `savePasskey`, `labelFromUserAgent`.
- `password.ts` - bcrypt hash/verify, strength check, Pwned Passwords check, `validateNewPassword`.
- `email-challenge.ts` - 6-digit OTP create/verify (10-min TTL, 5 attempts, hash compare).
- `rate-limit.ts` - action limits table, `getClientIp`, `checkRateLimit`/`recordAttempt`, atomic `checkAndRecord` (raw INSERT … ON CONFLICT).
- `recovery.ts` - recovery token create/validate/consume (30-min TTL, single-use).
- `totp.ts` - secret generation, otpauth URI, QR data URL, `verifyTotpCode` with replay step guard.
- `turnstile.ts` - `verifyTurnstile` (fail-open unconfigured, fail-closed on error when configured).

`lib/config/`:

- `env.ts` - `isLocalMode`, `getEnvStatus` (single source of truth for the setup env-check and dashboard), `requiredEnvMissing`, `isEmailConfigured`, `isMediaProviderConfigured`, `getActiveMediaProvider`, `isMediaConfigured`, `configuredProxiedProviders`, `isGitHubConfigured`, `getGitHubConfigStatus`, `isVercelConfigured`, `isNeonConfigured`, `isEdgeConfigWritable`, `isTurnstileConfigured`, `getSiteUrl(+OrNull)`, `getWebAuthnRpId/Origin`, `getSessionSecret`.
- `site.ts` - 5-second in-memory caches for adminPath/status/pendingRedeployId (with the 4-minute redeploy auto-release), `invalidateSiteConfigCache`, `isSetupComplete`, the path/username BLOCKLIST, `isBlocklisted`, `generateSuggestedAdminPath`.
- `edge-config.ts` - Edge Config reads (`adminPath`, `siteStatus`) via `@vercel/edge-config`; `syncToEdgeConfig` writes via the Vercel REST API.
- `neon-regions.ts` - the 8 selectable Neon regions.

`lib/consent/`: `types.ts` (ConsentCategory/BannerConfig/Decision/CookiePayload + `DEFAULT_CONSENT_BANNER_CONFIG`), `gate.ts` (client: `hasConsent`, `onConsentChange`, `loadIfConsented`, `notifyConsentChange`; backs `window.cactusConsent`).

`lib/crypto/secrets.ts` - AES-256-GCM `encryptSecret`/`decryptSecret` using ENCRYPTION_KEY; format `iv:authTag:ciphertext` (hex).

`lib/db/prisma.ts` - global-singleton PrismaClient (query logging in development).

`lib/deploy/`: `reconcile.ts` (`markModulesDeploySucceeded` - promotes pendingVersion, clears alerts; `markModulesDeployFailed` - reverts to update_available or failed), `redeploy.ts` (`startDeferredRedeploy` - arms the redeploy gate synchronously, then in `after()` syncs modules.json or falls back to an env-var redeploy, and polls Vercel for the new deployment id).

`lib/design/tokens.ts` - `DesignTokens` v2 type, `DEFAULT_DESIGN_TOKENS`, `COLOUR_PRESETS`, `buildTokenStyles` (tokens → CSS custom properties for the public site), `buildAdminThemeStyles` (primary-colour family + `--font-sans` only, for admin white-labelling), `buildFontHref` (Google Fonts URL for non-system fonts).

`lib/email/index.ts` - see Email section.

`lib/github/client.ts` - see GitHub API Integration.

`lib/layout/`: `displayConditions.ts` (rule types, match + specificity scoring), `resolveThemeLayout.ts` (best published layout for a type/context).

`lib/media/`: `providers.ts`, `loader.ts`, `upload.ts` (also `downloadMedia`, `deleteMedia`, `saveMediaRecord`, `getMediaReferences`), `migration.ts` - see Media Layer.

`lib/menu/resolve.ts` - `resolveMenu` (published-page filtering, nested tree build), `resolveMainMenu`.

`lib/modules/`: `manifest.ts` (zod schemas for `cactus.module.json` and `cactus.theme.json`, `parseGitHubRepo` strict URL validation, `fetchManifestFromRepo`, `validateTablePrefixUnique`), `github.ts` (`getLatestRelease` by channel, `syncModulesJson`, `getLatestDeploymentStatus`), `updates.ts` (`findModuleUpdates` - pure detection), `router.ts` (AUTO-GENERATED, gitignored - API dispatch + page loaders for installed modules).

`lib/notifications/`: `alerts.ts` (`upsertAlert` keyed by dedupeKey - re-surfaces on title change; `clearAlert`; `recordCoreUpdate`; `recordModuleUpdate`), `deployment.ts` (`recordDeploymentNeeded` rolling reasons list, `getUnreadCount`, `labelForEnvKeys`).

`lib/permissions/check.ts` - see Permissions System.

`lib/privacy/template.ts` - privacy-policy generator: `WizardAnswers` type, `DATA_COLLECTED_OPTIONS`, `PURPOSE_OPTIONS`, `DISCLAIMER_TEXT`, `assemblePolicyMarkdown` (jurisdiction-aware GDPR/CCPA sections).

`lib/puck/`: `config.tsx` (all block definitions + per-context configs; TipTap HTML conversion for RSC richtext), `module-components.ts` (AUTO-GENERATED, gitignored), `resolveTemplateData.ts`, `renderInfoPage.tsx` (`resolveContentData`, `renderInfoPageContent`), `renderLayoutWithContent.tsx` (injects page content into a layout's ContentSlot), `MediaPickerField.tsx` (`OgImagePickerField`, `ImageUrlPickerField` - media-library modal fields), `MenuCheckboxField.tsx`, `MenuSelectField.tsx`, `MenuBlockEditorPreview.tsx` (editor-side MenuBlock preview with live menu fetch), `SiteColourField.tsx` (palette swatch picker), `components/AosInit.tsx` (AOS init client component), `components/MenuBlockClient.tsx` (public interactive menu: dropdowns, mobile hamburger), `components/SiteLogoClient.tsx` (logo/site-name link with hover state).

`lib/setup/`: `starterLayouts.ts` (`refreshStarterLayouts` - upserts ~23 starter Layouts by fixed ids across header ×9 / footer ×4 / infoPage ×4 / notFound ×3 / statusPage ×3, `isStarter: true`, published with display conditions), `stylesInfoPage.ts` (`upsertStylesInfoPage` - seeds the draft `style-guide` page; `STYLES_PAGE_SLUG`/`TITLE`).

`lib/updates/core.ts` - `compareVersions`, `getCoreUpdateStatus` (channel-aware, cached 10 min / errors 30 s, aggregates release notes for all newer releases), `syncCoreFromUpstream` (see GitHub API Integration), `invalidateCoreUpdateCache`.

`lib/vercel/`: `deploy.ts` (`triggerVercelRedeploy` - redeploy latest production deployment), `env.ts` (list/upsert/delete project env vars; sensitive-key typing - sensitive vars skip the `development` target; `SENSITIVE_KEYS` set).

### Components

Admin (`components/admin/`):

- `AdminShell.tsx` - sidebar shell: mobile drawer, collapsible rail (persisted in localStorage, auto-collapse inside Puck editors), toolbar (collapse toggle, ThemeToggle, NotificationBell), wraps children in `AdminPathProvider`. Props: adminPath, userRole, siteName, version, moduleNavEntries, unreadCount, children.
- `AdminNav.tsx` - nav sections + inline SVG icons, module nav entries (manifest-supplied SVG innerHTML or fallback icon), account/sign-out/version footer. Props: adminPath, userRole, version, collapsed, onNavClick, moduleNavEntries. Section labels (core + module groups) are buttons that toggle that section's collapsed state, persisted per-label in `localStorage` (`cactus-sidebar-sections-collapsed`); defaults to maximised.
- `AdminPathContext.tsx` - React context (default `cactus-admin`); `useAdminPath()`.
- `NotificationBell.tsx` - bell + unread badge, portal dropdown listing notifications with view/redeploy/read-toggle/delete actions (same handlers as the notifications page). Props: adminPath, unreadCount, collapsed.
- `DeployLogViewer.tsx` - renders translated deploy-log messages (via `translateLogLine`), deduped, last 8 visible, `onComplete` on the final line. Props: rawLines, onComplete, onError.
- `UnsavedChangesModal.tsx` - cancel/discard/save-and-leave dialog. Props: pendingHref, saving, message, onCancel, onDiscard, onSave?.
- `useUnsavedChanges.ts` - hook: `dirtyRef` + beforeunload warning + in-app link interception → `pendingHref`.
- `TabStrip.tsx` - shared underline-style horizontal tab bar (flush edges, no side gaps); scrolls with edge fade + click arrow overlay when tabs overflow. Items render as `<Link>` (if `href`) or `<button>` (if `onClick`). Props: items (key, label, href?, onClick?, active), trailing?, style?. Used by Settings, Appearance→Styles, Layouts, and by Gazette/Boards/Contact-form module nav and list tabs.

Public/shared:

- `components/ThemeToggle.tsx` - light/auto/dark three-way toggle (`compact`, `collapsed` cycle-button variants); persists `cactus-theme`, applies `data-theme`, follows system in auto.
- `components/consent/ConsentBanner.tsx` - GDPR banner (bottom-bar or modal): accept-all / reject-all / manage-per-category / notice-only dismiss; writes the `cactus-consent` cookie (versioned payload) + `cactus-consent-id`; POSTs `/api/consent`; re-prompts on categoriesVersion bump or reConsentDays expiry; registers `window.cactusConsent`. Props: config, privacyPolicyUrl.

Route-colocated client components (listed with their routes above): `PagesTable`, `PuckEditor`, `LayoutPuckEditor`, `DisplayConditionsPanel`, `MediaUpload`, `MediaDelete`, `NotificationActions`, `UserActions`, `RolesClient`.

### Types

No standalone `types/` directory or `.d.ts` files beyond `next-env.d.ts` (generated). Types are colocated:

- `lib/auth/session.ts` - `SessionUser` (User & {role}).
- `lib/config/env.ts` - `EnvVarStatus`, `GitHubConfigStatus`.
- `lib/consent/types.ts` - `ConsentCategory`, `ConsentBannerConfig`, `ConsentDecision`, `ConsentCookiePayload`.
- `lib/design/tokens.ts` - `DesignTokens`, `GlobalColour`, `GlobalFont`, `Typo`, `ColourPreset`.
- `lib/layout/displayConditions.ts` - `ConditionType`, `ConditionRule`, `DisplayConditions`, `RenderContext`.
- `lib/media/providers.ts` - `ProviderKind`, `ProviderEnvVar`; `lib/media/upload.ts` - `UploadResult`; `lib/media/migration.ts` - `FailedItem`, `BatchResult`.
- `lib/modules/manifest.ts` - `ModuleManifest`, `ThemeManifest` (zod-inferred).
- `lib/updates/core.ts` - `CoreUpdateStatus`, `SyncResult`, `ModuleRegistryEntry`; `lib/modules/updates.ts` - `ModuleUpdateInfo`.
- `lib/menu/resolve.ts` - `PublicMenuItem`.
- `lib/puck/config.tsx` - `PuckConfig`.
- `app/api/setup/env-check/route.ts` - `DatabaseState` (imported by the setup wizard).
- `workers/media-worker/index.ts` - `Env` (Worker bindings).
- Module types: `modules/contact-form/lib/types.ts`, `modules/contact-form-reply-catcher/lib/types.ts` (listed under Modules).

### Configuration Files

- `package.json` - name `cactus`, version 0.5.179, private; Node `22.x`; npm override `uuid ^11`. Scripts: dev, dev:warm, build, start, lint, typecheck, test(/watch), db:migrate/studio/generate/status, db:push (blocked), sync-wiki. Key deps: next ^16, react 19, @prisma/client 6, @puckeditor/core ^0.22, @simplewebauthn 13, @octokit/rest 21 + auth-app 8, AWS SDK S3, cloudinary, @imagekit/nodejs, @supabase/storage-js, @vercel/blob, @vercel/edge-config, aos, bcryptjs, dompurify + jsdom (pinned ^26), imapflow, mailparser, email-reply-parser, marked, nanoid, nodemailer, otpauth, pg, qrcode, sharp, zod, date-fns(-tz). Dev: vitest 2, eslint 9 + eslint-config-next 16, typescript 5.6, prisma 6.
- `next.config.ts` - injects `NEXT_PUBLIC_APP_VERSION` + `NEXT_TELEMETRY_DISABLED`; image remotePatterns (Worker hostname from env, cloudinary, imagekit); custom image loader file; production-only CORS header for `/_next/static/*`; security headers deliberately not here (proxy.ts).
- `proxy.ts` - see Middleware.
- `tsconfig.json` - strict, `noUncheckedIndexedAccess`, `noImplicitOverride`, bundler resolution, path alias `@/*` → `./*`; excludes `workers/media-worker`.
- `eslint.config.mjs` - flat config, `eslint-config-next/core-web-vitals`; ignores `lib/modules/**`, `lib/puck/module-components.ts`, `.next`, `node_modules`, `.claude`.
- `prisma/schema.prisma` - see Database Schema. `prisma/migrations/20260626000000_init/migration.sql` is the single init migration, edited in place.
- `vercel.json` - AUTO-GENERATED by `generate-module-cron.mjs`, gitignored. Current content: one cron - `/api/m/contact-form-reply-catcher/cron/poll` at `0 6 * * *`.
- `lib/modules/settings-tabs.ts` - AUTO-GENERATED by `generate-module-settings-tabs.mjs`, gitignored (covered by the `lib/modules/**` eslint ignore). Current content: one tab - `contact-form-reply-catcher`.
- `lib/modules/extension-points.ts` - AUTO-GENERATED by `generate-module-extension-points.mjs`, gitignored (covered by the `lib/modules/**` eslint ignore). Current content: three entries - `contact-form-reply-catcher` contributing two to `contact-form.inbox-actions` and one to `contact-form.thread-messages`.
- `modules.json` - module registry committed to the repo: `contact-form` pinned to `v0.1.18` at `github.com/cactus-foundation-modules/contact-form`. (`contact-form-reply-catcher` exists on disk but is not in the registry.)
- `.claudeignore` - `.next/`, `node_modules/`, `prisma/migrations/`, `.git/`, `*.log`, `.env*`, `coverage/`, `dist/`, `out/`.
- No tracked `.gitignore` exists. All ignore rules live machine-locally in `.git/info/exclude`: node_modules, .next, env files, PROGRESS.md, tsbuildinfo, next-env.d.ts, .vercel, `/modules/`, `/lib/modules/router.ts`, `/lib/puck/module-components.ts`, `/vercel.json`, `.claude/`, `CLAUDE.md`, `.claudeignore` (CLAUDE.md itself is untracked).
- No `.gitmodules` - modules are build-time clones, not git submodules.
- `.env.example` - annotated reference for every env var (required/optional split, local-mode notes).
- `workers/media-worker/wrangler.toml` - Worker name `cactus-media-worker`, tsc type-check as the build command, secrets via `wrangler secret put`.
- `.claude/settings.json` - Claude Code permission allowlist + `caveman@caveman` plugin.
- `app/globals.css` - 1,719-line design system: primitive palette, semantic CSS variables (`--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`), light/dark via `data-theme`, admin shell/nav/table/card/badge/btn/field classes, setup-shell, theme-toggle, account grid.
- `public/` - favicons (`favicon.ico/svg/-96x96.png`), `apple-touch-icon.png`, web-app manifest icons, `site.webmanifest`, `cactus.svg`.
- Root docs (untracked working notes aside): `README.md` (project readme), `PROGRESS.md` (build-phase tracker, gitignored), `cactus-design-system.md` + `cactus-design-system-visual.html` (admin design-language reference), `CLAUDE.md` (agent instructions, untracked).
- `BOARDS_SPEC.md` - full implementation spec for the planned Boards forum module (`brd_` prefix, `boards.*` permissions, publicBasePath `boards`); spec only, nothing implemented. Its final section lists protected items awaiting Chris's sign-off: core per-user notifications (see below) and the Tiptap/editor dependency question.
- `NOTIFICATIONS_SPEC.md` - DRAFT spec for extending the admin-only Notification system to per-user notifications (new `UserNotification`/`UserNotificationPrefs` models, member bell, shared `lib/notifications/user.ts` writer, digest cron). Review required before any implementation; touches core schema.
- No vitest config file; vitest runs on defaults (single test file: `lib/deploy-log-translator.test.ts`).

---

## Modules

Modules live in `/modules` (gitignored), cloned at build time by `scripts/checkout-modules.mjs` from the tags pinned in `modules.json`. Wiring into core is exclusively via the generated files (router, puck components, cron, settings tabs, extension points). Four modules are present on disk.

### Contact Form

- Slug: `contact-form` (table prefix `cf_`), repo `github.com/cactus-foundation-modules/contact-form`, manifest version 0.1.21 (registry pin v0.1.18).
- A contact form placed on any page or layout through the Puck builder, configured per-block. Submissions land in an admin inbox with read/archive state, a markdown reply composer with per-admin signatures, notification and auto-reply emails, Turnstile and per-block rate limiting, GDPR consent capture, per-block retention, and CSV export.

**Database**
Table prefix: `cf_`

- `cf_contact_submissions` - `id` (text PK, gen_random_uuid), `created_at`, `updated_at`, `name`, `email`, `phone?`, `company?`, `subject?`, `message`, `ip_address?`, `user_agent?`, `gdpr_consent` (bool, default false), `status` (text: unread | read | archived, default unread), `source_type?` (page | layout), `source_id?`, `source_block_id?` (Puck block id), `source_label?`. Indexes: status, created_at, email, (ip_address, created_at), source_block_id.
- `cf_contact_submission_replies` - `id`, `created_at`, `submission_id` FK → cf_contact_submissions (cascade), `sent_by_id` FK → core `User` (restrict), `body`, `signature_snapshot?`. Index: submission_id.
- `cf_user_profiles` - `id`, `created_at`, `updated_at`, `user_id` FK → core `User` (cascade, unique), `signature?`. One row per admin, created on first signature save.

**Permissions**

- `contact.view` - inbox pages, submission list/read/status changes.
- `contact.reply` - posting replies.
- `contact.delete` - deleting submissions (single + bulk).
- `contact.export` - CSV export.

**API Routes** (all served through `/api/m/contact-form/…` via the generated router)

- `POST /api/m/contact-form/contact/submit` - public submission endpoint. Re-derives the form config server-side from the saved Puck data (page by path/homepage, else all layouts, matching block type+id); Turnstile when enabled+configured; per-block IP rate limit; field validation per config; HTML-stripping sanitisation; stores the submission with source tracking; syncs the rolling unread notification; fires notification + optional auto-reply emails.
- `GET /api/m/contact-form/admin/submissions` - paginated list, status filter (`contact.view`).
- `PATCH /api/m/contact-form/admin/submissions` - bulk status change (`contact.view`) or bulk delete (`contact.delete`).
- `GET/PATCH/DELETE /api/m/contact-form/admin/submissions/[id]` - read (auto-marks unread→read), status patch, delete.
- `POST /api/m/contact-form/admin/submissions/[id]/reply` - stores the reply with a signature snapshot, marks read, sends the reply email (`contact.reply`).
- `GET /api/m/contact-form/admin/export` - CSV download, optional status filter (`contact.export`).
- `GET/PATCH /api/m/contact-form/admin/signature` - per-admin signature read/save (session only).
- `GET /api/m/contact-form/cron/retention` - Vercel cron target; requires `Authorization: Bearer $CRON_SECRET`; runs `runRetentionPolicy()`; returns `{ok: true, deleted: N}`.

Admin pages (served through `/cactus-admin/m/contact-form/…`): `inbox` (list, tabs, bulk actions - `SubmissionList.tsx`), `inbox/[id]` (detail + reply thread incl. caught replies + `ReplyComposer` markdown editor), `my-signature` (markdown signature editor).

Both `inbox` and `inbox/[id]` publish extension points other modules can contribute to (permission-filtered live from `Module.manifest`, resolved via the generated `lib/modules/extension-points.ts`, see `scripts/generate-module-extension-points.mjs` above): `contact-form.inbox-actions` (button row on `inbox`, left of "Edit My Signature", receives `{adminPath}`), `contact-form.submission-detail` (component block on `inbox/[id]`, rendered after the merged Replies thread and before the reply composer, receives `{submissionId}`; currently no consumers), and `contact-form.thread-messages` (data contract, not a component - contributing modules export an async `(submissionId) => Promise<ThreadMessageContribution[]>`, `{id, createdAt, senderLabel, body, badge?}` per `modules/contact-form/lib/types.ts`; core merges the results with the submission's own replies by `createdAt` into one chronological "Replies" list, giving any message with a truthy `badge` a muted `--color-bg-subtle`/`--color-border-strong` card instead of the default `--color-accent` border - `badge` is not rendered as visible text, it's purely the style trigger). `contact-form.inbox-actions` and `contact-form.thread-messages` are currently consumed only by `contact-form-reply-catcher` (Caught Replies button + inline caught-reply timeline entries, muted card colour, no visible label).

**Puck Blocks**

- `ContactForm` (client `contactFormPuckComponent`, RSC `contactFormPuckRscComponent` from `components/puck/ContactFormBlock.tsx`). Props: formTitle, introText, submitLabel, padding; showPhone/showCompany/showSubject + require* (yes/no strings), nameValidationMode (first_only | both); notificationEmail, emailNotifyMode (full | notify | off), ccEmails (newline list), autoReplyEnabled, autoReplyBody (markdown); turnstileEnabled, rateLimitEnabled, rateLimitMaxAttempts (default 3), rateLimitWindowMin (default 10); gdprConsentEnabled, gdprConsentLabel; retentionDays (0 = never); successMessage. `resolveFields` swaps the field set for a "email not configured" notice and disables the Turnstile toggle when unconfigured. Renders the public form (`ContactFormClient.tsx`) posting to the submit endpoint.

**Configuration**
Stored entirely in the Puck block's props (per form instance) inside the owning page/layout `builderData`; converted server-side by `blockPropsToConfig`. No module-global settings and no settings rows in the database.

**External Integrations**
Core email (Brevo/SMTP) for notification, auto-reply, and reply emails; Cloudflare Turnstile via core config. No credentials of its own.

**Cron Jobs**

- `0 3 * * *` (daily 03:00, clear of the reply-catcher poll at 06:00) → `/api/m/contact-form/cron/retention`; registered via `cronJobs` in `cactus.module.json`, emitted into the generated `vercel.json`. Calls `runRetentionPolicy()` (`lib/retention.ts`), which prunes `cf_contact_submissions` past each Puck block's `retentionDays` setting.

**Scripts**
None.

**Known Limitations**

- `requiredEnvVars` is empty: the form block degrades in the editor when email is unconfigured, but submissions still store even if notification emails fail.
- README's install instructions (git submodule, "Admin > Contact > Settings") describe an older mechanism; installation actually flows through the Cactus Modules admin and `modules.json`, and there is no settings page.

### Contact Form Reply Catcher

- Slug: `contact-form-reply-catcher` (table prefix `rc_`), manifest version 0.1.0. Not in `modules.json` (present on disk only; not part of the shipped registry).
- Polls the site admin's real mailbox (plain IMAP or Outlook OAuth) and threads submitter replies - and the admin's own personally-sent replies - back into the contact-form inbox, so conversations continued over ordinary email stay visible in Cactus. Read-only against the mailbox: never marks read, moves, or deletes.

**Database**
Table prefix: `rc_`

- `rc_mailbox_config` - singleton (`id = 'singleton'`): `provider` (imap | outlook_oauth, checked), `imap_host?`, `imap_port` (default 993), `imap_username?`, `imap_password_encrypted?`, `oauth_client_id_encrypted?`, `oauth_client_secret_encrypted?`, `oauth_access_token_encrypted?`, `oauth_refresh_token_encrypted?`, `oauth_token_expires_at?`, `inbox_folder?` / `sent_folder?` (null = auto-detect), `last_poll_at?`, `last_poll_status?` (ok | error), `last_poll_error?`, timestamps.
- `rc_processed_messages` - dedupe ledger: `id`, `imap_uid`, `imap_folder`, `message_id_header?`, `matched_submission_id?`, `processed_at`. Unique (imap_folder, imap_uid); index on message_id_header.
- `rc_caught_replies` - `id`, `created_at`, `submission_id` FK → `cf_contact_submissions` (cascade; one-way pointer, contact-form's schema untouched), `body`, `sender_type` (submitter | admin, checked), `external_email?`. Index: submission_id.

**Permissions**

- `replycatcher.manage` - settings tab/API, OAuth flow, check-now, caught-replies inbox pages.

**API Routes** (via `/api/m/contact-form-reply-catcher/…`)

- `GET /api/m/contact-form-reply-catcher/cron/poll` - Vercel cron target; requires `Authorization: Bearer $CRON_SECRET`; runs `pollMailbox()`.
- `POST /api/m/contact-form-reply-catcher/admin/check-now` - manual poll (`replycatcher.manage`), 60-second cooldown.
- `GET/PATCH /api/m/contact-form-reply-catcher/admin/settings` - mailbox config; secrets returned only as booleans; PATCH requires ENCRYPTION_KEY and encrypts IMAP password / OAuth client credentials at rest.
- `GET /api/m/contact-form-reply-catcher/admin/oauth/microsoft/start` - builds the Microsoft authorize URL (scope `offline_access` + `IMAP.AccessAsUser.All`), state cookie `cactus_rc_oauth_state` (10 min).
- `GET /api/m/contact-form-reply-catcher/admin/oauth/microsoft/callback` - state check, code→token exchange, stores encrypted token pair, redirects to `/<adminPath>/config?tab=contact-form-reply-catcher` with `oauth=connected|error`.

Settings live as a tab on core `/cactus-admin/config` (id `contact-form-reply-catcher`, registered via manifest `settingsTabs`, component `modules/contact-form-reply-catcher/components/SettingsTab.tsx`) rather than a standalone admin page - provider choice, IMAP/Outlook credentials, folder overrides, last-poll status, check-now, OAuth connect. Admin pages: `inbox` + `inbox/[id]` (own "Caught Replies" list + merged per-submission timeline, unchanged) only; `navEntries` is empty - no sidebar link at all any more.

Discoverability instead runs through three `extensionPoints` entries registered in `cactus.module.json` (see `scripts/generate-module-extension-points.mjs` above), all gated on `replycatcher.manage`: `contact-form.inbox-actions` → `components/CaughtRepliesButton.tsx` (a "Caught Replies" button on the core contact-form inbox list, left of "Edit My Signature", linking to this module's own `inbox` page) and `components/FetchLatestRepliesButton.tsx`; and `contact-form.thread-messages` → `lib/thread-messages.ts` (`getCaughtReplyThreadMessages`, an async function - not a component - querying `listCaughtRepliesBySubmission` and mapping to `ThreadMessageContribution[]`, `senderLabel` "You (caught from your mailbox)" for admin-sourced catches else the submitter's external email, `badge: 'Caught'` - used only to trigger the muted card styling on the core thread, not rendered as visible text). Core merges these by `createdAt` with contact-form's own replies into one chronological thread; no more separate "Caught replies" block/header (former `components/CaughtRepliesPanel.tsx`, removed).

**Puck Blocks**
None.

**Configuration**
Global, in the `rc_mailbox_config` singleton row (see Database). Secrets encrypted with core `ENCRYPTION_KEY`. Keys as columns above; defaults: `imap_port` 993, folders auto-detected (INBOX + SPECIAL-USE `\Sent`, falling back to common sent-folder names).

**External Integrations**

- IMAP mailboxes via `imapflow` (TLS, app-password auth) - any provider.
- Microsoft Outlook via user-supplied Azure app (client id/secret entered in settings): OAuth2 authorization-code + refresh flow against `login.microsoftonline.com`, XOAUTH2 IMAP to `outlook.office365.com:993`; access token auto-refreshed when within 5 minutes of expiry.
- Message parsing: `mailparser` (bodies) + `email-reply-parser` (quoted-text stripping).

**Cron Jobs**

- `0 6 * * *` (daily 06:00) → `/api/m/contact-form-reply-catcher/cron/poll`; registered via `cronJobs` in `cactus.module.json`, emitted into the generated `vercel.json`. Poll walks Inbox (sender = submitter) and Sent (sender = admin, only when genuinely from the configured address), first run limited to a 30-day lookback, then UID-incremental; matches by sender/recipient email against recent `cf_contact_submissions` preferring subject overlap; matched submitter replies mark the submission unread.

**Scripts**
None.

**Known Limitations**

- Matching is a documented best-effort heuristic (no Message-ID threading, because contact-form's schema is never touched); a genuinely new email from an address with no recent submission does not match.
- Requires `ENCRYPTION_KEY` (declared required) and `CRON_SECRET` (declared optional, but the cron endpoint returns 503 without it - only manual check-now works then).
- Hard-depends on `contact-form` ≥ 0.1.0 (enforced at install/uninstall by core).
- Vercel Hobby plan caps crons at one invocation per day, so the daily schedule is the effective floor there.

### Gazette

- Slug: `gazette` (table prefix `gz_`), repo `github.com/cactus-foundation-modules/gazette`, manifest version 0.1.0. Not in `modules.json` (present on disk only; not part of the shipped registry).
- Writing-first blog/news module: Posts with Tags, Series, comments, reactions, view counts, an RSS feed, a WordPress/Medium/Substack importer, and a Puck-based body palette (five prose-focused blocks) separate from the page-builder palette. First consumer of the new core `publicBasePath` mechanism (`publicBasePath: "gazette"` → `/gazette/*`).

**Database**
Table prefix: `gz_`

- `gz_posts` - `id`, `title`, `slug` (unique), `excerpt?`, `status` (DRAFT | PUBLISHED | SCHEDULED, checked, default DRAFT), `published_at?`, `scheduled_for?`, `featured_image_id?` (Media.id, no FK), `author_id?` FK → core `User` (set null), `imported_author_name?`, `seo_title?`, `seo_description?`, `canonical_url?`, `builder_data?` (JSONB, Puck Data), `is_pinned` (default false), `is_private` (default false), `view_count` (default 0), `series_id?` FK → gz_series (set null), `series_order?`, `preview_token_hash?`, `preview_token_expires_at?`, timestamps. Indexes: (status, published_at desc), scheduled_for, author_id, (series_id, series_order), is_pinned (partial), preview_token_hash.
- `gz_series` - `id`, `title`, `slug` (unique), `description?`, timestamps.
- `gz_tags` - `id`, `name`, `slug` (unique), `created_at`. `gz_post_tags` - (post_id, tag_id) join, cascade both ways.
- `gz_author_profiles` - `id`, `user_id` FK → core `User` (cascade, unique), `bio?` (markdown), `avatar_id?`, timestamps.
- `gz_comments` - `id`, `post_id` FK → gz_posts (cascade), `parent_id?` FK → self (cascade, one level enforced in app code), `author_name`, `author_email`, `author_user_id?` FK → core `User` (set null, set when an editor replies from the admin), `body`, `status` (PENDING | APPROVED | REJECTED, checked, default PENDING), `ip_address?`, timestamps. Indexes: (post_id, status), (status, created_at desc), parent_id, (ip_address, created_at).
- `gz_reactions` - `id`, `post_id` FK → gz_posts (cascade), `emoji`, `visitor_token`, `created_at`. Unique (post_id, emoji, visitor_token).
- `gz_post_views` - `id`, `post_id` FK → gz_posts (cascade), `visitor_token`, `viewed_at`. Unique (post_id, visitor_token) - dedup gate for the view-count increment.
- `gz_settings` - singleton (`id = 'singleton'`): `posts_per_page` (default 10), `rss_enabled` (default true), `feed_title?`, `feed_description?`, `comments_enabled` (default true), `comments_visibility` (PUBLIC | MEMBERS_ONLY, checked, default PUBLIC), `comment_moderation` (PRE | POST, checked, default PRE), `comments_threaded` (default true), `reactions_enabled` (default true), `reaction_set?` (JSONB array; null falls back to code default `['👍','❤️','🔥','💡']`), `show_view_counts` (default false), `updated_at`.
- `gz_user_roles` - `user_id` PK FK → core `User` (cascade), `role` (GAZETTE_CONTRIBUTOR | GAZETTE_AUTHOR | GAZETTE_EDITOR, checked), `assigned_by?`, `created_at`. One row per user.
- `gz_post_templates` - `id`, `title`, `builder_data?` (JSONB), timestamps.

**Permissions**

- `gazette.access` - the only manifest-declared permission; gates all six Gazette admin sidebar links (Posts/Tags/Series/Authors/Comments/Templates). Unlike every other module, these render under their own `admin-nav-section-label` ("Gazette", via manifest `navGroupLabel`) rather than the shared "Modules" bucket - see `app/cactus-admin/layout.tsx` note above. Page-level access is independently governed by `gz_user_roles` (see below) - a user can have `gazette.access` with no Gazette role (sees a "no permission" alert) or a Gazette role with no `gazette.access` (can still deep-link to admin pages, just has no sidebar link).

**Gazette roles** (module-level, not core `Role` rows - a core `User` has exactly one core role but can additionally hold at most one Gazette role via `gz_user_roles`)

- `GAZETTE_CONTRIBUTOR` - write/edit own posts while DRAFT only; cannot publish.
- `GAZETTE_AUTHOR` - write/edit/publish own posts.
- `GAZETTE_EDITOR` - edit/publish anyone's posts; manage tags, series, comments, templates, settings.
- Core admins (`isAdmin`) always pass every Gazette permission check regardless of role.
- **Role assignment is core-admin only** (`isAdmin`, not `isGazetteEditor`) - `/admin/roles*` endpoints remain gated on `isAdminUser`. There is no standalone Gazette Roles page any more: assignment now lives on core `/cactus-admin/roles` as a `GazetteRolesSection.tsx` card (self-fetches `GET /api/m/gazette/admin/roles`, 403s render nothing), contributed via the `core.roles-page` extension point (see extension-points generator note above). Reaching `/cactus-admin/roles` at all already requires `roles.manage`, which only admin-equivalent roles hold, so the section is never shown to a plain Gazette editor.

**API Routes** (all served through `/api/m/gazette/…` via the generated router)

Admin (`/api/m/gazette/admin/…`, session + `gz_user_roles`/`isAdmin` gated per-route):
- `GET/POST /posts`, `GET/PATCH/DELETE /posts/[id]`, `POST /posts/bulk` (bulk delete), `POST /posts/[id]/publish` (publish | schedule | unpublish), `POST /posts/[id]/duplicate`, `POST /posts/[id]/preview-token` (regenerate; overwrites the previous hash, invalidating the old link).
- `GET/POST /tags`, `PATCH/DELETE /tags/[id]` (editor only; DELETE 409s with `{count}` if still in use).
- `GET/POST /series`, `GET/PATCH/DELETE /series/[id]`, `PATCH /series/[id]/reorder` (editor only).
- `GET /authors`, `GET/PATCH /authors/[userId]` (PATCH: editor any, else self only).
- `GET /comments`, `PATCH/DELETE /comments/[id]`, `POST /comments/[id]/reply`, `POST /comments/bulk` (editor only).
- `GET /roles`, `PUT/DELETE /roles/[userId]` - **`isAdmin` only**, not editor. Backs `GazetteRolesSection.tsx` on core `/cactus-admin/roles`, not a module page.
- `GET /users` (picker, editor only), `GET/POST /templates`, `PATCH/DELETE /templates/[id]` (editor only), `GET/PATCH /settings` (editor only, backs `GazetteSettingsTab.tsx` on core `/cactus-admin/config`), `POST /import` (multipart, editor only, backs the import wizard appended below that same settings tab).

Public (`/api/m/gazette/public/…`, no session required):
- `POST /comments` - zod-validated; checks post visibility, `comments_enabled`, `MEMBERS_ONLY` → session required else 403 with "Only members can comment.", Turnstile (fail-open if unconfigured), IP rate limit (5 per 10 min), threading rules; status PRE→PENDING / POST→APPROVED.
- `POST /reactions` - toggle (insert or delete on conflict), validates emoji against the configured set, returns fresh counts.
- `POST /views` - `recordView`, dedup via `gz_post_views` unique constraint before incrementing `view_count`.

Admin pages (`/cactus-admin/m/gazette/…`, all RSC-gated on `canViewGazetteAdmin`): `posts` (list, tabs/search/bulk - `PostList.tsx`), `posts/new` (template chooser), `posts/[id]` (two-column editor - `PostEditor.tsx`, embeds a gazette-only Puck config for the body), `tags`, `series`, `series/[id]` (drag-to-reorder), `authors`, `authors/[userId]`, `comments`, `templates`. No `settings`, `import`, or `roles` page any more - moved to core `/cactus-admin/config` (Gazette tab, import wizard appended beneath it) and core `/cactus-admin/roles` (extension-point section) respectively. `GazetteNav.tsx` (the in-page tab bar across these six pages) now only lists Posts/Tags/Series/Authors/Comments/Templates.

Public pages (`/gazette/…`, via the core `publicBasePath` mechanism, `force-dynamic`): index (paginated, pinned-first), `[slug]` (post - TOC, reading time, reactions, share buttons, series nav, author bio, related posts, comments), `tag/[slug]`, `series/[slug]`, `archive/[year]`, `archive/[year]/[month]`, `preview/[token]` (no auth, `noindex`), `feed.xml` (RSS 2.0, 20 items).

**Puck Blocks**

- `GazetteFeed` (client `gazetteFeedPuckComponent`, RSC `gazetteFeedPuckRscComponent` from `components/puck/GazetteFeedBlock.tsx`) - registered in the manifest, appears in the site-wide "Modules" palette. Layout (Grid/List/Compact), count, tag filter (resolved live from `/api/m/gazette/admin/tags`), show excerpt/author/date/image toggles, "Read more" label. RSC render calls `connection()` first so any page embedding it renders dynamically.
- `GazetteFeatured` (client `gazetteFeaturedPuckComponent`, RSC `gazetteFeaturedPuckRscComponent`) - source (Latest/Pinned), layout (Hero/Card/Minimal). Same `connection()` treatment.
- Body palette (module-internal, NOT in the manifest, only used inside the post editor's own embedded Puck config): `GazetteProse` (richtext, heading levels 2-4 only, code/codeBlock/strike/underline/horizontalRule/textAlign disabled - no Image extension available, see Known Limitations), `GazettePullQuote`, `GazetteCode` (editor: plain `<pre>`; RSC: `shiki` `codeToHtml` with `createCssVariablesTheme`, `--gz-shiki-*` CSS variables), `GazetteImage` (custom media-picker field, editor-only), `GazetteDivider`.

**Configuration**
Global, in the `gz_settings` singleton row (see Database). No `requiredEnvVars`.

**External Integrations**
Core Turnstile (comment spam check, fail-open if unconfigured), core media (`Media.id` for featured images/avatars), `shiki` (core dependency, added for this module) for code-block highlighting.

**Cron Jobs**
None - scheduled posts go live lazily: `PUBLIC_VISIBLE_SQL` treats a SCHEDULED row as visible once `scheduled_for <= NOW()`, and `normaliseScheduledPosts()` opportunistically flips the DB status to PUBLISHED on admin reads/writes. No Vercel Cron needed for correctness.

**Scripts**
None.

**Known Limitations**

- `@tiptap/extension-image` is not a transitive dependency of `@puckeditor/core` and modules can't add npm packages, so the prose richtext schema has no Image node - an `<img>` inside imported HTML is silently dropped rather than embedded (images are handled as a separate `GazetteImage` block instead).
- `MEMBERS_ONLY` comment visibility currently just means "any logged-in core user" - there's no public membership system yet. Documented as designed interim behaviour in `wiki/Gazette.md`, not a bug.
- Zip imports (Medium/Substack raw exports) aren't supported - no zip dependency available to modules. Admins unzip first and select the extracted files.
- `teardown` in the manifest correctly lists literal snake_case table names (`gz_posts` etc) - contact-form's manifest gets this wrong (PascalCase); do not copy that pattern.

### Boards

- Slug: `boards` (table prefix `brd_`), repo `github.com/cactus-foundation-modules/boards`, manifest version 0.1.0. Registered in `modules.json`.
- A discussion forum: boards, one level of sub-boards, threads and replies for registered users, with polls, reactions, subscriptions, bookmarks, read tracking, full-text search, moderation (queue/reports/bans/IP bans/log), a phpBB/Discourse importer, RSS feeds and a daily email digest. Thread openers are composed with a module-internal Puck body palette (six blocks), separate from the page-builder palette; replies use a standalone richtext composer (not Puck). First consumer of a generic core dashboard-widget extension point and of two new generic nested `feed.xml` core delegates (see Routes and Admin UI sections above).

**Database**
Table prefix: `brd_` (29 tables)

- `brd_categories` - `id`, `title`, `position`, timestamps.
- `brd_boards` - `id`, `category_id?` FK → brd_categories (set null), `title`, `slug` (unique), `description?`, `position`, `icon_emoji?`, `icon_media_id?` (Media.id, no FK), `is_locked`, `visibility` (PUBLIC | MEMBERS | PRIVATE, checked, default PUBLIC - sub-boards inherit, no column of their own), `noindex` (per-board search-engine opt-out, independent of visibility), `min_post_length?`, `word_filter?` (JSONB lowercase term array), timestamps.
- `brd_sub_boards` - `id`, `board_id` FK → brd_boards (cascade), `title`, `slug` (unique per board), `description?`, `position`, `is_locked`, timestamps. One level of nesting only.
- `brd_tags` - `id`, `name`, `slug` (unique), `created_at`.
- `brd_threads` - `id`, `board_id` FK → brd_boards (cascade), `sub_board_id?` FK → brd_sub_boards (cascade), `title`, `slug` (unique, globally), `author_id?` FK → core `User` (set null), `author_name` (snapshot), `opener_data?` (JSONB, Puck Data), `status` (PUBLISHED | PENDING | HIDDEN | DELETED | ARCHIVED, checked), `is_pinned`, `is_locked`, `is_global_announcement`, `view_count`, `reply_count` (denormalised), `last_post_at?` (denormalised, set on post creation only), `ip_address?`, `imported_from?`, timestamps. Indexes incl. GIN full-text on `title`.
- `brd_posts` - replies; opener body lives on the thread row. `id`, `thread_id` FK → brd_threads (cascade), `author_id?` FK → User (set null), `author_name` (snapshot), `body_html`, `body_source?` (JSONB, editor doc), `reply_to_post_id?` FK → self (set null, flat quoted-reply pointer), `status` (PUBLISHED | PENDING | HIDDEN | DELETED, checked), `edited_at?`, `edited_by?` FK → User (set null), `ip_address?`, `imported_from?`, timestamps. GIN full-text on `body_html`.
- `brd_post_revisions` - `id`, `post_id` FK → brd_posts (cascade), `body_html`, `body_source?`, `edited_by?` FK → User (set null), `created_at`.
- `brd_thread_tags` - (thread_id, tag_id) composite PK, cascade both ways.
- `brd_drafts` - composer auto-save. `id`, `user_id` FK → User (cascade), `thread_id?` FK → brd_threads (cascade, reply drafts), `board_id?` FK → brd_boards (cascade, new-thread drafts), `title?`, `opener_data?`, `body_source?`, timestamps. Partial unique on (user_id, thread_id) WHERE thread_id IS NOT NULL.
- `brd_post_reactions` - registered users only (not visitor-token, unlike Gazette). `id`, `post_id` FK → brd_posts (cascade), `user_id` FK → User (cascade), `emoji`, `created_at`. Unique (post_id, user_id, emoji).
- `brd_thread_views` - anonymous view dedupe, mirrors `gz_post_views` + cookie `cactus-boards-vid`. Unique (thread_id, visitor_token).
- `brd_bookmarks` - `id`, `thread_id` FK → brd_threads (cascade), `user_id` FK → User (cascade), `created_at`. Unique (thread_id, user_id).
- `brd_read_state` - `user_id` FK → User (cascade), `thread_id` FK → brd_threads (cascade), `last_read_post_at`, `updated_at`. Composite PK.
- `brd_polls` - one per thread. `id`, `thread_id` FK → brd_threads (cascade, unique), `question`, `allow_multiple`, `closes_at?`, `created_at`.
- `brd_poll_options` - `id`, `poll_id` FK → brd_polls (cascade), `label`, `position`.
- `brd_poll_votes` - `id`, `option_id` FK → brd_poll_options (cascade), `poll_id` FK → brd_polls (cascade), `user_id` FK → User (cascade), `created_at`. Unique (option_id, user_id).
- `brd_user_profiles` - forum identity, deleted with the user. `id`, `user_id` FK → User (cascade, unique), `username` (unique), `signature?`, `avatar_id?` (Media.id, no FK), `bio?`, `post_count` (denormalised), `last_seen_at?`, timestamps.
- `brd_moderator_assignments` - board-scoped moderators + Global Moderator flag in one table (module-side, like `gz_user_roles`). `id`, `user_id` FK → User (cascade), `board_id?` FK → brd_boards (cascade, NULL = Global Moderator), `assigned_by?`, `created_at`. Unique (user_id, board_id) plus a partial unique on (user_id) WHERE board_id IS NULL.
- `brd_bans` - `id`, `user_id` FK → User (cascade), `reason?`, `expires_at?` (null = indefinite), `created_by?`, `created_at`.
- `brd_ip_bans` - `id`, `ip_address` (unique), `reason?`, `expires_at?`, `created_by?`, `created_at`.
- `brd_moderation_queue` - `id`, `item_type` (THREAD | POST, checked), `item_id` (no FK, polymorphic), `reason`, `status` (OPEN | APPROVED | REJECTED, checked), `resolved_by?` FK → User (set null), `resolved_at?`, `created_at`.
- `brd_reports` - member-filed flags, same polymorphic shape as the queue plus `reporter_id?` FK → User (set null), `status` (OPEN | RESOLVED | DISMISSED, checked).
- `brd_moderation_log` - append-only audit. `id`, `actor_id?` FK → User (set null), `actor_name` (snapshot), `action`, `item_type?` (free text - THREAD/POST/USER, no CHECK, unlike the queue/reports tables), `item_id?`, `detail?` (JSONB), `created_at`.
- `brd_thread_subscriptions`, `brd_board_subscriptions` - same (item_id, user_id) shape, cascade both ways, unique pair.
- `brd_notification_prefs` - `user_id` PK FK → User (cascade), `mode` (IMMEDIATE | DIGEST | OFF, checked, default IMMEDIATE), `email_enabled`, `last_digest_at?`, `updated_at`.
- `brd_thread_templates` - mirrors `gz_post_templates`: `id`, `title`, `builder_data?`, timestamps.
- `brd_import_jobs` - `id`, `source` (PHPBB | DISCOURSE, checked), `status` (PENDING | RUNNING | DONE | FAILED, checked), `stats?` (JSONB), `error?`, `created_by?`, timestamps.
- `brd_settings` - singleton (`id = 'singleton'`): `threads_per_page` (20), `posts_per_page` (20), `rss_enabled` (true), `feed_title?`, `feed_description?`, `reactions_enabled` (true), `reaction_set?` (JSONB, null falls back to code default `['👍','❤️','🔥','💡']`), `signatures_enabled` (true), `signature_max_length` (500), `min_account_age_days` (0), `first_post_count` (3), `first_post_account_age_days` (7), `post_cooldown_seconds` (30), `posts_per_hour_limit` (20), `edit_window_minutes` (0 = unlimited), `show_view_counts` (true), `updated_at`.

**Permissions**

- `boards.access` - the Boards admin nav entry and baseline module admin screens.
- `boards.manage` - structural admin (boards/sub-boards/categories/tags/templates CRUD, settings, imports).

Moderator and Global Moderator are **not** core permission keys - they're `brd_moderator_assignments` rows, assigned core-admin-only from `/cactus-admin/m/boards/moderators` (mirrors Gazette's roles screen: 404, not an alert, for non-admins).

**API Routes** (all served through `/api/m/boards/…` via the generated router)

Admin (`/api/m/boards/admin/…`): full CRUD for `categories`, `boards` (+ `reorder`), `sub-boards`, `tags`; `threads` list/patch/delete + `pin`/`lock`/`archive`/`move`/`split`/`announce` actions (moderator, scope-checked per board); `posts` list/patch/delete + `revisions` (moderator hard-delete vs public author soft-delete); `threads/bulk` and `posts/bulk` (hide/delete/lock/archive/move/approve/reject, `{done, skipped}` response); `users/[id]/warn`; `moderation/queue` + per-item approve/reject; `reports` + per-item resolve/dismiss; `bans`/`ip-bans` CRUD (Global Moderator+); `moderation/log` (read-only); `moderators` CRUD (**isAdmin only**); `users` picker; `templates` CRUD; `settings`; `import` (multipart, creates a `brd_import_jobs` row, processes synchronously within the request - same platform constraint as Gazette's importer) + `import/[jobId]` poll; `analytics`; `dashboard-summary` (feeds the core widget).

Public (`/api/m/boards/public/…`): `POST /threads` (submission gauntlet: ban/IP-ban/account-age → lock check → min length → Turnstile → cooldown/hourly rate limit → word-filter/new-account moderation queue gate; materialises polls, tags, fires mention + board-subscriber notifications); `POST /threads/[id]/posts` (same gauntlet, quote + mention + thread-subscriber notifications, bumps `reply_count`/`last_post_at`); `PATCH/DELETE /posts/[id]` (author within `edit_window_minutes` or moderator; author delete is soft, renders "Post removed"); `POST /posts/[id]/reactions` (toggle); `POST /threads/[id]/views` (visitor-token dedupe); `POST /polls/[id]/votes` (toggle, enforces `allow_multiple`/`closes_at`); `PUT/DELETE /subscriptions/thread|board/[id]`; `GET /bookmarks`, `PUT/DELETE /bookmarks/thread/[id]`; `PUT/GET/DELETE /drafts`; `POST /threads/[id]/read`, `POST /boards/[id]/read` (bulk mark-read); `POST /reports`; `GET /search` (Postgres `ts_rank`, scoped to boards visible to the requester); `GET/PATCH /profile` (username settable once, then admin-only); `GET /account/export` (GDPR JSON); plus small read-only `GET /tags` and `GET /templates` backing the public composer's tag picker and template chooser (not in the original spec table, added because the composer needs them).

Cron: `GET|POST /api/m/boards/cron/digest` (`Authorization: Bearer $CRON_SECRET`) - both methods accepted since Vercel Cron always invokes via GET (same as contact-form's retention cron) while BOARDS_SPEC labels the endpoint POST; `lib/digest.ts` `runDigest()` emails `DIGEST`-mode subscribers their new subscribed-board threads and subscribed-thread replies since `last_digest_at`.

Admin pages (`/cactus-admin/m/boards/…`, tab bar `BoardsNav.tsx`): `threads` (the manifest nav-entry landing page - list/filter/bulk moderation), `structure` (tabbed: Categories/Boards/Sub-boards/Tags/Templates, `boards.manage`), `moderators` (isAdmin only), `moderation` (tabbed: Queue/Reports/Bans/IP Bans/Log), `settings` (`boards.manage`), `import` (`boards.manage`), `analytics` (`boards.access`).

Public pages (`/boards/…`, via the core `publicBasePath` mechanism): index (categories/boards/sub-boards, global announcements strip, search - `?q=` re-renders the same page as search results rather than a new route), `[board]` (sub-board list + thread list, inline "New Thread" composer toggle), `[board]/[sub]`, `t/[slug]` (opener via Puck RSC incl. live poll results, tags, share buttons, subscribe/bookmark, reactions, paginated replies with oldest/newest sort toggle, reply composer, inline moderator controls), `u/[username]` (public profile), `feed.xml` + `[board]/feed.xml` + `[board]/[sub]/feed.xml` (RSS, `PUBLIC` non-`noindex` boards only).

**Puck Blocks**

Thread-opener-only body palette (module-internal, NOT in the manifest, mirrors Gazette's body palette pattern): `BoardsProse` (richtext, headings 2-4, no image node - same restricted schema as `GazetteProse`), `BoardsPullQuote`, `BoardsCode` (editor `<pre>`, RSC `shiki` highlighted, `--brd-shiki-*` CSS variables), `BoardsImage` (media-picker field), `BoardsPoll` (question/options/allow-multiple/closes-at; the thread API materialises it into `brd_polls`/`brd_poll_options` on save; RSC render swaps to a `makeBoardsPollRscFieldDef(pollContext)` factory - same technique as Gazette's TOC heading injection - so public rendering shows live vote counts via `PollWidget.tsx` instead of the authored draft options), `BoardsEmbed` (URL field, whitelist-rendered YouTube/Vimeo iframes else a plain link card, no oEmbed fetching).

Replies don't use Puck at all - the standalone `ReplyComposer.tsx` embeds a minimal single-block Puck instance (`ReplyBody`, reusing `boardsProseFieldDef`) purely to get the same richtext field without a new `@tiptap/*` dependency (BOARDS_SPEC protected item 2); the full page-builder chrome this drags in in this speed edition is a known rough edge, not hidden.

**Configuration**
Global, in the `brd_settings` singleton row (see Database), edited at `/cactus-admin/m/boards/settings` - a module admin page, not a core `/cactus-admin/config` tab. Per-board config (lock, visibility, icon, min post length, word filter, ordering) lives as columns on `brd_boards`/`brd_sub_boards`, edited in the Structure screen.

**External Integrations**
Core Turnstile (submission gauntlet, fail-open if unconfigured), core media (`Media.id` for avatars/board icons/inline images), core email (Brevo/SMTP) for the daily digest and immediate-mode notification emails, `shiki` (existing core dependency) for code-block highlighting.

**Cron Jobs**
`0 7 * * *` → `/api/m/boards/cron/digest`; registered via `cronJobs` in `cactus.module.json`, emitted into the generated `vercel.json`.

**Scripts**
None.

**Known Limitations**

- Per BOARDS_SPEC protected item 1, per-user notifications degrade to email-only (`lib/notify.ts` `notifyUser`) - no bell, no in-app read/unread - until the separate core per-user notification system (`NOTIFICATIONS_SPEC.md`) ships; `DIGEST`-mode users get the daily email, `OFF` suppresses everything, and there is currently no admin-visible notification history at all for Boards items.
- The import wizard (`POST /import`) processes synchronously within the request (`maxDuration = 60`), same as Gazette's importer - very large forum exports may exceed the Vercel function timeout. Idempotent via `imported_from` on threads/posts (safe to re-run); boards/categories are matched by title, not a source id, since `brd_boards` has no `imported_from` column.
- `ReplyComposer.tsx` embeds a full Puck editor instance (with its default component-picker chrome) to reuse the richtext field for a single always-present block, rather than a purpose-built minimal text box - a deliberate corner cut per BOARDS_SPEC protected item 2 ("start with the zero-new-dependency Puck richtext path").
- The two new generic nested `feed.xml` core delegates (`app/(public)/[slug]/[a]/feed.xml/route.ts`, `.../[a]/[b]/feed.xml/route.ts`) introduce dynamic segment names (`[a]`, `[b]`) as siblings of the existing `[...path]` catch-all under `app/(public)/[slug]/` - confirmed via a full `next build` that Next.js does not treat a `route.ts`-only dynamic segment as conflicting with a `page.tsx` catch-all at the same directory level (only same-file-type siblings need matching dynamic names).
