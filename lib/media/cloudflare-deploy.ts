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

// Full deploy: resolve account, upload with secrets, enable the URL.
export async function deployMediaWorker(params: {
  auth: CloudflareAuth
  accountId?: string
  secrets: WorkerSecret[]
}): Promise<{ url: string; accountId: string }> {
  const accountId = await resolveAccountId(params.auth, params.accountId)
  await uploadWorker(params.auth, accountId, params.secrets)
  const url = await enableWorkerUrl(params.auth, accountId)
  return { url, accountId }
}
