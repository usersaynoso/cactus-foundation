import { prisma } from '@/lib/db/prisma'
import { getMembersConfig, registrationPasswordPolicy } from '@/lib/members/config'
import { validateInviteToken } from '@/lib/members/registration'
import RegisterForm from '@/components/members/RegisterForm'
import { getMemberAreaPath } from '@/lib/members/paths'
import { carriedMemberRedirect } from '@/lib/members/member-redirect'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ invite?: string; email?: string; redirect?: string }> }

export default async function MemberRegisterPage({ searchParams }: Props) {
  const config = await getMembersConfig()
  // `email` prefills the form for anyone sent here from somewhere that already
  // knows their address - a shop's post-purchase prompt, say, where signing up
  // under a different address quietly costs them the order they just placed.
  // It is a convenience only: the address is still theirs to change, and
  // whatever is typed still has to survive verification.
  const { invite: inviteToken, email: prefillEmail, redirect } = await searchParams
  // `redirect` is where the member ends up once their emailed link has verified
  // and signed them in - a native app's hand-off page, say, so signing up from
  // the app finishes back in the app. Resolved by exactly the rule the sign-in
  // page uses (member-redirect.ts); with none, nothing changes.
  const basePath = `/${getMemberAreaPath()}`
  const carriedRedirect = carriedMemberRedirect(redirect, basePath)

  if (!config.enabled) {
    return (
      <div style={{ maxWidth: 480, margin: '6rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
        <h1 style={{ marginBottom: 'var(--space-3)' }}>Registration isn&apos;t available</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>This site isn&apos;t accepting new member accounts right now.</p>
      </div>
    )
  }

  if (config.registrationMode === 'INVITE_ONLY') {
    const invite = inviteToken ? await validateInviteToken(inviteToken) : null
    if (!invite) {
      return (
        <div style={{ maxWidth: 480, margin: '6rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <h1 style={{ marginBottom: 'var(--space-3)' }}>Registration is invite-only</h1>
          <p style={{ color: 'var(--color-text-muted)' }}>
            You&apos;ll need an invite link to create an account here.
          </p>
        </div>
      )
    }
  }

  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { privacyPolicyPageId: true },
  })
  const privacyPage = siteConfig?.privacyPolicyPageId
    ? await prisma.infoPage.findUnique({
        where: { id: siteConfig.privacyPolicyPageId },
        select: { slug: true },
      })
    : null

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem' }}>
      <RegisterForm
        registrationMode={config.registrationMode}
        inviteToken={config.registrationMode === 'INVITE_ONLY' ? inviteToken : undefined}
        privacyPolicyUrl={privacyPage?.slug ? `/${privacyPage.slug}` : undefined}
        initialEmail={prefillEmail}
        collectUsername={config.registrationCollectUsername}
        collectDisplayName={config.registrationCollectDisplayName}
        passwordPolicy={registrationPasswordPolicy(config)}
        redirect={carriedRedirect}
        signInHref={carriedRedirect ? `${basePath}/login?redirect=${encodeURIComponent(carriedRedirect)}` : undefined}
      />
    </div>
  )
}
