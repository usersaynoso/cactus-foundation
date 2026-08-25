import { notFound } from 'next/navigation'
import { resolveModulePublicPage } from '@/lib/modules/router.public'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string; path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, path } = await params
  try {
    const resolved = await resolveModulePublicPage(slug, path)
    if (!resolved?.generateMetadata) return {}
    // searchParams must travel too, and the await must sit inside the try: a
    // module metadata failure should cost the title, never the page.
    return await resolved.generateMetadata({ params: Promise.resolve(resolved.mappedParams), searchParams })
  } catch { return {} }
}

export default async function ModulePublicSubPage({ params, searchParams }: Props) {
  const { slug, path } = await params
  const resolved = await resolveModulePublicPage(slug, path)
  if (!resolved) notFound()
  const { Component, mappedParams } = resolved
  return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
}
