-- Remember the addresses a media item used to live at.
--
-- Optimise, resize, crop, replace, rename, move and dedupe all give an item a new
-- storage key and url while it keeps its identity. Core rewrites the references it
-- can reach at that moment; it cannot reach a reference written afterwards against
-- a url captured beforehand - an editor screen opened before the optimise and
-- saved after it. That reference names an address nothing answers to, so the
-- picture 404s and, worse, the item behind it reads as unreferenced and is offered
-- up in the library's "Unused" tile.
--
-- With the old addresses kept, a stale reference still counts as a reference, and
-- a module about to store a url can ask what that url resolves to now.
--
-- Additive and idempotent: a fresh install gets this from the init migration, an
-- existing one from here on its next update. No backfill is possible - the moves
-- that already happened left no trace.
CREATE TABLE IF NOT EXISTS "MediaFormerAddress" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFormerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MediaFormerAddress_mediaId_idx" ON "MediaFormerAddress"("mediaId");
CREATE INDEX IF NOT EXISTS "MediaFormerAddress_url_idx" ON "MediaFormerAddress"("url");
CREATE INDEX IF NOT EXISTS "MediaFormerAddress_key_idx" ON "MediaFormerAddress"("key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MediaFormerAddress_mediaId_fkey'
  ) THEN
    ALTER TABLE "MediaFormerAddress"
      ADD CONSTRAINT "MediaFormerAddress_mediaId_fkey"
      FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
