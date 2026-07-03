import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { notifyAdminMemberDeletionRequested } from '@/lib/members/admin-notify'
import { sendMemberEmail } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

async function getSiteName(): Promise<string> {
  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  return config?.siteName ?? 'Cactus'
}

export async function requestMemberDeletion(memberId: string): Promise<Date> {
  const config = await getMembersConfig()
  const scheduledAt = new Date(Date.now() + config.deletionGracePeriodDays * 24 * 60 * 60 * 1000)
  const member = await prisma.member.update({
    where: { id: memberId },
    data: { deletionRequestedAt: new Date(), deletionScheduledAt: scheduledAt },
    select: { username: true, email: true },
  })

  if (isEmailConfigured()) {
    const siteName = await getSiteName()
    await sendMemberEmail(
      { email: member.email },
      'member.deletion-requested',
      { siteName, scheduledAt: scheduledAt.toLocaleDateString('en-GB') }
    ).catch(() => {})
  }

  if (config.adminNotifyOnDeletion) {
    await notifyAdminMemberDeletionRequested(memberId, member.username).catch(() => {})
  }

  return scheduledAt
}

export async function cancelMemberDeletion(memberId: string): Promise<void> {
  const member = await prisma.member.update({
    where: { id: memberId },
    data: { deletionRequestedAt: null, deletionScheduledAt: null },
    select: { email: true },
  })

  if (isEmailConfigured()) {
    const siteName = await getSiteName()
    await sendMemberEmail({ email: member.email }, 'member.deletion-cancelled', { siteName }).catch(() => {})
  }
}

// Cron target: hard-deletes every member whose grace period has elapsed.
// Cascades (see schema) take every child row (sessions, passkeys, consent
// records, admin notes/action log, etc.) with it.
export async function purgeScheduledDeletions(): Promise<number> {
  const result = await prisma.member.deleteMany({
    where: { deletionScheduledAt: { lte: new Date() } },
  })
  return result.count
}
