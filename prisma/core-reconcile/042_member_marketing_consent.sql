-- Standing marketing-consent preference on the account, kept in sync with the
-- shopper's most recent order by the shop module ("last order wins" - see
-- lib/members/marketing-consent.ts). Null means no preference ever expressed,
-- not "no".
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN;
