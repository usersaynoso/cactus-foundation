-- Theme Builder: typed layouts + display conditions
-- Fresh-install platform — no live data to migrate.

-- Add new Layout columns
ALTER TABLE "Layout"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'infoPage',
  ADD COLUMN "displayConditions" JSONB,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Drop ModuleLayoutDefault (replaced by display conditions)
DROP TABLE IF EXISTS "ModuleLayoutDefault";

-- Remove InfoPage.layoutId (layout assignment now via display conditions)
ALTER TABLE "InfoPage" DROP CONSTRAINT IF EXISTS "InfoPage_layoutId_fkey";
ALTER TABLE "InfoPage" DROP COLUMN IF EXISTS "layoutId";

-- Remove obsolete SiteConfig columns
ALTER TABLE "SiteConfig"
  DROP COLUMN IF EXISTS "headerConfig",
  DROP COLUMN IF EXISTS "footerBuilderData",
  DROP COLUMN IF EXISTS "defaultLayoutId",
  DROP COLUMN IF EXISTS "comingSoonPageId",
  DROP COLUMN IF EXISTS "maintenancePageId";
