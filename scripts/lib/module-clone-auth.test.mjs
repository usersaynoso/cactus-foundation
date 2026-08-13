import { describe, it, expect } from 'vitest'
import { createCipheriv, randomBytes, generateKeyPairSync, createVerify } from 'crypto'
import {
  chooseCredentialTiers,
  isUsableEncryptionKey,
  decryptSecret,
  tryDecryptSecret,
  buildAuthHeaderArgs,
  secretsToScrub,
  scrubSecrets,
  buildAppJwt,
  resolveCloneToken,
} from './module-clone-auth.mjs'

// Mirror of lib/crypto/secrets.ts encryptSecret, so the decrypt half can be
// round-trip tested against ciphertext of exactly the stored shape.
function encryptSecret(plaintext, keyHex) {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`
}

const KEY = 'ab'.repeat(32)
const OTHER_KEY = 'cd'.repeat(32)

describe('chooseCredentialTiers', () => {
  it('prefers MODULE_CLONE_TOKEN above everything', () => {
    expect(chooseCredentialTiers({
      MODULE_CLONE_TOKEN: 't', DATABASE_URL: 'postgres://x', ENCRYPTION_KEY: KEY, GITHUB_API_TOKEN: 'p',
    })).toEqual(['env-token', 'github-app', 'github-pat'])
  })

  it('offers the app tier only with a database and a usable key', () => {
    expect(chooseCredentialTiers({ DATABASE_URL: 'postgres://x', ENCRYPTION_KEY: KEY })).toEqual(['github-app'])
    expect(chooseCredentialTiers({ DATABASE_URL: 'postgres://x' })).toEqual([])
    expect(chooseCredentialTiers({ DATABASE_URL: 'postgres://x', ENCRYPTION_KEY: 'short' })).toEqual([])
    expect(chooseCredentialTiers({ ENCRYPTION_KEY: KEY })).toEqual([])
  })

  it('falls back to GITHUB_API_TOKEN alone', () => {
    expect(chooseCredentialTiers({ GITHUB_API_TOKEN: 'p' })).toEqual(['github-pat'])
  })

  it('returns nothing for a bare environment', () => {
    expect(chooseCredentialTiers({})).toEqual([])
  })
})

describe('isUsableEncryptionKey', () => {
  it('accepts a 64-char hex string and nothing else', () => {
    expect(isUsableEncryptionKey(KEY)).toBe(true)
    expect(isUsableEncryptionKey(undefined)).toBe(false)
    expect(isUsableEncryptionKey('xyz')).toBe(false)
    expect(isUsableEncryptionKey('g'.repeat(64))).toBe(false)
  })
})

describe('decryptSecret', () => {
  it('round-trips ciphertext of the stored shape', () => {
    const secret = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'
    expect(decryptSecret(encryptSecret(secret, KEY), KEY)).toBe(secret)
  })

  it('tryDecryptSecret returns null for a wrong key, malformed input, or no key', () => {
    const encrypted = encryptSecret('secret', KEY)
    expect(tryDecryptSecret(encrypted, OTHER_KEY)).toBeNull()
    expect(tryDecryptSecret('not:even:close', KEY)).toBeNull()
    expect(tryDecryptSecret(encrypted, undefined)).toBeNull()
    expect(tryDecryptSecret(null, KEY)).toBeNull()
  })
})

describe('buildAuthHeaderArgs', () => {
  it('scopes the header to github.com and never embeds the raw token', () => {
    const args = buildAuthHeaderArgs('tok_123')
    expect(args[0]).toBe('-c')
    expect(args[1].startsWith('http.https://github.com/.extraheader=AUTHORIZATION: basic ')).toBe(true)
    expect(args[1]).not.toContain('tok_123')
    const b64 = args[1].split('basic ')[1]
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe('x-access-token:tok_123')
  })
})

describe('scrubSecrets', () => {
  it('removes the raw token and its base64 form from representative git output', () => {
    const token = 'ghs_verysecrettoken'
    const [raw, b64] = secretsToScrub(token)
    const output = [
      `fatal: unable to access 'https://github.com/o/r/': The requested URL returned error: 403`,
      `trace: header AUTHORIZATION: basic ${b64}`,
      `remote: Invalid credentials for ${raw}`,
    ].join('\n')
    const scrubbed = scrubSecrets(output, [raw, b64])
    expect(scrubbed).not.toContain(raw)
    expect(scrubbed).not.toContain(b64)
    expect(scrubbed).toContain('[redacted]')
  })

  it('returns output with no secret unchanged', () => {
    const text = 'fatal: repository not found'
    expect(scrubSecrets(text, secretsToScrub('tok'))).toBe(text)
  })
})

describe('buildAppJwt', () => {
  it('produces a verifiable RS256 JWT with the right claims', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const now = 1_700_000_000
    const jwt = buildAppJwt('12345', pem, now)
    const [header, payload, signature] = jwt.split('.')

    const decode = (part) => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decode(payload)).toEqual({ iat: now - 60, exp: now + 540, iss: '12345' })

    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${payload}`)
    const sig = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    expect(verifier.verify(publicKey, sig)).toBe(true)
  })
})

describe('resolveCloneToken', () => {
  const APP_ENV = { DATABASE_URL: 'postgres://x', ENCRYPTION_KEY: KEY }

  it('returns MODULE_CLONE_TOKEN without touching the database', async () => {
    const result = await resolveCloneToken(
      { ...APP_ENV, MODULE_CLONE_TOKEN: 'override' },
      { fetchConnection: () => { throw new Error('must not be called') } },
    )
    expect(result).toEqual({ token: 'override', source: 'MODULE_CLONE_TOKEN', warnings: [] })
  })

  it('mints an app installation token from a readable connection', async () => {
    const result = await resolveCloneToken(APP_ENV, {
      fetchConnection: async () => ({
        appId: '99', installationId: '42', privateKeyEncrypted: encryptSecret('PEM', KEY),
      }),
      mintToken: async ({ appId, privateKey, installationId }) => {
        expect(appId).toBe('99')
        expect(privateKey).toBe('PEM')
        expect(installationId).toBe('42')
        return 'ghs_minted'
      },
    })
    expect(result?.token).toBe('ghs_minted')
    expect(result?.source).toBe('github-app')
  })

  it('falls through to GITHUB_API_TOKEN when the connection is unreadable', async () => {
    const result = await resolveCloneToken(
      { ...APP_ENV, GITHUB_API_TOKEN: 'pat' },
      {
        fetchConnection: async () => ({
          appId: '99', installationId: '42', privateKeyEncrypted: encryptSecret('PEM', OTHER_KEY),
        }),
      },
    )
    expect(result?.token).toBe('pat')
    expect(result?.source).toBe('GITHUB_API_TOKEN')
    expect(result?.warnings.length).toBe(1)
  })

  it('falls through when the database is unreachable, and never throws', async () => {
    const result = await resolveCloneToken(
      { ...APP_ENV, GITHUB_API_TOKEN: 'pat' },
      { fetchConnection: async () => { throw new Error('connection refused') } },
    )
    expect(result?.source).toBe('GITHUB_API_TOKEN')
  })

  it('returns null for a bare environment', async () => {
    expect(await resolveCloneToken({}, {})).toBeNull()
  })

  it('returns null when the app tier fails and nothing else is set', async () => {
    const result = await resolveCloneToken(APP_ENV, {
      fetchConnection: async () => null,
    })
    expect(result).toBeNull()
  })
})
