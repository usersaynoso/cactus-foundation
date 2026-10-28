import { randomBytes } from 'crypto'
import { isLocalMode } from '@/lib/config/env'
import { getHostEnvVarKeys, upsertHostEnvVar } from './env'
import { getHostingCredentials } from './provider'

// CRON_SECRET is the bearer token attached to every scheduled request (Vercel adds
// `Authorization: Bearer $CRON_SECRET` itself; on Netlify the scheduled function in
// netlify/functions/cactus-cron.mts does it), and every module cron route refuses to
// run without it. Unlike SQUARE_ACCESS_TOKEN or BREVO_API_KEY it is not a
// credential the owner has to go and fetch from a third party: it is an internal
// shared secret with no meaning outside this site, so the platform mints its own
// rather than dead-ending an install on a value it could have generated itself.
//
// Same shape as the SESSION_SECRET / ENCRYPTION_KEY fallback in
// app/api/setup/complete/route.ts: write it to the hosting project, and let the
// redeploy the caller was already about to trigger carry it into process.env.
// Nothing is lost by the running process not seeing it - a cron cannot fire
// against a deployment that no longer exists once that build lands.

export type CronSecretOutcome =
  /** Already in this deployment's environment; nothing to do. */
  | 'present'
  /** Minted and written to the hosting project; live after the next deploy. */
  | 'provisioned'
  /** Already on the hosting project - this deployment simply predates it. */
  | 'pending'
  /** Local-development mode: no hosting project to write to, and no crons either. */
  | 'skipped'
  /** No hosting credentials, or the API refused. The caller decides how loudly to care. */
  | 'unavailable'

/** True for every outcome that means a cron will authenticate once the next deploy lands. */
export function cronSecretSatisfied(outcome: CronSecretOutcome): boolean {
  return outcome !== 'unavailable'
}

export async function ensureCronSecret(): Promise<CronSecretOutcome> {
  if (process.env.CRON_SECRET) return 'present'
  if (isLocalMode()) return 'skipped'

  const creds = getHostingCredentials()
  if (!creds) return 'unavailable'

  try {
    // A previous call may have created it against a later deployment than the one
    // running this code, so absence from process.env does not mean absence from the
    // project. Overwriting would silently invalidate any cron mid-flight.
    const keys = await getHostEnvVarKeys(creds)
    if (keys.includes('CRON_SECRET')) return 'pending'

    // Stored secret (see ./sensitive-keys), so it is write-only from here
    // on: only a redeploy can ever hand the value back to the app.
    await upsertHostEnvVar(creds, 'CRON_SECRET', randomBytes(32).toString('hex'))
    return 'provisioned'
  } catch {
    return 'unavailable'
  }
}
