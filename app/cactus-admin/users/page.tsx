import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermissions, isAdmin } from '@/lib/permissions/check'
import { MEMBERS_ROLE_NAME } from '@/lib/members/default-role'
import { TabStrip } from '@/components/admin/TabStrip'
import PeopleListClient from './PeopleListClient'
import PendingApprovalClient from './PendingApprovalClient'
import InvitesClient from './InvitesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Users — Admin' }

// The pending-approval queue is a work list, not an archive - cap it rather than
// reading the whole table, and say so when there are more waiting.
const PENDING_LIMIT = 200

type Props = { searchParams: Promise<Record<string, string>> }

export default async function UsersPage({ searchParams }: Props) {
  const currentUser = await getSessionFromCookie()
  if (!currentUser) return null

  // All four gates resolved in a single query rather than a round-trip apiece.
  const granted = await hasPermissions(currentUser, [
    'users.manage',
    'members.list',
    'members.approve',
    'members.invite',
  ])
  if (!granted['users.manage']) {
    return <div className="alert alert-danger">You do not have permission to manage users.</div>
  }

  const canViewMembers = granted['members.list'] === true
  const canApprove = granted['members.approve'] === true
  const canInvite = granted['members.invite'] === true

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
