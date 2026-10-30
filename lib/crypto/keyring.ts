import { createHash, createHmac, timingSafeEqual } from 'crypto'

// The site's encryption keys, as a ring rather than a single key.
//
// ENCRYPTION_KEY used to be one variable read raw all over core and the modules:
// it encrypts stored secrets (lib/crypto/secrets.ts) and signs links and cookies
// that sit in customers' inboxes for years. That made it impossible to change -
// a new key would strand every secret and break every link already sent.
//
// The ring has three sources:
//   - ENCRYPTION_KEY       the current key on the host.
//   - ENCRYPTION_KEY_NEXT  a key being rotated to (lib/crypto/rotation.ts). Present
//                          only between staging a rotation and finishing it.
//   - previous keys        retired keys, stored in the "EncryptionKey" table
//                          encrypted under the active key, so a site that moves host
//                          carries its history with it. Loaded at boot
//                          (instrumentation.ts -> lib/crypto/keyring-loader.ts).
//
// Reading (decrypting, verifying a signature) tries every key in the ring. Writing
// (encrypting, signing) uses one ACTIVE key: ENCRYPTION_KEY, or ENCRYPTION_KEY_NEXT
// once the database says the rotation to it has committed. See the state table in
// lib/crypto/rotation.ts for why the running site never loses a secret on the way.
//
// Nothing else reads process.env.ENCRYPTION_KEY. lib/crypto/no-direct-key-reads
// .test.ts fails the build of core if anything starts to, and the rotation screen
// refuses to run while an installed module still does.

export const ENCRYPTION_KEY_VAR = 'ENCRYPTION_KEY'
export const ENCRYPTION_KEY_NEXT_VAR = 'ENCRYPTION_KEY_NEXT'

const KEY_SHAPE = /^[0-9a-fA-F]{64}$/

/** True for a 64-character hex string - the only shape a key may have. */
export function isWellFormedKey(hex: string | null | undefined): hex is string {
  return typeof hex === 'string' && KEY_SHAPE.test(hex)
}

/**
 * A short public name for a key: safe to store, show and compare, useless for
 * recovering the key. Case-folded so the same key typed in capitals is the same key.
 */
export function keyFingerprint(hex: string): string {
  return createHash('sha256').update(`cactus-encryption-key:${hex.toLowerCase()}`).digest('hex').slice(0, 16)
}

type RingState = {
  /** Retired keys, newest first. */
  previous: string[]
  /** Fingerprint of the key the stored secrets are under, per the database. */
  activeFingerprint: string | null
  /** Stable salt for pseudonymous ids (see derivationSalt). */
  derivationSalt: string | null
  loaded: boolean
}

const EMPTY: RingState = { previous: [], activeFingerprint: null, derivationSalt: null, loaded: false }

let state: RingState = { ...EMPTY }

// The database side is re-read now and then, so an instance that booted before a
// rotation (another serverless instance, say) picks up the new active key and
// history without a redeploy. The loader registers itself here rather than this
// file importing the database, which would drag Prisma into every caller.
const REFRESH_MS = 5 * 60 * 1000
let refresher: (() => Promise<void>) | null = null
let loadedAt = 0
let refreshing = false

export function setKeyringRefresher(fn: (() => Promise<void>) | null): void {
  refresher = fn
}

function maybeRefresh(): void {
  if (!refresher || refreshing || Date.now() - loadedAt < REFRESH_MS) return
  refreshing = true
  // Counted from the attempt, so a site with no database yet asks once every few
  // minutes rather than on every call.
  loadedAt = Date.now()
  void refresher()
    .catch(() => {
      // A database blip leaves the ring as it was; the next access tries again.
    })
    .finally(() => {
      refreshing = false
    })
}

/** Replace what the ring knows from the database. The loader and tests call this. */
export function setKeyringState(next: Partial<Omit<RingState, 'loaded'>>): void {
  state = {
    previous: (next.previous ?? state.previous).filter(isWellFormedKey),
    activeFingerprint: next.activeFingerprint === undefined ? state.activeFingerprint : next.activeFingerprint,
    derivationSalt: next.derivationSalt === undefined ? state.derivationSalt : next.derivationSalt,
    loaded: true,
  }
  loadedAt = Date.now()
}

/** Forget everything loaded from the database. Tests only. */
export function resetKeyringState(): void {
  state = { ...EMPTY }
  loadedAt = 0
  refresher = null
}

export function isKeyringLoaded(): boolean {
  return state.loaded
}

/** The two keys the host gives this deployment, each null unless well formed. */
export function envKeys(): { current: string | null; next: string | null } {
  const current = process.env[ENCRYPTION_KEY_VAR]
  const next = process.env[ENCRYPTION_KEY_NEXT_VAR]
  return {
    current: isWellFormedKey(current) ? current : null,
    next: isWellFormedKey(next) ? next : null,
  }
}

/**
 * The raw ENCRYPTION_KEY value exactly as the host set it, well formed or not.
 * Only for telling "not set" from "set but the wrong shape" in setup and settings
 * messages; never use it as a key.
 */
export function rawCurrentEnvKey(): string | null {
  return process.env[ENCRYPTION_KEY_VAR] || null
}

/** The key every new encryption and signature uses, or null if there is none. */
export function activeKey(): string | null {
  maybeRefresh()
  const { current, next } = envKeys()
  if (next && state.activeFingerprint === keyFingerprint(next)) return next
  return current ?? next ?? null
}

/** Every key a stored secret or signature may be under, active first, no repeats. */
export function readingKeys(): string[] {
  const { current, next } = envKeys()
  const active = activeKey()
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of [active, next, current, ...state.previous]) {
    if (!key) continue
    const folded = key.toLowerCase()
    if (seen.has(folded)) continue
    seen.add(folded)
    out.push(key)
  }
  return out
}

/** Fingerprints of every key in the ring - for refusing a "new" key we already hold. */
export function ringFingerprints(): Set<string> {
  return new Set(readingKeys().map(keyFingerprint))
}

/** True if there is a key to encrypt and sign with. */
export function isEncryptionKeyUsable(): boolean {
  return activeKey() !== null
}

// Signatures predate the keyring and never cared about the key's shape: the
// modules keyed HMAC on whatever string ENCRYPTION_KEY held. A site whose key is
// not 64 hex characters cannot encrypt (and so cannot rotate), but its links
// worked and must keep working, so signing falls back to the raw value there.
function rawFallback(): string | null {
  const raw = rawCurrentEnvKey()
  return raw && !isWellFormedKey(raw) ? raw : null
}

/** Every key a signature may have been made with: the ring, or the raw value. */
export function signatureKeys(): string[] {
  const fallback = rawFallback()
  return fallback ? [...readingKeys(), fallback] : readingKeys()
}

/**
 * The active key, for signing. Throws with `purpose` in the message when the site
 * has no key, so a module's error still says what it was trying to do.
 */
export function signingKey(purpose = 'signing'): string {
  const key = activeKey() ?? rawFallback()
  if (!key) throw new Error(`ENCRYPTION_KEY is not set - required for ${purpose}.`)
  return key
}

/** HMAC-SHA256 of `data` under the active key, keyed on the hex string as text. */
export function hmacSign(data: string, encoding: 'base64url' | 'hex' = 'base64url'): string {
  return createHmac('sha256', signingKey()).update(data).digest(encoding)
}

/**
 * True if `given` equals what `expectedFor` makes from ANY key in the ring.
 *
 * Shaped as a callback because the modules' tokens differ (base64url or hex,
 * truncated or not, a sub-key derived first): each module keeps its own recipe and
 * only stops choosing the key. Constant-time per comparison, and false rather
 * than a throw for anything malformed - a bad link is a 404, not a 500.
 */
export function verifyWithAnyKey(given: string | null | undefined, expectedFor: (key: string) => string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  let match = false
  for (const key of signatureKeys()) {
    let expected: string
    try {
      expected = expectedFor(key)
    } catch {
      continue
    }
    const b = Buffer.from(expected)
    // Every key is tried even after a match, so timing does not say which one signed.
    if (a.length === b.length && timingSafeEqual(a, b)) match = true
  }
  return match
}

/** `hmacSign`'s partner: true if `token` is the HMAC of `data` under any key in the ring. */
export function hmacVerify(data: string, token: string | null | undefined, encoding: 'base64url' | 'hex' = 'base64url'): boolean {
  return verifyWithAnyKey(token, (key) => createHmac('sha256', key).update(data).digest(encoding))
}

/**
 * A stable secret for pseudonymous ids - a hashed IP, a visitor id - that must not
 * change when the encryption key does, or every visitor would split in two.
 *
 * Stored in SiteConfig.derivationSaltEncrypted, seeded with the encryption key's
 * value as it stood before the first rotation, so no id that existed then changes.
 * Falls back to the current key when the database has not been read: exact on a
 * site that has never rotated, and on a rotated one only the moments before the
 * boot-time load (instrumentation.ts) lands.
 */
export function derivationSalt(): string | null {
  maybeRefresh()
  return state.derivationSalt ?? rawCurrentEnvKey()
}
