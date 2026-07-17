const VERCEL_API = 'https://api.vercel.com'

type VercelEnvTarget = 'production' | 'preview' | 'development'
type VercelEnvType = 'plain' | 'sensitive'

type VercelEnvVar = {
  id: string
  key: string
  type: VercelEnvType
  target: VercelEnvTarget[]
}

const DEFAULT_TARGETS: VercelEnvTarget[] = ['production', 'preview', 'development']

// Vercel rejects target "development" on type "sensitive" vars (they never
// decrypt to `vercel dev` / local pulls), so sensitive keys skip that target.
// Local dev reads secrets from .env.local instead.
const SENSITIVE_TARGETS: VercelEnvTarget[] = ['production', 'preview']

// Sensitive type marks the value write-only (hidden from the dashboard after
// creation) for secret-bearing keys; plain for everything else.
const SENSITIVE_KEYS = new Set([
  'DATABASE_URL',
  'SESSION_SECRET',
  'VERCEL_API_TOKEN',
  'BREVO_API_KEY',
  'SMTP_PASS',
  'B2_APPLICATION_KEY',
  'GITHUB_API_TOKEN',
  'ENCRYPTION_KEY',
  'NEON_API_KEY',
  'EDGE_CONFIG',
  'VERCEL_WEBHOOK_SECRET',
  'TURNSTILE_SECRET_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_GLOBAL_API_KEY',
])

function envType(key: string): VercelEnvType {
  return SENSITIVE_KEYS.has(key) ? 'sensitive' : 'plain'
}

function envTargets(type: VercelEnvType): VercelEnvTarget[] {
  return type === 'sensitive' ? SENSITIVE_TARGETS : DEFAULT_TARGETS
}

// Vercel's batch env-create endpoint can return 2xx with per-item failures in a
// `failed` array — a plain res.ok check silently drops those vars. Throws if any
// item in the response failed.
async function assertNoFailedItems(res: Response, key: string): Promise<void> {
  try {
    const data = (await res.clone().json()) as {
      failed?: Array<{ error?: { key?: string; message?: string } }>
    }
    if (data.failed && data.failed.length > 0) {
      const details = data.failed
        .map((f) => `${f.error?.key ?? key}: ${f.error?.message ?? 'unknown error'}`)
        .join('; ')
      throw new Error(`Vercel rejected env var(s): ${details}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Vercel rejected')) throw err
    // Non-JSON or unexpected body — treat as success (res.ok already checked).
  }
}

// Fetches all env var entries for the project (returns id + key, never value).
async function listVercelEnvVars(token: string, projectId: string): Promise<VercelEnvVar[]> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!res.ok) {
    throw new Error(`Vercel API list env vars failed (${res.status})`)
  }
  const data = (await res.json()) as { envs?: VercelEnvVar[] }
  return data.envs ?? []
}

// Returns the set of env var keys currently set in the Vercel project.
export async function getVercelEnvVarKeys(token: string, projectId: string): Promise<string[]> {
  const vars = await listVercelEnvVars(token, projectId)
  return vars.map((v) => v.key)
}

// Reads the current values of the given keys back off the Vercel project. Use
// this when code needs a value that was saved after the running deployment was
// built, so process.env doesn't have it yet.
//
// Vercel only hands back the values of `plain` vars. Anything stored `sensitive`
// (see SENSITIVE_KEYS) is write-only and decrypts to an empty string, so it maps
// to null here: "this key is set, but its value cannot be recovered". Keys absent
// from the result are not set on the project at all. Only process.env - i.e. a
// redeploy - can supply a sensitive value.
export async function getVercelEnvValues(
  token: string,
  projectId: string,
  keys: string[],
  target: VercelEnvTarget = 'production'
): Promise<Record<string, string | null>> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) {
    throw new Error(`Vercel API read env values failed (${res.status})`)
  }
  const data = (await res.json()) as { envs?: Array<VercelEnvVar & { value?: string }> }
  const wanted = new Set(keys)
  const out: Record<string, string | null> = {}
  for (const env of data.envs ?? []) {
    if (!wanted.has(env.key)) continue
    if (!env.target?.includes(target)) continue
    const value = env.value?.trim()
    out[env.key] = value ? value : null
  }
  return out
}

// Upserts a single env var: PATCHes if the key already exists, POSTs to create otherwise.
export async function upsertVercelEnvVar(
  token: string,
  projectId: string,
  key: string,
  value: string,
  type?: VercelEnvType
): Promise<void> {
  const resolvedType = type ?? envType(key)
  const vars = await listVercelEnvVars(token, projectId)
  const existing = vars.find((v) => v.key === key)

  if (existing) {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, type: resolvedType, target: envTargets(resolvedType) }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel PATCH env var "${key}" failed (${res.status}): ${body}`)
    }
  } else {
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          { key, value, type: resolvedType, target: envTargets(resolvedType) },
        ]),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
    }
    await assertNoFailedItems(res, key)
  }
}

// Deletes env vars by key. Attempts all deletions via allSettled (one failure
// does not abort the others). Returns lists of deleted and failed keys.
export async function deleteVercelEnvVars(
  token: string,
  projectId: string,
  keys: string[]
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const existing = await listVercelEnvVars(token, projectId)
  const toDelete = existing.filter((v) => v.id && keys.includes(v.key))

  const results = await Promise.allSettled(
    toDelete.map(async ({ id, key }) => {
      const res = await fetch(
        `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`${res.status}: ${body}`)
      }
      return key
    })
  )

  const deleted: string[] = []
  const failed: Array<{ key: string; error: string }> = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      deleted.push(r.value)
    } else {
      failed.push({ key: toDelete[i]?.key ?? 'unknown', error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
    }
  })

  return { deleted, failed }
}

// Batch upsert. Fetches the var list once, then creates/updates each key.
export async function upsertVercelEnvVars(
  token: string,
  projectId: string,
  vars: Array<{ key: string; value: string; type?: VercelEnvType }>
): Promise<void> {
  const existing = await listVercelEnvVars(token, projectId)
  const existingMap = new Map(existing.map((v) => [v.key, v.id]))

  await Promise.all(
    vars.map(async ({ key, value, type }) => {
      const resolvedType = type ?? envType(key)
      const existingId = existingMap.get(key)

      if (existingId) {
        const res = await fetch(
          `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env/${existingId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ value, type: resolvedType, target: envTargets(resolvedType) }),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Vercel PATCH env var "${key}" failed (${res.status}): ${body}`)
        }
      } else {
        const res = await fetch(
          `${VERCEL_API}/v10/projects/${encodeURIComponent(projectId)}/env`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([
              { key, value, type: resolvedType, target: envTargets(resolvedType) },
            ]),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
        }
        await assertNoFailedItems(res, key)
      }
    })
  )
}
