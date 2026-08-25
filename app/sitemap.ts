import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { collectModuleSitemapEntries } from '@/lib/modules/router.public'
import { escapeSitemapEntries } from '@/lib/seo/sitemap-xml'

// Reads live published pages + module entries, so it must render per request.
// Left static, the sitemap freezes at whatever existed at build time and never
// picks up newly published pages.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!siteUrl) return []

  const base: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ]

  try {
    const pages = await prisma.infoPage.findMany({
      where: { status: 'published' },
      select: { slug: true, updatedAt: true },
    })
    base.push(
      ...pages.map((p) => ({
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
