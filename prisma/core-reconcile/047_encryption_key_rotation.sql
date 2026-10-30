-- 047 - Encryption key rotation.
--
-- A site can now move to a new ENCRYPTION_KEY without losing a stored secret or
-- breaking a link already sent (lib/crypto/keyring.ts, lib/crypto/rotation.ts).
-- Retired keys live in "EncryptionKey", encrypted under the active key; each
-- rotation keeps a copy of every value it touched in "EncryptionKeyRotation".
--
-- derivationSaltEncrypted is left NULL here on purpose. It is seeded with the
-- key's own value - so no hashed IP or visitor id changes - by the running site,
-- the first time it boots on this version, because only the site holds the key.
--
-- Additive and idempotent: a fresh install gets all of this from the init
-- migration, an existing one from here on its next update.
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "encryptionKeyActiveFingerprint" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "encryptionKeyStagedFingerprint" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "encryptionKeySwapRequestedAt" TIMESTAMP(3);
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "derivationSaltEncrypted" TEXT;

CREATE TABLE IF NOT EXISTS "EncryptionKey" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "keyEncrypted" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EncryptionKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EncryptionKey_fingerprint_key" ON "EncryptionKey"("fingerprint");

CREATE TABLE IF NOT EXISTS "EncryptionKeyRotation" (
    "id" TEXT NOT NULL,
    "fromFingerprint" TEXT NOT NULL,
    "toFingerprint" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "backup" JSONB NOT NULL,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EncryptionKeyRotation_pkey" PRIMARY KEY ("id")
);
