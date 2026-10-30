// Deploys the Cactus media Worker to a user's Cloudflare account via the
// Cloudflare API, so a non-technical admin never has to touch a terminal or the
// Cloudflare dashboard. Called from app/api/admin/media/deploy-worker/route.ts.
//
// The Worker source is transpiled to a plain ES module at build time and embedded
// as MEDIA_WORKER_SOURCE (see scripts/generate-media-worker.mjs).

import { createHash } from 'node:crypto'
import { MEDIA_WORKER_SOURCE } from './worker-source.generated'
import { CLOUDFLARE_WORKERS_EDIT_PERMISSION } from './providers'

const CF_API = 'https://api.cloudflare.com/client/v4'
const WORKER_SCRIPT_PREFIX = 'cactus-media-'
// The single name every install used before Workers were per site.
const LEGACY_WORKER_SCRIPT_NAME = 'cactus-media-worker'
// Cloudflare caps a script name at 63 characters.
const WORKER_SCRIPT_NAME_MAX = 63
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

// One Worker per site, named after the site's hostname. The Worker carries the
// site's own storage keys, its one allowed origin and signing keys derived from
// its own SESSION_SECRET, so it can never be shared: every deploy replaces all
// of those in one PUT. A single fixed name meant two sites on one Cloudflare
// account overwrote each other's Worker, and the second deploy took every image
// on the first site down (2026-10-30). Installs deployed before this keep
// serving from the old `cactus-media-worker` until their next deploy moves them
// onto their own name and repoints media.<domain> at it.
export function mediaWorkerScriptName(siteHostname: string): string {
  const host = siteHostname.trim().toLowerCase().replace(/\.$/, '')
  const slug = host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) throw new Error('A site hostname is needed to name its media Worker.')
  const name = `${WORKER_SCRIPT_PREFIX}${slug}`
  if (name.length <= WORKER_SCRIPT_NAME_MAX) return name
  // Too long: keep a readable head and add a hash of the whole host, so two long
  // hostnames that share a prefix still get different Workers.
  const hash = createHash('sha256').update(host).digest('hex').slice(0, 8)
  const head = name.slice(0, WORKER_SCRIPT_NAME_MAX - hash.length - 1).replace(/-+$/, '')
  return `${head}-${hash}`
}

function zoneOwnsHost(zoneName: string, host: string): boolean {
  const zone = zoneName.toLowerCase()
  return host === zone || host.endsWith(`.${zone}`)
}

// Refuse to overwrite a Worker that serves a domain this site does not own. The
// per-site name makes this near impossible, but an upload replaces every secret
// at once, so a collision would be another site's outage - worth one read.
export async function assertWorkerNotShared(
  auth: CloudflareAuth,
  accountId: string,
  scriptName: string,
  siteHostname: string
): Promise<void> {
  const host = siteHostname.trim().toLowerCase().replace(/\.$/, '')
  const res = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/domains?service=${encodeURIComponent(scriptName)}`,
    { headers: authHeaders(auth), signal: AbortSignal.timeout(15_000) }
  )
  const body = (await res.json()) as CfResponse<Array<{ hostname: string; service: string; zone_name: string }>>
  if (!res.ok || !body.success) throw cfError('Worker domain lookup', body, res.status)

  const foreign = (body.result ?? [])
    .filter((d) => d.service === scriptName && !zoneOwnsHost(d.zone_name, host))
    .map((d) => d.hostname)
  if (foreign.length > 0) {
    throw new Error(
      `The Cloudflare Worker ${scriptName} also serves ${foreign.join(', ')}, which isn't this site's domain. Deploying would replace that site's settings and break its images, so nothing was changed.`
    )
  }
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
  scriptName: string,
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
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}`,
    { method: 'PUT', headers: authHeaders(auth), body: form, signal: AbortSignal.timeout(30_000) }
  )
  const body = (await res.json()) as CfResponse<unknown>
  if (!res.ok || !body.success) {
    // Cloudflare's 10000 here means the credential itself was accepted but isn't
    // allowed to write Workers on this account. Listing accounts needs far less
    // permission than uploading a script, so a token that got this far can still
    // land on 10000 - say which permission is missing rather than parroting
    // "Authentication error" at someone with no way to act on it.
    if (body.errors?.some((e) => e.code === 10000)) {
      throw new Error(
        `Cloudflare wouldn't let this credential create the Worker on account ${accountId} (10000 Authentication error). Check the API token grants ${CLOUDFLARE_WORKERS_EDIT_PERMISSION} for that account, and that the Account ID is the right one.`
      )
    }
    throw cfError('Worker upload', body, res.status)
  }
}

// Ensure the account's workers.dev subdomain is claimed, enable it for this
// script, and return the public URL the app should serve media from.
export async function enableWorkerUrl(
  auth: CloudflareAuth,
  accountId: string,
  scriptName: string
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
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`,
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

  return `https://${scriptName}.${subdomain}.workers.dev`
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
  scriptName: string,
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
    .filter((z) => zoneOwnsHost(z.name, host))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (!zone) {
    return { url: null, reason: `no domain in this Cloudflare account matches ${host}, so media stays on the workers.dev address` }
  }

  const hostname = `media.${zone.name.toLowerCase()}`

  // media.<zone> is one per zone, and two sites can share a zone (an apex site
  // and a subdomain one). Never take the hostname off another site's Worker. The
  // one hand-over allowed is from the old shared name, and only when this site
  // is the one already serving from that hostname.
  const currentRes = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/domains?hostname=${encodeURIComponent(hostname)}`,
    { headers: authHeaders(auth), signal: AbortSignal.timeout(15_000) }
  )
  const currentBody = (await currentRes.json()) as CfResponse<Array<{ hostname: string; service: string }>>
  if (!currentRes.ok || !currentBody.success) {
    return { url: null, reason: `couldn't check who is using ${hostname}: ${currentBody.errors?.map((e) => e.message).join('; ') || `HTTP ${currentRes.status}`}` }
  }
  const holder = (currentBody.result ?? []).find((d) => d.hostname.toLowerCase() === hostname)?.service
  if (holder && holder !== scriptName) {
    const ourUrl = process.env.CLOUDFLARE_WORKER_URL?.trim().replace(/\/$/, '').toLowerCase()
    const legacyHandOver = holder === LEGACY_WORKER_SCRIPT_NAME && ourUrl === `https://${hostname}`
    if (!legacyHandOver) {
      return { url: null, reason: `${hostname} already serves another Worker (${holder}), probably another site on the same domain, so this site's media stays on the workers.dev address` }
    }
  }

  const attachRes = await fetch(
    `${CF_API}/accounts/${encodeURIComponent(accountId)}/workers/domains`,
    {
      method: 'PUT',
      headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment: 'production',
        hostname,
        service: scriptName,
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

// Full deploy: resolve account, check the site's own Worker isn't serving
// someone else's domain, upload with secrets, enable the workers.dev URL, then
// try to attach a media.<your-domain> Custom Domain. The returned `url` is
// the best public base to serve media from: the Custom Domain when it attached,
// otherwise the workers.dev URL. `note` explains any fallback for the admin.
export async function deployMediaWorker(params: {
  auth: CloudflareAuth
  accountId?: string
  secrets: WorkerSecret[]
  siteHostname: string
}): Promise<{
  url: string
  workersDevUrl: string
  accountId: string
  customDomain: string | null
  note?: string
}> {
  const accountId = await resolveAccountId(params.auth, params.accountId)
  const scriptName = mediaWorkerScriptName(params.siteHostname)
  await assertWorkerNotShared(params.auth, accountId, scriptName, params.siteHostname)
  await uploadWorker(params.auth, accountId, scriptName, params.secrets)
  const workersDevUrl = await enableWorkerUrl(params.auth, accountId, scriptName)

  let customDomain: string | null = null
  let note: string | undefined
  const attached = await attachMediaCustomDomain(params.auth, accountId, scriptName, params.siteHostname)
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

  return {
    url: customDomain ?? workersDevUrl,
    workersDevUrl,
    accountId,
    customDomain,
    note,
  }
}
