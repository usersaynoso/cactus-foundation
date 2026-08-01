-- Optional per-notification action-button label (falls back to the bell's
-- per-type default when null). Lets an alert's button say what clicking it
-- actually does, e.g. the search module's "Build the index".
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "actionLabel" TEXT;
