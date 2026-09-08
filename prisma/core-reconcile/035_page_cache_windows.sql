-- Settings > General > Speed gains two numbers, both about how much of the site
-- has to be built in a function rather than handed out by a cache.
--
-- pageCacheLongTtl: a second, longer window for the addresses that make up the
-- long tail of a site's crawl surface - anything with a query string (on a shop
-- with options, that is every buyable combination of every product) and the
-- machine-read files (sitemap, robots.txt, feeds). 0 means "no second window",
-- which is exactly what every install did before this, so an existing site
-- behaves identically until its owner picks a window.
--
-- vercelEdgeTtl: how long Vercel's own edge may keep a copy on a site that has
-- a purgeable cache downstream. Previously fixed at 0, so every miss at
-- Cloudflare re-rendered the page. 60 seconds absorbs that at the cost of a
-- publish's purge taking up to a minute to be visible everywhere.
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageCacheLongTtl" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "vercelEdgeTtl" INTEGER NOT NULL DEFAULT 60;
