// Autosave endpoint for Puck builder pages.
// Requires pages.write. Autosave ONLY ever writes `builderData` (the working draft)
// and menu associations — it can never affect what is live.
// Rules:
//   - Never writes publishedData, publishedAt, publishedById, or status.
//   - For draft pages (never published), reconciles title/slug/metaDescription/ogImageId
//     columns because those columns describe the draft and it is harmless to update them.
//   - For published pages, leaves title/slug/metaDescription/ogImageId untouched so the
//     live page's metadata is frozen to the published state.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

const Body = z.object({
  data: z.object({
    root: z.object({
      props: z.record(z.unknown()).optional(),
    }).passthrough(),
    content: z.array(z.unknown()).optional(),
    zones: z.record(z.unknown()).optional(),
  }).passthrough(),
  menuIds: z.array(z.string()).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.write')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid builder data')

  const { data, menuIds } = parsed.data
  const rootProps = (data.root?.props ?? {}) as Record<string, unknown>

  // Strip status from persisted root.props — status is a real column, never trusted from client
  const { status: _ignored, ...safeRootProps } = rootProps
  void _ignored

  let pageUpdate: Parameters<typeof prisma.infoPage.update>[0]['data']

  if (page.status === 'draft') {
    // Draft page: reconcile metadata columns freely (nothing is live yet)
    const title           = typeof rootProps.title           === 'string' ? rootProps.title.slice(0, 200)            : page.title
    const rawSlug         = typeof rootProps.slug            === 'string' ? rootProps.slug.slice(0, 200)             : page.slug
    const metaDescription = typeof rootProps.metaDescription === 'string' ? rootProps.metaDescription.slice(0, 300)  : page.metaDescription
    const ogImageId       = typeof rootProps.ogImageId       === 'string' ? rootProps.ogImageId                      : page.ogImageId

    const slug = rawSlug.replace(/[^a-z0-9-]/g, '').slice(0, 200) || page.slug

    if (slug !== page.slug) {
      const exists = await prisma.infoPage.findFirst({ where: { slug, NOT: { id } } })
      if (exists) return errorResponse(`Slug "${slug}" is already in use`, 409)
    }

    const builderData = {
      ...data,
      root: { ...data.root, props: { ...safeRootProps, title, slug, metaDescription, ogImageId } },
    }

    pageUpdate = {
      title,
      slug,
      metaDescription: metaDescription ?? null,
      ogImageId: ogImageId ?? null,
      bodyFormat: 'builder',
      builderData: builderData as unknown as import('@prisma/client').Prisma.InputJsonValue,
    }
  } else {
    // Published page: freeze all metadata columns. Only update the draft content blob.
    // Reflect the current published metadata back into root.props so the editor
    // displays the correct values when the page is reopened.
    const builderData = {
      ...data,
      root: {
        ...data.root,
        props: {
          ...safeRootProps,
          title: page.title,
          slug: page.slug,
          metaDescription: page.metaDescription,
          ogImageId: page.ogImageId,
        },
      },
    }

    pageUpdate = {
      bodyFormat: 'builder',
      builderData: builderData as unknown as import('@prisma/client').Prisma.InputJsonValue,
    }
  }

  const canManageMenus = menuIds !== undefined && await hasPermission(user, 'menus.manage')

  await prisma.$transaction(async (tx) => {
    await tx.infoPage.update({ where: { id }, data: pageUpdate })

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
  })

  return NextResponse.json({ ok: true, slug: page.slug })
}
