import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse, parsePaginationParams } from '@/lib/utils'
import {
  validateUpload,
  uploadMedia,
  deleteMedia,
  saveMediaRecord,
  getMediaReferences,
} from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const { skip, perPage, page } = parsePaginationParams(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  const search = request.nextUrl.searchParams.get('q') ?? undefined

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      skip,
      take: perPage,
      where: search
        ? { OR: [{ key: { contains: search } }, { altText: { contains: search } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { username: true } } },
    }),
    prisma.media.count({
      where: search
        ? { OR: [{ key: { contains: search } }, { altText: { contains: search } }] }
        : undefined,
    }),
  ])

  return NextResponse.json({ items, total, page, perPage })
}

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.upload')) return errorResponse('Forbidden', 403)

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return errorResponse('Media storage is not configured. Select a provider and add its credentials in Settings → Media.', 503)
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return errorResponse('No file provided')

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = validateUpload(file.type, buffer.length)
  if (!validation.valid) return errorResponse(validation.reason)

  const altText = formData.get('altText') as string | null
  const isDecorative = formData.get('isDecorative') === 'true'

  try {
    const result = await uploadMedia(buffer, file.type, provider, file.name)
    const record = await saveMediaRecord({
      key: result.key,
      url: result.url,
      provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      uploadedById: user.id,
      altText: altText ?? undefined,
      isDecorative,
    })
    return NextResponse.json(record, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 500)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'media.delete')) return errorResponse('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')
  if (!id) return errorResponse('Media ID required')

  const media = await prisma.media.findUnique({ where: { id } })
  if (!media) return errorResponse('Not found', 404)

  // Check references — warn if the item is still in use
  const refs = await getMediaReferences(id)
  if (refs.length > 0) {
    const force = searchParams.get('force') === 'true'
    if (!force) {
      return NextResponse.json(
        { error: 'This media item is still in use', references: refs },
        { status: 409 }
      )
    }
  }

  // Delete from the provider the row actually lives on (not the active selection).
  await deleteMedia(media.provider, media.key)
  await prisma.media.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
