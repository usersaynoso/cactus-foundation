import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import {
  adminPasskeyRemovalBlocked,
  consumeAdminStepUpGrant,
  findLinkedAdminForMember,
} from '@/lib/members/admin-passkey-manage'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

// Removes one of the admin's own admin passkeys from the member security page.
// Needs a fresh admin-passkey confirmation (step-up/verify), spent here.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  const admin = isAccountSectionEnabled(config, 'security') ? await findLinkedAdminForMember(member, config) : null
  if (!admin) return NextResponse.json({ error: 'Not available for this account' }, { status: 403 })

  const { id } = await params
  const passkey = await prisma.passkey.findUnique({ where: { id }, select: { id: true, userId: true } })
  if (!passkey || passkey.userId !== admin.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const blocked = await adminPasskeyRemovalBlocked(admin, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

  if (!(await consumeAdminStepUpGrant(member.id, admin.id))) {
    return NextResponse.json(
      { error: 'Confirm it is you with an admin passkey first.', stepUpRequired: true },
      { status: 403 }
    )
  }

  await prisma.passkey.deleteMany({ where: { id, userId: admin.id } })
  await notifyMemberSecurityAlert(member, 'An admin passkey was removed from your account.')
  return NextResponse.json({ ok: true })
}
