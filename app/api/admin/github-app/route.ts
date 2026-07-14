import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getGithubConnectionStatus } from '@/lib/github/client'
import { errorResponse } from '@/lib/utils'

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

  const key = process.env.ENCRYPTION_KEY ?? ''
  const encryptionKeySet = key.length > 0
  const encryptionKeyValid = key.length === 64 && /^[0-9a-fA-F]+$/.test(key)
  const hasPat = !!process.env.GITHUB_API_TOKEN

  // "Connected" means the credentials can actually be used, not merely that a row
  // is sitting in the table. A site restored from another install's backup has the
  // row but not the key that encrypted it, and reporting that as connected is how
  // an owner ends up staring at "Unsupported state or unable to authenticate data"
  // on the update button - see lib/github/client.ts.
  let state: 'none' | 'unreadable' | 'not-installed' | 'ready' = 'none'
  let appSlug: string | null = null
  let installationAccount: string | null = null

  if (encryptionKeyValid) {
    try {
      const status = await getGithubConnectionStatus()
      state = status.state
      appSlug = status.appSlug
      installationAccount = status.installationAccount
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
    hasPat,
  })
}
