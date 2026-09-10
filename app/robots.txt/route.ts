import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  collectModuleRobotsDisallow,
  collectModuleRobotsExtraLines,
  collectModuleRobotsGroups,
} from '@/lib/modules/router.public'
import { serialiseRobotsTxt, type RobotsGroup } from '@/lib/seo/robots-txt'
import { resolveSiteUrl } from '@/lib/seo/site-url'

// /robots.txt, served as a route rather than through Next's robots metadata
// helper. The helper can only emit what its own type has fields for, and two of
// the things a site now says to AI crawlers - a Content-Signal line, a comment
// pointing at /llms.txt - have no field to live in. See lib/seo/robots-txt.ts.
//
// Rendered per request, exactly as the metadata route was: it reads the live
// SiteConfig, so a static copy would leave a fresh install blocked from
// crawlers no matter what the owner unticks until the next deploy.
export const dynamic = 'force-dynamic'

// Core's own closed doors. Every group in the file gets these, not only the
// catch-all one - see mergeBaseDisallow.
const CORE_DISALLOW = ['/cactus-admin/', '/setup/', '/cactus-status/', '/api/']

function textResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * A crawler obeys the MOST SPECIFIC group that names it and ignores every other
 * group in the file - so an agent given rules of its own stops reading the `*`
 * group entirely. A module that says "yes, this one may crawl us" would
 * therefore be handing that one crawler the admin area, the setup wizard and
 * the whole API, which is not what anybody meant by allowing it.
 *
 * So every named group inherits the base disallow list. A group that already
 * shuts the whole site (`Disallow: /`) is left alone: it has said something
 * stricter, and repeating the paths underneath it would only add noise.
 */
function mergeBaseDisallow(group: RobotsGroup, base: string[]): RobotsGroup {
  const existing = group.disallow ?? []
  if (existing.includes('/')) return group
  const merged = [...existing]
  for (const path of base) if (!merged.includes(path)) merged.push(path)
  return { ...group, disallow: merged }
}

export async function GET() {
  const siteUrl = resolveSiteUrl()

  // No URL yet (pre-setup) — disallow all crawling.
  if (!siteUrl) {
    return textResponse(serialiseRobotsTxt({ groups: [{ userAgents: ['*'], disallow: ['/'] }] }))
  }

  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { hideFromCrawlers: true, status: true },
    })

    const disallowAll = config?.hideFromCrawlers === true || config?.status !== 'live'

    if (disallowAll) {
      return textResponse(serialiseRobotsTxt({ groups: [{ userAgents: ['*'], disallow: ['/'] }] }))
    }

    const disallow = [...CORE_DISALLOW]
    try {
      disallow.push(...await collectModuleRobotsDisallow())
    } catch {
      // Module robots entries are best-effort.
    }

    let extraLines: string[] = []
    try {
      extraLines = await collectModuleRobotsExtraLines()
    } catch {
      // Same: a module having a moment costs the file its extra lines, nothing else.
    }

    let namedGroups: RobotsGroup[] = []
    try {
      namedGroups = (await collectModuleRobotsGroups()).map((g) => mergeBaseDisallow(g, disallow))
    } catch {
      // Ditto. Without them the file says what it said before AI crawlers had names.
    }

    return textResponse(serialiseRobotsTxt({
      groups: [
        { userAgents: ['*'], extraLines, allow: ['/'], disallow },
        ...namedGroups,
      ],
      sitemaps: [`${siteUrl}/sitemap.xml`],
    }))
  } catch {
    return textResponse(serialiseRobotsTxt({ groups: [{ userAgents: ['*'], disallow: ['/'] }] }))
  }
}
