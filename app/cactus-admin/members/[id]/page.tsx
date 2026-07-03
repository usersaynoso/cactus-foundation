import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
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
  const member = await prisma.member.findUnique({ where: { id } })
  if (!member) notFound()

  const [canEdit, canSuspend, canApprove, canTrust, canNotes, canDelete] = await Promise.all([
    hasPermission(user, 'members.edit'),
    hasPermission(user, 'members.suspend'),
    hasPermission(user, 'members.approve'),
    hasPermission(user, 'members.trust'),
    hasPermission(user, 'members.notes'),
    hasPermission(user, 'members.delete'),
  ])

  const extensionModules = await prisma.module.findMany({
    where: { status: { in: ['active', 'update_available'] } },
    select: { manifest: true },
  })
  const sectionIds: string[] = []
  for (const mod of extensionModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== 'members.admin-member-detail') continue
      if (!entry.permission || (await hasPermission(user, entry.permission))) {
        sectionIds.push(entry.id)
      }
    }
  }
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
