import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { decryptSecret } from '@/lib/crypto/secrets'

async function getConnection() {
  if (!process.env.ENCRYPTION_KEY) return null
  const { prisma } = await import('@/lib/db/prisma')
  return prisma.githubAppConnection.findFirst()
}

// Returns an authenticated Octokit client.
// Resolution order:
//   1. GitHub App installation token (if GithubAppConnection row has installationId)
//   2. GITHUB_API_TOKEN personal access token
//   3. throws — caller should treat as "not configured"
export async function getGithubClient(): Promise<Octokit> {
  const conn = await getConnection()

  if (conn?.installationId) {
    const privateKey = decryptSecret(conn.privateKeyEncrypted)
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: conn.appId,
        privateKey,
        installationId: conn.installationId,
      },
    })
  }

  if (process.env.GITHUB_API_TOKEN) {
    return new Octokit({ auth: process.env.GITHUB_API_TOKEN })
  }

  throw new Error(
    'GitHub is not configured. Connect a GitHub App or set GITHUB_API_TOKEN.'
  )
}

// Returns a bearer token string for use in raw fetch() calls (e.g. manifest.ts).
// Returns null if GitHub is not configured.
export async function getGithubToken(): Promise<string | null> {
  const conn = await getConnection()

  if (conn?.installationId) {
    const privateKey = decryptSecret(conn.privateKeyEncrypted)
    const auth = createAppAuth({
      appId: conn.appId,
      privateKey,
      installationId: conn.installationId,
    })
    const result = await auth({ type: 'installation' }) as { token: string }
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
