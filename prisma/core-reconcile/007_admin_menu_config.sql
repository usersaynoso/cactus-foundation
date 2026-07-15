-- SiteConfig.adminMenuConfig: admin sidebar customisation set in Settings >
-- Navigation (per-item order, rename and per-role visibility rules). Null means
-- "use the built-in defaults", so existing installs need no backfill - the first
-- deploy after this update just gains an empty column and the sidebar keeps
-- rendering its default order until an admin saves a customisation.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "adminMenuConfig" JSONB;
