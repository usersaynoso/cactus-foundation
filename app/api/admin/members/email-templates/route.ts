import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { MEMBER_EMAIL_TEMPLATES, listMemberEmailTemplateKeys } from '@/lib/email/templates'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'members.email-templates'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const overrides = await prisma.emailTemplate.findMany()
  const overridesByKey = new Map(overrides.map((o) => [o.key, o]))

  const templates = listMemberEmailTemplateKeys().map((key) => {
    const def = MEMBER_EMAIL_TEMPLATES[key]
    const override = overridesByKey.get(key)
    return {
      key,
      label: def.label,
      mergeTags: def.mergeTags,
      transactional: def.transactional,
      subject: override?.subject ?? def.subject,
      bodyHtml: override?.bodyHtml ?? def.bodyHtml,
      isOverridden: !!override,
      updatedAt: override?.updatedAt ?? null,
    }
  })

  return NextResponse.json({ templates })
}
