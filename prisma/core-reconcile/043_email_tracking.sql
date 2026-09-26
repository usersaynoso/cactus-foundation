-- The site's own email tracking: opens, followed links and bounces on mail sent
-- over an ordinary SMTP account, where no mail service is counting them for us.
-- See lib/email/tracking.
--
-- Additive and idempotent: a fresh install gets all of this from the init
-- migration, an existing one from here on its next update. Nothing to backfill -
-- mail already sent was never tracked, and its log rows say so (tracked = false).

-- On by default. Settings > Emails switches it off for the whole site.
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "emailTracking" BOOLEAN NOT NULL DEFAULT true;

-- Which way each send went, and whether our own tracking was put on it.
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "transport" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "tracked" BOOLEAN NOT NULL DEFAULT false;

-- A bounce quotes the Message-ID the mail library wrote on an SMTP send, which
-- is stored as providerId; this is how it is found again.
CREATE INDEX IF NOT EXISTS "EmailLog_providerId_idx" ON "EmailLog"("providerId");

CREATE TABLE IF NOT EXISTS "EmailEvent" (
    "id" TEXT NOT NULL,
    "emailLogId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailEvent_emailLogId_occurredAt_idx" ON "EmailEvent"("emailLogId", "occurredAt");

-- A constraint has no IF NOT EXISTS, so it is added only where it is missing,
-- the same way 038 does it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailEvent_emailLogId_fkey'
  ) THEN
    ALTER TABLE "EmailEvent"
      ADD CONSTRAINT "EmailEvent_emailLogId_fkey"
      FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
