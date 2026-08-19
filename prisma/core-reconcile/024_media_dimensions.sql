-- Media.width / Media.height / Media.pixels: the pixel size of a raster image,
-- so the library can sort by "biggest picture" rather than only by "biggest
-- file". A 40 MB photograph and a 40 MB scan of a postage stamp are the same
-- size on disc and nothing like the same size on a page.
--
-- All three nullable with no backfill here: an existing library has tens of
-- thousands of images whose bytes are in object storage, and measuring them
-- means fetching each one - not something a schema reconcile has any business
-- doing on a deploy. They fill in as images pass through the server (upload,
-- optimise, crop, resize, replace) and in bulk from the "Measure image sizes"
-- action on the media page. Until then they are null, and the dimension sorts
-- put null last.
--
-- `pixels` is width x height, kept as a column because the sort orders by it and
-- Prisma cannot order by an expression. Indexed for exactly that reason.

ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "pixels" INTEGER;

CREATE INDEX IF NOT EXISTS "Media_pixels_idx" ON "Media"("pixels");
