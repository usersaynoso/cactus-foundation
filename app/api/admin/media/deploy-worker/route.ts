import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { isLocalMode } from '@/lib/config/env'
import { errorResponse } from '@/lib/utils'
import type { MediaProviderType } from '@prisma/client'
import {
  PROVIDER_KIND,
  WORKER_SECRET_KEYS,
  CLOUDFLARE_WORKER_VAR,
  CLOUDFLARE_CREDENTIAL_KEYS,
  ALL_CLOUDFLARE_CREDENTIAL_KEYS,
} from '@/lib/media/providers'
import { deployMediaWorker, type CloudflareAuth, type WorkerSecret } from '@/lib/media/cloudflare-deploy'
import { rebaseProxiedMediaUrls } from '@/lib/media/upload'
import { deriveUploadSigningKey } from '@/lib/media/upload-token'
import { deriveAssetSigningKey } from '@/lib/media/asset-token'
import { upsertVercelEnvVars, getVercelEnvValues } from '@/lib/vercel/env'
import { recordDeploymentNeeded, labelForEnvKeys } from '@/lib/notifications/deployment'

// Account lookup + Worker upload + subdomain enable can chain several Cloudflare
// calls; give it headroom.
export const maxDuration = 60

type Body = {
  provider?: MediaProviderType
  authMode?: 'token' | 'global'
  apiToken?: string
  globalKey?: string
  email?: string
  accountId?: string
  // Freshly-typed provider secret values from the panel (key -> value). Used when
  // the credentials have been entered but not yet saved + redeployed into
  // process.env; the route falls back to process.env for already-live values.
  secrets?: Record<string, string>
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!isAdmin(user)) return errorResponse('Forbidden', 403)

  if (isLocalMode()) {
    return errorResponse(
      'Automatic Worker deployment is unavailable in local-development mode. Deploy from your live site.',
      503
    )
  }

  const vercelToken = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!vercelToken || !projectId) {
    return errorResponse('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required', 503)
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  const provider = body.provider
  if (!provider || !(provider in PROVIDER_KIND)) return errorResponse('Unknown media provider', 400)
  if (PROVIDER_KIND[provider] !== 'PROXIED') {
    return errorResponse(`${provider} is served directly and does not use a Cloudflare Worker.`, 400)
  }

  // Everything the deploy needs is already stored on the Vercel project once the
  // admin has set it up once, so nothing here should have to be retyped. Read the
  // saved values back: the Vercel API is the freshest source (it sees values saved
  // since this deployment was built), but it only returns `plain` vars - sensitive
  // ones decrypt to nothing and are only reachable via process.env, i.e. after a
  // redeploy. A Vercel hiccup is non-fatal: process.env alone still covers a site
  // that has redeployed since its credentials were saved.
  let stored: Record<string, string | null> = {}
  try {
    stored = await getVercelEnvValues(vercelToken, projectId, [
      ...WORKER_SECRET_KEYS[provider],
      ...ALL_CLOUDFLARE_CREDENTIAL_KEYS,
    ])
  } catch {
    // Fall through to process.env only.
  }

  const savedValue = (key: string): string | undefined =>
    stored[key] || process.env[key]?.trim() || undefined
  // Saved on the project, but write-only and absent from this deployment: the
  // admin can't be told to "enter it above" - they need a redeploy.
  const isWriteOnly = (key: string): boolean => stored[key] === null && !process.env[key]?.trim()

  // Build the Cloudflare auth from whichever credential the admin supplied,
  // falling back to the one saved by an earlier deploy.
  let auth: CloudflareAuth
  if (body.authMode === 'global') {
    const email = body.email?.trim() || savedValue(CLOUDFLARE_CREDENTIAL_KEYS.email)
    const globalKey = body.globalKey?.trim() || savedValue(CLOUDFLARE_CREDENTIAL_KEYS.globalKey)
    if (!email || !globalKey) {
      return errorResponse(
        'Global API Key mode needs both the account email and the key, and there is no saved pair to fall back on.',
        400
      )
    }
    auth = { kind: 'global', email, globalKey }
  } else {
    const apiToken = body.apiToken?.trim() || savedValue(CLOUDFLARE_CREDENTIAL_KEYS.apiToken)
    if (!apiToken) {
      return errorResponse('An API token is required - none is saved on this site yet.', 400)
    }
    auth = { kind: 'token', apiToken }
  }

  const accountId = body.accountId?.trim() || savedValue(CLOUDFLARE_CREDENTIAL_KEYS.accountId)

  // Assemble the Worker secrets: each provider credential + ALLOWED_ORIGIN.
  // Prefer a freshly-typed value from the request, else the saved one.
  const provided = body.secrets ?? {}
  const secrets: WorkerSecret[] = []
  const missing: string[] = []
  const notLive: string[] = []
  for (const key of WORKER_SECRET_KEYS[provider]) {
    const value = provided[key]?.trim() || savedValue(key)
    if (!value) {
      if (isWriteOnly(key)) notLive.push(key)
      else missing.push(key)
      continue
    }
    secrets.push({ name: key, text: value })
  }

  // ALLOWED_ORIGIN is the public site origin - never asked of the admin. The
  // hostname is also used to find the Cloudflare zone to attach media.<domain> to.
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
  let siteHostname: string | undefined
  if (siteUrl) {
    let origin = siteUrl
    try {
      const parsed = new URL(siteUrl)
      origin = parsed.origin
      siteHostname = parsed.hostname
    } catch {
      // Fall back to the raw value if it isn't a parseable URL.
    }
    secrets.push({ name: 'ALLOWED_ORIGIN', text: origin })
  } else {
    missing.push('ALLOWED_ORIGIN (set SITE_URL)')
  }

  // Signing key for direct uploads. Derived from SESSION_SECRET so there's
  // nothing extra for the operator to configure; pushing it here is what turns
  // the Worker's upload endpoint on. Skipped (uploads stay on the serverless
  // path) if SESSION_SECRET isn't set rather than failing the whole deploy.
  try {
    secrets.push({ name: 'UPLOAD_SIGNING_SECRET', text: deriveUploadSigningKey() })
  } catch {
    // SESSION_SECRET absent - leave uploads disabled on the Worker.
  }

  // Signing key for protected reads (3D models). Derived from the same
  // SESSION_SECRET under a different label, so a token minted for one path cannot
  // be replayed against the other. Pushing it here is what turns read enforcement
  // on; without it the Worker serves models to anyone holding the url, which is
  // also what every Worker deployed before this existed does.
  try {
    secrets.push({ name: 'ASSET_SIGNING_SECRET', text: deriveAssetSigningKey() })
  } catch {
    // SESSION_SECRET absent - models stay readable without a token.
  }

  if (missing.length > 0 || notLive.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) {
      parts.push(`Missing credential values for: ${missing.join(', ')}. Enter and save them above first.`)
    }
    if (notLive.length > 0) {
      const single = notLive.length === 1
      parts.push(
        `${notLive.join(', ')} ${single ? 'is' : 'are'} saved on your project but stored write-only, and this site hasn't redeployed since. Redeploy from the Status tab and try again, or paste the ${single ? 'value' : 'values'} above.`
      )
    }
    return errorResponse(parts.join(' '), 400)
  }

  let url: string
  let resolvedAccountId: string
  let customDomain: string | null = null
  let note: string | undefined
  try {
    const result = await deployMediaWorker({ auth, accountId, secrets, siteHostname })
    url = result.url
    resolvedAccountId = result.accountId
    customDomain = result.customDomain
    note = result.note
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Worker deployment failed', 502)
  }

  // Persist the Worker URL (plain) plus the Cloudflare credentials (the two keys
  // are sensitive per lib/vercel/env.ts) so a later provider switch can redeploy
  // without re-entering anything.
  const toWrite: Array<{ key: string; value: string }> = [
    { key: CLOUDFLARE_WORKER_VAR.key, value: url },
    { key: CLOUDFLARE_CREDENTIAL_KEYS.accountId, value: resolvedAccountId },
  ]
  if (auth.kind === 'token') {
    toWrite.push({ key: CLOUDFLARE_CREDENTIAL_KEYS.apiToken, value: auth.apiToken })
  } else {
    toWrite.push({ key: CLOUDFLARE_CREDENTIAL_KEYS.globalKey, value: auth.globalKey })
    toWrite.push({ key: CLOUDFLARE_CREDENTIAL_KEYS.email, value: auth.email })
  }

  try {
    await upsertVercelEnvVars(vercelToken, projectId, toWrite)
    await recordDeploymentNeeded({ label: labelForEnvKeys(toWrite.map((v) => v.key)) })
  } catch (err: unknown) {
    // The Worker itself deployed fine; only saving the settings failed. Hand the
    // URL back so the admin can paste it manually rather than lose the deploy.
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({
      ok: true,
      url,
      warning: `Worker deployed, but saving your settings failed: ${message}. Paste this address into ${CLOUDFLARE_WORKER_VAR.key} yourself: ${url}`,
    })
  }

  // Move existing proxied images onto the newly-saved Worker base so the whole
  // library uses one address, not just uploads made from now on. Non-fatal: the
  // Worker and settings are already saved, so a hiccup here shouldn't fail the call.
  let rebased: number | null = null
  try {
    rebased = await rebaseProxiedMediaUrls(url)
  } catch {
    rebased = null
  }

  return NextResponse.json({ ok: true, url, customDomain, note, rebased, deploymentNeeded: true })
}
