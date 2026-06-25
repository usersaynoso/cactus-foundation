-- Multi-provider media storage.
-- Replaces the free-text SiteConfig.imageProvider / Media.provider columns with a
-- proper MediaProviderType enum, backfills existing Backblaze rows to B2, and adds
-- the MediaMigrationJob table used to converge every Media row onto one provider.

-- CreateEnum
CREATE TYPE "MediaProviderType" AS ENUM ('B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE', 'CLOUDINARY', 'IMAGEKIT');

-- Normalise legacy values before casting Media.provider to the enum.
-- Existing installs stored the literal string 'backblaze'.
UPDATE "Media" SET "provider" = 'B2' WHERE "provider" = 'backblaze' OR "provider" NOT IN ('B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE', 'CLOUDINARY', 'IMAGEKIT');

-- AlterTable: convert Media.provider from TEXT to the enum (cast preserves backfilled values).
ALTER TABLE "Media" ALTER COLUMN "provider" TYPE "MediaProviderType" USING ("provider"::"MediaProviderType");

-- AlterTable: replace SiteConfig.imageProvider (TEXT) with mediaProvider (enum).
-- Backfill: any install that had an image provider set was on Backblaze, so map it to B2.
-- This keeps an already-working B2 install from showing as unconfigured.
ALTER TABLE "SiteConfig" ADD COLUMN "mediaProvider" "MediaProviderType";
UPDATE "SiteConfig" SET "mediaProvider" = 'B2' WHERE "imageProvider" = 'backblaze' OR "imageProvider" IS NOT NULL;
ALTER TABLE "SiteConfig" DROP COLUMN "imageProvider";

-- CreateIndex
CREATE INDEX "Media_provider_idx" ON "Media"("provider");

-- CreateTable
CREATE TABLE "MediaMigrationJob" (
    "id" TEXT NOT NULL,
    "toProvider" "MediaProviderType" NOT NULL,
    "status" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "migratedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItemIds" JSONB NOT NULL DEFAULT '[]',
    "cursor" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "MediaMigrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaMigrationJob_status_idx" ON "MediaMigrationJob"("status");

-- CreateIndex
CREATE INDEX "MediaMigrationJob_startedAt_idx" ON "MediaMigrationJob"("startedAt");
