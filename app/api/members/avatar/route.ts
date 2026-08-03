import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { profileSectionOffResponse } from '@/lib/members/account-sections'
import { validateUpload, uploadMedia, deleteMedia, saveMediaRecord } from '@/lib/media/upload'
import { getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  // The picture controls live on the profile page, so the section switch gates
  // this ahead of the uploads-specific one.
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()
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

const ChoiceBody = z.object({ avatarChoice: z.enum(['UPLOAD', 'GRAVATAR', 'GENERATED']) })

// Picking which of the three sources to show. Uploading a file implies UPLOAD
// and is handled by POST above; this is the only way to reach GRAVATAR, which
// otherwise no member could ever be on however keen the site is on it.
export async function PATCH(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()

  const parsed = ChoiceBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { avatarChoice } = parsed.data

  // The same switches that decide whether each option is offered, re-checked
  // here so a crafted PATCH can't park a member on a source the site has
  // turned off - resolveEffectiveAvatarChoice would only mask it on read.
  if (avatarChoice === 'GRAVATAR' && !config.gravatarEnabled) {
    return NextResponse.json({ error: 'Gravatar is not available on this site' }, { status: 403 })
  }
  if (avatarChoice === 'UPLOAD' && (!config.avatarUploadsEnabled || !member.avatarMediaId)) {
    return NextResponse.json({ error: 'There is no uploaded picture to use' }, { status: 400 })
  }

  await prisma.member.update({ where: { id: member.id }, data: { avatarChoice } })
  return NextResponse.json({ avatarChoice })
}

export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Read before anything is destroyed: refusing after the file has already gone
  // would be a refusal in name only.
  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()

  // Keyed on the stored file, not on the active choice: since the picker lets
  // a member keep an upload while showing Gravatar, gating on UPLOAD here left
  // the file on the storage provider and its Media row behind for ever.
  if (member.avatarMediaId) {
    const media = await prisma.media.findUnique({ where: { id: member.avatarMediaId } })
    if (media) {
      await deleteMedia(media.provider, media.key).catch(() => {})
      await prisma.media.delete({ where: { id: media.id } }).catch(() => {})
    }
  }

  // Only the choice that just lost its picture needs replacing. A member
  // sitting on initials who tidies away an old upload asked to delete a file,
  // not to be moved onto Gravatar.
  const avatarChoice =
    member.avatarChoice === 'UPLOAD' ? (config.gravatarEnabled ? 'GRAVATAR' : 'GENERATED') : member.avatarChoice
  await prisma.member.update({
    where: { id: member.id },
    data: { avatarMediaId: null, avatarChoice },
  })

  // Returned rather than assumed by the caller: the fallback depends on a
  // config switch the browser has no view of, and guessing GENERATED here left
  // the profile preview claiming initials while the server had said Gravatar.
  return NextResponse.json({ ok: true, avatarChoice })
}
