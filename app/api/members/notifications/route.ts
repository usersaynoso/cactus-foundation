import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getModuleNotificationCategories } from '@/lib/modules/member-extensions'
import { DEFAULT_CHANNEL_PREFERENCE } from '@/lib/members/notification-prefs'
import { isSmsAvailable } from '@/lib/sms/send'

// Categories come entirely from active modules' manifest.memberExtensions -
// core has no non-transactional notification types of its own yet (things
// like the security-alert email are transactional and bypass preferences
// altogether, see MEMBERS_SPEC.md Email section).
//
// Each category can be delivered by email, by text, or by both, depending on
// what the module declared and whether the site can send a text at all. A
// category the module marked `required` may have its delivery changed but not
// switched off: at least one channel stays on.

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [categories, prefs, smsAvailable] = await Promise.all([
    getModuleNotificationCategories(),
    prisma.memberNotificationPreference.findMany({ where: { memberId: member.id } }),
    isSmsAvailable(),
  ])

  const prefFor = (category: string, channel: 'EMAIL' | 'SMS') =>
    prefs.find((p) => p.category === category && p.channel === channel)

  return NextResponse.json({
    smsAvailable,
    categories: categories.map((c) => {
      const email = prefFor(c.category, 'EMAIL')
      const sms = prefFor(c.category, 'SMS')
      // A channel the module never offered is not a choice the member has, so
      // it is reported as unavailable rather than as an unticked box.
      const smsOffered = c.channels.includes('SMS') && smsAvailable
      return {
        category: c.category,
        label: c.label,
        required: c.required,
        emailOffered: c.channels.includes('EMAIL'),
        smsOffered,
        email: email?.enabled ?? DEFAULT_CHANNEL_PREFERENCE.email,
        sms: smsOffered ? sms?.enabled ?? DEFAULT_CHANNEL_PREFERENCE.sms : false,
        digestMode: email?.digestMode ?? 'INSTANT',
      }
    }),
  })
}

const Body = z.object({
  category: z.string().min(1),
  // Omitted means email, which is what every caller meant before texts existed.
  channel: z.enum(['EMAIL', 'SMS']).default('EMAIL'),
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
  const { category, channel, enabled, digestMode } = parsed.data

  const categories = await getModuleNotificationCategories()
  const def = categories.find((c) => c.category === category)
  if (!def) return NextResponse.json({ error: 'Unknown notification category' }, { status: 404 })

  if (channel === 'SMS') {
    if (!def.channels.includes('SMS')) {
      return NextResponse.json({ error: 'That one is not sent by text message.' }, { status: 400 })
    }
    if (enabled && !(await isSmsAvailable())) {
      return NextResponse.json({ error: 'Text messages are not set up on this site yet.' }, { status: 503 })
    }
  }

  // The last way of being told cannot be switched off for a category the module
  // marked required - an order somebody has paid for is not a subscription.
  if (enabled === false && def.required) {
    const others = await prisma.memberNotificationPreference.findMany({
      where: { memberId: member.id, category },
      select: { channel: true, enabled: true },
    })
    const stateOf = (c: 'EMAIL' | 'SMS') => {
      const row = others.find((o) => o.channel === c)
      return row ? row.enabled : c === 'EMAIL' ? DEFAULT_CHANNEL_PREFERENCE.email : DEFAULT_CHANNEL_PREFERENCE.sms
    }
    const smsAvailable = await isSmsAvailable()
    const stillOn = (['EMAIL', 'SMS'] as const).filter((c) => {
      if (c === channel) return false
      if (!def.channels.includes(c)) return false
      if (c === 'SMS' && !smsAvailable) return false
      return stateOf(c)
    })
    if (stillOn.length === 0) {
      return NextResponse.json(
        { error: 'Pick another way to hear about these first - we cannot leave you with no way of being told.' },
        { status: 400 },
      )
    }
  }

  const pref = await prisma.memberNotificationPreference.upsert({
    where: { memberId_channel_category: { memberId: member.id, channel, category } },
    create: {
      memberId: member.id,
      channel,
      category,
      enabled: enabled ?? true,
      digestMode: digestMode ?? 'INSTANT',
    },
    update: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(digestMode !== undefined ? { digestMode } : {}),
    },
  })

  return NextResponse.json({
    category: pref.category,
    channel: pref.channel,
    enabled: pref.enabled,
    digestMode: pref.digestMode,
  })
}
