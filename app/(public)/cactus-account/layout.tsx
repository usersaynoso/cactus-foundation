import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { memberNeedsSmsEnrolment } from '@/lib/members/sms-policy'
import { getMemberAreaPath, isPublicMemberPath } from '@/lib/members/paths'
import AccountFlash from '@/components/members/account/AccountFlash'
import MemberAccountShell from '@/components/members/account/MemberAccountShell'

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
    // Sign-in/sign-up/verify pages are the way *out* of having no session, so
    // they render as-is (bare - the account nav is for members). Gating them
    // pointed /login at /login and re-encoded the whole URL into the next
    // one's ?redirect= each time round, until it outgrew what a browser will
    // load. Missing header falls through to the gate, which is one safe hop:
    // the resulting /login request carries the header and renders.
    // AccountFlash goes on both sides of this gate: verifying an email aims
    // the visitor at the member area, and a signed-out one is bounced straight
    // back out to /login, which is where the pill then has to appear.
    if (isPublicMemberPath(fullPath, basePath)) {
      return (
        <>
          <AccountFlash />
          {children}
        </>
      )
    }
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

  // The chrome itself lives in MemberAccountShell so a module's member pages
  // (shop's /shop/account/*) can wear exactly the same thing - they are outside
  // this route group and would otherwise render bare.
  return (
    <MemberAccountShell
      member={member}
      notice={
        smsEnrolmentDue ? (
          <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
            This site requires a mobile number for your sign-in codes.{' '}
            <Link href={basePath}>Add yours here</Link> to keep signing in smoothly.
          </div>
        ) : null
      }
    >
      {children}
    </MemberAccountShell>
  )
}
