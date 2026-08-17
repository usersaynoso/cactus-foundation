-- DeployLock.expiresAt: when a hold stops being credible.
--
-- The install/update lock is released by the handler that took it, on success or
-- in its catch. A function hard-killed mid-push (Vercel's 60s ceiling, or OOM)
-- runs neither, so the lock was stranded and every later attempt got a 409
-- "Another install or update is in progress" until a blanket 15-minute staleness
-- rule swept it. Whoever takes the lock now stamps how long its own work could
-- legitimately run, so an abandoned lock frees in seconds instead.
--
-- Nullable on purpose: a row written by an older build carries no expiry and
-- falls back to the 15-minute rule, so this can land mid-flight harmlessly.

ALTER TABLE "DeployLock" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
