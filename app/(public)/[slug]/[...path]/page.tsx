import { notFound } from 'next/navigation'
import { resolveModulePublicPage } from '@/lib/modules/router.public'
import type { Metadata } from 'next'
import { canonicalPath, withPublicSeo } from '@/lib/seo/public-metadata'
import { resolveBranding } from '@/lib/config/branding'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string; path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, path } = await params
  // Deep module pages are where duplicate-URL trouble actually lives: a product
  // reachable under several categories, a listing with a sort parameter on the
  // end. Each of those needs to name the one address it wants credited.
  const canonical = canonicalPath(slug, path)
  try {
    const branding = await resolveBranding().catch(() => null)
    const resolved = await resolveModulePublicPage(slug, path)
    if (!resolved?.generateMetadata) return withPublicSeo({}, canonical, branding?.name)
    // searchParams must travel too, and the await must sit inside the try: a
    // module metadata failure should cost the title, never the page.
    const moduleMeta = await resolved.generateMetadata({ params: Promise.resolve(resolved.mappedParams), searchParams })
    return withPublicSeo(moduleMeta ?? {}, canonical, branding?.name)
  } catch { return withPublicSeo({}, canonical) }
}

export default async function ModulePublicSubPage({ params, searchParams }: Props) {
  const { slug, path } = await params
  const resolved = await resolveModulePublicPage(slug, path)
  if (!resolved) notFound()
  const { Component, mappedParams } = resolved
  return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
}
