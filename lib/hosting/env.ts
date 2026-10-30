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
import {
  deleteServerEnvVars,
  getServerEnvValues,
  getServerEnvVarKeys,
  upsertServerEnvVars,
} from '@/lib/server-host/env'

// Environment variables on the site's hosting platform, whichever it is. Writes only
// reach the running site after a rebuild (lib/hosting/deploy.ts) on every platform:
// on a server, each release keeps the env file it was built with.

export type HostEnvVar = {
  key: string
  value: string
  /** Store write-only. Defaults to whether the key is in SENSITIVE_ENV_KEYS. */
  secret?: boolean
}

export async function getHostEnvVarKeys(creds: HostingCredentials): Promise<string[]> {
  switch (creds.provider) {
    case 'vercel':
      return getVercelEnvVarKeys(creds.token, creds.siteId)
    case 'netlify':
      return getNetlifyEnvVarKeys(creds.token, creds.siteId)
    case 'server':
      return getServerEnvVarKeys(creds.token, creds.siteId)
  }
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
  switch (creds.provider) {
    case 'vercel':
      return getVercelEnvValues(creds.token, creds.siteId, keys)
    case 'netlify':
      return getNetlifyEnvValues(creds.token, creds.siteId, keys)
    case 'server':
      return getServerEnvValues(creds.token, creds.siteId, keys)
  }
}

export async function upsertHostEnvVars(creds: HostingCredentials, vars: HostEnvVar[]): Promise<void> {
  if (vars.length === 0) return
  switch (creds.provider) {
    case 'vercel':
      await upsertVercelEnvVars(
        creds.token,
        creds.siteId,
        vars.map(({ key, value, secret }) => ({
          key,
          value,
          type: (secret ?? isSensitiveEnvKey(key)) ? 'sensitive' : 'plain',
        }))
      )
      return
    case 'netlify':
      await upsertNetlifyEnvVars(creds.token, creds.siteId, vars)
      return
    case 'server':
      await upsertServerEnvVars(
        creds.token,
        creds.siteId,
        vars.map(({ key, value, secret }) => ({ key, value, secret: secret ?? isSensitiveEnvKey(key) }))
      )
      return
  }
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
  switch (creds.provider) {
    case 'vercel':
      return deleteVercelEnvVars(creds.token, creds.siteId, keys)
    case 'netlify':
      return deleteNetlifyEnvVars(creds.token, creds.siteId, keys)
    case 'server':
      return deleteServerEnvVars(creds.token, creds.siteId, keys)
  }
}
