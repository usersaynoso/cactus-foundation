-- SiteConfig.backdropLogoSurface: what the backdrop logo sits on - 'page' (the
-- page colour, which is how every site has always looked) or 'theme' (the Theme
-- colour, which then shows through every page section without a background of
-- its own). Defaults to 'page', and is only read while backdropLogoEnabled is
-- true, so gaining this column repaints precisely nothing.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "backdropLogoSurface" TEXT NOT NULL DEFAULT 'page';
