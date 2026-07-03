import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import PendingApprovalClient from './PendingApprovalClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pending approval — Admin' }

export default async function PendingApprovalPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.approve'))) {
    return <div className="alert alert-danger">You do not have permission to approve members.</div>
  }

  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''

  const members = await prisma.member.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true, email: true, createdAt: true },
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pending approval</h1>
      </div>
      <PendingApprovalClient
        members={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        adminPath={adminPath}
      />
      {members.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No members awaiting approval.</p>}
    </div>
  )
}
