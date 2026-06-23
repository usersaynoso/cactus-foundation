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

  const { title, body, metaDescription, status, bodyFormat } = parsed.data
  let { slug } = parsed.data
  if (!slug) slug = generateSlug(title)

  const existing = await prisma.infoPage.findUnique({ where: { slug } })
  if (existing) return errorResponse(`Slug "${slug}" is already in use`, 409)

  if (status === 'published' && !await hasPermission(user, 'pages.publish')) {
    return errorResponse('You do not have permission to publish pages', 403)
  }

  const page = await prisma.infoPage.create({
    data: { title, slug, body, metaDescription, status, bodyFormat, createdById: user.id },
  })

  if (status === 'published') revalidatePath(`/${slug}`)

  return NextResponse.json(page, { status: 201 })
}
