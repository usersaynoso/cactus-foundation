import type { EnvKeySummary, EnvWrite } from '@/cactus-host/protocol'
import { assertServerHostOk, serverHostFetch, sitePath } from './api'

// The site's env file on its server, through cactus-host. Same contract as the
// Vercel and Netlify twins: a secret key can be listed but never read back (it maps
// to null), and a write reaches the running site only with the next build, because
// each release keeps the env it was built with.

async function listKeys(token: string, siteId: string): Promise<EnvKeySummary[]> {
  const res = await serverHostFetch(token, sitePath(siteId, '/env'), { timeoutMs: 10_000 })
  await assertServerHostOk(res, 'list environment variables')
  return ((await res.json()) as { keys?: EnvKeySummary[] }).keys ?? []
}

export async function getServerEnvVarKeys(token: string, siteId: string): Promise<string[]> {
  return (await listKeys(token, siteId)).map((k) => k.key)
}

export async function getServerEnvValues(
  token: string,
  siteId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {}
  const res = await serverHostFetch(token, sitePath(siteId, '/env/values'), {
    method: 'POST',
    body: { keys },
    timeoutMs: 10_000,
  })
  await assertServerHostOk(res, 'read environment variables')
  return ((await res.json()) as { values?: Record<string, string | null> }).values ?? {}
}

export async function upsertServerEnvVars(token: string, siteId: string, vars: EnvWrite[]): Promise<void> {
  if (vars.length === 0) return
  const res = await serverHostFetch(token, sitePath(siteId, '/env'), {
    method: 'PUT',
    body: { vars },
    timeoutMs: 10_000,
  })
  await assertServerHostOk(res, 'save environment variables')
}

export async function deleteServerEnvVars(
  token: string,
  siteId: string,
  keys: string[]
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  if (keys.length === 0) return { deleted: [], failed: [] }
  try {
    const res = await serverHostFetch(token, sitePath(siteId, '/env'), {
      method: 'DELETE',
      body: { keys },
      timeoutMs: 10_000,
    })
    await assertServerHostOk(res, 'remove environment variables')
    const data = (await res.json()) as {
      deleted?: string[]
      failed?: Array<{ key: string; error: string }>
    }
    return { deleted: data.deleted ?? [], failed: data.failed ?? [] }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return { deleted: [], failed: keys.map((key) => ({ key, error })) }
  }
}
