import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const template = await prisma.pageTemplate.findUnique({ where: { id } })
  if (!template) return errorResponse('Not found', 404)
  return NextResponse.json(template)
}

const Patch = z.object({
  name: z.string().min(1).max(200).optional(),
  builderData: z.unknown().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const template = await prisma.pageTemplate.findUnique({ where: { id } })
  if (!template) return errorResponse('Not found', 404)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await prisma.pageTemplate.update({ where: { id }, data: parsed.data as any })
  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const [template, config] = await Promise.all([
    prisma.pageTemplate.findUnique({ where: { id } }),
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { headerTemplateId: true, footerTemplateId: true } }),
  ])
  if (!template) return errorResponse('Not found', 404)

  if (config?.headerTemplateId === id) {
    return errorResponse('This template is the active site header. Reassign it in Settings > General before deleting.', 409)
  }
  if (config?.footerTemplateId === id) {
    return errorResponse('This template is the active site footer. Reassign it in Settings > General before deleting.', 409)
  }

  await prisma.pageTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
