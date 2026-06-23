import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'

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
    return [
      ...base,
      ...pages.map((p) => ({
        url: `${siteUrl}/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    ]
  } catch {
    return base
  }
}
