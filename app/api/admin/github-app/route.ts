import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getGithubConnectionStatus, installRepoWriteProblem } from '@/lib/github/client'
import { errorResponse } from '@/lib/utils'
import { isEncryptionKeyUsable, rawCurrentEnvKey } from '@/lib/crypto/keyring'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  // Used by both the config and modules settings pages — either permission
  // is enough to view the GitHub App connection status.
  const [canConfig, canModules] = await Promise.all([
    hasPermission(user, 'config.manage'),
    hasPermission(user, 'modules.manage'),
  ])
  if (!canConfig && !canModules) return errorResponse('Forbidden', 403)

  const encryptionKeySet = rawCurrentEnvKey() !== null || isEncryptionKeyUsable()
  const encryptionKeyValid = isEncryptionKeyUsable()
  const hasPat = !!process.env.GITHUB_API_TOKEN

  // "Connected" means the credentials can actually be used, not merely that a row
  // is sitting in the table. A site restored from another install's backup has the
  // row but not the key that encrypted it, and reporting that as connected is how
  // an owner ends up staring at "Unsupported state or unable to authenticate data"
  // on the update button - see lib/github/client.ts.
  let state: 'none' | 'unreadable' | 'not-installed' | 'ready' = 'none'
  let appSlug: string | null = null
  let installationAccount: string | null = null
  // Set when the App is connected but cannot write to this site's repo - not installed
  // on it, or Contents left at read-only. Reads keep working (a public repo reads with
  // anything), so without this the first sign is a failed update.
  let writeProblem: string | null = null

  if (encryptionKeyValid) {
    try {
      const status = await getGithubConnectionStatus()
      state = status.state
      appSlug = status.appSlug
      installationAccount = status.installationAccount
      if (state === 'ready') writeProblem = await installRepoWriteProblem()
    } catch {
      // DB not reachable — return defaults
    }
  }

  return NextResponse.json({
    encryptionKeySet,
    encryptionKeyValid,
    connected: state === 'ready' || state === 'not-installed',
    // A connection saved by a different install. Usable by nobody here; the owner
    // has to connect a GitHub App of their own.
    unreadable: state === 'unreadable',
    appSlug,
    installationAccount,
    hasInstallation: state === 'ready',
    writeProblem,
    hasPat,
  })
}
