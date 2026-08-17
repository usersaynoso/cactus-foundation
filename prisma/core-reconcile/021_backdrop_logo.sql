-- SiteConfig backdrop-logo settings: the Appearance > Branding option that
-- paints the site logo once, centred, on the page colour behind every public
-- page. Defaults are "off", so an existing install gains the columns and renders
-- exactly as it did before until an admin ticks the box.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "backdropLogoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "backdropLogoScale" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "backdropLogoMode" TEXT NOT NULL DEFAULT 'auto';
