import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getEmailTemplateDef } from '@/lib/email/registry'
import { previewEmailTemplate } from '@/lib/email/render'

const Body = z.object({
  key: z.string(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  wrapperLayoutId: z.string().nullable().optional(),
})

// Renders unsaved editor content through the real send path and hands back the
// HTML for the preview pane. Same code as an actual send right up to the point
// of posting it, so what an owner sees here is what lands.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'emails.templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success || !getEmailTemplateDef(parsed.data.key)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  }

  const { key, subject, bodyHtml, wrapperLayoutId } = parsed.data
  const rendered = await previewEmailTemplate(key, { subject, bodyHtml, wrapperLayoutId })
  return NextResponse.json({ subject: rendered.subject, html: rendered.html })
}
