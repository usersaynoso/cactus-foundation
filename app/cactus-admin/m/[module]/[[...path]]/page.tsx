import { resolveModulePage } from '@/lib/modules/router'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ module: string; path?: string[] }>
  searchParams: Promise<Record<string, string>>
}

export default async function ModulePage({ params, searchParams }: Props) {
  const { module, path } = await params
  const resolved = await resolveModulePage(module, path ?? [])
  if (!resolved) notFound()
  const { Component, mappedParams } = resolved
  return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
}
