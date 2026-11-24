import VerifyEmailPanel from '@/components/members/VerifyEmailPanel'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { carriedMemberRedirect } from '@/lib/members/member-redirect'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string }> }

export default async function VerifyEmailPage({ searchParams }: Props) {
  const config = await getMembersConfig()
  // Somebody who mistyped their address at sign-up can't fix it from here - the
  // only way out is a fresh registration - so the page offers that door, but
  // only where it opens. Invite-only sites need a link this visitor hasn't got,
  // and a site with members switched off has no door at all.
  const registerOpen = config.enabled && config.registrationMode !== 'INVITE_ONLY'

  const basePath = `/${getMemberAreaPath()}`
  // Where the member registered from, carried here by the emailed link (or by
  // the register form, for the "check your inbox" visit, so a resent link
  // carries it too). Resolved by the same rule as the sign-in page's redirect;
  // with none, the panel behaves exactly as it always has.
  const { redirect } = await searchParams
  const redirectHref = carriedMemberRedirect(redirect, basePath)

  return (
    <VerifyEmailPanel
      // "Sign up again" keeps the redirect, or a second attempt would lose it.
      registerHref={
        registerOpen
          ? `${basePath}/register${redirectHref ? `?redirect=${encodeURIComponent(redirectHref)}` : ''}`
          : undefined
      }
      accountHref={basePath}
      redirectHref={redirectHref}
    />
  )
}
