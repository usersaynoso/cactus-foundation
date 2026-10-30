import { prisma } from '@/lib/db/prisma'
import {
  envKeys,
  isWellFormedKey,
  rawCurrentEnvKey,
  setKeyringRefresher,
  setKeyringState,
} from './keyring'
import { encryptSecret, tryDecryptWithKey } from './secrets'
import type { SecretsDb } from './encrypted-columns'

// Reads the database half of the keyring (lib/crypto/keyring.ts): the previous
// keys, which key the data is under, and the stable id salt. Called once at boot
// from instrumentation.ts, after a rotation by the route that ran it, and every
// few minutes thereafter by the keyring itself.

// Everything in the database is under the active key, which is always one of the
// two the host gives this deployment, so those two are all it takes to open it.
function openWithEnvKeys(value: string | null | undefined): string | null {
  if (!value) return null
  const { current, next } = envKeys()
  for (const key of [next, current]) {
    if (!key) continue
    const plain = tryDecryptWithKey(value, key)
    if (plain !== null) return plain
  }
  return null
}

export async function loadKeyring(db: SecretsDb = prisma): Promise<void> {
  const [configRows, history] = await Promise.all([
    db.$queryRawUnsafe<{ active: string | null; salt: string | null }[]>(
      `SELECT "encryptionKeyActiveFingerprint" AS active, "derivationSaltEncrypted" AS salt
       FROM "SiteConfig" WHERE "id" = 'singleton'`,
    ),
    db.$queryRawUnsafe<{ keyEncrypted: string }[]>(
      `SELECT "keyEncrypted" FROM "EncryptionKey" ORDER BY "retiredAt" DESC`,
    ),
  ])
  const config = configRows[0]

  let salt = openWithEnvKeys(config?.salt)

  // First boot on a version with a salt: seed it with the key's own value, which
  // is what every hashed IP and visitor id was made from until now, so none of
  // them changes. Only on a site that has never rotated - after a rotation the
  // salt was seeded by the rotation itself - and only with a key that can seal it.
  const raw = rawCurrentEnvKey()
  if (config && !config.salt && !config.active && isWellFormedKey(raw)) {
    await db.$executeRawUnsafe(
      `UPDATE "SiteConfig" SET "derivationSaltEncrypted" = $1
       WHERE "id" = 'singleton' AND "derivationSaltEncrypted" IS NULL`,
      encryptSecret(raw),
    )
    salt = raw
  }

  setKeyringState({
    previous: history.map((h) => openWithEnvKeys(h.keyEncrypted)).filter(isWellFormedKey),
    activeFingerprint: config?.active ?? null,
    derivationSalt: salt,
  })
}

/** Load now and keep the ring refreshed. Never throws: a site with no database yet still boots. */
export async function startKeyring(): Promise<void> {
  setKeyringRefresher(() => loadKeyring())
  try {
    await loadKeyring()
  } catch {
    // Setup phase, or the database is having a moment. The ring runs on the host's
    // keys alone until the next refresh succeeds.
  }
}
