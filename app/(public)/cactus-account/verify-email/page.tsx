import VerifyEmailPanel from '@/components/members/VerifyEmailPanel'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'

export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage() {
  const config = await getMembersConfig()
  // Somebody who mistyped their address at sign-up can't fix it from here - the
  // only way out is a fresh registration - so the page offers that door, but
  // only where it opens. Invite-only sites need a link this visitor hasn't got,
  // and a site with members switched off has no door at all.
  const registerOpen = config.enabled && config.registrationMode !== 'INVITE_ONLY'

  return <VerifyEmailPanel registerHref={registerOpen ? `/${getMemberAreaPath()}/register` : undefined} />
}
