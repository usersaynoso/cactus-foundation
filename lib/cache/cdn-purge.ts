// Tells Cloudflare to drop its copy of a page that just changed.
//
// Only relevant when the page cache is on (Settings > General > Speed). With it
// off nothing downstream holds a copy in the first place and every call here is
// a no-op, which is also what happens on any site that never configured a
// Cloudflare token - the overwhelming majority.
//
// Deliberately BEST EFFORT, and deliberately never thrown from. Publishing a
// page must not fail because a cache API had a bad minute, and the cost of a
// missed purge is bounded and small: the page ages out on its own within the
// window the owner chose, which is at most an hour. An editor who cannot press
// Publish is a much worse outcome than an editor who sees their change a few
// minutes late.
//
// Vercel's own CDN needs nothing here - revalidatePath() already invalidates it,
// and every call site below sits next to one.

const CF_API = 'https://api.cloudflare.com/client/v4'

// A purge needs Zone.Cache Purge, which is NOT the permission the media
// Worker's token carries (Workers Scripts:Edit). A site using both therefore
// needs two tokens, so this reads its own var first and only falls back to the
// shared one for the case where the owner made a single token with both
// permissions on it.
function purgeToken(): string | undefined {
  return process.env.CLOUDFLARE_PURGE_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim() || undefined
}

function zoneId(): string | undefined {
  return process.env.CLOUDFLARE_ZONE_ID?.trim() || undefined
}

export function isCdnPurgeConfigured(): boolean {
  return !!purgeToken() && !!zoneId()
}

// Absolute URLs are what Cloudflare's purge-by-url expects, so the site's own
// origin has to be known. SITE_URL is the one every install already sets.
function siteOrigin(): string | undefined {
  const raw = process.env.SITE_URL?.trim()
  if (!raw) return undefined
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin
  } catch {
    return undefined
  }
}

/**
 * Purge specific paths (e.g. ['/', '/about']) from Cloudflare's cache.
 *
 * Silent no-op when unconfigured. Never throws.
 */
export async function purgeCdnPaths(paths: string[]): Promise<void> {
  const token = purgeToken()
  const zone = zoneId()
  const origin = siteOrigin()
  if (!token || !zone || !origin) return

  const files = [...new Set(paths)]
    .map((p) => (p.startsWith('/') ? p : `/${p}`))
    .map((p) => `${origin}${p}`)
  if (files.length === 0) return

  try {
    const res = await fetch(`${CF_API}/zones/${zone}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Cloudflare caps purge-by-url at 30 files per call. More than that from
      // one edit means something bulk happened, and a bulk edit is better served
      // by letting the window expire than by fanning out API calls.
      body: JSON.stringify({ files: files.slice(0, 30) }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.warn(`[cdn-purge] Cloudflare returned ${res.status} for ${files.length} path(s) - they will expire on their own`)
    }
  } catch (err) {
    console.warn('[cdn-purge] purge failed - paths will expire on their own', err)
  }
}

// Shared by purgeCdnEverything (silent, best-effort) and purgeCdnEverythingOrThrow
// (the manual button's route, which needs to tell the owner it actually worked).
async function requestPurgeEverything(token: string, zone: string): Promise<void> {
  const res = await fetch(`${CF_API}/zones/${zone}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purge_everything: true }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Cloudflare returned ${res.status}: ${body}`)
  }
}

/**
 * Drop Cloudflare's copy of everything on this zone.
 *
 * Used when the page cache is turned off or its window changes: copies already
 * out there would otherwise keep being handed out for up to an hour after the
 * owner switched the feature off, which reads as "the setting doesn't work".
 *
 * Silent no-op when unconfigured. Never throws.
 */
export async function purgeCdnEverything(): Promise<void> {
  const token = purgeToken()
  const zone = zoneId()
  if (!token || !zone) return

  try {
    await requestPurgeEverything(token, zone)
  } catch (err) {
    console.warn('[cdn-purge] full purge failed - copies will expire on their own', err)
  }
}

/**
 * Same full purge, for the "Purge everything now" button on Settings → Speed.
 * Unlike purgeCdnEverything, this one is what tells the owner whether it
 * actually worked - so it throws rather than swallowing the failure.
 */
export async function purgeCdnEverythingOrThrow(): Promise<void> {
  const token = purgeToken()
  const zone = zoneId()
  if (!token || !zone) throw new Error('Cloudflare zone id and purge token are not both set')
  await requestPurgeEverything(token, zone)
}
