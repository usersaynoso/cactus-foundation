import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import EmailTemplatesClient from './EmailTemplatesClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Email templates — Admin' }

export default async function EmailTemplatesPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.email-templates'))) {
    return <div className="alert alert-danger">You do not have permission to edit email templates.</div>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Member email templates</h1>
      </div>
      <EmailTemplatesClient />
    </div>
  )
}
