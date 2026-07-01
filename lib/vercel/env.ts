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
])

function envType(key: string): VercelEnvType {
  return SENSITIVE_KEYS.has(key) ? 'sensitive' : 'plain'
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
        body: JSON.stringify({ value, type: resolvedType, target: DEFAULT_TARGETS }),
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
          { key, value, type: resolvedType, target: DEFAULT_TARGETS },
        ]),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
    }
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
            body: JSON.stringify({ value, type: resolvedType, target: DEFAULT_TARGETS }),
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
              { key, value, type: resolvedType, target: DEFAULT_TARGETS },
            ]),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Vercel POST env var "${key}" failed (${res.status}): ${body}`)
        }
      }
    })
  )
}
