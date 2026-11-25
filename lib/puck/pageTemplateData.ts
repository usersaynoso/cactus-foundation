import { getSiteConfig } from '@/lib/config/site'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { prisma } from '@/lib/db/prisma'
import { needsTemplateData, resolveTemplateData, type TemplateContext } from '@/lib/puck/resolveTemplateData'

// The Site blocks (Menu, Site Header, Site Logo, Copyright, Sign In button) are
// offered in the page editor and in the page, Account Login and Account Login
// Modal layout editors, but they only get their menu, logo and site name from
// resolveTemplateData - which only the header, footer and status pages ran. On a
// published page they drew "Menu - configure in editor", no logo and "My Site".
//
// RSC-only: reads the session cookies and the database.

// The same context app/(public)/layout.tsx hands the header and footer: the
// site's name and logo, and who is looking (for menu audiences).
async function templateContext(): Promise<TemplateContext> {
  const [config, user, member] = await Promise.all([
    getSiteConfig().catch(() => null),
    getSessionFromCookie().catch(() => null),
    getMemberFromCookie().catch(() => null),
  ])
  const lookup = (id: string | null | undefined) =>
    id ? prisma.media.findUnique({ where: { id }, select: { url: true } }).catch(() => null) : Promise.resolve(null)
  const [logo, logoDark] = await Promise.all([lookup(config?.logoMediaId), lookup(config?.logoDarkMediaId)])
  return {
    siteName: config?.siteName ?? '',
    logoUrl: logo?.url ?? null,
    logoDarkUrl: logoDark?.url ?? null,
    isLoggedIn: !!user,
    adminPath: config?.adminPath ?? '',
    viewer: { isAuthenticated: !!user || !!member, isAdmin: !!user },
  }
}

/**
 * A resolver for the Puck trees one render draws. Data without any Site block is
 * handed back exactly as it came - no copy made, nothing looked up - and the
 * context is fetched at most once however many trees need it. A failure to
 * resolve renders the data as stored, which is what every caller did before.
 */
export function templateDataResolver(): <T>(data: T) => Promise<T> {
  let ctx: Promise<TemplateContext> | null = null
  return async <T,>(data: T): Promise<T> => {
    if (!data || !needsTemplateData(data)) return data
    try {
      return (await resolveTemplateData(data, await (ctx ??= templateContext()))) as unknown as T
    } catch {
      return data
    }
  }
}
