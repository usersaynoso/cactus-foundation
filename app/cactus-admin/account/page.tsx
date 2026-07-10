import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import AccountPageClient from './AccountPageClient'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function AccountPage() {
  // Modules can append per-admin sections here (e.g. SMS login codes) via the
  // generic "admins.account-section" extension point, permission-filtered live
  // from Module.manifest - this page knows the point name only, never any
  // module name.
  const user = await getSessionFromCookie()
  const extensionModules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  const sectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'admins.account-section') continue
      if (!user) continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) {
        sectionIds.push(entry.id)
      }
    }
  }
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
