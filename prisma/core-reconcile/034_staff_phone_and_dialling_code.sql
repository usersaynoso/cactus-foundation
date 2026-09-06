-- ---------------------------------------------------------------------------
-- 034 - A staff member's own phone number, and the site's dialling code.
--
-- Two halves of one job: letting somebody place a call from the site without
-- typing their own mobile number in from memory every time.
--
-- "User"."phone" is that number. Deliberately NOT encrypted, unlike
-- "smsOtpPhoneEncrypted" next to it: this one is a contact detail rather than a
-- credential. It is shown back to its owner in full so they can correct it, and
-- a column encrypted under a per-install key is unreadable after a restore into
-- a fresh site - which is a poor way to treat a number somebody typed in once.
--
-- "SiteConfig"."diallingCode" is which country a number typed without one
-- belongs to. "020 8138 0512" is a whole number to the person typing it and
-- half a number to a telephony provider; this is the missing half. Defaulted to
-- +44 to match the rest of this platform's British defaults (en-GB, DD/MM/YYYY)
-- and changed in Settings > General by anyone it does not suit.
-- ---------------------------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "SiteConfig"
  ADD COLUMN IF NOT EXISTS "diallingCode" TEXT NOT NULL DEFAULT '+44';
