import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { isEncryptionKeyUsable, tryDecryptSecret } from '@/lib/crypto/secrets'

// A GithubAppConnection row is worth exactly nothing unless this install's
// ENCRYPTION_KEY can read the private key inside it - and there is a perfectly
// ordinary way for it not to be able to: restore a backup onto a fresh install
// and the row arrives without the key that encrypted it, because setup mints a
// new key per site and a backup (rightly) does not carry the old one.
//
// So nothing here reads "a row exists" as "GitHub is connected". Everything
// tries the decryption first, and an unreadable connection is reported as what
// it is - rather than letting OpenSSL's "Unsupported state or unable to
// authenticate data" travel all the way to a site owner who was only trying to
// press Update.

export type GithubConnectionState =
  // No connection saved at all.
  | 'none'
  // A connection is saved, but this site's key cannot read it: it belongs to the
  // install that made the backup. The owner needs one of their own.
  | 'unreadable'
  // Readable, but the app was never installed on a GitHub account.
  | 'not-installed'
  | 'ready'

type Connection = {
  state: GithubConnectionState
  appId: string | null
  appSlug: string | null
  installationId: string | null
  installationAccount: string | null
  privateKey: string | null
}

const NO_CONNECTION: Connection = {
  state: 'none',
  appId: null,
  appSlug: null,
  installationId: null,
  installationAccount: null,
  privateKey: null,
}

async function loadConnection(): Promise<Connection> {
  if (!isEncryptionKeyUsable()) return NO_CONNECTION
  const { prisma } = await import('@/lib/db/prisma')
  const conn = await prisma.githubAppConnection.findFirst()
  if (!conn) return NO_CONNECTION

  const base = {
    appId: conn.appId,
    appSlug: conn.appSlug,
    installationId: conn.installationId,
    installationAccount: conn.installationAccount,
  }
  const privateKey = tryDecryptSecret(conn.privateKeyEncrypted)
  if (!privateKey) return { ...base, state: 'unreadable', privateKey: null }
  if (!conn.installationId) return { ...base, state: 'not-installed', privateKey }
  return { ...base, state: 'ready', privateKey }
}

/** Connection status for the admin UI. Never returns anything secret. */
export async function getGithubConnectionStatus(): Promise<{
  state: GithubConnectionState
  appSlug: string | null
  installationAccount: string | null
}> {
  const conn = await loadConnection()
  return {
    state: conn.state,
    appSlug: conn.appSlug,
    installationAccount: conn.installationAccount,
  }
}

function notConfigured(state: GithubConnectionState): Error {
  if (state === 'unreadable') {
    return new Error(
      'This site has a GitHub App connection saved, but it was set up on a different site and cannot be ' +
        'used here. Disconnect it under Settings, Integrations, then connect a GitHub App for this site.',
    )
  }
  if (state === 'not-installed') {
    return new Error(
      'The GitHub App has been created but not installed on an account yet. Finish the installation ' +
        'under Settings, Integrations.',
    )
  }
  return new Error('GitHub is not connected. Connect a GitHub App under Settings, Integrations.')
}

// Returns an authenticated Octokit client.
// Resolution order:
//   1. GitHub App installation token (a connection this site can actually read)
//   2. GITHUB_API_TOKEN personal access token
//   3. throws — caller should treat as "not configured"
export async function getGithubClient(): Promise<Octokit> {
  const conn = await loadConnection()

  if (conn.state === 'ready' && conn.appId && conn.privateKey && conn.installationId) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: conn.appId,
        privateKey: conn.privateKey,
        installationId: conn.installationId,
      },
    })
  }

  if (process.env.GITHUB_API_TOKEN) {
    return new Octokit({ auth: process.env.GITHUB_API_TOKEN })
  }

  throw notConfigured(conn.state)
}

// Returns a bearer token string for use in raw fetch() calls (e.g. manifest.ts).
// Returns null if GitHub is not configured - or is "configured" with a connection
// this install cannot read, which comes to the same thing.
export async function getGithubToken(): Promise<string | null> {
  const conn = await loadConnection()

  if (conn.state === 'ready' && conn.appId && conn.privateKey && conn.installationId) {
    const auth = createAppAuth({
      appId: conn.appId,
      privateKey: conn.privateKey,
      installationId: conn.installationId,
    })
    const result = (await auth({ type: 'installation' })) as { token: string }
    return result.token
  }

  return process.env.GITHUB_API_TOKEN ?? null
}

// Returns an app-level Octokit (JWT auth, not installation token).
// Used for app-level API calls like GET /app/installations/{id}.
export function getAppOctokit(appId: string, privateKey: string): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  })
}
