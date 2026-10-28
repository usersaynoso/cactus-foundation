import type { HostingCredentials } from './provider'
import { isSensitiveEnvKey } from './sensitive-keys'
import {
  deleteVercelEnvVars,
  getVercelEnvValues,
  getVercelEnvVarKeys,
  upsertVercelEnvVars,
} from '@/lib/vercel/env'
import {
  deleteNetlifyEnvVars,
  getNetlifyEnvValues,
  getNetlifyEnvVarKeys,
  upsertNetlifyEnvVars,
} from '@/lib/netlify/env'

// Environment variables on the site's hosting platform, whichever it is. Writes only
// reach the running site after a rebuild (lib/hosting/deploy.ts) on both platforms.

export type HostEnvVar = {
  key: string
  value: string
  /** Store write-only. Defaults to whether the key is in SENSITIVE_ENV_KEYS. */
  secret?: boolean
}

export async function getHostEnvVarKeys(creds: HostingCredentials): Promise<string[]> {
  return creds.provider === 'netlify'
    ? getNetlifyEnvVarKeys(creds.token, creds.siteId)
    : getVercelEnvVarKeys(creds.token, creds.siteId)
}

/**
 * Current production values of the given keys. A key stored secret maps to null (set,
 * but unreadable - only a redeploy can hand it to the app); a key absent from the
 * result is not set at all.
 */
export async function getHostEnvValues(
  creds: HostingCredentials,
  keys: string[]
): Promise<Record<string, string | null>> {
  return creds.provider === 'netlify'
    ? getNetlifyEnvValues(creds.token, creds.siteId, keys)
    : getVercelEnvValues(creds.token, creds.siteId, keys)
}

export async function upsertHostEnvVars(creds: HostingCredentials, vars: HostEnvVar[]): Promise<void> {
  if (vars.length === 0) return
  if (creds.provider === 'netlify') {
    await upsertNetlifyEnvVars(creds.token, creds.siteId, vars)
    return
  }
  await upsertVercelEnvVars(
    creds.token,
    creds.siteId,
    vars.map(({ key, value, secret }) => ({
      key,
      value,
      type: (secret ?? isSensitiveEnvKey(key)) ? 'sensitive' : 'plain',
    }))
  )
}

export async function upsertHostEnvVar(
  creds: HostingCredentials,
  key: string,
  value: string,
  secret?: boolean
): Promise<void> {
  await upsertHostEnvVars(creds, [{ key, value, secret }])
}

export async function deleteHostEnvVars(
  creds: HostingCredentials,
  keys: string[]
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  return creds.provider === 'netlify'
    ? deleteNetlifyEnvVars(creds.token, creds.siteId, keys)
    : deleteVercelEnvVars(creds.token, creds.siteId, keys)
}
