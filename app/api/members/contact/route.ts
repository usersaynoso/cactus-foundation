import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'

// The member's real-world name: who an order is made out to, as opposed to the
// public handle. Deliberately NOT part of /api/members/profile - that one is the
// public-profile section, gated behind accountSectionsEnabled.profile and the
// registrationCollectDisplayName switch, and a shop that has both of those off
// (the common shape for a checkout-only members system) still needs somewhere to
// keep a name.
//
// No phone number here: a number belongs to the address a parcel is going to,
// not to the account, so the shop keeps one per saved address.

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  return NextResponse.json({
    // Sent alongside so a caller filling in a contact form (the shop checkout
    // does) has the whole block from one request.
    email: member.email,
    fullName: member.fullName,
  })
}

const Body = z.object({
  fullName: z.string().trim().max(120).nullable().or(z.literal('')).optional(),
})

export async function PATCH(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { fullName } = parsed.data

  const updated = await prisma.member.update({
    where: { id: member.id },
    // Emptied rather than left alone when the box is cleared: taking a name back
    // off the account is a thing a member is entitled to do.
    data: { ...(fullName !== undefined ? { fullName: fullName || null } : {}) },
    select: { fullName: true },
  })

  return NextResponse.json(updated)
}
