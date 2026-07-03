import { Suspense, type ReactNode } from 'react'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { MEMBERS_ROLE_NAME } from '@/lib/members/default-role'
import ConfigPageClient from './ConfigPageClient'

type ModuleSettingsTab = { id: string; label: string; permission?: string }
type ExtensionPointEntry = { point: string; id: string; permission?: string }

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

  // "Users" tab (Members settings / Roles / Email templates) - a merge of what
  // used to be standalone /members/settings, /roles and /members/email-templates
  // pages, each still gated by its own original permission.
  const [canManageMembersSettings, canManageRoles, canManageEmailTemplates, canViewMembersGdpr] = await Promise.all([
    user ? hasPermission(user, 'members.settings') : false,
    user ? hasPermission(user, 'roles.manage') : false,
    user ? hasPermission(user, 'members.email-templates') : false,
    user ? hasPermission(user, 'members.gdpr') : false,
  ])

  let rolesData: { roles: Array<{ id: string; name: string; isProtected: boolean; permissionKeys: string[]; userCount: number }>; permissions: Array<{ key: string; description: string | null; module: string | null }>; activeModuleNames: string[] } | null = null
  let roleExtensions: ReactNode = null
  if (canManageRoles && user) {
    const [roles, permissions, activeRoleModules] = await Promise.all([
      prisma.role.findMany({
        // Members role is Member-facing, not a staff role - it has no bearing
        // on the admin panel, so it doesn't belong in this list.
        where: { name: { not: MEMBERS_ROLE_NAME } },
        include: {
          permissions: { select: { permissionKey: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.permission.findMany({ orderBy: { key: 'asc' } }),
      prisma.module.findMany({ where: { status: 'active' }, select: { name: true } }),
    ])
    rolesData = {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isProtected: r.isProtected,
        permissionKeys: r.permissions.map((p) => p.permissionKey),
        userCount: r._count.users,
      })),
      permissions,
      activeModuleNames: activeRoleModules.map((m) => m.name),
    }

    // Modules can contribute their own per-user role management UI here (e.g.
    // Gazette's Contributor/Author/Editor assignment) via the "core.roles-page"
    // extension point, permission-filtered live from Module.manifest.
    const roleSectionIds: string[] = []
    for (const mod of activeModules) {
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
    roleExtensions = (
      <>
        {roleSectionIds.map((id) => {
          const Section = roleSectionComponents[id]
          return Section ? <Section key={id} /> : null
        })}
      </>
    )
  }

  let membersGdprExtensions: ReactNode = null
  if (canViewMembersGdpr && user) {
    const entryIds: string[] = []
    for (const mod of activeModules) {
      const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
      if (!manifest?.extensionPoints) continue
      for (const entry of manifest.extensionPoints) {
        if (entry.point !== 'members.gdpr-entry') continue
        if (!entry.permission || await hasPermission(user, entry.permission)) {
          entryIds.push(entry.id)
        }
      }
    }
    const entryComponents = moduleExtensionPointComponents['members.gdpr-entry'] ?? {}
    membersGdprExtensions = (
      <>
        {entryIds.map((id) => {
          const Entry = entryComponents[id]
          return Entry ? <Entry key={id} /> : null
        })}
      </>
    )
  }

  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}>
      <ConfigPageClient
        moduleTabs={moduleTabs}
        canManageMembersSettings={canManageMembersSettings}
        canManageRoles={canManageRoles}
        canManageEmailTemplates={canManageEmailTemplates}
        canViewMembersGdpr={canViewMembersGdpr}
        rolesData={rolesData}
        roleExtensions={roleExtensions}
        membersGdprExtensions={membersGdprExtensions}
      />
    </Suspense>
  )
}
