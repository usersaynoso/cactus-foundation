-- Email changes are no longer applied to User.email the moment they are asked
-- for. The requested address is parked on the challenge row and only moves onto
-- the account once a code sent to that address has been confirmed, so a mistyped
-- or attacker-supplied address cannot take over the account or inherit the
-- existing emailVerifiedAt marker.
--
-- Nullable, so existing rows need no backfill: every challenge that is not an
-- email_change simply leaves it NULL.
ALTER TABLE "EmailChallenge" ADD COLUMN IF NOT EXISTS "pendingEmail" TEXT;
