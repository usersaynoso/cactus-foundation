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
})

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.read')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  return NextResponse.json(page)
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

  const { status, slug } = parsed.data

  if (status === 'published' && page.status === 'draft') {
    if (!await hasPermission(user, 'pages.publish')) {
      return errorResponse('You do not have permission to publish pages', 403)
    }
  }

  if (slug && slug !== page.slug) {
    const exists = await prisma.infoPage.findUnique({ where: { slug } })
    if (exists) return errorResponse(`Slug "${slug}" is already in use`, 409)
  }

  const updated = await prisma.infoPage.update({ where: { id }, data: parsed.data })

  revalidatePath(`/${updated.slug}`)
  if (page.slug !== updated.slug) revalidatePath(`/${page.slug}`)

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'pages.delete')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const page = await prisma.infoPage.findUnique({ where: { id } })
  if (!page) return errorResponse('Not found', 404)

  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
  const refs = [config?.comingSoonPageId, config?.maintenancePageId, config?.privacyPolicyPageId, config?.termsPageId]
  if (refs.includes(id)) {
    return errorResponse('This page is referenced in site settings. Update the settings first before deleting.', 409)
  }

  await prisma.infoPage.delete({ where: { id } })
  revalidatePath(`/${page.slug}`)
  return NextResponse.json({ ok: true })
}
