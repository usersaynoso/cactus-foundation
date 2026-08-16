import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSmsTemplateDef } from '@/lib/sms/registry'
import { previewSmsTemplate, smsSegments } from '@/lib/sms/render'

const Body = z.object({
  key: z.string(),
  body: z.string().optional(),
})

// Renders unsaved editor content through the real send path and hands back the
// text, plus what it would cost in segments. Same code as an actual send right
// up to the point of handing it to the provider.
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

  const text = await previewSmsTemplate(parsed.data.key, { body: parsed.data.body })
  return NextResponse.json({ text, ...smsSegments(text) })
}
