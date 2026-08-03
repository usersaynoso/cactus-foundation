import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { MembersConfigSchema, getMembersConfig, invalidateMembersConfigCache } from '@/lib/members/config'
import { hasAnyAuthMethod } from '@/lib/members/auth-policy'
import { getMemberAreaPath } from '@/lib/members/paths'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.settings'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const config = await getMembersConfig()

  return NextResponse.json({
    config,
    memberAreaPath: getMemberAreaPath(),
  })
}

// Partial update - only keys present in the body are validated/changed, the
// rest of the stored JSON is left as-is (same merge-then-validate pattern as
// designTokens/consentBannerConfig).
export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.settings'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const current = await getMembersConfig()
  const merged = MembersConfigSchema.safeParse({ ...current, ...body })
  if (!merged.success) {
    return NextResponse.json({ error: merged.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
  }

  // Turning every sign-in method off locks the members system shut with no
  // screen left to undo it from. Refused here rather than in the schema so the
  // message can say what to do about it.
  if (!hasAnyAuthMethod(merged.data)) {
    return NextResponse.json(
      { error: 'At least one sign-in method must stay switched on, or no member could ever sign in.' },
      { status: 400 }
    )
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { membersConfig: merged.data },
  })
  invalidateMembersConfigCache()

  return NextResponse.json({ config: merged.data })
}
