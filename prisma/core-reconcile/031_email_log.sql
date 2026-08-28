-- EmailLog: the ledger of every email the site sends.
--
-- Brevo sends the site's mail, which means none of it ever appears in the
-- owner's own Sent folder and no mail client can be asked about it. Until now
-- "did the order confirmation actually go?" had no answer anywhere on the site.
-- This records the attempt - who it went to, what it was called, whether it
-- worked - and nothing else: no html, no text, no attachments. A row is a few
-- hundred bytes, so the table stays small enough that no site ever has to prune
-- it to keep working, and rows past SiteConfig.emailLogRetentionMonths are swept
-- nightly anyway.
--
-- messageId is the Message-ID header we set on the way out. It is what lets a
-- reply arriving weeks later be matched to the message that prompted it.

CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "ccAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "templateKey" TEXT,
    "moduleName" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailLog_sentAt_idx" ON "EmailLog"("sentAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailLog_toAddress_sentAt_idx" ON "EmailLog"("toAddress", "sentAt" DESC);
CREATE INDEX IF NOT EXISTS "EmailLog_messageId_idx" ON "EmailLog"("messageId");

-- How long those rows are kept. Twelve months matches the other retention
-- defaults and is comfortably longer than any argument about a missing email.
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "emailLogRetentionMonths" INTEGER NOT NULL DEFAULT 12;
