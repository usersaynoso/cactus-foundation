import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { MEMBER_EMAIL_TEMPLATES, type MemberEmailTemplateKey } from '@/lib/email/templates'

function isValidKey(key: string): key is MemberEmailTemplateKey {
  return key in MEMBER_EMAIL_TEMPLATES
}

const Body = z.object({
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.email-templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key } = await params
  if (!isValidKey(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const template = await prisma.emailTemplate.upsert({
    where: { key },
    create: { key, subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, updatedById: user.id },
    update: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, updatedById: user.id },
  })

  return NextResponse.json({ template })
}

// Reset to the code default.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.email-templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key } = await params
  await prisma.emailTemplate.deleteMany({ where: { key } })

  return NextResponse.json({ ok: true })
}
