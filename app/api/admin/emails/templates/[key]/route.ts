import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getEmailTemplateDef } from '@/lib/email/registry'
import { missingRequiredTags } from '@/lib/email/render'

const Body = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  bodyHtml: z.string().trim().min(1).optional(),
  // null clears the choice back to "use the site default wrapper".
  wrapperLayoutId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
})

async function authorise() {
  const user = await getSessionFromCookie()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  if (!(await hasPermission(user, 'emails.templates'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authorise()
  if (auth.error) return auth.error
  const user = auth.user!

  const { key } = await params
  const def = getEmailTemplateDef(key)
  if (!def) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const patch = parsed.data

  const existing = await prisma.emailTemplate.findUnique({ where: { key } })

  // Validate against what the email would actually become, not just what this
  // request happens to carry - an edit that only touches the subject can still
  // strip the last `{{code}}` if the body already lost its own.
  const nextSubject = patch.subject ?? existing?.subject ?? def.subject
  const nextBody = patch.bodyHtml ?? existing?.bodyHtml ?? def.bodyHtml
  const missing = missingRequiredTags(def, nextSubject, nextBody)
  if (missing.length) {
    return NextResponse.json(
      {
        error: `This email will not work without ${missing.map((t) => `{{${t}}}`).join(' and ')}. Put ${missing.length > 1 ? 'them' : 'it'} back and try again.`,
      },
      { status: 400 },
    )
  }

  if (patch.isActive === false && def.transactional) {
    return NextResponse.json(
      { error: 'This one has to keep going out - it is how people get back into their account.' },
      { status: 400 },
    )
  }

  if (patch.wrapperLayoutId) {
    const wrapper = await prisma.layout.findFirst({
      where: { id: patch.wrapperLayoutId, type: 'emailWrapper' },
      select: { id: true },
    })
    if (!wrapper) return NextResponse.json({ error: 'Unknown wrapper design' }, { status: 400 })
  }

  const template = await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      subject: patch.subject ?? null,
      bodyHtml: patch.bodyHtml ?? null,
      wrapperLayoutId: patch.wrapperLayoutId ?? null,
      isActive: patch.isActive ?? true,
      updatedById: user.id,
    },
    update: {
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.bodyHtml !== undefined ? { bodyHtml: patch.bodyHtml } : {}),
      ...(patch.wrapperLayoutId !== undefined ? { wrapperLayoutId: patch.wrapperLayoutId } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedById: user.id,
    },
  })

  return NextResponse.json({ template })
}

// Reset the copy to the code default. The wrapper choice and the on/off switch
// survive: they are settings about the email, not the wording of it, and losing
// them to a "put the words back" click would be a nasty surprise.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authorise()
  if (auth.error) return auth.error
  const user = auth.user!

  const { key } = await params
  if (!getEmailTemplateDef(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 })

  await prisma.emailTemplate.updateMany({
    where: { key },
    data: { subject: null, bodyHtml: null, updatedById: user.id },
  })

  return NextResponse.json({ ok: true })
}
