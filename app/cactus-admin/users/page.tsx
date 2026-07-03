import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermission, isAdmin } from '@/lib/permissions/check'
import { MEMBERS_ROLE_NAME } from '@/lib/members/default-role'
import { TabStrip } from '@/components/admin/TabStrip'
import PeopleListClient from './PeopleListClient'
import PendingApprovalClient from './PendingApprovalClient'
import InvitesClient from './InvitesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Users — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function UsersPage({ searchParams }: Props) {
  const currentUser = await getSessionFromCookie()
  if (!currentUser) return null
  if (!await hasPermission(currentUser, 'users.manage')) {
    return <div className="alert alert-danger">You do not have permission to manage users.</div>
  }

  const [canViewMembers, canApprove, canInvite] = await Promise.all([
    hasPermission(currentUser, 'members.list'),
    hasPermission(currentUser, 'members.approve'),
    hasPermission(currentUser, 'members.invite'),
  ])

  const sp = await searchParams
  const tab = sp.tab === 'pending-approval' && canApprove ? 'pending-approval'
    : sp.tab === 'invites' && canInvite ? 'invites'
    : 'users'

  const tabItems = [
    { key: 'users', label: 'Users', href: '?tab=users' },
    ...(canApprove ? [{ key: 'pending-approval', label: 'Pending Approval', href: '?tab=pending-approval' }] : []),
    ...(canInvite ? [{ key: 'invites', label: 'Invites', href: '?tab=invites' }] : []),
  ].map((t) => ({ ...t, active: t.key === tab }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
      </div>

      {tabItems.length > 1 && <TabStrip items={tabItems} />}

      {tab === 'users' && <UsersTab currentUser={currentUser} canViewMembers={canViewMembers} />}
      {tab === 'pending-approval' && canApprove && <PendingApprovalTab />}
      {tab === 'invites' && canInvite && <InvitesClient />}
    </div>
  )
}

async function UsersTab({ currentUser, canViewMembers }: { currentUser: SessionUser; canViewMembers: boolean }) {
  // Members role is Member-facing, not assignable to staff accounts.
  const roles = await prisma.role.findMany({ where: { name: { not: MEMBERS_ROLE_NAME } }, orderBy: { name: 'asc' } })

  return (
    <PeopleListClient
      roles={roles.map((r) => ({ id: r.id, name: r.name, isProtected: r.isProtected }))}
      currentUserId={currentUser.id}
      currentUserIsAdmin={isAdmin(currentUser)}
      canViewMembers={canViewMembers}
    />
  )
}

async function PendingApprovalTab() {
  const members = await prisma.member.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true, email: true, createdAt: true },
  })

  return (
    <div>
      <PendingApprovalClient members={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
      {members.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No members awaiting approval.</p>}
    </div>
  )
}
