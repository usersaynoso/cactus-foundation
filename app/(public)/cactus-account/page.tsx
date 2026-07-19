import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getMemberFromCookie } from '@/lib/members/session'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string }

export default async function AccountIndexPage() {
  const member = await getMemberFromCookie()
  if (!member) return null // layout already redirects; defensive only

  // Modules can append content here via the "members.account-section"
  // extension point - unlike core.roles-page, there is no permission gate to
  // check since members have no permission keys.
  const extensionModules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })
  const sectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point === 'members.account-section') sectionIds.push(entry.id)
    }
  }
  const sectionComponents = moduleExtensionPointComponents['members.account-section'] ?? {}

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-2)', color: 'var(--color-text)' }}>
        Hi, {member.displayName || member.username}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 var(--space-6)' }}>
        Manage your profile, security, and account settings using the tabs above.
      </p>
      {sectionIds.map((id) => {
        const Section = sectionComponents[id]
        return Section ? <Section key={id} /> : null
      })}
    </div>
  )
}
