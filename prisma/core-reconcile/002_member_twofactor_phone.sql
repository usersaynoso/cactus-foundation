-- Core schema reconcile 002: member two-factor phone column.
--
-- Added with SMS-based member 2FA. Installs provisioned before it lack the
-- column, so the member 2FA flow throws on a frozen database. Additive,
-- idempotent — a no-op once present. See the header of 001 for the mechanism.

ALTER TABLE "MemberTwoFactor" ADD COLUMN IF NOT EXISTS "phoneEncrypted" TEXT;
