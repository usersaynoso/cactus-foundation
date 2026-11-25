# 0001. Member account routes accept a module's Bearer token, with a step-up grant for sensitive changes

- Status: proposed (branch `member-token-api`, awaiting the owner's approval to release)
- Date: Wednesday the 25th of November 2026

## Context

Every member account route under `app/api/members/**` identified the caller with `getMemberFromCookie()`. That suits the browser and nothing else. A module that ships a native app (the first is TG Finance, whose iPhone and Android apps hold a long-lived device token issued and checked by the module) wants its members to be able to change everything on their account from the app: profile and picture, username, email address, password, two-factor and recovery codes, passkeys, browser sessions and trusted browsers, and to read their activity. The owner ruled out data export and self-delete from apps, and asked that sensitive changes be re-confirmed in the app.

Three constraints shaped the answer:

1. **No module code in core.** Core must not learn what any module's token looks like or where it is stored.
2. **Nothing gets weaker for the browser.** Cookie behaviour, the fresh-session rule and the origin check stay exactly as they were.
3. **A token is not a fresh sign-in.** The browser's "signed in within the last ten minutes" rule guards adding or removing ways into an account. A device token is issued once and lives for months, so it can never satisfy that rule by its age.

## Decision

- **A new serverOnly extension point, `core.member-api-auth`.** A module registers one resolver, `(token, request) => Promise<{ memberId, credentialId, label? } | null>`. `getMemberAuthFromRequest(request)` in `lib/members/api-auth.ts` tries the member cookie first and, failing that, shows a Bearer token to each installed module's resolver in turn. Core then loads the member itself and refuses anyone who is not ACTIVE, exactly as a cookie session does. The answer records how the caller came in (`via: 'cookie' | 'token'`) and, for a token, which module, which credential and what the member calls it.
- **Unrecognised tokens are rate limited per address** (`member_api_token`, 30 failures in 15 minutes), after which resolvers are not asked at all for that address until the window passes. With no resolver installed, a Bearer token costs nothing and is simply not a sign-in.
- **The account routes use it**, with these left cookie-only on purpose: data export, delete account, cancel deletion, sign-out, and the admin-passkey routes.
- **A step-up grant replaces the fresh-session rule for token callers.** `POST /api/members/step-up` (token callers only) checks the account password, or a six-digit code emailed to the account's own address, and mints a grant: a 256-bit random secret, valid five minutes, single-use, bound to the member, the module and the module's credential id. It is stored as an HMAC (keyed with `SESSION_SECRET`, mixed with member, module and credential) in `WebAuthnChallenge` with purpose `member_api_step_up`, the table that already holds short-lived member-bound secrets including the admin passkey step-up grant. So no schema change, nothing usable in the table, and a grant shown by any other credential hashes to a row that does not exist. The app sends it as `X-Cactus-Step-Up`.
- **Where a grant is needed (token callers only):** starting an email change, adding or changing a password, removing the password, removing a passkey, `register-options` for a new passkey, `2fa/setup-options`, removing two-factor, regenerating recovery codes. Each route checks for a live grant before it reads its body (so a stolen token cannot use a route's own password check as an oracle) and spends it with an atomic delete immediately before the change (so a failed validation leaves it usable, and two racing requests cannot both use it). The routes' own checks still apply on top; changing a password still wants the current one.
- **Browser-session semantics for token callers:** no browser session or trusted browser is `isCurrent`; "sign out the others" and a password change sign every browser out. The app's own device belongs to the module.
- **Native passkeys:** the RP ID stays the site's domain. iOS needs only the existing `IOS_WEBCREDENTIAL_APP_IDS` (AASA `webcredentials`), because Apple reports the site's https origin. Android Credential Manager reports `android:apk-key-hash:<base64url of the signing-certificate SHA-256>`, so a new `ANDROID_WEBCREDENTIAL_APPS` setting serves `/.well-known/assetlinks.json` (relation `delegate_permission/common.get_login_creds` only) and adds exactly those origins to member passkey registration.
- **Logging:** each grant writes a `step_up_confirmed` member activity entry naming the method, module and device. Existing security-alert emails fire as before for passkey, password and two-factor changes; removing a password now sends one too (it never did, from the browser either).

## Alternatives considered

- **Have the module proxy every account route itself.** Rejected: it would copy core's account logic into a module (and into every future module with an app), and it would need core internals anyway.
- **Mint a cookie session for the app.** Rejected: it would put an ambient credential on a device that does not need one, make origin checks meaningless for it, and leave the fresh-session rule satisfied by any app that signed in within ten minutes.
- **A stateless signed grant.** Simpler, but cannot be single-use. Rejected in favour of a stored, spent-on-use grant.
- **A multi-use grant for five minutes.** Kinder to a member doing two things in a row (removing the password and then two-factor needs two confirmations now), but weaker. Single-use chosen; revisit if members find it tiresome.
- **A new table for grants.** Unnecessary: `WebAuthnChallenge` already has member, purpose, unique value and expiry, and is already used for the admin grant.

## Consequences

- Modules with apps can offer the whole account, minus export and deletion, with one small resolver.
- Core's member routes now import `lib/members/api-auth.ts` instead of `getMemberFromCookie` directly; new member account routes should do the same and decide, explicitly, whether they need a grant.
- A module's other device tokens are not revoked when the password changes from the app or the browser; core does not know about them. A future `core.member-credentials-changed` point could tell modules.
- The emailed step-up code uses the existing login-code template, so its wording talks about signing in.
- Core now owns `/.well-known/assetlinks.json` as a real route. With `ANDROID_WEBCREDENTIAL_APPS` unset it falls back to any module serving that file through `core.well-known-files`, so nothing is silenced; with it set, core's answer wins.
