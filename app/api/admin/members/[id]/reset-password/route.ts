import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { logMemberAdminAction } from '@/lib/members/admin-log'

// There is no admin-settable member password (only the member themselves
// ever knows/sets one) - "manual password reset" removes the password and
// 2FA configuration entirely, forcing the member back onto passkey/magic
// link until they set a new password (and, since it's mandatory alongside
// one, new 2FA) themselves from their account Security page.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.memberPassword.deleteMany({ where: { memberId: id } })
  await prisma.memberTwoFactor.deleteMany({ where: { memberId: id } })
  await logMemberAdminAction(user, id, 'reset_password')

  return NextResponse.json({ ok: true })
}
