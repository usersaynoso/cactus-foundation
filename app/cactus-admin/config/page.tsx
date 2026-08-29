import { Suspense, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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

// Roles and the member/registration settings used to be the "Users" tab here.
// They now live on the Users screen alongside the people they apply to, so any
// link still pointing at the old tab (a bookmark, a command-palette entry from a
// stale bundle, an older module) is sent on rather than quietly showing General.
const MOVED_TO_USERS_SUBS = new Set(['registration', 'avatars', 'usernames', 'sections', 'access', 'roles'])

export default async function ConfigPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  if (sp.tab === 'users' || (sp.sub && MOVED_TO_USERS_SUBS.has(sp.sub))) {
    const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
    const target = sp.sub === 'roles' ? 'roles'
      : sp.sub && MOVED_TO_USERS_SUBS.has(sp.sub) ? `settings&sub=${sp.sub}`
      : 'users'
    return redirect(`/${adminPath}/users?tab=${target}`)
  }

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

  // Every permission this page consults - the core tab gates, plus one per
  // module settings tab and per module-contributed section - resolved in a single
  // batch query. Each used to be its own database round-trip inside a loop.
  const permissionKeys = [
    ...new Set(
      [
        'emails.templates',
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

  const canManageEmailTemplates = granted['emails.templates'] === true
  const canViewMembersGdpr = granted['members.gdpr'] === true
  const canManageNav = granted['config.manage'] === true
  // Same key as the navigation editor: Schedules is site-wide plumbing, not a per-section
  // setting, and the permission batch above already resolved it.
  const canManageSchedules = granted['config.manage'] === true

  // Modules can add their own backup cards under Settings > Backup (e.g. a
  // module running an external service with its own database) via the
  // "core.backup-page" extension point - the same generic mechanism the roles
  // page uses over on Users.
  const backupSectionIds: string[] = []
  for (const manifest of manifests) {
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'core.backup-page') continue
      if (!entry.permission || granted[entry.permission]) {
        backupSectionIds.push(entry.id)
      }
    }
  }
  const backupSectionComponents = moduleExtensionPointComponents['core.backup-page'] ?? {}
  const backupExtensions: ReactNode = (
    <>
      {backupSectionIds.map((id) => {
        const Card = backupSectionComponents[id]
        return Card ? <Card key={id} /> : null
      })}
    </>
  )

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
    // The Inbox only exists where a module fills it. Unfiltered by permission here,
    // to match the rest of the editor: an admin sets rules on every item that this
    // site has, whether or not their own role could open it.
    const availableCoreItemIds = new Set<string>()
    const hasInboxTab = activeModules.some((mod) =>
      ((mod.manifest as { extensionPoints?: Array<{ point: string }> } | null)?.extensionPoints ?? [])
        .some((e) => e.point === 'core.inbox-tabs')
    )
    if (hasInboxTab) availableCoreItemIds.add('inbox')
    navEditorData = {
      sections: resolveAdminMenuForEditor(moduleGroups, parseAdminMenuConfig(siteConfigRow?.adminMenuConfig), availableCoreItemIds),
      roles: navRoles,
    }
  }

  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}>
      <ConfigPageClient
        moduleTabs={moduleTabs}
        hostedSettingsSlots={hostedSettingsSlots}
        hostedSettingsPanels={hostedSlotPanels}
        canManageEmailTemplates={canManageEmailTemplates}
        canViewMembersGdpr={canViewMembersGdpr}
        canManageNav={canManageNav}
        canManageSchedules={canManageSchedules}
        navEditorData={navEditorData}
        membersGdprExtensions={membersGdprExtensions}
        backupExtensions={backupExtensions}
      />
    </Suspense>
  )
}
