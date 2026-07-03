import { prisma } from '@/lib/db/prisma'
import { isBlocklisted } from '@/lib/config/site'
import { hashMemberToken, createVerificationToken } from '@/lib/members/tokens'
import { getMemberAreaPath } from '@/lib/members/paths'
import { sendMemberEmail } from '@/lib/email/templates'
import type { MembersConfig } from '@/lib/members/config'
import type { MemberStatus } from '@prisma/client'

const USERNAME_RE = /^[a-z0-9_-]{2,32}$/

export function isUsernameFormatValid(username: string): boolean {
  return USERNAME_RE.test(username)
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (isBlocklisted(username)) return false
  const existing = await prisma.member.findUnique({
    where: { username },
    select: { id: true },
  })
  return !existing
}

export function isEmailDomainAllowed(email: string, config: MembersConfig): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  if (config.blockedEmailDomains.some((d) => d.toLowerCase() === domain)) return false
  if (config.allowedEmailDomains.length === 0) return true
  return config.allowedEmailDomains.some((d) => d.toLowerCase() === domain)
}

// Status a Member row is created with. Email verification (when required
// AND actually sendable — no email provider configured means there is no
// way to ever satisfy it) always happens first; registrationMode only
// decides where a member lands once verified — see deriveActivatedStatus.
export function deriveInitialStatus(
  requireVerification: boolean,
  mode: MembersConfig['registrationMode']
): MemberStatus {
  if (requireVerification) return 'PENDING_VERIFICATION'
  return deriveActivatedStatus(mode)
}

// Status a member moves to once past registration gates (email verified,
// or skipped verification entirely).
export function deriveActivatedStatus(mode: MembersConfig['registrationMode']): MemberStatus {
  return mode === 'APPROVAL_REQUIRED' ? 'PENDING_APPROVAL' : 'ACTIVE'
}

export async function validateInviteToken(
  token: string
): Promise<{ id: string } | null> {
  const tokenHash = hashMemberToken(token.trim())
  const invite = await prisma.memberInvite.findUnique({ where: { tokenHash } })
  if (!invite) return null
  if (invite.usedAt || invite.revokedAt) return null
  if (invite.expiresAt < new Date()) return null
  return { id: invite.id }
}

export async function consumeInviteToken(inviteId: string, memberId: string): Promise<void> {
  await prisma.memberInvite.update({
    where: { id: inviteId },
    data: { usedAt: new Date(), usedByMemberId: memberId },
  })
}

// Issues a fresh verification token and emails the link. Shared by the
// register route (first send) and the verify-email resend route.
export async function sendVerificationEmail(
  memberId: string,
  email: string,
  siteName: string
): Promise<void> {
  const token = await createVerificationToken(memberId)
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const verifyUrl = `${siteUrl}/${getMemberAreaPath()}/verify-email?token=${token}`
  await sendMemberEmail({ email }, 'member.verify-email', { siteName, verifyUrl })
}

// Single source of truth for "can this member sign in right now" across every
// login method (passkey, magic link, password). Only ACTIVE members may. The
// PENDING_VERIFICATION case carries redirectToVerify so the login form can
// send them to the Phase 1 holding page instead of just showing an error.
export function loginRejectionForStatus(
  status: MemberStatus
): { error: string; redirectToVerify?: boolean } | null {
  switch (status) {
    case 'ACTIVE':
      return null
    case 'PENDING_VERIFICATION':
      return { error: 'Please verify your email address before signing in.', redirectToVerify: true }
    case 'PENDING_APPROVAL':
      return { error: 'Your account is awaiting admin approval.' }
    case 'SUSPENDED':
      return { error: 'This account has been suspended.' }
    case 'DELETED':
      return { error: 'This account no longer exists.' }
  }
}
