import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { hasModuleNotificationCategories } from '@/lib/modules/member-extensions'
import MemberAvatar from '@/components/members/MemberAvatar'
import VerifyEmailNudge from '@/components/members/account/VerifyEmailNudge'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string }

const CORE_ACTIVITY_LABELS: Record<string, string> = {
  login: 'Signed in',
  email_changed: 'Email address changed',
}

// Who to greet. The username is only a name the member recognises if the site
// asked them to pick one - with that switch off it was invented from their email
// address with random digits stuck on the end, and greeting someone by a handle
// they have never seen is worse than not using their name at all. The email's
// local part is what that handle was built from anyway, and the full address is
// printed directly underneath, so it gives nothing away.
function greetingName(member: { displayName: string | null; username: string; email: string }, usernameCollected: boolean): string {
  if (member.displayName) return member.displayName
  if (usernameCollected) return member.username
  return member.email.split('@')[0] || 'there'
}

function activityLabel(event: { type: string; source: string | null }): string {
  if (!event.source) return CORE_ACTIVITY_LABELS[event.type] ?? event.type
  return `${event.source}: ${event.type}`
}

function SummaryCard({ title, href, linkLabel, children }: {
  title: string
  href: string
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <h2 className="card-title" style={{ margin: 0, fontSize: 'var(--text-base)' }}>{title}</h2>
      <div style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', display: 'grid', gap: '0.25rem' }}>
        {children}
      </div>
      <Link href={href} style={{ color: 'var(--color-primary)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
        {linkLabel} →
      </Link>
    </div>
  )
}

export default async function AccountIndexPage() {
  const member = await getMemberFromCookie()
  if (!member) return null // layout already redirects; defensive only

  const basePath = `/${getMemberAreaPath()}`

  // One round of queries rather than a waterfall: this is the page every
  // signed-in member lands on, so it is the one worth not making them wait for.
  const [config, record, passkeyCount, sessionCount, twoFactorCount, recentActivity, extensionModules, notificationsAvailable] =
    await Promise.all([
      getMembersConfig(),
      prisma.member.findUnique({
        where: { id: member.id },
        select: {
          bio: true,
          websiteUrl: true,
          avatarChoice: true,
          avatarMediaId: true,
          backupEmail: true,
          createdAt: true,
          password: { select: { id: true } },
        },
      }),
      prisma.memberPasskey.count({ where: { memberId: member.id } }),
      prisma.memberSession.count({ where: { memberId: member.id, expiresAt: { gt: new Date() } } }),
      prisma.memberTwoFactor.count({ where: { memberId: member.id, verified: true } }),
      prisma.memberActivityEvent.findMany({
        where: { memberId: member.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, type: true, source: true, createdAt: true },
      }),
      prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } }),
      hasModuleNotificationCategories(),
    ])

  // Modules can append content here via the "members.account-section"
  // extension point - unlike core.roles-page, there is no permission gate to
  // check since members have no permission keys.
  const sectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point === 'members.account-section') sectionIds.push(entry.id)
    }
  }
  const sectionComponents = moduleExtensionPointComponents['members.account-section'] ?? {}

  const uploadedAvatar =
    record?.avatarChoice === 'UPLOAD' && record.avatarMediaId
      ? (await prisma.media.findUnique({ where: { id: record.avatarMediaId }, select: { url: true } }))?.url ?? null
      : null

  const sections = config.accountSectionsEnabled
  // Nagging for a display name the site never asks for, and gives the member no
  // field to fill in, is a to-do item they cannot tick off.
  const profileGaps = [
    config.registrationCollectDisplayName && !member.displayName && 'a display name',
    !record?.bio && 'a short bio',
    record?.avatarChoice === 'GENERATED' && 'a picture',
  ].filter((v): v is string => typeof v === 'string')

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <MemberAvatar
          memberId={member.id}
          username={member.username}
          displayName={member.displayName}
          avatarChoice={record?.avatarChoice ?? 'GENERATED'}
          uploadedUrl={uploadedAvatar}
          size={64}
        />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--color-text)' }}>
            Hi, {greetingName(member, config.registrationCollectUsername)}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-sm)' }}>
            {member.email}
            {record?.createdAt && (
              <> · Member since {record.createdAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</>
            )}
          </p>
        </div>
      </div>

      {!member.emailVerified && <VerifyEmailNudge email={member.email} />}

      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {sections.security && (
          <SummaryCard title="Account & Security" href={`${basePath}/security`} linkLabel="Manage account">
            <span>{passkeyCount === 0 ? 'No passkeys yet' : `${passkeyCount} passkey${passkeyCount === 1 ? '' : 's'}`}</span>
            <span>{record?.password ? 'Password set' : 'No password set'}</span>
            <span>{twoFactorCount > 0 ? 'Two-factor on' : 'Two-factor off'}</span>
            <span>{sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'}</span>
          </SummaryCard>
        )}

        {sections.profile && (
          <SummaryCard title="Profile" href={`${basePath}/profile`} linkLabel="Edit profile">
            {profileGaps.length === 0 ? (
              <span>All filled in. Nothing to do here.</span>
            ) : (
              <span>Still missing {profileGaps.join(', ')}.</span>
            )}
            {record?.websiteUrl && <span>Website added</span>}
          </SummaryCard>
        )}

        {/* Same rule as the tab: no module contributes a category, no card. A
            link labelled "Choose what we send" that opens a page with nothing
            to choose is worse than no link. */}
        {sections.notifications && notificationsAvailable && (
          <SummaryCard title="Notifications" href={`${basePath}/notifications`} linkLabel="Choose what we send">
            <span>Decide which emails land in your inbox.</span>
            {record?.backupEmail && <span>Recovery address: {record.backupEmail}</span>}
          </SummaryCard>
        )}

        {sections.activity && (
          <SummaryCard title="Recent activity" href={`${basePath}/activity`} linkLabel="See all activity">
            {recentActivity.length === 0 ? (
              <span>Nothing recorded yet.</span>
            ) : (
              recentActivity.map((event) => (
                <span key={event.id}>
                  {activityLabel(event)} · {event.createdAt.toLocaleDateString('en-GB')}
                </span>
              ))
            )}
          </SummaryCard>
        )}
      </div>

      {sectionIds.map((id) => {
        const Section = sectionComponents[id]
        return Section ? <Section key={id} /> : null
      })}
    </div>
  )
}
