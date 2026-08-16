-- Text message templates, and the SMS notification channel that goes with them.
--
-- Two additions, both no-ops on a site that never sends a text: the override
-- table behind the message editor (same shape as EmailTemplate, minus the
-- subject and the wrapper - a text is one body and nothing else), and the SMS
-- value on the notification-channel type so a member can ask for a category by
-- text as well as by email.
--
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent on its own and safe to
-- re-run; it is deliberately the first statement so a re-applied file does not
-- depend on the table half having succeeded.

ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'SMS';

CREATE TABLE IF NOT EXISTS "SmsTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsTemplate_key_key" ON "SmsTemplate"("key");
