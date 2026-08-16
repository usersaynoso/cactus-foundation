import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSmsTemplateDef, MAX_SMS_TEMPLATE_LENGTH, missingRequiredSmsTags } from '@/lib/sms/registry'

const Body = z.object({
  body: z.string().trim().min(1).max(MAX_SMS_TEMPLATE_LENGTH).optional(),
  isActive: z.boolean().optional(),
})

async function authorise() {
  const user = await getSessionFromCookie()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  if (!(await hasPermission(user, 'sms.templates'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authorise()
  if (auth.error) return auth.error
  const user = auth.user!

  const { key } = await params
  const def = getSmsTemplateDef(key)
  if (!def) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const patch = parsed.data

  const existing = await prisma.smsTemplate.findUnique({ where: { key } })

  const nextBody = patch.body ?? existing?.body ?? def.body
  const missing = missingRequiredSmsTags(def, nextBody)
  if (missing.length) {
    return NextResponse.json(
      {
        error: `This message will not work without ${missing.map((t) => `{{${t}}}`).join(' and ')}. Put ${missing.length > 1 ? 'them' : 'it'} back and try again.`,
      },
      { status: 400 },
    )
  }

  if (patch.isActive === false && def.transactional) {
    return NextResponse.json(
      { error: 'This one has to keep going out - it is not an optional message.' },
      { status: 400 },
    )
  }

  const template = await prisma.smsTemplate.upsert({
    where: { key },
    create: {
      key,
      body: patch.body ?? null,
      isActive: patch.isActive ?? true,
      updatedById: user.id,
    },
    update: {
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedById: user.id,
    },
  })

  return NextResponse.json({ template })
}

// Reset the wording to the code default. The on/off switch survives: it is a
// setting about the message, not the wording of it.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authorise()
  if (auth.error) return auth.error
  const user = auth.user!

  const { key } = await params
  if (!getSmsTemplateDef(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

  await prisma.smsTemplate.updateMany({
    where: { key },
    data: { body: null, updatedById: user.id },
  })

  return NextResponse.json({ ok: true })
}
