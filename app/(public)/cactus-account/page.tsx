import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import { hasModuleNotificationCategories } from '@/lib/modules/member-extensions'
import {
  accountExtrasInsertIndex,
  accountSectionAnchor,
  enabledAccountSectionKeys,
  moduleAccountSectionAnchor,
  type AccountSectionKey,
} from '@/lib/members/account-layout'
import { getMemberAccountNavExtras } from '@/lib/members/account-nav'
import MemberAvatar from '@/components/members/MemberAvatar'
import VerifyEmailNudge from '@/components/members/account/VerifyEmailNudge'
import ContactDetailsCard from '@/components/members/account/ContactDetailsCard'
import ProfileSection from '@/components/members/account/ProfileSection'
import SecuritySection from '@/components/members/account/SecuritySection'
import NotificationsSection from '@/components/members/account/NotificationsSection'
import ActivitySection from '@/components/members/account/ActivitySection'
import DangerZoneSection from '@/components/members/account/DangerZoneSection'

export const dynamic = 'force-dynamic'

type ExtensionPointEntry = { point: string; id: string }

const CORE_ACTIVITY_LABELS: Record<string, string> = {
  login: 'Signed in',
  email_changed: 'Email address changed',
}

// Who to greet. The full name wins where there is one, cut to its first word:
// "Hi, Chris" is what a person says, and "Hi, Chris Taylor-Guest" is what a bank
// says. It is also the one name here the member typed in themselves and can
// change, which is why it beats the rest.
//
// After that, the username is only a name the member recognises if the site
// asked them to pick one - with that switch off it was invented from their email
// address with random digits stuck on the end, and greeting someone by a handle
// they have never seen is worse than not using their name at all. The email's
// local part is what that handle was built from anyway, and the full address is
// printed directly underneath, so it gives nothing away.
function greetingName(
  member: { fullName: string | null; displayName: string | null; username: string; email: string },
  usernameCollected: boolean,
): string {
  const firstName = member.fullName?.trim().split(/\s+/)[0]
  if (firstName) return firstName
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
  const [config, record, passkeyCount, sessionCount, twoFactorCount, recentActivity, extensionModules, notificationsAvailable, navExtras] =
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
      getInstalledManifests(),
      hasModuleNotificationCategories(),
      // The same tabs the shell puts across the top. Read again here rather than
      // threaded down, because it is this page that has to draw the sections
      // those tabs point at, and in the same order.
      getMemberAccountNavExtras({ id: member.id, email: member.email, emailVerified: member.emailVerified }),
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
  // One page: every section the member can see is drawn below, and the summary
  // cards point at those rather than at pages of their own.
  const singlePage = config.accountSinglePage
  const sectionHref = (key: Parameters<typeof accountSectionAnchor>[0], path: string) =>
    singlePage ? `${basePath}#${accountSectionAnchor(key)}` : `${basePath}${path}`
  // Nagging for a display name the site never asks for, and gives the member no
  // field to fill in, is a to-do item they cannot tick off.
  const profileGaps = [
    config.registrationCollectDisplayName && !member.displayName && 'a display name',
    !record?.bio && 'a short bio',
    record?.avatarChoice === 'GENERATED' && 'a picture',
  ].filter((v): v is string => typeof v === 'string')

  // The one-page account, in tab order. Building it from the shared list rather
  // than a hand-written run of blocks is what stops the page and the tab bar
  // disagreeing about where a section goes.
  const sectionKeys = enabledAccountSectionKeys(sections, notificationsAvailable)
  const extrasAt = accountExtrasInsertIndex(sectionKeys)
  const sectionContent: Record<AccountSectionKey, React.ReactNode> = {
    profile: <ProfileSection />,
    security: <SecuritySection />,
    notifications: <NotificationsSection />,
    activity: <ActivitySection />,
    dangerZone: <DangerZoneSection linkedToStaff={!!member.userId} />,
  }
  const renderSection = (key: AccountSectionKey) => (
    <AccountSection key={key} anchor={accountSectionAnchor(key)}>
      {sectionContent[key]}
    </AccountSection>
  )

  // A module section a tab claimed is that tab's whole page drawn inline, and it
  // belongs to the one-page shape alone - tabbed, it stays the page it was, or
  // the overview would carry a second copy of somebody's entire order history.
  // Anything unclaimed is the summary card it always was and appears in both.
  const claimedSectionIds = new Set(
    navExtras.map((extra) => extra.sectionId).filter((id): id is string => typeof id === 'string'),
  )
  const moduleCards = sectionIds
    .filter((id) => !claimedSectionIds.has(id))
    .map((id) => {
      const Section = sectionComponents[id]
      return Section ? <Section key={id} /> : null
    })
  const moduleSections = singlePage
    ? navExtras.map((extra) => {
        const Section = extra.sectionId ? sectionComponents[extra.sectionId] : undefined
        return Section ? (
          <AccountSection key={extra.key} anchor={moduleAccountSectionAnchor(extra.key)}>
            <Section />
          </AccountSection>
        ) : null
      })
    : []

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <MemberAvatar
          memberId={member.id}
          username={member.username}
          displayName={member.displayName}
          avatarChoice={record?.avatarChoice ?? 'GENERATED'}
          uploadedUrl={uploadedAvatar}
          size={64}
        />
        <div style={{ minWidth: 0 }}>
          {/* A name is only worth greeting somebody by if they can put it right.
              The full name on the card below is always theirs to change, and the
              Profile section is the other place a name can be corrected - a site
              with neither greets nobody in particular rather than leaving a
              wrong guess sitting there. */}
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--color-text)' }}>
            {member.fullName?.trim() || sections.profile
              ? `Hi, ${greetingName(member, config.registrationCollectUsername)}`
              : 'Hi there'}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-sm)' }}>
            {member.email}
            {record?.createdAt && (
              <> · Member since {record.createdAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</>
            )}
          </p>
        </div>
        {/* A plain POST form, not a fetch: signing out is the one thing on this
            page that has to work whatever the browser is doing, and the route
            already redirects to /logged-out on its own. */}
        <form action="/api/members/auth/logout" method="POST" style={{ margin: 0, marginLeft: 'auto' }}>
          <button type="submit" className="btn btn-secondary btn-sm">Sign out</button>
        </form>
      </div>

      {!member.emailVerified && <VerifyEmailNudge email={member.email} />}

      {/* Above the summary cards because it is the only thing on this page with
          anything to fill in - the rest are links to somewhere else. */}
      <ContactDetailsCard
        initial={{ fullName: member.fullName, organisation: member.organisation }}
        collectOrganisation={config.accountCollectOrganisation}
        requireOrganisation={config.accountRequireOrganisation}
      />

      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {sections.security && (
          <SummaryCard title="Account & Security" href={sectionHref('security', '/security')} linkLabel="Manage account">
            <span>{passkeyCount === 0 ? 'No passkeys yet' : `${passkeyCount} passkey${passkeyCount === 1 ? '' : 's'}`}</span>
            <span>{record?.password ? 'Password set' : 'No password set'}</span>
            <span>{twoFactorCount > 0 ? 'Two-factor on' : 'Two-factor off'}</span>
            <span>{sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'}</span>
          </SummaryCard>
        )}

        {sections.profile && (
          <SummaryCard title="Profile" href={sectionHref('profile', '/profile')} linkLabel="Edit profile">
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
          <SummaryCard title="Notifications" href={sectionHref('notifications', '/notifications')} linkLabel="Choose what we send">
            <span>Decide which emails land in your inbox.</span>
            {record?.backupEmail && <span>Recovery address: {record.backupEmail}</span>}
          </SummaryCard>
        )}

        {sections.activity && (
          <SummaryCard title="Recent activity" href={sectionHref('activity', '/activity')} linkLabel="See all activity">
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

      {/* One page or not, a module's contribution sits where its tab sits: after
          Security, not at the top of the page. Tabbed, there is nothing else
          below to be after, so the whole lot renders here. */}
      {moduleCards}

      {/* One-page account. Each section is exactly the component its own page
          renders, so there is one copy of every one of them and no chance of
          the two shapes drifting apart. The same switches decide what appears:
          a section turned off is as absent here as its tab is, and they come in
          the order their tabs are listed in - module sections included. */}
      {singlePage && (
        <>
          {sectionKeys.slice(0, extrasAt).map(renderSection)}
          {moduleSections}
          {sectionKeys.slice(extrasAt).map(renderSection)}
        </>
      )}
    </div>
  )
}

// A section of the one-page account: the anchor its tab scrolls to, and a rule
// above it so the join between two sections reads as a join rather than as one
// long run of headings. `scrollMarginTop` clears the sticky tab bar, which
// would otherwise sit on top of the heading the member was just sent to.
function AccountSection({ anchor, children }: { anchor: string; children: React.ReactNode }) {
  return (
    <section
      id={anchor}
      style={{
        scrollMarginTop: 'calc(var(--cactus-header-offset, 0px) + 4rem)',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 'var(--space-6)',
      }}
    >
      {children}
    </section>
  )
}
