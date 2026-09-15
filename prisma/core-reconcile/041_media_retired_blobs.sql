-- Queue superseded media blobs for deletion instead of deleting them on the spot.
--
-- Optimise, resize, crop, replace, rename, move, dedupe and a remade shrunk copy
-- all give a picture a new address and repoint every reference to it. A page a
-- CDN saved beforehand still names the old address, though, and serves that copy
-- for the whole cache window - so deleting the old file straight away left those
-- pages full of broken pictures (seen 2026-09-14 on a live shop: every colour swatch on a
-- cached product page, for over an hour). The old file now waits here until the
-- windows have passed, and the hourly sweep deletes it.
--
-- Additive and idempotent: a fresh install gets this from the init migration, an
-- existing one from here on its next update. Nothing to backfill - blobs already
-- deleted are already gone.
CREATE TABLE IF NOT EXISTS "MediaRetiredBlob" (
    "provider" "MediaProviderType" NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deleteAfter" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaRetiredBlob_pkey" PRIMARY KEY ("provider", "key")
);

CREATE INDEX IF NOT EXISTS "MediaRetiredBlob_deleteAfter_idx" ON "MediaRetiredBlob"("deleteAfter");
