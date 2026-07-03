# Cactus Foundation - Members System Spec

Status: **APPROVED for phased build. Phase 0 in progress.** Protected categories
(auth, sessions, permissions, database schema, migrations) require isolated
diffs and individual sign-off per phase - never bundled under blanket approval.

> **British English** is required throughout all UI copy, error messages,
> email templates, and documentation produced by this implementation.
>
> **Commit discipline:** Do not push to any remote unless explicitly
> instructed. Commit and wait for approval. Never push to the Tester repo.

Implementation plan: `~/.claude/plans/make-a-plan-moonlit-rossum.md`.

---

## Agreed amendments (decisions made during planning, 3 July 2026)

These override the original spec text where they conflict:

1. **Standalone `Member` model.** The Overview's "same underlying `User`
   model" sentence is void - members get fully separate tables, sessions,
   cookies. No linkage to admin `User`.
2. **IDs are `cuid()`** (codebase convention), not `uuid()`.
   `crypto.randomUUID()`/`randomBytes` only for application-level token
   generation where Prisma is not involved.
3. **Settings storage**: one `membersConfig Json?` column on the `SiteConfig`
   singleton, Zod-validated with defaults in `lib/members/config.ts` - not
   individual columns and not a key-value store.
4. **`sessionDays: 30`** added to the settings keys - member session duration
   in days, sliding expiry. Omitted from the original spec, confirmed required.
5. **Extension points are declarative**, not imperative. The
   `registerMemberActivityType()`-style calls become manifest fields: UI
   components use the existing `extensionPoints` mechanism with new point
   names (`members.profile-section`, `members.account-section`,
   `members.gdpr-entry`, `members.admin-member-detail`); data contributions
   use a new optional `memberExtensions` manifest field (`activityTypes`,
   `notificationCategories`, `dataExportPath`, `routeTiers`).
6. **Internal path**: member area pages live at
   `app/(public)/cactus-account/*`; `proxy.ts` rewrites
   `/{MEMBER_AREA_PATH}/*` there and 404s direct access, mirroring the
   `/cactus-admin` pattern. Cookie names: `cactus_member_session`,
   `cactus_member_trusted`.
7. **Core cron jobs** (deletion purge, export expiry, digests) are declared in
   a `CORE_CRONS` array inside `scripts/generate-module-cron.mjs` - the
   generated `vercel.json` is gitignored and rebuilt from scratch each build.
8. **`WebAuthnChallenge` gains a nullable `memberId` column** and new purpose
   values for member flows - the table is otherwise reused as-is.
9. Ignore draft `NOTIFICATIONS_SPEC.md` for this build; reconcile when that
   spec is authorised.
10. Additional models beyond the original list: `MemberInvite`,
    `MemberAdminNote` (append-only), `MemberAdminActionLog`, `EmailTemplate`.

---

## Overview

The Members system adds frontend registration, authentication, and a member
account area to Cactus Foundation. It is a core platform feature, not a
module. It provides the identity layer that modules (Gazette, Forum, etc.)
extend with their own roles and activity types.

Paid/tiered membership is explicitly out of scope and will be handled by a
separate future module hooking into the infrastructure built here.

## Architectural principles

- Members are distinct from admin users: separate model, session context, and
  route namespace (see amendment 1).
- The member area path is set via the `MEMBER_AREA_PATH` env var (default:
  `account`), read via `process.env.MEMBER_AREA_PATH` in `proxy.ts` and route
  definitions. Not a runtime setting - changing it requires a redeploy.
- `proxy.ts` handles member session validation, site-status gating, and
  members-only mode enforcement. No `middleware.ts` exists.
- Passwords supported but **off by default**; admin must enable in settings.
  2FA is mandatory when passwords are enabled.
- All avatar media goes through the existing Cactus media system and
  Cloudflare Worker access layer.
- Cloudflare Turnstile on the registration form, validated server-side.
- All member-facing routes registered in `FIELD_NOTES.md`.

## Database models

Standalone tables, all `cuid()` ids, all tokens stored hashed:

- **`Member`** - email + username (unique), displayName, avatarMediaId,
  avatarChoice (`UPLOAD | GRAVATAR | GENERATED`, default GENERATED), bio,
  websiteUrl, trusted flag, status (`PENDING_VERIFICATION | PENDING_APPROVAL
  | ACTIVE | SUSPENDED | DELETED`), email verification fields, adminNotes
  superseded by `MemberAdminNote`, suspension fields (until/reason/notified),
  deletion fields (requestedAt/scheduledAt/exportReady), username-change
  fields (changedAt/previous/previousExpiresAt), timestamps.
- **`MemberPasskey`** - credentialId unique, publicKey bytes, counter,
  deviceName, lastUsedAt.
- **`MemberPassword`** - one per member, bcrypt hash (cost 12).
- **`MemberTwoFactor`** - method (`EMAIL | AUTHENTICATOR_APP`), encrypted
  TOTP secret, verified flag.
- **`MemberTrustedBrowser`** - hashed token, deviceInfo, expiry.
- **`MemberSession`** - hashed token, ipAddress, userAgent, location,
  lastActiveAt, expiresAt.
- **`MemberMagicLink`** / **`MemberVerificationToken`** - hashed single-use
  tokens with expiry.
- **`MemberNotificationPreference`** - channel (`EMAIL`), category string,
  digestMode (`INSTANT | DAILY | WEEKLY | DISABLED`), enabled.
- **`MemberConsentRecord`** - consentType, granted, ip, userAgent.
- **`MemberDataExportRequest`** - status (`PENDING | PROCESSING | READY |
  EXPIRED`), mediaId, expiry.
- **`MemberActivityEvent`** - type, source, metadata Json.
- **`MemberProfileVisibility`** - per-member show/hide bio, join date,
  website.
- **`MemberInvite`** - hashed token, single-use, expiry, createdBy, usedAt.
- **`MemberAdminNote`** - append-only admin notes with author + timestamp.
- **`MemberAdminActionLog`** - audit log of admin actions on members.
- **`EmailTemplate`** - key unique, subject, bodyHtml, updatedBy (admin
  overrides for the code-registry defaults).

## Settings keys (in `membersConfig` Json)

`enabled` false; `registrationMode` OPEN|INVITE_ONLY|APPROVAL_REQUIRED;
`emailVerificationRequired` true; `allowedAuthMethods` ["PASSKEY",
"MAGIC_LINK"]; `passwordsEnabled` false; `trustedBrowserDays` 30;
`sessionDays` 30; `avatarUploadsEnabled` true; `gravatarEnabled` true;
`siteWideMembersOnly` false; `siteWideMembersOnlyExceptions` [];
`guestPreviewEnabled` false; `usernameChangesEnabled` false;
`usernameChangeCooldownDays` 90; `usernameRedirectDays` 30;
`deletionGracePeriodDays` 14; `adminNotifyOnDeletion` false;
`postRegistrationRedirect` null; `allowedEmailDomains` [];
`blockedEmailDomains` []; `notifyAdminOnPendingApproval` true;
`profileVisibility` PUBLIC|MEMBERS_ONLY|HIDDEN; `accountSectionsEnabled`
{ profile, security, notifications, activity, dangerZone: true };
`directoryEnabled` false.

`MEMBER_AREA_PATH` is an env var, not a settings key.

## Authentication

Priority order: passkey (WebAuthn, same @simplewebauthn libraries as admin) >
magic link (15-minute single-use email link) > password + mandatory 2FA
(email code or TOTP) + optional trusted browser (admin-configurable days).
Admin enables/disables each method. Members may hold multiple passkeys.

## Registration

Canonical page `/{MEMBER_AREA_PATH}/register` plus a Puck block. Flow:
Turnstile server-side -> domain allow/blocklist -> rate limit (5/IP/hour) ->
account created per mode (OPEN / APPROVAL_REQUIRED -> PENDING_VERIFICATION;
INVITE_ONLY validates token first) -> verification email + holding page
`/{MEMBER_AREA_PATH}/verify-email` (resend after 60s) -> APPROVAL_REQUIRED
moves to PENDING_APPROVAL awaiting admin -> redirect to
`postRegistrationRedirect` or account area. Invite-only mode: admin-generated
single-use invite links, configurable expiry; public page shows
invitation-only message.

## Member account area

Base `/{MEMBER_AREA_PATH}`, all sub-routes session-gated in `proxy.ts`,
sections toggleable via `accountSectionsEnabled`:

- **Profile** - display name, bio, website, avatar (upload/Gravatar/generated
  initials), field visibility controls.
- **Security** - active sessions (revoke, sign-out-all), passkey management,
  password change, 2FA config (TOTP QR), login history, recovery codes,
  backup email, connected-accounts stub ("coming soon").
- **Notifications** - categories from core + module manifests, per-category
  toggle + digest mode.
- **Activity** - login history summary + module-contributed event timeline.
- **Danger Zone** - data export (one active request, 48-hour download
  expiry); deletion with grace period (`deletionGracePeriodDays`), banner
  with cancel, scheduled hard-delete job.

## Public profile

`/members/[username]`. Visibility per `profileVisibility` setting (HIDDEN =
404), then member-level overrides. Shows avatar, names, bio, website, join
date, module-contributed sections. Old usernames redirect for
`usernameRedirectDays`.

## Admin tools

Top-level Members nav section: overview dashboard (counts, pending approval
queue, recent suspensions, pending deletions); member list (search, filter by
status/trusted, sort, bulk actions, row actions - impersonate deferred);
member detail (edit, status management, suspension form, trusted toggle,
append-only notes, session revoke, manual password reset, export trigger,
admin delete bypassing grace, action log); invite management; settings pages
(registration, avatars, usernames, account sections, access control - with
read-only `MEMBER_AREA_PATH` display); email template editor (subject + body,
merge tags, test send); GDPR dashboard (consent records, export requests,
deletion requests, data processing log with module-injected entries).

## Spam and abuse

Registration endpoint: Turnstile server-side, rate limit 5/IP/hour,
`blockedEmailDomains` blocklist, `allowedEmailDomains` allowlist (empty =
all permitted subject to blocklist).

## Site access modes

Enforced in `proxy.ts` for non-admin routes:

- **Members-only mode** - `siteWideMembersOnly` gates all frontend routes;
  exceptions list, member-area paths auto-excepted; redirect to login with
  `redirect` param.
- **Guest preview** - teaser view with sign-in overlay when enabled.
- **Route tiers** - `PUBLIC | MEMBER | TRUSTED_MEMBER`, modules declare via
  `memberExtensions.routeTiers`.

## Puck blocks (core, editor + RSC parity)

`MembersLogin`, `MembersRegister` (with Turnstile), `MembersAccountLink`,
`MemberGate`, `TrustedMemberGate`, `MembersProfile`.

## Email

Existing Brevo/SMTP adapter. New admin-editable template system with code
defaults. Templates: `member.verify-email`*, `member.welcome`,
`member.magic-link`*, `member.suspended`, `member.deletion-requested`*,
`member.deletion-cancelled`*, `member.deletion-admin-notify`*,
`member.approved`, `member.digest-daily`, `member.digest-weekly`,
`member.security-alert`* (* = transactional, bypasses preferences).

## Permissions

`members.manage`, `.list`, `.view`, `.edit`, `.suspend`, `.delete`,
`.invite`, `.approve`, `.trust`, `.notes`, `.settings`, `.gdpr`,
`.email-templates`.

## Routes

Frontend: `/{MEMBER_AREA_PATH}/{login,register,verify-email,forgot-password,
reset-password,profile,security,notifications,activity,danger-zone}` + index;
`/members/[username]`. Member API under `/api/members/*` (~24 routes), admin
API under `/api/admin/members/*` (~18 routes). Full tables in the
implementation plan; all registered in `FIELD_NOTES.md` as built.

## Security notes

- Every `/api/members/*` route validates the member session server-side.
- Every `/api/admin/members/*` route validates admin session + specific
  permission.
- All tokens stored hashed; raw tokens never persisted.
- bcrypt cost 12 minimum; 2FA codes time-limited (10-minute email window,
  standard TOTP window).
- Suspension/deletion checks in `proxy.ts` before route handlers.
- Export files stored via the media system, time-limited access, not
  publicly listable.
- Enumeration-safe responses on register/magic-link/verify.

## Implementation phases

0. Schema + settings foundation **(protected: schema/migration + permissions,
   two isolated diffs)** - CURRENT
1. Registration + verification
2. Authentication **(protected: auth/sessions, per-sub-feature diffs)**
3. Member account area
4. Public profile
5. Admin tools
6. GDPR + email templates
7. Puck blocks
8. Site access modes **(protected-adjacent: proxy)**
9. Avatar polish
10. Hardening + docs
