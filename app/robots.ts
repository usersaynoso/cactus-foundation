import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = process.env.SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  // No URL yet (pre-setup) — disallow all crawling
  if (!siteUrl) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { hideFromCrawlers: true, status: true },
    })

    const disallowAll = config?.hideFromCrawlers === true || config?.status !== 'live'

    if (disallowAll) {
      return { rules: { userAgent: '*', disallow: '/' } }
    }

    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/_cactus_admin/', '/_setup/', '/_status/', '/api/'],
      },
      sitemap: `${siteUrl}/sitemap.xml`,
    }
  } catch {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
}
