import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { validateInviteToken } from '@/lib/members/registration'
import RegisterForm from '@/components/members/RegisterForm'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ invite?: string }> }

export default async function MemberRegisterPage({ searchParams }: Props) {
  const config = await getMembersConfig()
  const { invite: inviteToken } = await searchParams

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
      />
    </div>
  )
}
