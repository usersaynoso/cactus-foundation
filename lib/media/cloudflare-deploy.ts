// Deploys the Cactus media Worker to a user's Cloudflare account via the
// Cloudflare API, so a non-technical admin never has to touch a terminal or the
// Cloudflare dashboard. Called from app/api/admin/media/deploy-worker/route.ts.
//
// The Worker source is transpiled to a plain ES module at build time and embedded
// as MEDIA_WORKER_SOURCE (see scripts/generate-media-worker.mjs).

import { MEDIA_WORKER_SOURCE } from './worker-source.generated'

const CF_API = 'https://api.cloudflare.com/client/v4'
const WORKER_SCRIPT_NAME = 'cactus-media-worker'
const WORKER_MODULE_FILENAME = 'worker.mjs'
// Matches workers/media-worker/wrangler.toml so runtime behaviour is identical
// whether the Worker is deployed via this flow or via wrangler.
const COMPATIBILITY_DATE = '2024-01-01'

// Either a scoped API token (recommended) or a legacy Global API Key + email.
export type CloudflareAuth =
  | { kind: 'token'; apiToken: string }
  | { kind: 'global'; email: string; globalKey: string }

export type WorkerSecret = { name: string; text: string }

type CfResponse<T> = {
  success: boolean
  errors?: Array<{ code: number; message: string }>
  result?: T
}

function authHeaders(auth: CloudflareAuth): Record<string, string> {
  if (auth.kind === 'token') return { Authorization: `Bearer ${auth.apiToken}` }
  return { 'X-Auth-Email': auth.email, 'X-Auth-Key': auth.globalKey }
}

function cfError(action: string, body: CfResponse<unknown>, status: number): Error {
  const detail =
    body.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${status}`
  return new Error(`Cloudflare ${action} failed: ${detail}`)
}

// Resolve the account id. If the caller supplied one, trust it. Otherwise list
// the accounts the credential can see: exactly one is unambiguous; zero or many
// means we can't guess, so ask the caller to specify.
export async function resolveAccountId(
  auth: CloudflareAuth,
  provided?: string
): Promise<string> {
  const trimmed = provided?.trim()
  if (trimmed) return trimmed

  const res = await fetch(`${CF_API}/accounts?per_page=50`, {
    headers: authHeaders(auth),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json()) as CfResponse<Array<{ id: string; name: string }>>
  if (!res.ok || !body.success) throw cfError('account lookup', body, res.status)

  const accounts = body.result ?? []
  const first = accounts[0]
  if (!first) throw new Error('No Cloudflare accounts are visible to this credential.')
  if (accounts.length > 1) {
    throw new Error(
      `This credential can see ${accounts.length} Cloudflare accounts. Enter the Account ID of the one to use.`
    )
  }
  return first.id
}

// Upload (create or overwrite) the media Worker as an ES module. The provider
// secrets are set as secret_text bindings in the same request, so there is no
// separate secrets round-trip.
export async function uploadWorker(
  auth: CloudflareAuth,
  accountId: string,
  secrets: WorkerSecret[]
): Promise<void> {
  const metadata = {
    main_module: WORKER_MODULE_FILENAME,
    compatibility_date: COMPATIBILITY_DATE,
    bindings: secrets.map((s) => ({ type: 'secret_text', name: s.name, text: s.text })),
  }

  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append(
    WORKER_MODULE_FILENAME,
    new Blob([MEDIA_WORKER_SOURCE], { type: 'application/javascript+module' }),
    WORKER_MODULE_FILENAME
  )

  const res = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${WORKER_SCRIPT_NAME}`,
    { method: 'PUT', headers: authHeaders(auth), body: form, signal: AbortSignal.timeout(30_000) }
  )
  const body = (await res.json()) as CfResponse<unknown>
  if (!res.ok || !body.success) throw cfError('Worker upload', body, res.status)
}

// Ensure the account's workers.dev subdomain is claimed, enable it for this
// script, and return the public URL the app should serve media from.
export async function enableWorkerUrl(
  auth: CloudflareAuth,
  accountId: string
): Promise<string> {
  const subRes = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
    { headers: authHeaders(auth), signal: AbortSignal.timeout(15_000) }
  )
  const subBody = (await subRes.json()) as CfResponse<{ subdomain: string | null }>
  if (!subRes.ok || !subBody.success) throw cfError('subdomain lookup', subBody, subRes.status)

  const subdomain = subBody.result?.subdomain
  if (!subdomain) {
    throw new Error(
      'Your Cloudflare account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard, pick a subdomain once, then deploy again.'
    )
  }

  const enableRes = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${WORKER_SCRIPT_NAME}/subdomain`,
    {
      method: 'POST',
      headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  const enableBody = (await enableRes.json()) as CfResponse<unknown>
  if (!enableRes.ok || !enableBody.success) {
    throw cfError('enable Worker URL', enableBody, enableRes.status)
  }

  return `https://${WORKER_SCRIPT_NAME}.${subdomain}.workers.dev`
}

// Attach `media.<zone>` to the Worker as a Custom Domain so images load from a
// tidy address on the site owner's own domain instead of the raw workers.dev
// URL. Cloudflare provisions the DNS record and TLS certificate automatically.
//
// Best-effort: returns { url: null, reason } when no zone in the account owns the
// site's domain, or Cloudflare rejects the attach (e.g. a conflicting DNS record
// already exists on the media subdomain). The caller then keeps the workers.dev
// URL and surfaces the reason, so a missing Zone·Read permission or an unmanaged
// domain degrades gracefully rather than failing the whole deploy.
export async function attachMediaCustomDomain(
  auth: CloudflareAuth,
  accountId: string,
  siteHostname: string
): Promise<{ url: string; reason?: undefined } | { url: null; reason: string }> {
  const host = siteHostname.trim().toLowerCase().replace(/\.$/, '')
  // Only real, delegated domains can carry a Custom Domain. Skip localhost, bare
  // hostnames and the throwaway platform hosts that will never be a CF zone.
  if (!host || !host.includes('.') || host.endsWith('.vercel.app') || host.endsWith('.workers.dev')) {
    return { url: null, reason: `${host || 'your site URL'} isn't a custom domain, so media stays on the workers.dev address` }
  }

  // Find the zone that owns the site domain. The media subdomain must live inside
  // one of the account's zones; pick the longest suffix match (the apex).
  const zonesRes = await fetch(`${CF_API}/zones?per_page=50`, {
    headers: authHeaders(auth),
    signal: AbortSignal.timeout(15_000),
  })
  const zonesBody = (await zonesRes.json()) as CfResponse<Array<{ id: string; name: string }>>
  if (!zonesRes.ok || !zonesBody.success) {
    return { url: null, reason: `couldn't read your Cloudflare domains (add the Zone·Read permission to the token): ${zonesBody.errors?.map((e) => e.message).join('; ') || `HTTP ${zonesRes.status}`}` }
  }

  const zone = (zonesBody.result ?? [])
    .filter((z) => {
      const name = z.name.toLowerCase()
      return host === name || host.endsWith(`.${name}`)
    })
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (!zone) {
    return { url: null, reason: `no domain in this Cloudflare account matches ${host}, so media stays on the workers.dev address` }
  }

  const hostname = `media.${zone.name.toLowerCase()}`
  const attachRes = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/domains`,
    {
      method: 'PUT',
      headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment: 'production',
        hostname,
        service: WORKER_SCRIPT_NAME,
        zone_id: zone.id,
      }),
      signal: AbortSignal.timeout(30_000),
    }
  )
  const attachBody = (await attachRes.json()) as CfResponse<{ hostname: string }>
  if (!attachRes.ok || !attachBody.success) {
    const detail =
      attachBody.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${attachRes.status}`
    return { url: null, reason: `Cloudflare wouldn't attach ${hostname}: ${detail}` }
  }

  return { url: `https://${hostname}` }
}

function isWorkersDevUrl(url: string): boolean {
  try {
    return /\.workers\.dev$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

// Full deploy: resolve account, upload with secrets, enable the workers.dev URL,
// then try to attach a media.<your-domain> Custom Domain. The returned `url` is
// the best public base to serve media from: the Custom Domain when it attached,
// otherwise the workers.dev URL. `note` explains any fallback for the admin.
export async function deployMediaWorker(params: {
  auth: CloudflareAuth
  accountId?: string
  secrets: WorkerSecret[]
  siteHostname?: string
}): Promise<{
  url: string
  workersDevUrl: string
  accountId: string
  customDomain: string | null
  note?: string
}> {
  const accountId = await resolveAccountId(params.auth, params.accountId)
  await uploadWorker(params.auth, accountId, params.secrets)
  const workersDevUrl = await enableWorkerUrl(params.auth, accountId)

  let customDomain: string | null = null
  let note: string | undefined
  if (params.siteHostname) {
    const attached = await attachMediaCustomDomain(params.auth, accountId, params.siteHostname)
    if (attached.url) {
      customDomain = attached.url
    } else {
      note = attached.reason
      // Don't regress a custom domain attached on an earlier deploy if this attach
      // hit a transient error: keep serving from the existing media.<domain> rather
      // than dropping the whole library back to the workers.dev URL.
      const existing = process.env.CLOUDFLARE_WORKER_URL?.trim().replace(/\/$/, '')
      if (existing && !isWorkersDevUrl(existing)) customDomain = existing
    }
  }

  return {
    url: customDomain ?? workersDevUrl,
    workersDevUrl,
    accountId,
    customDomain,
    note,
  }
}
