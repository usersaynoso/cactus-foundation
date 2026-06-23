// Autosave endpoint for Puck builder pages.
// Requires pages.write. ALWAYS persists status=draft regardless of what the
// client sends in data.root.props.status — this is the only guarantee that
// keeps autosave from accidentally publishing a page.
// Reconciliation: slug, metaDescription, ogImageId, title are split out of
// data.root.props and written to their real InfoPage columns. builderData is
// stored with root.props containing only those four fields (no status) as a
// working copy; the DB columns are always canonical.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

const Body = z.object({
  data: z.object({
    root: z.object({
      props: z.record(z.unknown()).optional(),
    }).passthrough(),
    content: z.array(z.unknown()).optional(),
    zones: z.record(z.unknown()).optional(),
  }).passthrough(),
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

  const { data } = parsed.data
  const rootProps = (data.root?.props ?? {}) as Record<string, unknown>

  // Extract reconciled fields from root.props
  const title           = typeof rootProps.title           === 'string' ? rootProps.title.slice(0, 200)   : page.title
  const rawSlug         = typeof rootProps.slug            === 'string' ? rootProps.slug.slice(0, 200)    : page.slug
  const metaDescription = typeof rootProps.metaDescription === 'string' ? rootProps.metaDescription.slice(0, 300) : page.metaDescription
  const ogImageId       = typeof rootProps.ogImageId       === 'string' ? rootProps.ogImageId            : page.ogImageId

  const slug = rawSlug.replace(/[^a-z0-9-]/g, '').slice(0, 200) || page.slug

  if (slug !== page.slug) {
    const exists = await prisma.infoPage.findFirst({ where: { slug, NOT: { id } } })
    if (exists) return errorResponse(`Slug "${slug}" is already in use`, 409)
  }

  // Strip status from persisted root.props — status is a real column, never trusted from client
  const { status: _ignored, ...safeRootProps } = rootProps
  void _ignored

  const builderData = {
    ...data,
    root: { ...data.root, props: { ...safeRootProps, title, slug, metaDescription, ogImageId } },
  }

  const updated = await prisma.infoPage.update({
    where: { id },
    data: {
      title,
      slug,
      metaDescription: metaDescription ?? null,
      ogImageId: ogImageId ?? null,
      status: 'draft',
      bodyFormat: 'builder',
      // Prisma Json field — unknown[] and Record<string,unknown> are compatible
      // at runtime; we cast through unknown to satisfy the InputJsonValue constraint.
      builderData: builderData as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  })

  // Revalidate old slug if it changed (old slug may have been published)
  if (page.slug !== updated.slug) revalidatePath(`/${page.slug}`)

  return NextResponse.json({ ok: true, slug: updated.slug })
}
