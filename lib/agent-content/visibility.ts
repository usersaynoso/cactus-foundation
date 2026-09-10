import { prisma } from '@/lib/db/prisma'

// The same gate /robots.txt applies, asked once for the agent-content routes.
//
// A site that is hidden from search engines, or not live yet, must not hand a
// language model a tidy Markdown copy of itself through a side door. robots.txt
// says "disallow /" in that state and these three addresses have to agree with
// it, or the one instruction the owner gave is quietly untrue.
export async function agentContentAllowed(): Promise<boolean> {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { hideFromCrawlers: true, status: true },
    })
    if (!config) return false
    return config.hideFromCrawlers !== true && config.status === 'live'
  } catch {
    // No database, or mid-migration: assume hidden. The cost of being wrong the
    // other way is publishing a site the owner has not published.
    return false
  }
}
