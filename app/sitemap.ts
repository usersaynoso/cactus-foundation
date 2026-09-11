import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { collectModuleSitemapEntries } from '@/lib/modules/router.public'
import { escapeSitemapEntries } from '@/lib/seo/sitemap-xml'
import { resolveSiteUrl } from '@/lib/seo/site-url'

// Reads live published pages + module entries, so it must render per request.
// Left static, the sitemap freezes at whatever existed at build time and never
// picks up newly published pages.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl()

  if (!siteUrl) return []

  const base: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ]

  try {
    const [pages, config] = await Promise.all([
      prisma.infoPage.findMany({
        where: { status: 'published' },
        select: { id: true, slug: true, updatedAt: true },
      }),
      prisma.siteConfig
        .findUnique({ where: { id: 'singleton' }, select: { homepageId: true } })
        .catch(() => null),
    ])
    base.push(
      // The page assigned to the homepage is already listed above as the bare
      // domain, and its own /slug now redirects there. Listing both asked a
      // crawler to index one address twice.
      ...pages.filter((p) => p.id !== config?.homepageId).map((p) => ({
        url: `${siteUrl}/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    )
  } catch {
    // InfoPages unavailable — still try module entries below.
  }

  try {
    base.push(...await collectModuleSitemapEntries(siteUrl))
  } catch {
    // Module sitemap entries are best-effort.
  }

  // Last thing before it becomes XML. Next pastes each url into <loc> unescaped,
  // so a single raw `&` from a query string would end the document there and
  // lose every entry below it - see lib/seo/sitemap-xml.ts. Modules hand their
  // URLs over raw; escaping is this file's job, once, for all of them.
  return escapeSitemapEntries(base)
}
