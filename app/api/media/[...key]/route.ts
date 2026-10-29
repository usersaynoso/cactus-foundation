import { NextRequest, NextResponse } from 'next/server'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { PROVIDER_ENV_VARS } from '@/lib/media/providers'
import { canServeDirect } from '@/lib/media/serving-mode'
import { ASSET_TOKEN_PARAM, verifyAssetToken } from '@/lib/media/asset-token'
import { isProtectedMediaKey, providerForMediaKey, servedCacheControl, servedContentType } from '@/lib/media/serve-rules'
import { presignMediaRead, READ_REDIRECT_MAX_AGE_SECONDS } from '@/lib/media/presign'

// Direct serving mode's stand-in for the media Worker (lib/media/serving-mode.ts).
//
// Applies the Worker's read rules (lib/media/serve-rules.ts mirrors them) and then
// redirects to a short-lived presigned url on the bucket. No file bytes pass
// through here: the browser fetches them from the bucket itself, Range requests
// for video included.
//
// Answers whatever the serving mode, as long as the provider's credentials are
// present. That is deliberate and safe: it reads exactly the objects the Worker
// already serves publicly, under the same token rule, and it is what keeps a
// picture loading in the gap between an owner switching mode and the deployment
// that carries the switch going live. A provider without credentials here (or one
// that cannot be presigned at all, like Vercel Blob) is a plain 404.

function refuse(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

function siteOrigin(): string | null {
  const site = getSiteUrlOrNull()
  if (!site) return null
  try {
    return new URL(site).origin
  } catch {
    return null
  }
}

async function serve(request: NextRequest, params: Promise<{ key: string[] }>, method: 'GET' | 'HEAD'): Promise<NextResponse> {
  const { key: parts } = await params
  // Next hands the segments over already decoded. Keys are [a-z0-9._-/] anyway.
  const key = parts.join('/')

  const provider = providerForMediaKey(key)
  if (!provider || !canServeDirect(provider)) return refuse(404, 'Not found')
  if (!PROVIDER_ENV_VARS[provider].every((v) => !!process.env[v.key]?.trim())) return refuse(404, 'Not found')

  // Mirrors refuseUnauthorisedRead in the Worker: a 3D model needs a valid,
  // unexpired token bound to this exact key, and somebody else's page embedding
  // one is refused on its Origin before the signature is even looked at. An
  // absent Origin goes through to the signature check, as it does there.
  const isProtected = isProtectedMediaKey(key)
  if (isProtected) {
    const origin = request.headers.get('origin')
    const allowed = siteOrigin()
    if (origin && allowed && origin !== allowed) return refuse(403, 'Not authorised')
    const token = request.nextUrl.searchParams.get(ASSET_TOKEN_PARAM) ?? ''
    let valid = false
    try {
      valid = verifyAssetToken(key, token)
    } catch {
      // No SESSION_SECRET: nothing to verify against. The Worker serves unsigned in
      // that state rather than blanking every model, and so does this.
      valid = true
    }
    if (!valid) return refuse(403, 'Not authorised')
  }

  let target: string
  try {
    target = await presignMediaRead(provider, key, {
      method,
      contentType: servedContentType(key),
      cacheControl: servedCacheControl(key, isProtected),
    })
  } catch (err) {
    console.error(`[media] could not sign a read for ${key}:`, err)
    return refuse(502, 'Storage error')
  }

  // The redirect is cacheable for an hour: the signed url behind it is the same
  // for the whole hour and outlives the cached redirect by at least another. A
  // token-bearing model url stays out of shared caches; the token is in its
  // address, but there is no reason to hand a cache the right to replay it.
  const res = NextResponse.redirect(target, 302)
  res.headers.set(
    'Cache-Control',
    isProtected ? 'private, max-age=600' : `public, max-age=${READ_REDIRECT_MAX_AGE_SECONDS}`,
  )
  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  return serve(request, params, 'GET')
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  return serve(request, params, 'HEAD')
}
