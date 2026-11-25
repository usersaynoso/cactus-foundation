import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberAuthFromRequest } from '@/lib/members/api-auth'
import { mintMemberStepUpGrant, STEP_UP_TTL_MS } from '@/lib/members/api-step-up'
import { verifyPassword } from '@/lib/auth/password'
import { checkAndRecord } from '@/lib/auth/rate-limit'
import { createMemberEmailChallenge, verifyMemberEmailChallenge } from '@/lib/members/email-challenge'
import { recordMemberActivity } from '@/lib/members/activity'
import { isEmailConfigured } from '@/lib/config/env'

// An app (a module's Bearer token, lib/members/api-auth.ts) confirming it is
// still the member before a sensitive account change. See
// lib/members/api-step-up.ts for what the grant is and what it is good for.
//
// Token callers only. A browser proves the same thing by having signed in
// recently, and its routes keep that rule; a grant minted for a cookie would
// have no credential to be bound to.
//
//   GET                                  which methods this member can use
//   POST { method: 'password', password } -> { grant, expiresAt }
//   POST { method: 'email' }              -> { sent: true } (a code to the account's address)
//   POST { method: 'email', code }        -> { grant, expiresAt }

const TOKEN_ONLY = 'This is for the apps. In a browser, sign in again instead.'

const Body = z.discriminatedUnion('method', [
  z.object({ method: z.literal('password'), password: z.string().min(1).max(1000) }),
  z.object({ method: z.literal('email'), code: z.string().trim().min(1).max(20).optional() }),
])

async function methodsFor(memberId: string) {
  const password = await prisma.memberPassword.findUnique({ where: { memberId }, select: { id: true } })
  return { password: !!password, email: isEmailConfigured() }
}

export async function GET(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (auth.via !== 'token') return NextResponse.json({ error: TOKEN_ONLY }, { status: 400 })

  return NextResponse.json({ methods: await methodsFor(auth.member.id), ttlSeconds: STEP_UP_TTL_MS / 1000 })
}

export async function POST(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (auth.via !== 'token') return NextResponse.json({ error: TOKEN_ONLY }, { status: 400 })
  const { member } = auth

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const body = parsed.data

  // Asking for a code: the only branch that sends mail, so it has its own limit.
  if (body.method === 'email' && body.code === undefined) {
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'This site cannot send email at the moment. Use your password instead.' }, { status: 503 })
    }
    const limit = await checkAndRecord('member_api_step_up_send', [`member:${member.id}`])
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many codes asked for. Wait a quarter of an hour and try again.' }, { status: 429 })
    }
    const code = await createMemberEmailChallenge(member.id, 'step_up')
    const site = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
    try {
      const { sendLoginOtp } = await import('@/lib/email/index')
      await sendLoginOtp(member.email, code, site?.siteName ?? 'Cactus')
    } catch (error) {
      console.error('[members/step-up] code failed to send', error)
      return NextResponse.json({ error: 'We could not send the code. Please try again.' }, { status: 502 })
    }
    return NextResponse.json({ sent: true })
  }

  // Every guess, password or code, counts against one bucket per member.
  const limit = await checkAndRecord('member_api_step_up', [`member:${member.id}`])
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Wait a quarter of an hour and try again.' }, { status: 429 })
  }

  if (body.method === 'password') {
    const stored = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
    if (!stored) {
      return NextResponse.json({ error: 'Your account has no password. Ask for an email code instead.' }, { status: 400 })
    }
    if (!(await verifyPassword(body.password, stored.hash))) {
      return NextResponse.json({ error: 'That password is not right.' }, { status: 401 })
    }
  } else {
    const result = await verifyMemberEmailChallenge(member.id, 'step_up', body.code ?? '')
    if (!result.success) {
      const error =
        result.reason === 'expired'
          ? 'That code has expired. Ask for a new one.'
          : result.reason === 'max_attempts'
            ? 'Too many wrong codes. Ask for a new one.'
            : 'That code is not right.'
      return NextResponse.json({ error }, { status: 401 })
    }
  }

  const { grant, expiresAt } = await mintMemberStepUpGrant(auth)
  await recordMemberActivity(member.id, 'step_up_confirmed', {
    metadata: { method: body.method, app: auth.moduleName, device: auth.label },
  })
  return NextResponse.json({ grant, expiresAt: expiresAt.toISOString() })
}
