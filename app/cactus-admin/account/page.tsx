import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import AccountPageClient from './AccountPageClient'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function AccountPage() {
  // Modules can append per-admin sections here (e.g. SMS login codes) via the
  // generic "admins.account-section" extension point, permission-filtered live
  // from Module.manifest - this page knows the point name only, never any
  // module name.
  const [user, extensionModules] = await Promise.all([
    getSessionFromCookie(),
    prisma.module.findMany({
      where: { ...INSTALLED_MODULE_WHERE },
      select: { manifest: true },
    }),
  ])

  const sectionEntries: ExtensionPointEntry[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point === 'admins.account-section') sectionEntries.push(entry)
    }
  }

  // One batch query for every section's permission, rather than a round-trip each.
  const permissionKeys = [
    ...new Set(sectionEntries.map((e) => e.permission).filter((p): p is string => !!p)),
  ]
  const granted = user ? await hasPermissions(user, permissionKeys) : {}

  const sectionIds = user
    ? sectionEntries.filter((e) => !e.permission || granted[e.permission]).map((e) => e.id)
    : []
  const sectionComponents = moduleExtensionPointComponents['admins.account-section'] ?? {}

  return (
    <AccountPageClient
      extensionSections={sectionIds.map((id) => {
        const Section = sectionComponents[id]
        return Section ? <Section key={id} /> : null
      })}
    />
  )
}
