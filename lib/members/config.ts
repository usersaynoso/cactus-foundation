import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

// Members system settings, stored as a single JSON column on the SiteConfig
// singleton (same pattern as designTokens / consentBannerConfig). A null or
// partial column parses to the defaults below, so fresh installs need no row
// changes and new keys can be added without a migration.

export const MembersConfigSchema = z.object({
  enabled: z.boolean().default(false),
  registrationMode: z.enum(['OPEN', 'INVITE_ONLY', 'APPROVAL_REQUIRED']).default('OPEN'),
  emailVerificationRequired: z.boolean().default(true),
  allowedAuthMethods: z.array(z.enum(['PASSKEY', 'MAGIC_LINK', 'PASSWORD'])).default(['PASSKEY', 'MAGIC_LINK']),
  passwordsEnabled: z.boolean().default(false),
  trustedBrowserDays: z.number().int().min(1).max(365).default(30),
  // Member session duration in days (sliding expiry)
  sessionDays: z.number().int().min(1).max(365).default(30),
  avatarUploadsEnabled: z.boolean().default(true),
  gravatarEnabled: z.boolean().default(true),
  siteWideMembersOnly: z.boolean().default(false),
  siteWideMembersOnlyExceptions: z.array(z.string()).default([]),
  guestPreviewEnabled: z.boolean().default(false),
  usernameChangesEnabled: z.boolean().default(false),
  usernameChangeCooldownDays: z.number().int().min(0).max(3650).default(90),
  usernameRedirectDays: z.number().int().min(0).max(3650).default(30),
  deletionGracePeriodDays: z.number().int().min(0).max(365).default(14),
  adminNotifyOnDeletion: z.boolean().default(false),
  postRegistrationRedirect: z.string().nullable().default(null),
  allowedEmailDomains: z.array(z.string()).default([]),
  blockedEmailDomains: z.array(z.string()).default([]),
  notifyAdminOnPendingApproval: z.boolean().default(true),
  profileVisibility: z.enum(['PUBLIC', 'MEMBERS_ONLY', 'HIDDEN']).default('PUBLIC'),
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

export const MEMBERS_CONFIG_DEFAULTS: MembersConfig = MembersConfigSchema.parse({})

// A corrupted column must never take the site down: fall back to defaults.
export function parseMembersConfig(raw: unknown): MembersConfig {
  const result = MembersConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : MEMBERS_CONFIG_DEFAULTS
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
