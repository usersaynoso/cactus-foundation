import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermissions, isAdmin } from '@/lib/permissions/check'
import { MEMBERS_ROLE_NAME } from '@/lib/members/default-role'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { TabStrip } from '@/components/admin/TabStrip'
import PeopleListClient from './PeopleListClient'
import PendingApprovalClient from './PendingApprovalClient'
import InvitesClient from './InvitesClient'
import MembersSettingsTab, { type MembersSettingsTabKey } from '../config/MembersSettingsTab'
import RolesClient from '../config/RolesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Users — Admin' }

// Everything about the people on this site lives here: the staff and member
// lists, the approval queue, invites, roles and the registration/account
// settings. Roles and those settings used to be a tab on Settings, which meant
// looking after one person's account and deciding what accounts can do were two
// different screens. /config?tab=users still redirects here.
//
// The page is no longer gated on users.manage alone - somebody who may edit
// roles but not users would have lost the roles editor entirely in the move. Each
// tab carries its own gate instead, and a role with none of the three keys is
// still turned away at the door.

// The pending-approval queue is a work list, not an archive - cap it rather than
// reading the whole table, and say so when there are more waiting.
const PENDING_LIMIT = 200

const SETTINGS_SUB_TABS: { key: MembersSettingsTabKey; label: string }[] = [
  { key: 'registration', label: 'Registration' },
  { key: 'avatars', label: 'Avatars' },
  { key: 'usernames', label: 'Usernames' },
  { key: 'sections', label: 'Account sections' },
  { key: 'access', label: 'Access control' },
]

type ExtensionPointEntry = { point: string; id: string; permission?: string }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function UsersPage({ searchParams }: Props) {
  const currentUser = await getSessionFromCookie()
  if (!currentUser) return null

  // Every gate resolved in a single query rather than a round-trip apiece.
  const granted = await hasPermissions(currentUser, [
    'users.manage',
    'members.list',
    'members.approve',
    'members.invite',
    'members.settings',
    'roles.manage',
  ])

  const canManageUsers = granted['users.manage'] === true
  const canViewMembers = granted['members.list'] === true
  const canApprove = granted['members.approve'] === true
  const canInvite = granted['members.invite'] === true
  const canManageSettings = granted['members.settings'] === true
  const canManageRoles = granted['roles.manage'] === true

  if (!canManageUsers && !canManageSettings && !canManageRoles) {
    return <div className="alert alert-danger">You do not have permission to manage users.</div>
  }

  const sp = await searchParams
  // Each tab is only selectable by a role that may open it, so a hand-typed or
  // stale ?tab= falls through to the first tab this role does have.
  const available = [
    ...(canManageUsers ? ['users'] : []),
    ...(canManageUsers && canApprove ? ['pending-approval'] : []),
    ...(canManageUsers && canInvite ? ['invites'] : []),
    ...(canManageRoles ? ['roles'] : []),
    ...(canManageSettings ? ['settings'] : []),
  ]
  const tab = available.includes(sp.tab ?? '') ? sp.tab! : available[0]!

  const tabItems = [
    ...(canManageUsers ? [{ key: 'users', label: 'Users', href: '?tab=users' }] : []),
    ...(canManageUsers && canApprove ? [{ key: 'pending-approval', label: 'Pending Approval', href: '?tab=pending-approval' }] : []),
    ...(canManageUsers && canInvite ? [{ key: 'invites', label: 'Invites', href: '?tab=invites' }] : []),
    ...(canManageRoles ? [{ key: 'roles', label: 'Roles', href: '?tab=roles' }] : []),
    ...(canManageSettings ? [{ key: 'settings', label: 'Settings', href: '?tab=settings' }] : []),
  ].map((t) => ({ ...t, active: t.key === tab }))

  // Which settings panel, on its own second row - the five of them plus the four
  // above would be one long unreadable strip.
  const sub = (SETTINGS_SUB_TABS.some((s) => s.key === sp.sub) ? sp.sub : 'registration') as MembersSettingsTabKey

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
      </div>

      {tabItems.length > 1 && <TabStrip items={tabItems} />}

      {tab === 'users' && canManageUsers && <UsersTab currentUser={currentUser} canViewMembers={canViewMembers} />}
      {tab === 'pending-approval' && canManageUsers && canApprove && <PendingApprovalTab />}
      {tab === 'invites' && canManageUsers && canInvite && <InvitesClient />}
      {tab === 'roles' && canManageRoles && <RolesTab granted={granted} />}

      {tab === 'settings' && canManageSettings && (
        <>
          <TabStrip
            style={{ marginBottom: '1.5rem' }}
            items={SETTINGS_SUB_TABS.map((s) => ({
              key: s.key,
              label: s.label,
              href: `?tab=settings&sub=${s.key}`,
              active: s.key === sub,
            }))}
          />
          <MembersSettingsTab tab={sub} />
        </>
      )}
    </div>
  )
}

async function UsersTab({ currentUser, canViewMembers }: { currentUser: SessionUser; canViewMembers: boolean }) {
  // Members role is Member-facing, not assignable to staff accounts.
  const roles = await prisma.role.findMany({
    where: { name: { not: MEMBERS_ROLE_NAME } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isProtected: true },
  })

  return (
    <PeopleListClient
      roles={roles}
      currentUserId={currentUser.id}
      currentUserIsAdmin={isAdmin(currentUser)}
      canViewMembers={canViewMembers}
    />
  )
}

async function RolesTab({ granted }: { granted: Record<string, boolean> }) {
  // Explicit selects only - the roles editor needs a role's name, protected flag,
  // permission keys and holder count, not whole rows and every column of every
  // RolePermission join row.
  const [roles, permissions, activeRoleModules, activeModules] = await Promise.all([
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
    prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } }),
  ])

  // Modules can contribute their own per-user role management UI here (e.g.
  // Gazette's Contributor/Author/Editor assignment) via the "core.roles-page"
  // extension point, permission-filtered live from Module.manifest.
  const roleSectionIds: string[] = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== 'core.roles-page') continue
      if (!entry.permission || granted[entry.permission]) roleSectionIds.push(entry.id)
    }
  }
  const roleSectionComponents = moduleExtensionPointComponents['core.roles-page'] ?? {}

  return (
    <>
      <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
        Pick a role on the left, then choose what people with that role are allowed to do.
      </p>
      <RolesClient
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          isProtected: r.isProtected,
          permissionKeys: r.permissions.map((p) => p.permissionKey),
          // Members role is held by site members, not staff - count both so
          // it doesn't misleadingly show "0 people" while actually in use.
          userCount: r._count.users + r._count.members,
        }))}
        permissions={permissions}
        activeModuleNames={activeRoleModules.map((m) => m.name)}
      />
      {roleSectionIds.map((id) => {
        const Section = roleSectionComponents[id]
        return Section ? <Section key={id} /> : null
      })}
    </>
  )
}

async function PendingApprovalTab() {
  // One row over the cap, so the page knows whether more are waiting without
  // spending a second query counting them.
  const rows = await prisma.member.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { createdAt: 'asc' },
    take: PENDING_LIMIT + 1,
    select: { id: true, username: true, email: true, createdAt: true },
  })
  const members = rows.slice(0, PENDING_LIMIT)
  const hasMore = rows.length > PENDING_LIMIT

  return (
    <div>
      <PendingApprovalClient members={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
      {members.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No members awaiting approval.</p>}
      {hasMore && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Showing the {PENDING_LIMIT} longest-waiting members. Deal with these and the rest will appear.
        </p>
      )}
    </div>
  )
}
