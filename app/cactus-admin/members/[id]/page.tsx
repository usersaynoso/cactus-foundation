import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, hasPermissions } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import { getMembersConfig } from '@/lib/members/config'
import { peopleCustomerProviders } from '@/lib/members/people-customer-providers'
import { fillContactDetailsFromProviders } from '@/lib/members/people-customers'
import { resolveEffectiveAvatarChoice } from '@/lib/members/avatar'
import { isAccountSectionEnabled } from '@/lib/members/config'
import MemberDetailClient from './MemberDetailClient'
import type { MemberDetail, MemberSecuritySummary } from './member-detail-types'
import type { Metadata } from 'next'

type ExtensionPointEntry = { point: string; id: string; permission?: string }
type Props = { params: Promise<{ id: string }> }

// Named after the member being looked at, not "Member detail": with a handful of
// these open they were indistinguishable in the browser's history. The read is
// best-effort - a title is never worth a 500 on the screen behind it - and the
// render below fetches the full row separately, on the same request.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const member = await prisma.member.findUnique({
      where: { id },
      select: { displayName: true, fullName: true, username: true },
    })
    const name = member?.displayName ?? member?.fullName ?? member?.username
    if (name) return { title: `Members: ${name} — Admin` }
  } catch {
    // fall through
  }
  return { title: 'Members — Admin' }
}

export default async function MemberDetailPage({ params }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.view'))) {
    return <div className="alert alert-danger">You do not have permission to view members.</div>
  }

  const { id } = await params
  const [member, extensionModules, config] = await Promise.all([
    prisma.member.findUnique({
      where: { id },
      include: {
        role: { select: { name: true } },
        password: { select: { id: true } },
        twoFactorConfigs: { where: { verified: true }, select: { method: true } },
        _count: { select: { passkeys: true, adminNotes: true } },
      },
    }),
    prisma.module.findMany({
      where: { ...INSTALLED_MODULE_WHERE },
      select: { manifest: true },
    }),
    getMembersConfig(),
  ])
  if (!member) notFound()

  const now = new Date()
  const [sessionStats, lastLogin, avatarMedia] = await Promise.all([
    prisma.memberSession.aggregate({
      where: { memberId: id, expiresAt: { gt: now } },
      _count: { _all: true },
      _max: { lastActiveAt: true },
    }),
    prisma.memberActivityEvent.findFirst({
      where: { memberId: id, type: 'login' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    member.avatarMediaId
      ? prisma.media.findUnique({ where: { id: member.avatarMediaId }, select: { url: true } })
      : Promise.resolve(null),
  ])

  const sectionEntries: ExtensionPointEntry[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point === 'members.admin-member-detail') sectionEntries.push(entry)
    }
  }

  // Every remaining permission - the six action gates plus one per module-contributed
  // section - resolved in a single query rather than a round-trip apiece.
  const granted = await hasPermissions(user, [
    ...new Set([
      'members.edit',
      'members.suspend',
      'members.approve',
      'members.trust',
      'members.notes',
      'members.delete',
      ...sectionEntries.map((e) => e.permission).filter((p): p is string => !!p),
    ]),
  ])

  const sectionIds = sectionEntries
    .filter((entry) => !entry.permission || granted[entry.permission])
    .map((entry) => entry.id)
  const sectionComponents = moduleExtensionPointComponents['members.admin-member-detail'] ?? {}

  // A verified member whose account is still blank but whose orders say who they
  // are: show that, as the People list does. Display only, and a module the
  // viewer may not see the customers of is not asked.
  const [shown] = member.emailVerified
    ? await fillContactDetailsFromProviders(await peopleCustomerProviders(user), [
        { memberId: member.id, email: member.email, fullName: member.fullName, organisation: member.organisation },
      ])
    : [{ fullName: member.fullName, organisation: member.organisation }]

  const avatarChoice = resolveEffectiveAvatarChoice(member.avatarChoice, config)
  const detail: MemberDetail = {
    id: member.id,
    email: member.email,
    username: member.username,
    displayName: member.displayName,
    fullName: shown?.fullName ?? member.fullName,
    organisation: shown?.organisation ?? member.organisation,
    bio: member.bio,
    websiteUrl: member.websiteUrl,
    status: member.status,
    trusted: member.trusted,
    emailVerified: member.emailVerified,
    emailVerifiedAt: member.emailVerifiedAt?.toISOString() ?? null,
    marketingConsent: member.marketingConsent,
    roleName: member.role?.name ?? null,
    avatarChoice,
    avatarUrl: avatarChoice === 'UPLOAD' ? avatarMedia?.url ?? null : null,
    suspensionReason: member.suspensionReason,
    suspendedUntil: member.suspendedUntil?.toISOString() ?? null,
    deletionScheduledAt: member.deletionScheduledAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    isStaff: member.userId !== null,
  }
  const security: MemberSecuritySummary = {
    hasPassword: member.password !== null,
    passkeyCount: member._count.passkeys,
    twoFactorMethods: member.twoFactorConfigs.map((c) => c.method),
    activeSessionCount: sessionStats._count._all,
    lastActiveAt: sessionStats._max.lastActiveAt?.toISOString() ?? null,
    lastLoginAt: lastLogin?.createdAt.toISOString() ?? null,
  }

  return (
    <MemberDetailClient
      member={detail}
      security={security}
      noteCount={member._count.adminNotes}
      hasModuleSections={sectionIds.some((sid) => sectionComponents[sid])}
      renderedAt={now.getTime()}
      fields={{
        // The profile card shows what the site actually asks members for, and
        // nothing else: a display name only where sign-up asks for one, a bio
        // and website only where members have the Profile section to fill them
        // in. Organisation follows the account page's own switch, and is shown
        // anyway where one was given (an order can carry it in).
        displayName: config.registrationCollectDisplayName,
        bioAndWebsite: isAccountSectionEnabled(config, 'profile'),
        organisation: config.accountCollectOrganisation,
      }}
      permissions={{
        canEdit: granted['members.edit'] === true,
        canSuspend: granted['members.suspend'] === true,
        canApprove: granted['members.approve'] === true,
        canTrust: granted['members.trust'] === true,
        canNotes: granted['members.notes'] === true,
        canDelete: granted['members.delete'] === true,
      }}
    >
      {sectionIds.map((sid) => {
        const Section = sectionComponents[sid]
        return Section ? <Section key={sid} memberId={member.id} /> : null
      })}
    </MemberDetailClient>
  )
}
