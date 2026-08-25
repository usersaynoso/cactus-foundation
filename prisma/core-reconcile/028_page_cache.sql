-- SiteConfig.pageCacheEnabled / pageCacheTtl: the Settings > General > Speed
-- controls for serving public pages from a shared (CDN) cache.
--
-- Defaults to OFF, which is exactly what every existing install does today -
-- proxy.ts adds no Cache-Control, so Next.js keeps emitting its own
-- "private, no-cache, no-store" on dynamic pages and nothing downstream holds
-- a copy. The first deploy after this update gains the columns and behaves
-- identically; the switch only does something once an admin turns it on.
--
-- 300 seconds is the default window because it is short enough that a price or
-- an opening-hours edit is never stale for long, and long enough to absorb the
-- burst of hits that follows one page being shared.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageCacheEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "pageCacheTtl" INTEGER NOT NULL DEFAULT 300;

-- SiteConfig.behindCloudflare: whether this site's traffic is proxied through
-- Cloudflare. Defaults to false, which is the safe answer - CF-Connecting-IP is
-- a header anybody can send, and it is only believable when every request has
-- genuinely passed through Cloudflare on its way in. See lib/auth/rate-limit.ts.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "behindCloudflare" BOOLEAN NOT NULL DEFAULT false;
