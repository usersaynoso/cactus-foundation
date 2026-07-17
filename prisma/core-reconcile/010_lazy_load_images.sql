-- SiteConfig.lazyLoadImages: the Settings > Media switch for lazy-loading images
-- below the fold on the public site. Defaults to true, which is what every
-- existing install has been doing all along (the blocks it governs were already
-- lazy and hardcoded), so the first deploy after this update gains the column and
-- behaves exactly as it did before - the switch only does something once an admin
-- turns it off.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "lazyLoadImages" BOOLEAN NOT NULL DEFAULT true;
