-- Let a site ask Cloudflare for its pictures at the size they are drawn.
--
-- When the media host sits behind a Cloudflare zone with Image Transformations
-- switched on, a picture can be fetched through /cdn-cgi/image/ at a given width and
-- re-encoded on the way. Measured on a live hero photograph: 45.8 KB of WebP became
-- 15.1 KB of AVIF at the width it was actually drawn at, and the re-encode was the
-- bigger half of that.
--
-- Off by default, and deliberately not detected. Transformations is a paid feature on
-- a zone the platform cannot see from here, and guessing wrong does not merely serve
-- a heavy picture - every image on the site 404s. So the owner switches it on once,
-- having checked. See lib/media/resize-url.ts and Settings > General > Speed.
--
-- Idempotent: safe on an install that already has the column.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "cloudflareImageResizing" BOOLEAN NOT NULL DEFAULT false;
