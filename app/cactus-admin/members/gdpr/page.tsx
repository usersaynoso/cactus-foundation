import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import GdprClient from './GdprClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Members GDPR — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function MembersGdprPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.gdpr'))) {
    return <div className="alert alert-danger">You do not have permission to view GDPR data.</div>
  }

  const extensionModules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  const entryIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'members.gdpr-entry') continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) {
        entryIds.push(entry.id)
      }
    }
  }
  const entryComponents = moduleExtensionPointComponents['members.gdpr-entry'] ?? {}

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Members GDPR</h1>
      </div>
      <GdprClient />
      {entryIds.map((id) => {
        const Entry = entryComponents[id]
        return Entry ? <Entry key={id} /> : null
      })}
    </div>
  )
}
