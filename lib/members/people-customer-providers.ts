import { prisma } from '@/lib/db/prisma'
import type { SessionUser } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleServerExtensionPointComponents } from '@/lib/modules/extension-points.server'
import type { PeopleCustomerProvider } from '@/lib/members/people-customers'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

const POINT = 'core.people-customers'

/**
 * The providers this viewer may use, from modules that are actually installed.
 * The generated map holds every module the build compiled; a module switched
 * off since must not keep answering, so the live manifests decide.
 */
export async function peopleCustomerProviders(user: SessionUser): Promise<PeopleCustomerProvider[]> {
  const map = moduleServerExtensionPointComponents[POINT] as Record<string, PeopleCustomerProvider> | undefined
  if (!map || Object.keys(map).length === 0) return []

  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const entries: ExtensionPointEntry[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point === POINT && map[entry.id]) entries.push(entry)
    }
  }
  if (entries.length === 0) return []

  const keys = [...new Set(entries.map((e) => e.permission).filter((p): p is string => !!p))]
  const granted = keys.length > 0 ? await hasPermissions(user, keys) : {}
  return entries
    .filter((e) => !e.permission || granted[e.permission] === true)
    .map((e) => map[e.id])
    .filter((p): p is PeopleCustomerProvider => !!p)
}
