import { prisma } from '@/lib/db/prisma'
import { sendMemberEmail } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

// member.security-alert is transactional (see lib/email/templates.ts) - it
// always sends regardless of notification preferences, matching every other
// "something changed on your account" email (password-changed etc.) already
// sent unconditionally elsewhere in this codebase. Phase 10 hardening item:
// wired to passkey add/remove, password change, 2FA change, new trusted
// browser (MEMBERS_SPEC.md).
export async function notifyMemberSecurityAlert(
  member: { email: string },
  alertBody: string
): Promise<void> {
  if (!isEmailConfigured()) return
  const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
  await sendMemberEmail(
    { email: member.email },
    'member.security-alert',
    { siteName: siteConfig?.siteName ?? 'Cactus', alertBody }
  ).catch(() => {})
}
