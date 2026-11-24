import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

// Members system settings, stored as a single JSON column on the SiteConfig
// singleton (same pattern as designTokens / consentBannerConfig). A null or
// partial column parses to the defaults below, so fresh installs need no row
// changes and new keys can be added without a migration.

export const AUTH_METHODS = ['PASSKEY', 'MAGIC_LINK', 'PASSWORD'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

// Off = never offered. Optional = offered, the member may set it up or not.
// Required = the member must have it before their account is usable, and is
// walked through setting it up on their way in (see lib/members/auth-policy).
export type AuthMethodPolicy = 'OFF' | 'OPTIONAL' | 'REQUIRED'

export const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  PASSKEY: 'Passkey',
  MAGIC_LINK: 'Email sign-in link',
  PASSWORD: 'Password',
}

// A whole number of days, with one message naming the setting for every way it
// can be wrong. Zod's own wording ("Number must be greater than or equal to 1")
// reached the settings screen as-is and never said which box it meant.
function dayCount(label: string, min: number, max: number) {
  const message = `${label} must be a whole number of days from ${min} to ${max}`
  return z.number({ invalid_type_error: message }).int(message).min(min, message).max(max, message)
}

export const MembersConfigSchema = z.object({
  enabled: z.boolean().default(false),
  registrationMode: z.enum(['OPEN', 'INVITE_ONLY', 'APPROVAL_REQUIRED']).default('OPEN'),
  emailVerificationRequired: z.boolean().default(true),
  // Which fields the registration form asks for. Turning one off hides it and
  // stops the API accepting it, so a crafted POST can't fill in a field the
  // site has decided not to offer. With the username off, one is generated
  // from the email address instead - a shop that only wants a checkout login
  // has no reason to make people invent a handle first.
  registrationCollectUsername: z.boolean().default(true),
  registrationCollectDisplayName: z.boolean().default(true),
  // Whether the sign-up form offers a password box at all. Separate from the
  // PASSWORD sign-in policy on purpose: a site can allow passwords without
  // wanting one invented at the till. Off, the member registers with nothing to
  // remember and adds a password later from their account security page, which
  // is where the second factor password sign-in insists on lives anyway.
  // Default true so existing sites keep asking exactly as they do now.
  registrationCollectPassword: z.boolean().default(true),
  // One control per sign-in method, replacing the old allowedAuthMethods array
  // plus passwordsEnabled pair (two switches that both had to agree before a
  // password was offered - see normaliseLegacyAuthMethods for how stored rows
  // written under the old pair are read).
  //
  // A per-field .catch keeps one unrecognised value from dropping the entire
  // members config back to defaults, which would switch the members system off
  // rather than merely mis-set one method.
  authMethodPolicies: z
    .object({
      PASSKEY: z.enum(['OFF', 'OPTIONAL', 'REQUIRED']).catch('OPTIONAL').default('OPTIONAL'),
      // Two states, not three. There is nothing for a member to enrol: the
      // credential is a mailbox they have already verified, so "required"
      // would describe exactly the same behaviour as "optional". Whether the
      // address has to be verified at all is emailVerificationRequired's job.
      MAGIC_LINK: z.enum(['OFF', 'OPTIONAL']).catch('OPTIONAL').default('OPTIONAL'),
      PASSWORD: z.enum(['OFF', 'OPTIONAL', 'REQUIRED']).catch('OFF').default('OFF'),
    })
    .default({}),
  // Whether members must enrol a mobile number for SMS sign-in codes.
  // REQUIRED only bites while an SMS provider module is active and configured;
  // without one it behaves as OPTIONAL (nothing to enrol against). Applies to
  // password sign-in only - passkey and magic-link flows never use codes.
  smsTwoFactorPolicy: z.enum(['OPTIONAL', 'REQUIRED']).default('OPTIONAL'),
  // "Admins can use their admin passkey to sign in to their member account".
  // On, the member passkey sign-in also accepts a staff passkey and opens the
  // member account with the same verified address (lib/members/admin-passkey-
  // link.ts for the rules). One way only: a member passkey never opens the
  // admin area. Off by default, so every existing site behaves exactly as it
  // did until its owner chooses otherwise.
  adminPasskeySignInForMembers: z.boolean().default(false),
  // How long ticking "trust this browser" at a password sign-in skips the code
  // on that browser. Counted from the day it was ticked, never extended by use:
  // a trust that renews itself every visit never runs out on a browser that is
  // used daily, which is not what a number of days on a settings screen says.
  trustedBrowserDays: dayCount('Trusted browser duration', 1, 365).default(30),
  // How long a member stays signed in without visiting. Sliding: every visit
  // restarts the count (lib/members/session-core.ts).
  sessionDays: dayCount('Session duration', 1, 365).default(30),
  avatarUploadsEnabled: z.boolean().default(true),
  gravatarEnabled: z.boolean().default(true),
  siteWideMembersOnly: z.boolean().default(false),
  siteWideMembersOnlyExceptions: z.array(z.string()).default([]),
  guestPreviewEnabled: z.boolean().default(false),
  usernameChangesEnabled: z.boolean().default(false),
  // 0 = no cooldown. A change of capitals alone (chris to Chris) never counts
  // and is never refused by it - see app/api/members/username/route.ts.
  usernameChangeCooldownDays: dayCount('Change cooldown', 0, 3650).default(90),
  // How long an old username keeps forwarding to the new one and stays reserved
  // for its previous owner. 0 = no forwarding and nothing reserved.
  usernameRedirectDays: dayCount('Old-username redirect window', 0, 3650).default(30),
  deletionGracePeriodDays: dayCount('Deletion grace period', 0, 365).default(14),
  adminNotifyOnDeletion: z.boolean().default(false),
  // Whether a member may close their own account (the "Delete my account"
  // button and POST /api/members/delete-account). Off, the button goes and the
  // route refuses, so only an admin can delete a member. The rest of the Danger
  // zone (downloading their data) is untouched, and a member who had already
  // asked before it was switched off can still cancel. Default true: every site
  // already lets members do this, and keeps doing so until somebody says not.
  allowMemberSelfDeletion: z.boolean().default(true),
  postRegistrationRedirect: z.string().nullable().default(null),
  allowedEmailDomains: z.array(z.string()).default([]),
  blockedEmailDomains: z.array(z.string()).default([]),
  notifyAdminOnPendingApproval: z.boolean().default(true),
  profileVisibility: z.enum(['PUBLIC', 'MEMBERS_ONLY', 'HIDDEN']).default('PUBLIC'),
  // Whether members get a bio and a website box on their profile. Off, the box
  // goes from the profile page, its "show on my public profile" switch goes with
  // it, the public profile stops showing it and the profile route drops it on
  // save. Anything already saved is kept, and comes back if this goes back on.
  // Default true: both have always been there.
  profileCollectBio: z.boolean().default(true),
  profileCollectWebsite: z.boolean().default(true),
  // Draw the whole account on the overview page, one section under the next,
  // with the tabs scrolling to them instead of loading a page each. Off by
  // default: the tabbed shape is what every existing site already has, and a
  // busy account (a shop's, with orders and addresses on it) is a long page.
  accountSinglePage: z.boolean().default(false),
  // Whether the account overview asks for an organisation name alongside the
  // member's own name, and whether the contact route will save one. On by
  // default: it is one optional box, and the sites that keep members at all are
  // mostly the ones selling to businesses. A site with no use for it turns it
  // off here and the box goes, rather than sitting there collecting nothing.
  accountCollectOrganisation: z.boolean().default(true),
  // Whether that box has to be filled in. Off by default, and only ever read
  // where the box is switched on above: a site selling to the public would be
  // stopping a member saving their own name until they invented a company.
  // On, the account page stops calling it optional, refuses a blank one, and
  // the contact route refuses one too - a required field that only argues in
  // the browser is a suggestion.
  //
  // Note what this does NOT do: it does not go back over members who have been
  // signed up for a year without one. They are asked the next time they open
  // the page, which is the only moment anybody is there to answer.
  accountRequireOrganisation: z.boolean().default(false),
  accountSectionsEnabled: z.object({
    profile: z.boolean().default(true),
    security: z.boolean().default(true),
    notifications: z.boolean().default(true),
    activity: z.boolean().default(true),
    dangerZone: z.boolean().default(true),
  }).default({}),
  directoryEnabled: z.boolean().default(false),
})

export type MembersConfig = z.infer<typeof MembersConfigSchema>

export type AccountSectionKey = keyof MembersConfig['accountSectionsEnabled']

export const MEMBERS_CONFIG_DEFAULTS: MembersConfig = MembersConfigSchema.parse({})

// Whether a member-area section is switched on. The tab bar and the overview
// cards have always read this; the section's own page and the routes it saves
// through must read it too. Hiding a link is a suggestion - the page it points
// at answered a typed-in address perfectly happily, and its save endpoints
// answered a crafted request the same way.
export function isAccountSectionEnabled(config: MembersConfig, key: AccountSectionKey): boolean {
  return config.accountSectionsEnabled[key]
}

// Whether a member may schedule their own account for deletion. The one place
// the delete route and the Danger zone's button both ask, so the button never
// offers what the route would refuse.
export function isMemberSelfDeletionAllowed(config: MembersConfig): boolean {
  return config.allowMemberSelfDeletion
}

export const MEMBER_SELF_DELETION_OFF_MESSAGE =
  'Accounts on this site are closed by the team that runs it. Get in touch with them and they will sort it out.'

// Rows written before sign-in methods became one three-state control each.
// The old shape was an allowedAuthMethods array plus a separate passwordsEnabled
// boolean that both had to agree before passwords were offered, so a site with
// PASSWORD listed but the boolean off was not in fact offering passwords - and
// must not start doing so on the strength of a settings rewrite. Nothing is
// written back here: the derived value simply feeds the parse, and the first
// save from the admin screen persists the new shape (zod drops the old keys).
function normaliseLegacyAuthMethods(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  if (obj.authMethodPolicies !== undefined) return obj
  if (!Array.isArray(obj.allowedAuthMethods)) return obj

  const allowed = obj.allowedAuthMethods
  const listed = (method: AuthMethod) => allowed.includes(method)
  return {
    ...obj,
    authMethodPolicies: {
      PASSKEY: listed('PASSKEY') ? 'OPTIONAL' : 'OFF',
      MAGIC_LINK: listed('MAGIC_LINK') ? 'OPTIONAL' : 'OFF',
      PASSWORD: listed('PASSWORD') && obj.passwordsEnabled === true ? 'OPTIONAL' : 'OFF',
    },
  }
}

// A corrupted column must never take the site down: fall back to defaults.
export function parseMembersConfig(raw: unknown): MembersConfig {
  const result = MembersConfigSchema.safeParse(normaliseLegacyAuthMethods(raw ?? {}))
  return result.success ? result.data : MEMBERS_CONFIG_DEFAULTS
}

// Widened to the full three-state union on the way out: MAGIC_LINK's own type
// is narrower, and callers should be able to ask any method the same question
// without the comparison being flagged as impossible.
export function authMethodPolicy(config: MembersConfig, method: AuthMethod): AuthMethodPolicy {
  return config.authMethodPolicies[method]
}

// What the registration form should do about a password, which is not the same
// question as what the site allows. Only OPTIONAL can be dropped: OFF has no
// password to ask for, and REQUIRED means an account without one is unusable,
// so the box stays whatever the toggle says. Everything that guards password
// sign-in or adding a password later keeps reading the policy itself - turning
// this off changes the sign-up form, nothing else.
export function registrationPasswordPolicy(config: MembersConfig): AuthMethodPolicy {
  const policy = authMethodPolicy(config, 'PASSWORD')
  if (policy === 'OPTIONAL' && !config.registrationCollectPassword) return 'OFF'
  return policy
}

export function isAuthMethodEnabled(config: MembersConfig, method: AuthMethod): boolean {
  return authMethodPolicy(config, method) !== 'OFF'
}

export function isAuthMethodRequired(config: MembersConfig, method: AuthMethod): boolean {
  return authMethodPolicy(config, method) === 'REQUIRED'
}

export function enabledAuthMethods(config: MembersConfig): AuthMethod[] {
  return AUTH_METHODS.filter((method) => isAuthMethodEnabled(config, method))
}

export async function getMembersConfig(): Promise<MembersConfig> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { membersConfig: true },
  })
  return parseMembersConfig(config?.membersConfig)
}

// 5-second in-memory cache for per-request reads in proxy.ts (Node runtime;
// same pattern as getAdminPathCached in lib/config/site.ts).
let cachedMembersConfig: MembersConfig | null = null
let cachedMembersConfigAt = 0
const CACHE_TTL_MS = 5_000

export async function getMembersConfigCached(): Promise<MembersConfig> {
  const now = Date.now()
  if (cachedMembersConfig && now - cachedMembersConfigAt < CACHE_TTL_MS) {
    return cachedMembersConfig
  }
  const config = await getMembersConfig()
  cachedMembersConfig = config
  cachedMembersConfigAt = now
  return config
}

export function invalidateMembersConfigCache() {
  cachedMembersConfig = null
  cachedMembersConfigAt = 0
}
