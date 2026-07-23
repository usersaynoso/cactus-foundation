import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { resolveEffectiveAvatarChoice } from '@/lib/members/avatar'
import { isHttpUrl } from '@/lib/utils'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  // Effective, not raw, choice - if an admin has since disabled uploads/
  // gravatar, this keeps the profile-preview MemberAvatar and the "Current: …"
  // hint/Remove-button logic in ProfileSection.tsx in agreement about what's
  // actually being shown. The member's stored choice + uploaded file are
  // untouched, so re-enabling the toggle restores it with no action needed.
  const avatarChoice = resolveEffectiveAvatarChoice(member.avatarChoice, config)

  let avatarUrl: string | null = null
  if (avatarChoice === 'UPLOAD' && member.avatarMediaId) {
    const media = await prisma.media.findUnique({ where: { id: member.avatarMediaId }, select: { url: true } })
    avatarUrl = media?.url ?? null
  }

  return NextResponse.json({
    id: member.id,
    email: member.email,
    username: member.username,
    displayName: member.displayName,
    bio: member.bio,
    websiteUrl: member.websiteUrl,
    avatarChoice,
    avatarUrl,
    avatarUploadsEnabled: config.avatarUploadsEnabled,
    createdAt: member.createdAt,
  })
}

const Body = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  // Must be a real http(s) link. Zod's .url() alone accepts "javascript:…",
  // which lands in an href on the public profile page - stored XSS.
  websiteUrl: z.string().trim().max(300).refine(isHttpUrl, 'Enter a valid website address (http or https)').nullable().or(z.literal('')).optional(),
})

export async function PATCH(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { displayName, bio, websiteUrl } = parsed.data

  const updated = await prisma.member.update({
    where: { id: member.id },
    data: {
      ...(displayName !== undefined ? { displayName: displayName || null } : {}),
      ...(bio !== undefined ? { bio: bio || null } : {}),
      ...(websiteUrl !== undefined ? { websiteUrl: websiteUrl || null } : {}),
    },
    select: { displayName: true, bio: true, websiteUrl: true },
  })

  return NextResponse.json(updated)
}
