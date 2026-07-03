import { Suspense } from 'react'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import ConfigPageClient from './ConfigPageClient'

type ModuleSettingsTab = { id: string; label: string; permission?: string }

export default async function ConfigPage() {
  const user = await getSessionFromCookie()
  const activeModules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })

  const moduleTabs: Array<{ id: string; label: string }> = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { settingsTabs?: ModuleSettingsTab[] } | null
    if (!manifest?.settingsTabs) continue
    for (const t of manifest.settingsTabs) {
      if (!t.permission || (user && await hasPermission(user, t.permission))) {
        moduleTabs.push({ id: t.id, label: t.label })
      }
    }
  }

  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}>
      <ConfigPageClient moduleTabs={moduleTabs} />
    </Suspense>
  )
}
