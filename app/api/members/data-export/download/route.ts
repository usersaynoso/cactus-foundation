import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { downloadMedia } from '@/lib/media/upload'

// Streams the export bytes through this authenticated route rather than
// redirecting to the underlying storage URL - the export contains personal
// data, so it shouldn't ever be handed to the browser as a bare (if
// unguessable) storage link the way ordinary public media is.
export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const request = await prisma.memberDataExportRequest.findFirst({
    where: { memberId: member.id, status: 'READY' },
    orderBy: { createdAt: 'desc' },
  })
  if (!request?.mediaId || !request.expiresAt || request.expiresAt < new Date()) {
    return NextResponse.json({ error: 'No export is ready for download' }, { status: 404 })
  }

  const media = await prisma.media.findUnique({ where: { id: request.mediaId } })
  if (!media) {
    return NextResponse.json({ error: 'No export is ready for download' }, { status: 404 })
  }

  const buffer = await downloadMedia(media.provider, media.key, media.url)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cactus-data-export-${member.id}.json"`,
    },
  })
}
