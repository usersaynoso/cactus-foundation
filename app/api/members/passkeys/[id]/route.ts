import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberAuthFromRequest } from '@/lib/members/api-auth'
import { requireStepUpGrant, spendStepUpGrant } from '@/lib/members/api-step-up'
import { getMembersConfig, isAuthMethodEnabled, isAuthMethodRequired } from '@/lib/members/config'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

// From an app (a module token) removing a passkey needs a step-up grant
// (lib/members/api-step-up.ts): it takes a way into the account away.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  const needsStepUp = await requireStepUpGrant(auth, request)
  if (needsStepUp) return needsStepUp

  const { id } = await params
  const passkey = await prisma.memberPasskey.findUnique({ where: { id } })
  if (!passkey || passkey.memberId !== member.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const remaining = await prisma.memberPasskey.count({ where: { memberId: member.id, NOT: { id } } })
  if (remaining === 0) {
    const config = await getMembersConfig()

    // A site that requires passkeys would only bounce them straight back to the
    // setup step, so refuse here with the actual reason rather than letting the
    // removal succeed and the gate undo it.
    if (isAuthMethodRequired(config, 'PASSKEY')) {
      return NextResponse.json(
        { error: 'This site requires a passkey on every account, so your last one cannot be removed. Add another first.' },
        { status: 400 }
      )
    }

    // Unlike admin (where password is the only fallback), members always have
    // magic link as a fallback so long as it's an allowed method - only block
    // the deletion when NEITHER a magic-link path NOR a working password
    // exists, since that would leave zero ways to sign back in.
    const hasMagicLinkFallback = isAuthMethodEnabled(config, 'MAGIC_LINK')
    if (!hasMagicLinkFallback) {
      const password = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
      if (!password) {
        return NextResponse.json(
          { error: 'Cannot remove your only sign-in method - you would be locked out.' },
          { status: 400 }
        )
      }
    }
  }

  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

  await prisma.memberPasskey.delete({ where: { id } })
  await notifyMemberSecurityAlert(member, 'A passkey was removed from your account.')
  return NextResponse.json({ ok: true })
}
