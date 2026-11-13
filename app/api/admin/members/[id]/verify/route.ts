import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'
import { getMembersConfig } from '@/lib/members/config'
import { deriveActivatedStatus } from '@/lib/members/registration'

// Marks a member's email address as confirmed by hand - the admin's word in
// place of the member clicking the link in their inbox. For the customer who
// rang up, the address that bounces the verification email, the account made
// at a checkout and never confirmed.
//
// It is worth exactly what the link is worth, so it does exactly what the link
// does (app/api/members/verify-email): the flag, the timestamp, and a member
// still waiting on verification moves on to wherever the site's registration
// mode sends a verified member - ACTIVE, or PENDING_APPROVAL on a site that
// wants an admin to approve them as well. Any other status is left alone: a
// suspended member stays suspended however verified their address is.
//
// Gated on members.approve rather than members.edit because of what it unlocks.
// A verified address is the proof modules lean on before matching things up by
// email - the shop hands a member the guest orders placed at their address only
// once it is verified - so this is an access decision, not a profile tweak.
//
// One way only. There is no "unverify": the address was either confirmed or it
// was not, and taking the flag away again would not take back anything a module
// already matched up on the strength of it.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.approve'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const member = await prisma.member.findUnique({
    where: { id },
    select: { status: true, emailVerified: true, emailVerifiedAt: true },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Already done - by the member, or by another admin a moment ago. Answer with
  // what is there rather than stamping a second, later date over the real one.
  if (member.emailVerified) {
    return NextResponse.json({
      emailVerified: true,
      emailVerifiedAt: member.emailVerifiedAt?.toISOString() ?? null,
      status: member.status,
    })
  }

  const status = member.status === 'PENDING_VERIFICATION'
    ? deriveActivatedStatus((await getMembersConfig()).registrationMode)
    : member.status

  const [updated] = await prisma.$transaction([
    prisma.member.update({
      where: { id },
      data: { emailVerified: true, emailVerifiedAt: new Date(), status },
      select: { status: true, emailVerifiedAt: true },
    }),
    // Any link still sitting in their inbox is spent: it would only sign them
    // in on the back of a verification that has now happened another way.
    prisma.memberVerificationToken.deleteMany({ where: { memberId: id } }),
  ])
  await logMemberAdminAction(user, id, 'verify_email', { previousStatus: member.status, status: updated.status })

  return NextResponse.json({
    emailVerified: true,
    emailVerifiedAt: updated.emailVerifiedAt?.toISOString() ?? null,
    status: updated.status,
  })
}
