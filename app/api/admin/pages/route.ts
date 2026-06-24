import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { parsePaginationParams, generateSlug, errorResponse } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

const Body = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  body: z.string().default(''),
  metaDescription: z.string().max(300).optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  bodyFormat: z.enum(['markdown', 'builder']).default('markdown'),
  menuIds: z.array(z.string()).optional(),
  templateId: z.string().optional().nullable(),
  templateMode: z.enum(['copy', 'linked']).optional(),
})

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.read')) return errorResponse('Forbidden', 403)

  const { skip, perPage } = parsePaginationParams(request.nextUrl.searchParams)
  const [pages, total] = await Promise.all([
    prisma.infoPage.findMany({
      skip, take: perPage,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, slug: true, title: true, status: true, updatedAt: true },
    }),
    prisma.infoPage.count(),
  ])
  return NextResponse.json({ pages, total })
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.write')) return errorResponse('Forbidden', 403)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { title, body, metaDescription, status, bodyFormat, menuIds, templateId, templateMode } = parsed.data
  let { slug } = parsed.data
  if (!slug) slug = generateSlug(title)

  const existing = await prisma.infoPage.findUnique({ where: { slug } })
  if (existing) return errorResponse(`Slug "${slug}" is already in use`, 409)

  if (status === 'published' && !await hasPermission(user, 'pages.publish')) {
    return errorResponse('You do not have permission to publish pages', 403)
  }

  const canManageMenus = menuIds && menuIds.length > 0 && await hasPermission(user, 'menus.manage')

  // Handle template: copy or link
  let pageTemplateId: string | null = null
  let initialBuilderData: unknown = undefined
  if (templateId) {
    const canManageTemplates = await hasPermission(user, 'templates.manage')
    if (canManageTemplates) {
      const tmpl = await prisma.pageTemplate.findUnique({ where: { id: templateId } })
      if (tmpl) {
        if (templateMode === 'linked') {
          pageTemplateId = templateId
        } else {
          initialBuilderData = tmpl.builderData
        }
      }
    }
  }

  const page = await prisma.$transaction(async (tx) => {
    const created = await tx.infoPage.create({
      data: {
        title, slug, body, metaDescription, status, bodyFormat,
        createdById: user.id,
        templateId: pageTemplateId,
        ...(initialBuilderData ? { builderData: initialBuilderData } : {}),
      },
    })

    if (canManageMenus && menuIds) {
      for (const menuId of menuIds) {
        const maxOrder = await tx.menuItem.aggregate({
          where: { menuId, parentId: null },
          _max: { order: true },
        })
        await tx.menuItem.create({
          data: {
            menuId,
            pageId: created.id,
            type: 'PAGE',
            parentId: null,
            order: (maxOrder._max.order ?? -1) + 1,
          },
        })
      }
    }

    return created
  })

  if (status === 'published') revalidatePath(`/${slug}`)

  return NextResponse.json(page, { status: 201 })
}
