import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromRequest } from '@/lib/members/api-auth'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { profileSectionOffResponse } from '@/lib/members/account-sections'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
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
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // These switches only exist on the profile page, so switching that off takes
  // them with it - the public profile itself is governed by profileVisibility
  // in settings, which is an admin's control and unaffected.
  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()

  // With public profiles switched off there is nothing for these to govern,
  // and the page no longer shows them.
  if (config.profileVisibility === 'HIDDEN') {
    return NextResponse.json({ error: 'Public profiles are switched off on this site' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  // A switch for a field the site does not ask for is not on the page; dropped
  // rather than saved, so it is still what the member left it as if the field
  // comes back.
  const data = {
    ...(parsed.data.showJoinDate !== undefined ? { showJoinDate: parsed.data.showJoinDate } : {}),
    ...(config.profileCollectBio && parsed.data.showBio !== undefined ? { showBio: parsed.data.showBio } : {}),
    ...(config.profileCollectWebsite && parsed.data.showWebsite !== undefined ? { showWebsite: parsed.data.showWebsite } : {}),
  }

  const visibility = await prisma.memberProfileVisibility.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, ...data },
    update: data,
  })

  return NextResponse.json({
    showBio: visibility.showBio,
    showJoinDate: visibility.showJoinDate,
    showWebsite: visibility.showWebsite,
  })
}
