import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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
    // Next's own route cache first, THEN the CDN. A top-level page renders with
    // `revalidate = false` (app/(public)/[slug]/page.tsx), so its HTML is held by
    // Next indefinitely and only revalidatePath drops it. Purging Cloudflare
    // without this achieves nothing you can see: Cloudflare drops its copy, asks
    // the origin, is handed the same stale HTML back, and caches it again for
    // another full window. The order matters for the same reason - purge first
    // and Cloudflare can refill from the still-stale origin in the gap between
    // the two calls.
    revalidatePath('/', 'layout')
    await purgeCdnEverythingOrThrow()
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(`Purge failed: ${message}`, 502)
  }
}
