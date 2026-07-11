import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type Ctx = { params: Promise<{ id: string }> }

function cleanTag(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 40)
}

// PUT — replace an item's full tag set. Body: { tags: string[] } (names).
// Missing tags are created on the fly; tags no longer listed are unlinked (the
// Tag row itself is left alone so it stays available for autocomplete).
export async function PUT(request: NextRequest, { params }: Ctx) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const media = await prisma.media.findUnique({ where: { id }, select: { id: true } })
  if (!media) return errorResponse('Media item not found', 404)

  const body = await request.json().catch(() => null)
  const rawTags: unknown = body?.tags
  if (!Array.isArray(rawTags) || !rawTags.every((t) => typeof t === 'string')) {
    return errorResponse('tags must be an array of strings')
  }

  const names = Array.from(new Set(rawTags.map(cleanTag).filter(Boolean)))

  const tagIds: string[] = []
  for (const name of names) {
    const tag = await prisma.tag.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } })
    tagIds.push(tag.id)
  }

  await prisma.$transaction([
    prisma.mediaTag.deleteMany({ where: { mediaId: id, tagId: { notIn: tagIds.length ? tagIds : ['__none__'] } } }),
    ...tagIds.map((tagId) =>
      prisma.mediaTag.upsert({
        where: { mediaId_tagId: { mediaId: id, tagId } },
        create: { mediaId: id, tagId },
        update: {},
      }),
    ),
  ])

  return NextResponse.json({ ok: true, tags: names })
}
