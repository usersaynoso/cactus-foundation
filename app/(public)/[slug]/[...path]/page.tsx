import { notFound } from 'next/navigation'
import { resolveModulePublicPage } from '@/lib/modules/router'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string; path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path } = await params
  const resolved = await resolveModulePublicPage(slug, path)
  if (!resolved?.generateMetadata) return {}
  return resolved.generateMetadata({ params: Promise.resolve(resolved.mappedParams) })
}

export default async function ModulePublicSubPage({ params, searchParams }: Props) {
  const { slug, path } = await params
  const resolved = await resolveModulePublicPage(slug, path)
  if (!resolved) notFound()
  const { Component, mappedParams } = resolved
  return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
}
