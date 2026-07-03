import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { sendEmail } from '@/lib/email/index'
import { renderEmailTemplate, MEMBER_EMAIL_TEMPLATES, type MemberEmailTemplateKey } from '@/lib/email/templates'
import { isEmailConfigured } from '@/lib/config/env'

function isValidKey(key: string): key is MemberEmailTemplateKey {
  return key in MEMBER_EMAIL_TEMPLATES
}

const Body = z.object({ key: z.string() })

// Sends the *currently saved* (override or default) render of a template to
// the requesting admin's own address, with each merge tag filled in with a
// placeholder value so the email looks realistic without needing real data.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.email-templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not configured' }, { status: 503 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success || !isValidKey(parsed.data.key)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  }
  const key = parsed.data.key

  const sampleVars: Record<string, string> = {}
  for (const tag of MEMBER_EMAIL_TEMPLATES[key].mergeTags) {
    sampleVars[tag] = `[${tag}]`
  }

  const { subject, html, text } = await renderEmailTemplate(key, sampleVars)

  try {
    await sendEmail({ to: user.email, subject: `[Test] ${subject}`, html, text })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }
}
