import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Body = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['HEADER', 'FOOTER', 'PAGE']),
})

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const [templates, config] = await Promise.all([
    prisma.pageTemplate.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { headerTemplateId: true, footerTemplateId: true } }),
  ])

  return NextResponse.json({
    templates,
    headerTemplateId: config?.headerTemplateId ?? null,
    footerTemplateId: config?.footerTemplateId ?? null,
  })
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'templates.manage')) return errorResponse('Forbidden', 403)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const template = await prisma.pageTemplate.create({
    data: {
      ...parsed.data,
      createdById: user.id,
      builderData: { content: [], root: { props: {} }, zones: {} },
    },
  })

  return NextResponse.json(template, { status: 201 })
}
