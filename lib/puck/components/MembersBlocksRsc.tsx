// RSC-only render functions for the Members Puck blocks (MEMBERS_SPEC.md
// Phase 7). Deliberately a separate file from lib/puck/config.tsx: these
// import next/server's connection() and lib/members/session (which pulls in
// next/headers + Prisma) - fine for the RSC bundle these feed into
// (puckRscConfig), but must never end up in puckConfig's shared editor
// bundle, so config.tsx only ever imports this file into `rscComponents`.
import { connection } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMemberAreaPath } from '@/lib/members/paths'
import { getMembersConfig } from '@/lib/members/config'
import { resolveEffectiveAvatarChoice } from '@/lib/members/avatar'
import LoginForm from '@/components/members/LoginForm'
import RegisterForm from '@/components/members/RegisterForm'
import MemberAvatar from '@/components/members/MemberAvatar'

const LINK_STYLE: React.CSSProperties = { padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-secondary, var(--color-fg-secondary))', fontSize: '0.875rem', fontWeight: 500 }
const PRIMARY_LINK_STYLE: React.CSSProperties = { ...LINK_STYLE, background: 'var(--color-primary)', border: '1px solid var(--color-primary)', color: 'var(--color-bg)' }

async function resolvePrivacyPolicyUrl(): Promise<string | undefined> {
  const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { privacyPolicyPageId: true } })
  if (!siteConfig?.privacyPolicyPageId) return undefined
  const page = await prisma.infoPage.findUnique({ where: { id: siteConfig.privacyPolicyPageId }, select: { slug: true } })
  return page?.slug ? `/${page.slug}` : undefined
}

export async function MembersLoginRsc(props: { redirectTo?: string }) {
  await connection()
  const member = await getMemberFromCookie()
  if (member) {
    return (
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
        You&apos;re signed in as <strong>{member.displayName || member.username}</strong>.
      </p>
    )
  }
  return <LoginForm redirectTo={props.redirectTo || '/'} />
}

export async function MembersRegisterRsc() {
  await connection()
  const member = await getMemberFromCookie()
  if (member) {
    return (
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
        You&apos;re already signed in as <strong>{member.displayName || member.username}</strong>.
      </p>
    )
  }

  const config = await getMembersConfig()
  if (!config.enabled) return null

  if (config.registrationMode === 'INVITE_ONLY') {
    return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Registration is invite-only.</p>
  }

  const privacyPolicyUrl = await resolvePrivacyPolicyUrl()
  return <RegisterForm registrationMode={config.registrationMode} privacyPolicyUrl={privacyPolicyUrl} />
}

export async function MembersAccountLinkRsc(props: { loginLabel?: string; registerLabel?: string }) {
  await connection()
  const member = await getMemberFromCookie()
  const base = `/${getMemberAreaPath()}`

  if (member) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <a href={base} style={LINK_STYLE}>My Account</a>
        <form action="/api/members/auth/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={{ ...LINK_STYLE, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <a href={`${base}/login`} style={LINK_STYLE}>{props.loginLabel || 'Sign in'}</a>
      <a href={`${base}/register`} style={PRIMARY_LINK_STYLE}>{props.registerLabel || 'Register'}</a>
    </div>
  )
}

function GateFallback({ message, showSignIn }: { message: string; showSignIn: boolean }) {
  const base = `/${getMemberAreaPath()}`
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius, 8px)' }}>
      <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)' }}>{message}</p>
      {showSignIn && <a href={`${base}/login`} className="btn btn-primary btn-sm">Sign in</a>}
    </div>
  )
}

export async function MemberGateRsc(props: { content?: () => React.ReactNode; fallbackMessage?: string }) {
  await connection()
  const member = await getMemberFromCookie()
  if (member) return <>{typeof props.content === 'function' ? props.content() : null}</>
  return <GateFallback message={props.fallbackMessage || 'Sign in to view this content.'} showSignIn />
}

export async function TrustedMemberGateRsc(props: { content?: () => React.ReactNode; fallbackMessage?: string }) {
  await connection()
  const member = await getMemberFromCookie()
  if (member?.trusted) return <>{typeof props.content === 'function' ? props.content() : null}</>
  return (
    <GateFallback
      message={props.fallbackMessage || 'This content is only available to trusted members.'}
      showSignIn={!member}
    />
  )
}

export async function MembersProfileRsc() {
  await connection()
  const member = await getMemberFromCookie()
  if (!member) {
    return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Sign in to see your profile here.</p>
  }

  const config = await getMembersConfig()
  const avatarChoice = resolveEffectiveAvatarChoice(member.avatarChoice, config)
  let avatarUrl: string | null = null
  if (avatarChoice === 'UPLOAD' && member.avatarMediaId) {
    const media = await prisma.media.findUnique({ where: { id: member.avatarMediaId }, select: { url: true } })
    avatarUrl = media?.url ?? null
  }

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <MemberAvatar
        memberId={member.id}
        username={member.username}
        displayName={member.displayName}
        avatarChoice={avatarChoice}
        uploadedUrl={avatarUrl}
        size={56}
      />
      <div>
        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{member.displayName || member.username}</div>
        {member.bio && <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{member.bio}</p>}
        <a href={`/${getMemberAreaPath()}`} style={{ fontSize: '0.875rem' }}>Manage account →</a>
      </div>
    </div>
  )
}
