// Everything proxy.ts reads from the database, behind one seam.
//
// On Vercel (and locally) the proxy runs on the Node runtime and these are simply
// the functions it has always called - re-exported here with narrower types, no
// behaviour of their own. On Netlify the proxy runs as an edge function, whose
// loader cannot run Prisma at all (Prisma's generated client resolves itself
// through a `#main-entry-point` package import the edge bundler does not support),
// so next.config.ts aliases this module to ./data.netlify.ts for Netlify builds.
// That file answers the same questions over HTTP from a Node route.
//
// The contract is the export list and the types below. ./data.contract.test.ts
// type-checks the Netlify file against this one, so they cannot drift apart.

import {
  getAdminPathCached as siteAdminPath,
  getPageCacheCached as sitePageCache,
  getSiteStatusCached as siteStatus,
  isFirstRunComplete as siteFirstRunComplete,
  refreshFirstRunComplete as siteRefreshFirstRunComplete,
} from '@/lib/config/site'
import { validateSession as coreValidateSession } from '@/lib/auth/session-core'
import { isEdgeConfigWritable as envEdgeConfigWritable } from '@/lib/config/env'
import { getMembersConfigCached as membersConfigCached, type MembersConfig } from '@/lib/members/config'
import { validateMemberSession as coreValidateMemberSession } from '@/lib/members/session-core'
import { getModuleRouteTiersCached as moduleRouteTiersCached } from '@/lib/modules/member-extensions'
import type { SiteStatus } from '@prisma/client'
import { prismaGateFailureMeansUnconfigured } from './gate-failure'

/** The parts of an admin user the proxy looks at. */
export type ProxyAdminUser = { id: string; role: { isProtected: boolean } }
/** The parts of a member the proxy looks at. */
export type ProxyMember = { trusted: boolean }
export type ProxyPageCache = {
  enabled: boolean
  ttl: number
  longTtl: number
  vercelEdgeTtl: number
  behindCloudflare: boolean
}
export type ProxyRouteTier = { pathPrefix: string; tier: 'PUBLIC' | 'MEMBER' | 'TRUSTED_MEMBER' }

export const getAdminPathCached: () => Promise<string | null> = siteAdminPath
export const getSiteStatusCached: () => Promise<SiteStatus | null> = siteStatus
export const getPageCacheCached: () => Promise<ProxyPageCache> = sitePageCache
export const isFirstRunComplete: () => Promise<boolean> = siteFirstRunComplete
export const refreshFirstRunComplete: () => Promise<boolean> = siteRefreshFirstRunComplete
export const validateSession: (token: string) => Promise<ProxyAdminUser | null> = coreValidateSession
export const validateMemberSession: (token: string) => Promise<ProxyMember | null> = coreValidateMemberSession
export const getMembersConfigCached: () => Promise<MembersConfig> = membersConfigCached
export const getModuleRouteTiersCached: () => Promise<ProxyRouteTier[]> = moduleRouteTiersCached
export const isEdgeConfigWritable: () => boolean = envEdgeConfigWritable

// The Netlify version needs its own address to call its data route; the Node
// proxy reads the database directly and has no use for it.
export function rememberRequestOrigin(requestOrigin: string): void {
  void requestOrigin
}

// Whether a failed first-run read means "never set up" (show the wizard) rather
// than "database unreachable" (answer 503). Exported from the seam because the
// answer depends on what threw: a Prisma error here, an HTTP failure on Netlify.
export const gateFailureMeansUnconfigured: (err: unknown) => boolean = prismaGateFailureMeansUnconfigured
