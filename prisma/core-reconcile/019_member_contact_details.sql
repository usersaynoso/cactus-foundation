-- Member.fullName: the name the account overview now asks for, and the one the
-- shop checkout makes an order out to. Nullable with no default, so existing
-- members simply have nothing in it until they fill it in - nothing to backfill
-- and no behaviour change on the deploy that adds it.
--
-- No phone number here: a number belongs to a delivery address rather than to
-- the account, so the shop keeps one per saved address instead.

ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
