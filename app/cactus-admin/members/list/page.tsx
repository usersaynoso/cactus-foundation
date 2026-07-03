import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import MembersListClient from './MembersListClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Members — Admin' }

export default async function MembersListPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.list'))) {
    return <div className="alert alert-danger">You do not have permission to view members.</div>
  }

  const [canSuspend, canApprove, canTrust, canDelete] = await Promise.all([
    hasPermission(user, 'members.suspend'),
    hasPermission(user, 'members.approve'),
    hasPermission(user, 'members.trust'),
    hasPermission(user, 'members.delete'),
  ])

  return <MembersListClient permissions={{ canSuspend, canApprove, canTrust, canDelete }} />
}
