import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, CORE_PERMISSIONS } from '@/lib/permissions/check'
import RolesClient from './RolesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Roles — Admin' }

export default async function RolesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!await hasPermission(user, 'roles.manage')) {
    return <div className="alert alert-danger">You do not have permission to manage roles.</div>
  }

  const [roles, permissions, activeModules] = await Promise.all([
    prisma.role.findMany({
      include: { permissions: { select: { permissionKey: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    prisma.module.findMany({ where: { status: 'active' }, select: { name: true } }),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Roles & Permissions</h1>
      </div>
      <RolesClient
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          isProtected: r.isProtected,
          permissionKeys: r.permissions.map((p) => p.permissionKey),
        }))}
        permissions={permissions}
        activeModuleNames={activeModules.map((m) => m.name)}
      />
    </div>
  )
}
