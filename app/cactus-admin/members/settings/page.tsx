import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import SettingsClient from './SettingsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Members settings — Admin' }

export default async function MembersSettingsPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.settings'))) {
    return <div className="alert alert-danger">You do not have permission to edit Members settings.</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Members settings</h1>
      </div>
      <SettingsClient />
    </div>
  )
}
