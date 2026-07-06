import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { validateUpload, uploadMedia, deleteMedia, saveMediaRecord } from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!config.avatarUploadsEnabled) {
    return NextResponse.json({ error: 'Avatar uploads are disabled' }, { status: 403 })
  }

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    return NextResponse.json({ error: 'Media storage is not configured' }, { status: 503 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateUpload(file.type, buffer.length, buffer)
  if (!validation.valid) return NextResponse.json({ error: validation.reason }, { status: 400 })

  try {
    const result = await uploadMedia(validation.buffer, file.type, provider, file.name)
    const record = await saveMediaRecord({
      key: result.key,
      url: result.url,
      provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      isDecorative: true,
    })

    // Replace any previous uploaded avatar (best-effort - avatars aren't
    // shared/referenced elsewhere, unlike core Media used for logos/pages).
    const previous = await prisma.member.findUnique({ where: { id: member.id }, select: { avatarMediaId: true, avatarChoice: true } })
    if (previous?.avatarChoice === 'UPLOAD' && previous.avatarMediaId) {
      const oldMedia = await prisma.media.findUnique({ where: { id: previous.avatarMediaId } })
      if (oldMedia) {
        await deleteMedia(oldMedia.provider, oldMedia.key).catch(() => {})
        await prisma.media.delete({ where: { id: oldMedia.id } }).catch(() => {})
      }
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { avatarMediaId: record.id, avatarChoice: 'UPLOAD' },
    })

    return NextResponse.json({ avatarChoice: 'UPLOAD', url: record.url })
  } catch (err: unknown) {
    return NextResponse.json({ error: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 500 })
  }
}

export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (member.avatarChoice === 'UPLOAD' && member.avatarMediaId) {
    const media = await prisma.media.findUnique({ where: { id: member.avatarMediaId } })
    if (media) {
      await deleteMedia(media.provider, media.key).catch(() => {})
      await prisma.media.delete({ where: { id: media.id } }).catch(() => {})
    }
  }

  const config = await getMembersConfig()
  await prisma.member.update({
    where: { id: member.id },
    data: { avatarMediaId: null, avatarChoice: config.gravatarEnabled ? 'GRAVATAR' : 'GENERATED' },
  })

  return NextResponse.json({ ok: true })
}
