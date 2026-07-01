import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

const Patch = z.object({
  title:           z.string().min(1).max(200).optional(),
  slug:            z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  body:            z.string().optional(),
  metaDescription: z.string().max(300).optional().nullable(),
  ogImageId:       z.string().optional().nullable(),
  status:          z.enum(['draft', 'published']).optional(),
  bodyFormat:      z.enum(['markdown', 'builder']).optional(),
  menuIds:         z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.read')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const [page, menuItems] = await Promise.all([
    prisma.infoPage.findUnique({ where: { id } }),
    prisma.menuItem.findMany({ where: { pageId: id }, select: { menuId: true } }),
  ])
  if (!page) return errorResponse('Not found', 404)

  return NextResponse.json({ ...page, menuIds: menuItems.map((m) => m.menuId) })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.write')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { status, slug, menuIds, ...pageData } = parsed.data

  if (status === 'published' && page.status === 'draft') {
    // Publishing must flow through the /publish endpoint so the history snapshot
    // logic runs. PATCH can update other fields but cannot flip the status to published.
    return errorResponse('Use the Publish button in the page editor to publish a page', 400)
  }

  if (slug && slug !== page.slug) {
    const exists = await prisma.infoPage.findUnique({ where: { slug } })
    if (exists) return errorResponse(`Slug "${slug}" is already in use`, 409)
  }

  const canManageMenus = menuIds !== undefined && await hasPermission(user, 'menus.manage')

  const updated = await prisma.$transaction(async (tx) => {
    const up = await tx.infoPage.update({
      where: { id },
      data: { ...pageData, ...(slug ? { slug } : {}), ...(status ? { status } : {}) },
    })

    if (canManageMenus && menuIds !== undefined) {
      const currentItems = await tx.menuItem.findMany({
        where: { pageId: id },
        select: { menuId: true, id: true },
      })
      const currentMenuIds = new Set(currentItems.map((i) => i.menuId))
      const requestedMenuIds = new Set(menuIds)

      const toAdd = menuIds.filter((mid) => !currentMenuIds.has(mid))
      const toRemove = currentItems.filter((i) => !requestedMenuIds.has(i.menuId))

      for (const menuId of toAdd) {
        const maxOrder = await tx.menuItem.aggregate({
          where: { menuId, parentId: null },
          _max: { order: true },
        })
        await tx.menuItem.create({
          data: {
            menuId,
            pageId: id,
            type: 'PAGE',
            parentId: null,
            order: (maxOrder._max.order ?? -1) + 1,
          },
        })
      }

      for (const item of toRemove) {
        await tx.menuItem.delete({ where: { id: item.id } })
      }
    }

    return up
  })

  revalidatePath(`/${updated.slug}`)
  if (page.slug !== updated.slug) revalidatePath(`/${page.slug}`)

  return NextResponse.json({ ...updated, menuIds: menuIds ?? [] })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
  const refs = [config?.privacyPolicyPageId, config?.termsPageId]
  if (refs.includes(id)) {
    return errorResponse('This page is referenced in site settings. Update the settings first before deleting.', 409)
  }

  await prisma.infoPage.delete({ where: { id } })
  revalidatePath(`/${page.slug}`)
  return NextResponse.json({ ok: true })
}
