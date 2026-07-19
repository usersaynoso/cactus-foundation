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
import { queryMediaLibrary, parseLibraryQuery } from '@/lib/media/library-query'
import { signAssetUrl } from '@/lib/media/asset-token'
import { resolveFolderPath } from '@/lib/media/organise'

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const { perPage, page } = parsePaginationParams(
    Object.fromEntries(request.nextUrl.searchParams)
  )
  const query = parseLibraryQuery(request.nextUrl.searchParams, perPage, page)
  const { items, total, hasMore } = await queryMediaLibrary(query)

  // Protected types (3D models) need a read token or the Worker refuses them, and
  // the library's own picker previews a model in a viewer just as the storefront
  // does. Every other item is handed back with its url untouched - signAssetUrl
  // only acts on the types the Worker actually gates.
  const signed = items.map((item) => ({ ...item, url: signAssetUrl(item.url) }))

  return NextResponse.json({ items: signed, total, page, perPage, hasMore })
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
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) return errorResponse(validation.reason)

  const altText = formData.get('altText') as string | null
  const isDecorative = formData.get('isDecorative') === 'true'
  const rawFolderId = formData.get('folderId')
  const folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId : null

  try {
    const folderPath = folderId ? await resolveFolderPath(folderId) : ''
    const result = await uploadMedia(validation.buffer, file.type, provider, file.name, folderPath || undefined)
    const record = await saveMediaRecord({
      key: result.key,
      url: result.url,
      provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      uploadedById: user.id,
      altText: altText ?? undefined,
      isDecorative,
      originalName: file.name || undefined,
      folderId,
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
