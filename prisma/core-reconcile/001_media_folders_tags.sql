-- Core schema reconcile 001: media folders, tags, and the optimised flag.
--
-- Fresh installs get all of this from the init migration. This file exists for
-- installs provisioned before these objects were added to core: the single
-- core init migration is edited in place and never re-runs on an existing
-- database, so additive changes never reached them. `scripts/reconcile-core-schema.mjs`
-- runs every reconcile file on each deploy; every statement here is idempotent,
-- so it is a harmless no-op once an install is up to date.
--
-- Additive only. Never drop, rename, or alter existing columns here.

-- Media.originalName (added with the media library rewrite; the library query
-- selects it, so an install missing it crashes the admin media page).
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "originalName" TEXT;

-- Media.optimised (added with in-library image optimisation).
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "optimised" BOOLEAN NOT NULL DEFAULT false;

-- Media.folderId (added with media library folders).
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "folderId" TEXT;

-- Folder / Tag / MediaTag (added with media library folders and tags).
CREATE TABLE IF NOT EXISTS "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MediaTag" (
    "mediaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("mediaId", "tagId")
);

-- Indexes.
CREATE INDEX IF NOT EXISTS "Media_folderId_idx" ON "Media"("folderId");
CREATE UNIQUE INDEX IF NOT EXISTS "Folder_parentId_name_key" ON "Folder"("parentId", "name");
CREATE INDEX IF NOT EXISTS "Folder_parentId_idx" ON "Folder"("parentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name");
CREATE INDEX IF NOT EXISTS "MediaTag_tagId_idx" ON "MediaTag"("tagId");

-- Foreign keys. Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is guarded
-- by a name check against pg_constraint.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Media_folderId_fkey') THEN
        ALTER TABLE "Media" ADD CONSTRAINT "Media_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Folder_parentId_fkey') THEN
        ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MediaTag_mediaId_fkey') THEN
        ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MediaTag_tagId_fkey') THEN
        ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
