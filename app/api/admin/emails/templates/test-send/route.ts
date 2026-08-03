import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { sendEmail } from '@/lib/email/index'
import { getEmailTemplateDef } from '@/lib/email/registry'
import { previewEmailTemplate } from '@/lib/email/render'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({
  key: z.string(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  wrapperLayoutId: z.string().nullable().optional(),
})

// Sends the template - including any unsaved edit open in the editor - to the
// requesting admin's own address, with stand-in merge values. Never to anyone
// else: a test send is for checking the design, not a broadcast tool.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'emails.templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not configured' }, { status: 503 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success || !getEmailTemplateDef(parsed.data.key)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  }

  const { key, subject, bodyHtml, wrapperLayoutId } = parsed.data
  const rendered = await previewEmailTemplate(key, { subject, bodyHtml, wrapperLayoutId })

  try {
    await sendEmail({ to: user.email, subject: `[Test] ${rendered.subject}`, html: rendered.html, text: rendered.text })
    return NextResponse.json({ ok: true, to: user.email })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }
}
