import Link from 'next/link'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Members — Admin' }

export default async function MembersOverviewPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.list'))) {
    return <div className="alert alert-danger">You do not have permission to view members.</div>
  }

  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''

  const [total, active, pendingApproval, pendingVerification, suspended, pendingDeletion, recentSuspensions] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.member.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.member.count({ where: { status: 'PENDING_VERIFICATION' } }),
    prisma.member.count({ where: { status: 'SUSPENDED' } }),
    prisma.member.count({ where: { deletionScheduledAt: { not: null } } }),
    prisma.member.findMany({
      where: { status: 'SUSPENDED' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, username: true, suspensionReason: true, suspendedUntil: true },
    }),
  ])

  const stats = [
    { label: 'Total members', value: total },
    { label: 'Active', value: active },
    { label: 'Pending verification', value: pendingVerification },
    { label: 'Pending approval', value: pendingApproval },
    { label: 'Suspended', value: suspended },
    { label: 'Scheduled for deletion', value: pendingDeletion },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Members</h1>
        <Link href={`/${adminPath}/members/list`} className="btn btn-primary">View all members</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {pendingApproval > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          {pendingApproval} member{pendingApproval > 1 ? 's are' : ' is'} awaiting approval.{' '}
          <Link href={`/${adminPath}/members/pending-approval`}>Review now →</Link>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ margin: '0 0 1rem' }}>Recent suspensions</h2>
        {recentSuspensions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>No suspended members.</p>
        ) : (
          recentSuspensions.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <Link href={`/${adminPath}/members/${m.id}`}>{m.username}</Link>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{m.suspensionReason ?? 'No reason given'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
