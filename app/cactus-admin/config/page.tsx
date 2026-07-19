import { Suspense, type ReactNode } from 'react'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { moduleSettingsTabComponents } from '@/lib/modules/settings-tabs'
import type { HostedSettingsPanels, HostedSettingsSlots } from '@/lib/modules/hosted-settings'
import { buildModuleNavGroups, parseAdminMenuConfig, resolveAdminMenuForEditor, type ModuleManifestNav, type EditorNavSection } from '@/lib/nav/admin-menu'
import ConfigPageClient from './ConfigPageClient'

// A settings tab with `host` set is not a top-level Settings tab. It renders
// inside another module's UI slot named by `host` (e.g. the shop payments tab),
// so a module can own its settings panel while placing it where it belongs.
type ModuleSettingsTab = { id: string; label: string; permission?: string; host?: string }
type ExtensionPointEntry = { point: string; id: string; permission?: string }

export default async function ConfigPage() {
  const [user, activeModules] = await Promise.all([
    getSessionFromCookie(),
    prisma.module.findMany({
      where: { ...INSTALLED_MODULE_WHERE },
      select: { manifest: true },
    }),
  ])

  const manifests = activeModules.map(
    (mod) => mod.manifest as { settingsTabs?: ModuleSettingsTab[]; extensionPoints?: ExtensionPointEntry[] } | null
  )

  // Every permission this page consults - the four core tab gates, plus one per
  // module settings tab and per module-contributed section - resolved in a single
  // batch query. Each used to be its own database round-trip inside a loop.
  const permissionKeys = [
    ...new Set(
      [
        'members.settings',
        'roles.manage',
        'members.email-templates',
        'members.gdpr',
        'config.manage',
        ...manifests.flatMap((m) => (m?.settingsTabs ?? []).map((t) => t.permission)),
        ...manifests.flatMap((m) => (m?.extensionPoints ?? []).map((e) => e.permission)),
      ].filter((k): k is string => !!k)
    ),
  ]
  const granted = user ? await hasPermissions(user, permissionKeys) : {}

  // Two destinations for a module's settings tab: the top-level Settings tab
  // strip (`moduleTabs`), or another module's slot (`hostedSlotPanels`, keyed by
  // the tab's `host`). Hosted panels are resolved and rendered here so the slot
  // host (a client component nested deep in this page) receives ready-made nodes
  // and never has to import the module registry itself.
  //
  // Each panel keeps the `id` and `label` from its manifest entry alongside the
  // rendered node. A host that only drops panels into a section of its own UI has
  // no use for either, but one that gives each panel its own tab cannot work
  // without the label - a tab strip needs it before it renders anything, and
  // there is no getting it back out of a merged node. Both shapes go down; see
  // lib/modules/hosted-settings.ts.
  const moduleTabs: Array<{ id: string; label: string }> = []
  const hostedSlotPanels: HostedSettingsPanels = {}
  for (const manifest of manifests) {
    if (!manifest?.settingsTabs) continue
    for (const t of manifest.settingsTabs) {
      if (t.permission && !granted[t.permission]) continue
      if (t.host) {
        const Panel = moduleSettingsTabComponents[t.id]
        if (Panel) (hostedSlotPanels[t.host] ??= []).push({ id: t.id, label: t.label, node: <Panel key={t.id} /> })
      } else {
        moduleTabs.push({ id: t.id, label: t.label })
      }
    }
  }
  const hostedSettingsSlots: HostedSettingsSlots = {}
  for (const [host, panels] of Object.entries(hostedSlotPanels)) {
    hostedSettingsSlots[host] = <>{panels.map((p) => p.node)}</>
  }

  // "Users" tab (Members settings / Roles / Email templates) - a merge of what
  // used to be standalone /members/settings, /roles and /members/email-templates
  // pages, each still gated by its own original permission.
  const canManageMembersSettings = granted['members.settings'] === true
  const canManageRoles = granted['roles.manage'] === true
  const canManageEmailTemplates = granted['members.email-templates'] === true
  const canViewMembersGdpr = granted['members.gdpr'] === true
  const canManageNav = granted['config.manage'] === true

  let rolesData: { roles: Array<{ id: string; name: string; isProtected: boolean; permissionKeys: string[]; userCount: number }>; permissions: Array<{ key: string; description: string | null; module: string | null }>; activeModuleNames: string[] } | null = null
  let roleExtensions: ReactNode = null
  if (canManageRoles && user) {
    // Explicit selects only - the roles editor needs a role's name, protected flag,
    // permission keys and holder count, not whole rows and every column of every
    // RolePermission join row.
    const [roles, permissions, activeRoleModules] = await Promise.all([
      prisma.role.findMany({
        select: {
          id: true,
          name: true,
          isProtected: true,
          permissions: { select: { permissionKey: true } },
          _count: { select: { users: true, members: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.permission.findMany({
        select: { key: true, description: true, module: true },
        orderBy: { key: 'asc' },
      }),
      prisma.module.findMany({ where: { status: 'active' }, select: { name: true } }),
    ])
    rolesData = {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isProtected: r.isProtected,
        permissionKeys: r.permissions.map((p) => p.permissionKey),
        // Members role is held by site members, not staff - count both so
        // it doesn't misleadingly show "0 people" while actually in use.
        userCount: r._count.users + r._count.members,
      })),
      permissions,
      activeModuleNames: activeRoleModules.map((m) => m.name),
    }

    // Modules can contribute their own per-user role management UI here (e.g.
    // Gazette's Contributor/Author/Editor assignment) via the "core.roles-page"
    // extension point, permission-filtered live from Module.manifest.
    const roleSectionIds: string[] = []
    for (const manifest of manifests) {
      if (!manifest?.extensionPoints) continue
      for (const entry of manifest.extensionPoints) {
        if (entry.point !== 'core.roles-page') continue
        if (!entry.permission || granted[entry.permission]) {
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
    for (const manifest of manifests) {
      if (!manifest?.extensionPoints) continue
      for (const entry of manifest.extensionPoints) {
        if (entry.point !== 'members.gdpr-entry') continue
        if (!entry.permission || granted[entry.permission]) {
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

  // Settings > Navigation editor data. Gated by config.manage (same key that guards
  // the rest of System settings). The editor lists every menu item - core and every
  // module link, unfiltered by permission - so an admin can set rules on all of them.
  let navEditorData: {
    sections: EditorNavSection[]
    roles: Array<{ id: string; name: string; isProtected: boolean }>
  } | null = null
  if (canManageNav && user) {
    const [siteConfigRow, navRoles] = await Promise.all([
      prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { adminMenuConfig: true } }),
      prisma.role.findMany({ select: { id: true, name: true, isProtected: true }, orderBy: { name: 'asc' } }),
    ])
    const navManifests = activeModules.map((mod) => mod.manifest as ModuleManifestNav | null)
    const moduleGroups = buildModuleNavGroups(navManifests, { canSee: () => true })
    navEditorData = {
      sections: resolveAdminMenuForEditor(moduleGroups, parseAdminMenuConfig(siteConfigRow?.adminMenuConfig)),
      roles: navRoles,
    }
  }

  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}>
      <ConfigPageClient
        moduleTabs={moduleTabs}
        hostedSettingsSlots={hostedSettingsSlots}
        hostedSettingsPanels={hostedSlotPanels}
        canManageMembersSettings={canManageMembersSettings}
        canManageRoles={canManageRoles}
        canManageEmailTemplates={canManageEmailTemplates}
        canViewMembersGdpr={canViewMembersGdpr}
        canManageNav={canManageNav}
        navEditorData={navEditorData}
        rolesData={rolesData}
        roleExtensions={roleExtensions}
        membersGdprExtensions={membersGdprExtensions}
      />
    </Suspense>
  )
}
