import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import AccountNav from '@/components/members/account/AccountNav'
import DeletionBanner from '@/components/members/account/DeletionBanner'

export const dynamic = 'force-dynamic'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const member = await getMemberFromCookie()
  const memberAreaPath = getMemberAreaPath()
  const basePath = `/${memberAreaPath}`

  if (!member) {
    // x-cactus-member-full-path is set by proxy.ts on the rewrite - the
    // internal /cactus-account/* pathname is useless here since it's the
    // same regardless of the configured memberAreaPath.
    const headersList = await headers()
    const fullPath = headersList.get('x-cactus-member-full-path') ?? basePath
    redirect(`${basePath}/login?redirect=${encodeURIComponent(fullPath)}`)
  }

  const config = await getMembersConfig()

  return (
    <div style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.5rem' }}>
      {member.deletionScheduledAt && (
        <DeletionBanner scheduledAt={member.deletionScheduledAt.toISOString()} />
      )}
      <AccountNav basePath={basePath} sections={config.accountSectionsEnabled} />
      {children}
    </div>
  )
}
