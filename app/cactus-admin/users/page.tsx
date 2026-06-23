import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, isAdmin } from '@/lib/permissions/check'
import { parsePaginationParams } from '@/lib/utils'
import Link from 'next/link'
import UserActions from './UserActions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Users — Admin' }

type Props = { searchParams: Promise<Record<string, string>> }

export default async function UsersPage({ searchParams }: Props) {
  const currentUser = await getSessionFromCookie()
  if (!currentUser) return null
  if (!await hasPermission(currentUser, 'users.manage')) {
    return <div className="alert alert-danger">You do not have permission to manage users.</div>
  }

  const sp = await searchParams
  const params = new URLSearchParams(sp)
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
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <span style={{ color: '#6b7280', fontSize: '0.9375rem' }}>{total} total</span>
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
                  {u.displayName && <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{u.displayName}</div>}
                </td>
                <td style={{ fontSize: '0.9rem' }}>{u.email}</td>
                <td>
                  <span className={`badge ${u.role.isProtected ? 'badge-blue' : 'badge-gray'}`}>
                    {u.role.name}
                  </span>
                </td>
                <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
