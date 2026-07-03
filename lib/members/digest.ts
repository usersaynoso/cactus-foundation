import { prisma } from '@/lib/db/prisma'
import { sendMemberEmail } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

type DigestMode = 'DAILY' | 'WEEKLY'

// Batches module-sourced MemberActivityEvent rows into one digest email per
// member per run. An event's `type` doubles as the MemberNotificationPreference
// `category` it belongs to (MEMBERS_SPEC.md amendment 5 - modules declare
// notificationCategories, core has none of its own). Cursored by a fixed
// look-back window (24h/7d) rather than a stored "last sent" timestamp - simpler,
// correct as long as the cron runs on schedule, no schema change needed.
export async function runDigest(mode: DigestMode): Promise<number> {
  if (!isEmailConfigured()) return 0

  const windowMs = (mode === 'DAILY' ? 24 : 7 * 24) * 60 * 60 * 1000
  const since = new Date(Date.now() - windowMs)

  const prefs = await prisma.memberNotificationPreference.findMany({
    where: { digestMode: mode, enabled: true },
    select: { memberId: true, category: true },
  })
  if (prefs.length === 0) return 0

  const categoriesByMember = new Map<string, string[]>()
  for (const p of prefs) {
    const list = categoriesByMember.get(p.memberId) ?? []
    list.push(p.category)
    categoriesByMember.set(p.memberId, list)
  }

  const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  const siteName = siteConfig?.siteName ?? 'Cactus'
  const templateKey = mode === 'DAILY' ? ('member.digest-daily' as const) : ('member.digest-weekly' as const)

  let sent = 0
  for (const [memberId, categories] of categoriesByMember) {
    const events = await prisma.memberActivityEvent.findMany({
      where: { memberId, type: { in: categories }, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    if (events.length === 0) continue

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { email: true, status: true },
    })
    if (!member || member.status !== 'ACTIVE') continue

    const digestBody = events.map((e) => `${e.source ?? 'Site'}: ${e.type}`).join('<br>')
    await sendMemberEmail({ email: member.email }, templateKey, { siteName, digestBody }).catch(() => {})
    sent++
  }

  return sent
}
