// Build-time clone credentials for private module repos.
//
// checkout-modules.mjs runs FIRST in the prebuild (scripts/prebuild.mjs), as a
// barrier before `prisma generate` - so nothing here may rely on the generated
// Prisma client, and being plain .mjs nothing here can import the TypeScript
// helpers in lib/ either. The database is read with `pg` (the same way
// run-module-migrations.mjs already does during the build), the stored App
// private key is decrypted with node crypto mirroring lib/crypto/secrets.ts
// (aes-256-gcm, "iv_hex:tag_hex:ciphertext_hex"), and the installation token
// is minted with a hand-built RS256 JWT mirroring lib/github/client.ts.
//
// Resolution order (each tier degrades cleanly to the next):
//   1. MODULE_CLONE_TOKEN            - explicit override, no questions asked
//   2. GitHub App installation token - the no-new-secret path: the App that
//      already commits modules.json can fetch private module repos too, once
//      the owner grants it access to them
//   3. GITHUB_API_TOKEN              - the PAT-configured site's equivalent
//   4. none                          - anonymous clone, today's behaviour
//
// Nothing in this file may throw out of resolveCloneToken: a site with no
// private modules must build exactly as it did before this file existed.

import { createDecipheriv, createSign } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

export function isUsableEncryptionKey(hex) {
  return !!hex && hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)
}

// Mirror of lib/crypto/secrets.ts decryptSecret. Throws on malformed input or
// a wrong key (GCM auth failure) - callers use tryDecryptSecret.
export function decryptSecret(encrypted, keyHex) {
  const key = Buffer.from(keyHex, 'hex')
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
    throw new Error('Invalid encrypted secret: bad iv or authTag length')
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8')
}

export function tryDecryptSecret(encrypted, keyHex) {
  if (!encrypted || !isUsableEncryptionKey(keyHex)) return null
  try {
    return decryptSecret(encrypted, keyHex)
  } catch {
    return null
  }
}

// The ordered credential tiers available given the environment. Pure, so the
// tier choice is unit-testable without a database or network.
export function chooseCredentialTiers(env) {
  const tiers = []
  if (env.MODULE_CLONE_TOKEN) tiers.push('env-token')
  if (env.DATABASE_URL && isUsableEncryptionKey(env.ENCRYPTION_KEY)) tiers.push('github-app')
  if (env.GITHUB_API_TOKEN) tiers.push('github-pat')
  return tiers
}

// Git receives the credential as command-line config, never in the clone URL:
// -c config is not persisted, so modules/<name>/.git/config keeps a clean
// remote and no token is written to disk inside the deployed build. The
// http.https://github.com/.extraheader key form scopes the header to
// github.com - a header attached unconditionally would be sent to whatever
// host a repoUrl happened to name.
export function buildAuthHeaderArgs(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`]
}

// Everything a given token could appear as in captured git output: the raw
// token and the base64 basic-auth blob git was actually handed (git error text
// can echo the command line, and build logs are visible in the deployment log
// viewer).
export function secretsToScrub(token) {
  return [token, Buffer.from(`x-access-token:${token}`).toString('base64')]
}

export function scrubSecrets(text, secrets) {
  let out = text
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]')
  }
  return out
}

// Base64url without padding, as JWT requires.
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// RS256 JWT for GitHub App auth. iat backdated 60s against clock drift, 9min
// expiry (GitHub caps at 10) - same shape @octokit/auth-app produces.
export function buildAppJwt(appId, privateKeyPem, nowSeconds) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const signature = b64url(signer.sign(privateKeyPem))
  return `${header}.${payload}.${signature}`
}

export async function mintInstallationToken({ appId, privateKey, installationId, fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const jwt = buildAppJwt(appId, privateKey, nowSeconds)
  const res = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cactus-checkout-modules',
    },
  })
  if (!res.ok) throw new Error(`installation token request failed: ${res.status}`)
  const data = await res.json()
  if (!data?.token) throw new Error('installation token response carried no token')
  return data.token
}

// Reads the (single) GithubAppConnection row with pg - lazily imported so a
// machine without the dependency, or without a reachable database, degrades
// instead of crashing the build.
export async function fetchGithubAppConnection(databaseUrl) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query(
      'SELECT "appId", "installationId", "privateKeyEncrypted" FROM "GithubAppConnection" LIMIT 1'
    )
    return rows[0] ?? null
  } finally {
    await client.end()
  }
}

// The orchestrator checkout-modules.mjs calls once at startup. Returns
// { token, source } or null, plus human-readable warnings (never containing a
// secret) for the caller to log. deps is injectable for tests.
export async function resolveCloneToken(env = process.env, deps = {}) {
  const {
    fetchConnection = fetchGithubAppConnection,
    mintToken = mintInstallationToken,
  } = deps
  const warnings = []

  for (const tier of chooseCredentialTiers(env)) {
    if (tier === 'env-token') {
      return { token: env.MODULE_CLONE_TOKEN, source: 'MODULE_CLONE_TOKEN', warnings }
    }
    if (tier === 'github-app') {
      try {
        const conn = await fetchConnection(env.DATABASE_URL)
        if (!conn || !conn.installationId) continue
        const privateKey = tryDecryptSecret(conn.privateKeyEncrypted, env.ENCRYPTION_KEY)
        if (!privateKey) {
          warnings.push('GitHub App connection exists but this environment cannot decrypt it - trying the next credential')
          continue
        }
        const token = await mintToken({ appId: conn.appId, privateKey, installationId: conn.installationId })
        return { token, source: 'github-app', warnings }
      } catch (err) {
        warnings.push(`GitHub App clone credential unavailable (${err instanceof Error ? err.message : 'unknown error'}) - trying the next credential`)
      }
    }
    if (tier === 'github-pat') {
      return { token: env.GITHUB_API_TOKEN, source: 'GITHUB_API_TOKEN', warnings }
    }
  }
  return null
}
