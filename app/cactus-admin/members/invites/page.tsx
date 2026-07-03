import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import InvitesClient from './InvitesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Invites — Admin' }

export default async function InvitesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.invite'))) {
    return <div className="alert alert-danger">You do not have permission to manage invites.</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Invites</h1>
      </div>
      <InvitesClient />
    </div>
  )
}
