import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermission, isAdmin } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import Link from 'next/link'
import { TabStrip } from '@/components/admin/TabStrip'
import UserActions from './UserActions'
import MembersListClient from './MembersListClient'
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
  const tab = sp.tab === 'members' && canViewMembers ? 'members'
    : sp.tab === 'pending-approval' && canApprove ? 'pending-approval'
    : sp.tab === 'invites' && canInvite ? 'invites'
    : 'users'

  const tabItems = [
    { key: 'users', label: 'Users', href: '?tab=users' },
    ...(canViewMembers ? [{ key: 'members', label: 'Members', href: '?tab=members' }] : []),
    ...(canApprove ? [{ key: 'pending-approval', label: 'Pending Approval', href: '?tab=pending-approval' }] : []),
    ...(canInvite ? [{ key: 'invites', label: 'Invites', href: '?tab=invites' }] : []),
  ].map((t) => ({ ...t, active: t.key === tab }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
      </div>

      {tabItems.length > 1 && <TabStrip items={tabItems} />}

      {tab === 'users' && <UsersTab currentUser={currentUser} searchParams={sp} />}
      {tab === 'members' && canViewMembers && <MembersTab currentUser={currentUser} />}
      {tab === 'pending-approval' && canApprove && <PendingApprovalTab />}
      {tab === 'invites' && canInvite && <InvitesClient />}
    </div>
  )
}

async function UsersTab({ currentUser, searchParams }: { currentUser: SessionUser; searchParams: Record<string, string> }) {
  const params = new URLSearchParams(searchParams)
  const { skip, perPage, page } = parsePaginationParams(params)

  const [users, total, roles] = await Promise.all([
    prisma.user.findMany({
      skip, take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { role: true },
    }),
    prisma.user.count(),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>{total} total</span>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.suspendedAt ? 0.6 : 1 }}>
                <td>
                  <div style={{ fontWeight: 500 }}>{u.username}</div>
                  {u.displayName && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{u.displayName}</div>}
                </td>
                <td style={{ fontSize: '0.9rem' }}>{u.email}</td>
                <td>
                  <span className={`badge ${u.role.isProtected ? 'badge-blue' : 'badge-gray'}`}>
                    {u.role.name}
                  </span>
                </td>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  {u.suspendedAt ? (
                    <span className="badge badge-red">Suspended</span>
                  ) : u.emailVerifiedAt ? (
                    <span className="badge badge-green">Active</span>
                  ) : (
                    <span className="badge badge-yellow">Unverified</span>
                  )}
                </td>
                <td>
                  {u.id !== currentUser.id && (
                    <UserActions
                      targetUser={{ id: u.id, username: u.username, roleId: u.roleId, suspendedAt: u.suspendedAt?.toISOString() ?? null, role: u.role }}
                      currentUserIsAdmin={isAdmin(currentUser)}
                      roles={roles.map((r) => ({ id: r.id, name: r.name, isProtected: r.isProtected }))}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <Link href={`?page=${page - 1}`}>←</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={`?page=${n}`} className={n === page ? 'current' : ''}>{n}</Link>
          ))}
          {page < totalPages && <Link href={`?page=${page + 1}`}>→</Link>}
        </div>
      )}
    </div>
  )
}

async function MembersTab({ currentUser }: { currentUser: SessionUser }) {
  const [canSuspend, canApprove, canTrust, canDelete] = await Promise.all([
    hasPermission(currentUser, 'members.suspend'),
    hasPermission(currentUser, 'members.approve'),
    hasPermission(currentUser, 'members.trust'),
    hasPermission(currentUser, 'members.delete'),
  ])

  return <MembersListClient permissions={{ canSuspend, canApprove, canTrust, canDelete }} />
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
