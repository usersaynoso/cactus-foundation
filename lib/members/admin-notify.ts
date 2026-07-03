import { prisma } from '@/lib/db/prisma'
import { upsertAlert } from '@/lib/notifications/alerts'
import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

// Both send an in-app admin notification (reusing the generic 'message' type
// and the existing upsertAlert dedupe mechanism - a member has no dedicated
// NotificationType of its own, adding one is a schema change) and, when email
// is configured, a plain email to every protected-role admin. Gated by
// membersConfig.notifyAdminOnPendingApproval / adminNotifyOnDeletion at the
// call site, not in here.

async function getAdminEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: { isProtected: true } }, select: { email: true } })
  return admins.map((a) => a.email)
}

async function getSiteName(): Promise<string> {
  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  return config?.siteName ?? 'Cactus'
}

export async function notifyAdminMemberPendingApproval(memberId: string, username: string): Promise<void> {
  await upsertAlert({
    type: 'message',
    dedupeKey: `member-pending-approval:${memberId}`,
    title: `New member awaiting approval: ${username}`,
    link: '/users?tab=pending-approval',
  })

  if (!isEmailConfigured()) return
  const [emails, siteName] = await Promise.all([getAdminEmails(), getSiteName()])
  await Promise.all(
    emails.map((to) =>
      sendEmail({
        to,
        subject: `${siteName}: new member awaiting approval`,
        html: `<p><strong>${username}</strong> has registered and is awaiting approval.</p>`,
        text: `${username} has registered and is awaiting approval.`,
      }).catch(() => {})
    )
  )
}

export async function notifyAdminMemberDeletionRequested(memberId: string, username: string): Promise<void> {
  await upsertAlert({
    type: 'message',
    dedupeKey: `member-deletion:${memberId}`,
    title: `Member scheduled for deletion: ${username}`,
    link: `/members/${memberId}`,
  })

  if (!isEmailConfigured()) return
  const [emails, siteName] = await Promise.all([getAdminEmails(), getSiteName()])
  const { subject, html, text } = await renderEmailTemplate('member.deletion-admin-notify', { siteName, username })
  await Promise.all(
    emails.map((to) => sendEmail({ to, subject, html, text }).catch(() => {}))
  )
}
