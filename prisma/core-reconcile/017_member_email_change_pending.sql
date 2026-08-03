-- Members can change their own sign-in address from the account area. The
-- requested address is parked on the challenge row and only moves onto the
-- Member once a code sent to that address has been confirmed, so a mistyped or
-- attacker-supplied address cannot take over the account or inherit the
-- existing emailVerified marker.
--
-- Same shape as EmailChallenge.pendingEmail (011) on the staff side. Nullable,
-- so existing rows need no backfill: every challenge that is not an
-- email_change simply leaves it NULL.
ALTER TABLE "MemberEmailChallenge" ADD COLUMN IF NOT EXISTS "pendingEmail" TEXT;
