import { buildAndroidAssetLinks } from '@/lib/auth/android-webcredentials'
import { readWellKnownFile } from '@/lib/well-known/providers'

// Digital Asset Links for Android apps that use this site's passkeys
// (ANDROID_WEBCREDENTIAL_APPS, lib/auth/android-webcredentials.ts).
//
// A real route, so it is answered here and the /.well-known rewrite to
// /api/well-known never sees the path. With the setting unset it still asks the
// modules (core.well-known-files) before giving up, so a module that serves this
// file itself is not silenced by core owning the address.
export const dynamic = 'force-dynamic'

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
}

export async function GET() {
  const body = buildAndroidAssetLinks()
  if (body) return Response.json(body, { headers: HEADERS })

  const fromModule = await readWellKnownFile('assetlinks.json')
  if (fromModule) return new Response(fromModule, { headers: HEADERS })

  return new Response('Not configured', { status: 404 })
}
