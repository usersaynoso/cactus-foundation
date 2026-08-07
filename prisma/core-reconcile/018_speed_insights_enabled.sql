-- SiteConfig.speedInsightsEnabled: the Settings > General switch for Vercel's
-- Speed Insights script. Defaults to true, which is exactly what every existing
-- install has been doing all along (the root layout rendered <SpeedInsights />
-- unconditionally), so the first deploy after this update gains the column and
-- behaves as it did before - the switch only does something once an admin turns
-- it off.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "speedInsightsEnabled" BOOLEAN NOT NULL DEFAULT true;
