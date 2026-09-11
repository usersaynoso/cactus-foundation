-- Find a picture's shrunk copies again, in one query.
--
-- A rendition (lib/media/renditions.ts) is filed beside its original under a name
-- derived from the original's storage key - "abc123-chair.webp" gets
-- "abc123-chair-thumb.webp". That name is how a surface drawing small pictures
-- resolves the copy it wants, and a category grid resolves several hundred of them
-- in one go on every render.
--
-- Without this index that lookup is a full scan of the media library - 33k rows on
-- the live install - on a query that runs on a page render. With it, the name
-- narrows the match to a handful and the folder settles which of them it is.
--
-- Idempotent: safe to run against an install that already has the index.

CREATE INDEX IF NOT EXISTS "Media_originalName_idx" ON "Media"("originalName");
