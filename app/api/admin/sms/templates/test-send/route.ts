import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getActiveSmsProvider } from '@/lib/auth/sms'
import { getSmsTemplateDef } from '@/lib/sms/registry'
import { previewSmsTemplate } from '@/lib/sms/render'
import { normaliseSmsNumber } from '@/lib/sms/send'

const Body = z.object({
  key: z.string(),
  body: z.string().optional(),
  to: z.string().min(1),
})

// Sends the message - including any unsaved edit open in the editor - to a
// number the admin types in, with stand-in merge values. Unlike the email test
// send there is no address on the session to fall back on: an admin account has
// an email, not a phone. Rate limiting is not needed on top of the permission
// check, but the number is normalised so a typed-in 07 number works.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'sms.templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success || !getSmsTemplateDef(parsed.data.key)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  }

  const to = normaliseSmsNumber(parsed.data.to)
  if (!to) {
    return NextResponse.json({ error: 'That does not look like a mobile number. Try it in full, e.g. +447700900123.' }, { status: 400 })
  }

  const provider = await getActiveSmsProvider()
  if (!provider) {
    return NextResponse.json({ error: 'Text messaging is not set up yet.' }, { status: 503 })
  }

  const text = await previewSmsTemplate(parsed.data.key, { body: parsed.data.body })

  try {
    await provider.sendSms(to, `[Test] ${text}`)
    return NextResponse.json({ ok: true, to })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }
}
