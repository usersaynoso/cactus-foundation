import { isSensitiveEnvKey } from '@/lib/hosting/sensitive-keys'
import { assertNetlifyOk, getNetlifySite, netlifyFetch, NetlifyApiError } from './api'

// Netlify keeps environment variables on the team (account), scoped to a site with
// `?site_id=`. Every call therefore needs the site's account id first, which is
// cached per site for the life of the process - it never changes.

type NetlifyEnvValue = { id?: string; value?: string; context?: string }
type NetlifyEnvVar = { key: string; is_secret?: boolean; values?: NetlifyEnvValue[] }

// Secret values may not use the catch-all 'all' context, nor the local 'dev' one, so
// they are written to each deployed context by name. They also may not be exposed to
// post-processing (snippet injection), which is why their scopes are listed.
const SECRET_CONTEXTS = ['production', 'deploy-preview', 'branch-deploy'] as const
const SECRET_SCOPES = ['builds', 'functions', 'runtime'] as const

const accountIds = new Map<string, string>()

async function accountIdFor(token: string, siteId: string): Promise<string> {
  const cached = accountIds.get(siteId)
  if (cached) return cached
  const site = await getNetlifySite(token, siteId)
  if (!site?.account_id) {
    throw new NetlifyApiError(`Netlify site "${siteId}" was not found, or the token cannot see it`, 404)
  }
  accountIds.set(siteId, site.account_id)
  return site.account_id
}

function envPath(accountId: string, siteId: string, key?: string): string {
  const base = `/accounts/${encodeURIComponent(accountId)}/env`
  return `${base}${key ? `/${encodeURIComponent(key)}` : ''}?site_id=${encodeURIComponent(siteId)}`
}

function envBody(key: string, value: string, secret: boolean) {
  return secret
    ? {
        key,
        is_secret: true,
        scopes: SECRET_SCOPES,
        values: SECRET_CONTEXTS.map((context) => ({ context, value })),
      }
    : { key, values: [{ context: 'all', value }] }
}

async function listNetlifyEnvVars(token: string, siteId: string): Promise<NetlifyEnvVar[]> {
  const accountId = await accountIdFor(token, siteId)
  const res = await netlifyFetch(token, envPath(accountId, siteId), { timeoutMs: 10_000 })
  await assertNetlifyOk(res, 'list env vars')
  return ((await res.json()) as NetlifyEnvVar[]) ?? []
}

export async function getNetlifyEnvVarKeys(token: string, siteId: string): Promise<string[]> {
  return (await listNetlifyEnvVars(token, siteId)).map((v) => v.key)
}

// Same contract as getVercelEnvValues: a key that is set but stored secret (its value
// cannot be read back) maps to null; a key absent from the result is not set at all.
export async function getNetlifyEnvValues(
  token: string,
  siteId: string,
  keys: string[],
  context: 'production' | 'deploy-preview' | 'branch-deploy' = 'production'
): Promise<Record<string, string | null>> {
  const wanted = new Set(keys)
  const out: Record<string, string | null> = {}
  for (const env of await listNetlifyEnvVars(token, siteId)) {
    if (!wanted.has(env.key)) continue
    if (env.is_secret) {
      out[env.key] = null
      continue
    }
    const match =
      env.values?.find((v) => v.context === context) ?? env.values?.find((v) => v.context === 'all')
    if (!match) continue
    const value = match.value?.trim()
    out[env.key] = value ? value : null
  }
  return out
}

// One write, retried once as a plain value when Netlify refuses the secret form.
// Secret values are a paid-plan feature on some Netlify teams; on those, refusing to
// save the var at all would strand setup on a value the platform will happily store
// in the ordinary way, so it is stored plain and the downgrade is logged.
async function writeOne(
  token: string,
  accountId: string,
  siteId: string,
  key: string,
  value: string,
  secret: boolean,
  exists: boolean
): Promise<void> {
  const send = (asSecret: boolean) =>
    exists
      ? netlifyFetch(token, envPath(accountId, siteId, key), {
          method: 'PUT',
          body: envBody(key, value, asSecret),
        })
      : netlifyFetch(token, envPath(accountId, siteId), {
          method: 'POST',
          body: [envBody(key, value, asSecret)],
        })

  let res = await send(secret)
  if (!res.ok && secret && (res.status === 400 || res.status === 403 || res.status === 422)) {
    console.warn(`[netlify] secret storage refused for ${key} (${res.status}); storing it as a plain value`)
    res = await send(false)
  }
  await assertNetlifyOk(res, `${exists ? 'update' : 'create'} env var "${key}"`)
}

export async function upsertNetlifyEnvVars(
  token: string,
  siteId: string,
  vars: Array<{ key: string; value: string; secret?: boolean }>
): Promise<void> {
  const accountId = await accountIdFor(token, siteId)
  const existing = new Set((await listNetlifyEnvVars(token, siteId)).map((v) => v.key))
  await Promise.all(
    vars.map(({ key, value, secret }) =>
      writeOne(token, accountId, siteId, key, value, secret ?? isSensitiveEnvKey(key), existing.has(key))
    )
  )
}

export async function upsertNetlifyEnvVar(
  token: string,
  siteId: string,
  key: string,
  value: string,
  secret?: boolean
): Promise<void> {
  await upsertNetlifyEnvVars(token, siteId, [{ key, value, secret }])
}

export async function deleteNetlifyEnvVars(
  token: string,
  siteId: string,
  keys: string[]
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const accountId = await accountIdFor(token, siteId)
  const present = new Set((await listNetlifyEnvVars(token, siteId)).map((v) => v.key))
  const toDelete = keys.filter((k) => present.has(k))

  const results = await Promise.allSettled(
    toDelete.map(async (key) => {
      const res = await netlifyFetch(token, envPath(accountId, siteId, key), { method: 'DELETE' })
      await assertNetlifyOk(res, `delete env var "${key}"`)
      return key
    })
  )

  const deleted: string[] = []
  const failed: Array<{ key: string; error: string }> = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') deleted.push(r.value)
    else failed.push({ key: toDelete[i] ?? 'unknown', error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
  })
  return { deleted, failed }
}
