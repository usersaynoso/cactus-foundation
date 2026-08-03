import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { profileSectionOffResponse } from '@/lib/members/account-sections'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const visibility = await prisma.memberProfileVisibility.findUnique({ where: { memberId: member.id } })
  return NextResponse.json({
    showBio: visibility?.showBio ?? true,
    showJoinDate: visibility?.showJoinDate ?? true,
    showWebsite: visibility?.showWebsite ?? true,
  })
}

const Body = z.object({
  showBio: z.boolean().optional(),
  showJoinDate: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // These switches only exist on the profile page, so switching that off takes
  // them with it - the public profile itself is governed by profileVisibility
  // in settings, which is an admin's control and unaffected.
  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const visibility = await prisma.memberProfileVisibility.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, ...parsed.data },
    update: parsed.data,
  })

  return NextResponse.json({
    showBio: visibility.showBio,
    showJoinDate: visibility.showJoinDate,
    showWebsite: visibility.showWebsite,
  })
}
