// Publish endpoint for Puck builder pages.
// Requires pages.publish — checked server-side on every call, never inferred
// from the client. This is the ONLY path that can set status=published for a
// builder-format page and the only path that writes publishedData.
// On each publish: the previous live version (if any) is prepended to history
// (capped at HISTORY_CAP entries), then publishedData is set to the new content.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

const HISTORY_CAP = 10

type HistoryEntry = {
  data: unknown
  title: string
  at: string
  byId: string | null
}

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
  if (!await hasPermission(user, 'pages.publish')) return errorResponse('Forbidden — pages.publish permission required', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid builder data')

  const { data } = parsed.data
  const rootProps = (data.root?.props ?? {}) as Record<string, unknown>

  const title           = typeof rootProps.title           === 'string' ? rootProps.title.slice(0, 200)            : page.title
  const rawSlug         = typeof rootProps.slug            === 'string' ? rootProps.slug.slice(0, 200)             : page.slug
  const metaDescription = typeof rootProps.metaDescription === 'string' ? rootProps.metaDescription.slice(0, 300)  : page.metaDescription
  const ogImageId       = typeof rootProps.ogImageId       === 'string' ? rootProps.ogImageId                      : page.ogImageId

  const slug = rawSlug.replace(/[^a-z0-9-]/g, '').slice(0, 200) || page.slug

  if (slug !== page.slug) {
    const exists = await prisma.infoPage.findFirst({ where: { slug, NOT: { id } } })
    if (exists) return errorResponse(`Slug "${slug}" is already in use`, 409)
  }

  const { status: _ignored, ...safeRootProps } = rootProps
  void _ignored

  const builderData = {
    ...data,
    root: { ...data.root, props: { ...safeRootProps, title, slug, metaDescription, ogImageId } },
  }

  // Build updated history: if there is a current live version, archive it first
  const existingHistory = Array.isArray(page.history) ? (page.history as HistoryEntry[]) : []
  let newHistory = existingHistory

  if (page.publishedData !== null && page.publishedData !== undefined) {
    const archivedEntry: HistoryEntry = {
      data: page.publishedData,
      title: page.title,
      at: (page.publishedAt ?? page.updatedAt).toISOString(),
      byId: page.publishedById ?? null,
    }
    newHistory = [archivedEntry, ...existingHistory].slice(0, HISTORY_CAP)
  }

  const now = new Date()

  const updated = await prisma.infoPage.update({
    where: { id },
    data: {
      title,
      slug,
      metaDescription: metaDescription ?? null,
      ogImageId: ogImageId ?? null,
      status: 'published',
      bodyFormat: 'builder',
      builderData: builderData as unknown as import('@prisma/client').Prisma.InputJsonValue,
      publishedData: builderData as unknown as import('@prisma/client').Prisma.InputJsonValue,
      publishedAt: now,
      publishedById: user.id,
      history: newHistory as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  })

  revalidatePath(`/${updated.slug}`)
  if (page.slug !== updated.slug) revalidatePath(`/${page.slug}`)

  return NextResponse.json({ ok: true, slug: updated.slug })
}
