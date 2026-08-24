-- Member.organisation: the company, school or practice a member buys on behalf
-- of. It used to be asked for as part of the delivery address at checkout, which
-- put it in the wrong place twice over - it was repeated on every saved address,
-- and it described the person rather than the door a parcel goes to. It now sits
-- with the member's name, on the account and directly under the name box at
-- checkout.
--
-- Nullable with no default, so existing members simply have nothing in it until
-- they fill it in. Nothing to backfill here: what earlier orders carried lives
-- on those orders, and the shop module's own reconcile moves it across.

ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "organisation" TEXT;
