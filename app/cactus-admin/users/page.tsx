import Link from 'next/link'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermissions, isAdmin } from '@/lib/permissions/check'
import { MEMBERS_ROLE_NAME } from '@/lib/members/default-role'
import { getMembersConfig } from '@/lib/members/config'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { TabStrip } from '@/components/admin/TabStrip'
import { AdminTooltip } from '@/components/admin/Tooltip'
import { SettingsIcon } from '@/components/admin/notification-icons'
import PeopleListClient from './PeopleListClient'
import { parsePeopleFilters, type PeopleFilters } from './people-list-filters'
import PendingApprovalClient from './PendingApprovalClient'
import InvitesClient from './InvitesClient'
import RolesClient from '../config/RolesClient'
import { adminScreenTitle } from '@/lib/nav/admin-menu'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { tab } = await searchParams
  return { title: adminScreenTitle('Users', tab) }
}

// The people on this site: the staff and member lists, the approval queue,
// invites and roles. The registration/account settings that apply to all of them
// live under Settings › Users, reached from the cog beside the heading; the old
// ?tab=settings links are sent on there.
//
// The page is not gated on users.manage alone - somebody who may edit roles but
// not users would lose the roles editor. Each tab carries its own gate instead,
// and a role with neither key is turned away at the door.

// The pending-approval queue is a work list, not an archive - cap it rather than
// reading the whole table, and say so when there are more waiting.
const PENDING_LIMIT = 200

type ExtensionPointEntry = { point: string; id: string; permission?: string }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function UsersPage({ searchParams }: Props) {
  const currentUser = await getSessionFromCookie()
  if (!currentUser) return null

  const sp = await searchParams
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
  if (sp.tab === 'settings') {
    const sub = sp.sub ? `&sub=${encodeURIComponent(sp.sub)}` : ''
    return redirect(`/${adminPath}/config?tab=users${sub}`)
  }

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

  if (!canManageUsers && !canManageRoles) {
    return <div className="alert alert-danger">You do not have permission to manage users.</div>
  }

  // Each tab is only selectable by a role that may open it, so a hand-typed or
  // stale ?tab= falls through to the first tab this role does have.
  const available = [
    ...(canManageUsers ? ['users'] : []),
    ...(canManageUsers && canApprove ? ['pending-approval'] : []),
    ...(canManageUsers && canInvite ? ['invites'] : []),
    ...(canManageRoles ? ['roles'] : []),
  ]
  const tab = available.includes(sp.tab ?? '') ? sp.tab! : available[0]!

  const tabItems = [
    ...(canManageUsers ? [{ key: 'users', label: 'Users', href: '?tab=users' }] : []),
    ...(canManageUsers && canApprove ? [{ key: 'pending-approval', label: 'Pending Approval', href: '?tab=pending-approval' }] : []),
    ...(canManageUsers && canInvite ? [{ key: 'invites', label: 'Invites', href: '?tab=invites' }] : []),
    ...(canManageRoles ? [{ key: 'roles', label: 'Roles', href: '?tab=roles' }] : []),
  ].map((t) => ({ ...t, active: t.key === tab }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        {canManageSettings && (
          <AdminTooltip body="User settings">
            <Link href={`/${adminPath}/config?tab=users`} className="admin-icon-btn" aria-label="User settings">
              {SettingsIcon}
            </Link>
          </AdminTooltip>
        )}
      </div>

      {tabItems.length > 1 && <TabStrip items={tabItems} />}

      {tab === 'users' && canManageUsers && <UsersTab currentUser={currentUser} canViewMembers={canViewMembers} initialFilters={parsePeopleFilters(sp)} />}
      {tab === 'pending-approval' && canManageUsers && canApprove && <PendingApprovalTab />}
      {tab === 'invites' && canManageUsers && canInvite && <InvitesClient />}
      {tab === 'roles' && canManageRoles && <RolesTab granted={granted} />}
    </div>
  )
}

async function UsersTab({ currentUser, canViewMembers, initialFilters }: { currentUser: SessionUser; canViewMembers: boolean; initialFilters: PeopleFilters }) {
  // Members role is Member-facing, not assignable to staff accounts.
  const [roles, membersConfig] = await Promise.all([
    prisma.role.findMany({
      where: { name: { not: MEMBERS_ROLE_NAME } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isProtected: true },
    }),
    getMembersConfig(),
  ])

  return (
    <PeopleListClient
      roles={roles}
      currentUserId={currentUser.id}
      currentUserIsAdmin={isAdmin(currentUser)}
      canViewMembers={canViewMembers}
      initialFilters={initialFilters}
      displayNamesOn={membersConfig.registrationCollectDisplayName}
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
