import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberFromCookie } from '@/lib/members/session'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import MemberAvatar from '@/components/members/MemberAvatar'
import { resolveEffectiveAvatarChoice } from '@/lib/members/avatar'
import { isHttpUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string }
type Props = { params: Promise<{ username: string }> }

export default async function MemberProfilePage({ params }: Props) {
  const { username } = await params
  const config = await getMembersConfig()

  // HIDDEN takes the whole feature offline - 404, not a "profiles disabled"
  // message, so it's indistinguishable from the feature never having existed.
  if (!config.enabled || config.profileVisibility === 'HIDDEN') notFound()

  if (config.profileVisibility === 'MEMBERS_ONLY') {
    const viewer = await getMemberFromCookie()
    if (!viewer) notFound()
  }

  const member = await prisma.member.findUnique({
    where: { username },
    include: { profileVisibility: true },
  })

  if (!member) {
    // Old-username redirect, only within the configured window.
    const byOldUsername = await prisma.member.findFirst({
      where: { previousUsername: username, previousUsernameExpiresAt: { gt: new Date() } },
      select: { username: true },
    })
    if (byOldUsername) redirect(`/members/${byOldUsername.username}`)
    notFound()
  }

  // Non-ACTIVE members (pending/suspended/deleted) have no visitable profile.
  if (member.status !== 'ACTIVE') notFound()

  // Honours avatarUploadsEnabled/gravatarEnabled toggles immediately, even
  // for a member whose stored avatarChoice predates the toggle change.
  const avatarChoice = resolveEffectiveAvatarChoice(member.avatarChoice, config)
  let avatarUrl: string | null = null
  if (avatarChoice === 'UPLOAD' && member.avatarMediaId) {
    const media = await prisma.media.findUnique({ where: { id: member.avatarMediaId }, select: { url: true } })
    avatarUrl = media?.url ?? null
  }

  const visibility = member.profileVisibility ?? { showBio: true, showJoinDate: true, showWebsite: true }

  // members.profile-section extension point - content-injection, no permission
  // gate since members have no permission keys.
  const extensionModules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { manifest: true },
  })
  const sectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point === 'members.profile-section') sectionIds.push(entry.id)
    }
  }
  const sectionComponents = moduleExtensionPointComponents['members.profile-section'] ?? {}

  return (
    <div style={{ maxWidth: 600, margin: '3rem auto', padding: '0 1.5rem' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <MemberAvatar
          memberId={member.id}
          username={member.username}
          displayName={member.displayName}
          avatarChoice={avatarChoice}
          uploadedUrl={avatarUrl}
          size={80}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
            {member.displayName || member.username}
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>@{member.username}</p>
        </div>
      </div>

      {visibility.showBio && member.bio && (
        <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3)' }}>{member.bio}</p>
      )}
      {visibility.showWebsite && member.websiteUrl && isHttpUrl(member.websiteUrl) && (
        <p style={{ margin: '0 0 var(--space-3)' }}>
          <a href={member.websiteUrl} rel="noopener noreferrer nofollow">{member.websiteUrl}</a>
        </p>
      )}
      {visibility.showJoinDate && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Joined {member.createdAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}
        </p>
      )}

      {sectionIds.map((id) => {
        const Section = sectionComponents[id]
        return Section ? <Section key={id} memberId={member.id} /> : null
      })}
    </div>
  )
}
