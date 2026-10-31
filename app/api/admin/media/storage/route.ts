import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { getSiteConfig } from '@/lib/config/site'
import { canBrowseStorage, listStorageFolder, tidyStoragePrefix } from '@/lib/media/storage-browse'

// GET ?prefix=<folder> - one folder of the site's bucket as the bucket itself holds it,
// every file and folder, for the media picker's "choose a folder" view (picking where
// the database backups go). Admins only: it shows the whole bucket, the server's
// backups included, not just the media library.
export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const prefix = tidyStoragePrefix(request.nextUrl.searchParams.get('prefix'))
  if (prefix === null) return NextResponse.json({ error: 'That is not a folder path' }, { status: 400 })

  const provider = (await getSiteConfig())?.mediaProvider
  if (!canBrowseStorage(provider)) {
    return NextResponse.json({ error: 'Your storage does not keep folders this screen can open.' }, { status: 409 })
  }

  try {
    return NextResponse.json(await listStorageFolder(provider, prefix))
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: `Your storage would not list that folder: ${detail.slice(0, 300)}` }, { status: 502 })
  }
}
