import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { isCdnPurgeConfigured, purgeCdnEverythingOrThrow } from '@/lib/cache/cdn-purge'
import { errorResponse } from '@/lib/utils'

// Manual "Purge everything now" button on Settings → Speed. Everything else that
// calls into lib/cache/cdn-purge.ts is best-effort and silent by design - this is
// the one place an owner presses a button and needs to be told whether it worked.
export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  if (!isCdnPurgeConfigured()) {
    return errorResponse('Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_PURGE_API_TOKEN first.', 400)
  }

  try {
    await purgeCdnEverythingOrThrow()
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Purge failed: ${message}`, 502)
  }
}
