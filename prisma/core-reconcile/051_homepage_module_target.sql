-- SiteConfig.homepageModuleId / homepageEntityKind / homepageEntityId: Settings >
-- General > Homepage can now name a module's content (anything a module offers
-- through the core.menu-entity-provider extension point) instead of an info page.
-- The root URL then redirects to it. All three nullable and null by default, so
-- every install keeps exactly the homepage it has until an owner picks one.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "homepageModuleId" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "homepageEntityKind" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "homepageEntityId" TEXT;
