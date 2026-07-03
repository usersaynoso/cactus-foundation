import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getModuleNotificationCategories } from '@/lib/modules/member-extensions'

// Categories come entirely from active modules' manifest.memberExtensions -
// core has no non-transactional notification types of its own yet (things
// like the security-alert email are transactional and bypass preferences
// altogether, see MEMBERS_SPEC.md Email section).
export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [categories, prefs] = await Promise.all([
    getModuleNotificationCategories(),
    prisma.memberNotificationPreference.findMany({ where: { memberId: member.id } }),
  ])

  const prefsByCategory = new Map(prefs.map((p) => [p.category, p]))
  return NextResponse.json({
    categories: categories.map((c) => {
      const pref = prefsByCategory.get(c.category)
      return {
        category: c.category,
        label: c.label,
        enabled: pref?.enabled ?? true,
        digestMode: pref?.digestMode ?? 'INSTANT',
      }
    }),
  })
}

const Body = z.object({
  category: z.string().min(1),
  enabled: z.boolean().optional(),
  digestMode: z.enum(['INSTANT', 'DAILY', 'WEEKLY', 'DISABLED']).optional(),
})

export async function PATCH(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { category, enabled, digestMode } = parsed.data

  const pref = await prisma.memberNotificationPreference.upsert({
    where: { memberId_channel_category: { memberId: member.id, channel: 'EMAIL', category } },
    create: {
      memberId: member.id,
      channel: 'EMAIL',
      category,
      enabled: enabled ?? true,
      digestMode: digestMode ?? 'INSTANT',
    },
    update: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(digestMode !== undefined ? { digestMode } : {}),
    },
  })

  return NextResponse.json({ category: pref.category, enabled: pref.enabled, digestMode: pref.digestMode })
}
