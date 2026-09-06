import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'
import { toE164 } from '@/lib/phone'
import { siteDiallingCode } from '@/lib/phone.server'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const [dbUser, diallingCode] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, username: true, displayName: true, phone: true },
    }),
    siteDiallingCode(),
  ])
  if (!dbUser) return errorResponse('Not authenticated', 401)

  // The dialling code rides along so the account page can say which country a
  // short number will be read as, rather than the owner finding out when a call
  // goes to the wrong one.
  return NextResponse.json({ ...dbUser, diallingCode })
}

const Body = z.object({
  displayName: z.string().max(128).optional(),
  /** As typed - "020 8138 0512" is a perfectly good answer. Stored in the one
   *  shape a telephony provider will take; see lib/phone.ts. */
  phone: z.string().max(40).optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
  }

  let phone: string | null = null
  const typed = parsed.data.phone?.trim() ?? ''
  if (typed) {
    phone = toE164(typed, await siteDiallingCode())
    if (!phone) {
      return errorResponse('That does not look like a phone number. Try it as 020 8138 0512, or with the country code as +44 20 8138 0512.', 400)
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName ?? null, phone },
  })

  return NextResponse.json({ ok: true, phone })
}
