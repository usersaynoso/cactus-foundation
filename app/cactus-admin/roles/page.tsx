import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, CORE_PERMISSIONS } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import RolesClient from './RolesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Roles — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function RolesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!await hasPermission(user, 'roles.manage')) {
    return <div className="alert alert-danger">You do not have permission to manage roles.</div>
  }

  const [roles, permissions, activeModules, extensionModules] = await Promise.all([
    prisma.role.findMany({
      include: {
        permissions: { select: { permissionKey: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    prisma.module.findMany({ where: { status: 'active' }, select: { name: true } }),
    prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } }),
  ])

  // Modules can contribute their own per-user role management UI here (e.g.
  // Gazette's Contributor/Author/Editor assignment) via the "core.roles-page"
  // extension point, permission-filtered live from Module.manifest.
  const roleSectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'core.roles-page') continue
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        roleSectionIds.push(entry.id)
      }
    }
  }
  const roleSectionComponents = moduleExtensionPointComponents['core.roles-page'] ?? {}

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles & Permissions</h1>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
            Pick a role on the left, then choose what people with that role are allowed to do.
          </p>
        </div>
      </div>
      <RolesClient
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          isProtected: r.isProtected,
          permissionKeys: r.permissions.map((p) => p.permissionKey),
          userCount: r._count.users,
        }))}
        permissions={permissions}
        activeModuleNames={activeModules.map((m) => m.name)}
      />
      {roleSectionIds.map((id) => {
        const Section = roleSectionComponents[id]
        return Section ? <Section key={id} /> : null
      })}
    </div>
  )
}
