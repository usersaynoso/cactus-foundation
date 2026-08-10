import { prisma } from '@/lib/db/prisma'
import { hasPermission } from '@/lib/permissions/check'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { SessionUser } from '@/lib/auth/session'

// ---------------------------------------------------------------------------
// Shared resolver for "whole-page tab" extension points — the shape core uses
// wherever one admin screen hosts tabs contributed by modules (Media, Inbox).
//
// Only a server context can read the stored manifests and check permissions, so
// resolution happens here and the caller decides what to render: the Media page
// renders every panel and lets the client shell switch between them, while the
// Inbox renders only the tab the URL asks for (its panels read query params, so
// they have to be the thing the server rendered). A site with nothing
// contributing simply gets no extra tabs and the host renders as it always did.
// ---------------------------------------------------------------------------

export type ExtensionTab = {
  id: string
  label: string
  order: number
  /** The module's panel. Render it yourself — props are the host's contract. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- module components are resolved by string id from a generated registry
  Component: any
}

type ExtensionPointEntry = { point: string; id: string; permission?: string; label?: string; order?: number }

// The install-time manifest schema strips a tab's `label` until the next deploy
// restores it, so fall back to a tidy label derived from the entry id meanwhile.
function fallbackTabLabel(id: string): string {
  const words = id.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Resolve every module-contributed tab published into `point`, gated by each
 * entry's own permission, sorted by its declared order (unset sorts last).
 */
export async function resolveExtensionTabs(point: string, user: SessionUser | null): Promise<ExtensionTab[]> {
  if (!user) return []
  const components = moduleExtensionPointComponents[point] ?? {}
  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const tabs: ExtensionTab[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== point) continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const Component = components[entry.id]
      if (!Component) continue
      tabs.push({
        id: entry.id,
        label: entry.label ?? fallbackTabLabel(entry.id),
        order: entry.order ?? 999,
        Component,
      })
    }
  }
  return tabs.sort((a, b) => a.order - b.order)
}
