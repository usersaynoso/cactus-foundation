-- SiteConfig.pageStoreEnabled / pageStorePaths / pageStoreIgnoreTables: the
-- Settings > General > Speed controls for holding finished public pages inside the
-- running site (lib/cache/page-store). Off by default, so every install behaves as
-- it did until an owner turns it on.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageStoreEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageStorePaths" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageStoreIgnoreTables" TEXT NOT NULL DEFAULT '';
