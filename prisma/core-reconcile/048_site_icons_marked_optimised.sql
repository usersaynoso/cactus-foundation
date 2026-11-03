-- 048 - Site icons are marked already optimised.
--
-- The favicon, app icon and every generated rendition are exact-size PNGs on
-- purpose (the icon route now redraws whatever is set into the right format, see
-- lib/config/favicon-variants.ts), and the media optimiser no longer re-encodes
-- them. This marks the icons an existing install already has, so the media
-- library stops listing them as needing optimising. New icons are marked as they
-- are generated or saved.
--
-- Data only, no schema change. Idempotent: it only ever sets the flag to true on
-- raster images that are in use as site icons, and a second run changes nothing.
UPDATE "Media" m
SET "optimised" = true
FROM "SiteConfig" c
WHERE c."id" = 'singleton'
  AND m."optimised" = false
  AND m."mimeType" LIKE 'image/%'
  AND m."mimeType" <> 'image/svg+xml'
  AND m."id" IN (
    c."faviconMediaId",
    c."faviconDarkMediaId",
    c."appIconMediaId",
    c."favicon16MediaId",
    c."favicon32MediaId",
    c."appleTouchIconMediaId",
    c."webManifest192MediaId",
    c."webManifest512MediaId"
  );
