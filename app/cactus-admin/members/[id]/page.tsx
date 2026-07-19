import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission, hasPermissions } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import MemberDetailClient from './MemberDetailClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Member detail — Admin' }

type ExtensionPointEntry = { point: string; id: string; permission?: string }
type Props = { params: Promise<{ id: string }> }

export default async function MemberDetailPage({ params }: Props) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasPermission(user, 'members.view'))) {
    return <div className="alert alert-danger">You do not have permission to view members.</div>
  }

  const { id } = await params
  const [member, extensionModules] = await Promise.all([
    prisma.member.findUnique({ where: { id } }),
    prisma.module.findMany({
      where: { ...INSTALLED_MODULE_WHERE },
      select: { manifest: true },
    }),
  ])
  if (!member) notFound()

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
  const canEdit = granted['members.edit'] === true
  const canSuspend = granted['members.suspend'] === true
  const canApprove = granted['members.approve'] === true
  const canTrust = granted['members.trust'] === true
  const canNotes = granted['members.notes'] === true
  const canDelete = granted['members.delete'] === true

  const sectionIds = sectionEntries
    .filter((entry) => !entry.permission || granted[entry.permission])
    .map((entry) => entry.id)
  const sectionComponents = moduleExtensionPointComponents['members.admin-member-detail'] ?? {}

  return (
    <MemberDetailClient
      member={{
        id: member.id,
        email: member.email,
        username: member.username,
        displayName: member.displayName,
        bio: member.bio,
        websiteUrl: member.websiteUrl,
        status: member.status,
        trusted: member.trusted,
        suspensionReason: member.suspensionReason,
        suspendedUntil: member.suspendedUntil?.toISOString() ?? null,
        deletionScheduledAt: member.deletionScheduledAt?.toISOString() ?? null,
        createdAt: member.createdAt.toISOString(),
      }}
      permissions={{ canEdit, canSuspend, canApprove, canTrust, canNotes, canDelete }}
    >
      {sectionIds.map((id) => {
        const Section = sectionComponents[id]
        return Section ? <Section key={id} memberId={member.id} /> : null
      })}
    </MemberDetailClient>
  )
}
