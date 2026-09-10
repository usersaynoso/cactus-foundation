import { resolveModulePage } from '@/lib/modules/router'
import { getInstalledModules } from '@/lib/modules/live-status'
import { resolveModulePageTitle, type ModuleManifestNav } from '@/lib/nav/admin-menu'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ module: string; path?: string[] }>
  searchParams: Promise<Record<string, string>>
}

// Every module admin screen is rendered through THIS file, so Next only ever reads
// metadata from here - a `export const metadata` inside the module's own page was
// silently ignored, and every one of them inherited the root default. That is the
// whole reason a browser's history was thirty identical site names.
//
// The module's own metadata still wins where it exists (it can name the record
// being edited); otherwise the sidebar link the screen sits under supplies a
// section name. Anything that throws here degrades to the fallback title rather
// than taking the screen down - a tab name is never worth a 500.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { module, path } = await params
  const segments = path ?? []

  let resolved: Awaited<ReturnType<typeof resolveModulePage>> = null
  try {
    resolved = await resolveModulePage(module, segments)
  } catch {
    resolved = null
  }

  if (resolved?.generateMetadata) {
    try {
      const meta = (await resolved.generateMetadata({
        params: Promise.resolve(resolved.mappedParams),
        searchParams,
      })) as Metadata | undefined
      if (meta?.title) return meta
    } catch {
      // fall through to the static export, then the nav label
    }
  }

  const staticTitle = (resolved?.metadata as Metadata | undefined)?.title
  if (staticTitle) return { title: staticTitle }

  // getInstalledModules is React-cached and the admin layout has already asked for
  // it on this same request, so the fallback costs no extra query.
  let manifests: Array<ModuleManifestNav | null> = []
  try {
    const installed = await getInstalledModules()
    manifests = installed.map((m) => (m.manifest ?? null) as ModuleManifestNav | null)
  } catch {
    manifests = []
  }

  return { title: `${resolveModulePageTitle(module, segments, manifests)} — Admin` }
}

export default async function ModulePage({ params, searchParams }: Props) {
  const { module, path } = await params
  const resolved = await resolveModulePage(module, path ?? [])
  if (!resolved) notFound()
  const { Component, mappedParams } = resolved
  return <Component params={Promise.resolve(mappedParams)} searchParams={searchParams} />
}
