import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { memberNeedsSmsEnrolment } from '@/lib/members/sms-policy'
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

  // Nag members who sign in with a password until they add the mobile number
  // the site requires for sign-in codes. Members without a password never see
  // codes, so the policy doesn't apply to them.
  let smsEnrolmentDue = false
  if (config.smsTwoFactorPolicy === 'REQUIRED') {
    const record = await prisma.member.findUnique({
      where: { id: member.id },
      select: { password: { select: { id: true } }, twoFactorConfigs: true },
    })
    smsEnrolmentDue = !!record?.password && (await memberNeedsSmsEnrolment(config, record.twoFactorConfigs))
  }

  return (
    <div style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.5rem' }}>
      {member.deletionScheduledAt && (
        <DeletionBanner scheduledAt={member.deletionScheduledAt.toISOString()} />
      )}
      {smsEnrolmentDue && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          This site requires a mobile number for your sign-in codes.{' '}
          <Link href={basePath}>Add yours here</Link> to keep signing in smoothly.
        </div>
      )}
      <AccountNav basePath={basePath} sections={config.accountSectionsEnabled} />
      {children}
    </div>
  )
}
