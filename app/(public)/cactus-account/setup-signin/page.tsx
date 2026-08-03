import { redirect } from 'next/navigation'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAuthMethodRequired } from '@/lib/members/config'
import { ENROLABLE_AUTH_METHODS, memberOutstandingAuthSetup } from '@/lib/members/auth-policy'
import { getMemberAreaPath } from '@/lib/members/paths'
import { isEmailConfigured } from '@/lib/config/env'
import RequiredSignInSetup from '@/components/members/account/RequiredSignInSetup'

export const dynamic = 'force-dynamic'

// The one page the account layout's required-setup gate lets through. Reached
// by that redirect, and by anyone who bookmarks it - hence the check below,
// which sends a member with nothing outstanding back where they meant to go.
export default async function SetupSignInPage() {
  const member = await getMemberFromCookie()
  if (!member) return null // layout already redirects; defensive only

  const config = await getMembersConfig()
  const basePath = `/${getMemberAreaPath()}`

  const outstanding = await memberOutstandingAuthSetup(config, member.id)
  if (outstanding.length === 0) redirect(basePath)

  return (
    <RequiredSignInSetup
      requiredMethods={ENROLABLE_AUTH_METHODS.filter((method) => isAuthMethodRequired(config, method))}
      basePath={basePath}
      emailCodesAvailable={isEmailConfigured()}
    />
  )
}
