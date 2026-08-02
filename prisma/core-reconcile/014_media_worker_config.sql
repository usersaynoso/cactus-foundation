-- SiteConfig.mediaWorkerConfig: settings for the off-platform media worker that
-- optimises video (the Fly.io API token and app name, set in Media > Video).
--
-- It replaces "sequenceConfig", which held the same Fly settings plus the
-- conversion knobs of the scroll-sequence converter that has since been removed.
-- The Fly half is worth carrying over - it is an API token someone pasted in -
-- so the copy below moves it across on the first deploy after this update, and
-- silently does nothing on a fresh install where the old column never existed.
--
-- The old column is deliberately NOT dropped. Dropping it would make this update
-- the one thing a rollback could not survive, for the sake of one unused nullable
-- column; it can go in its own time, once nobody is going back.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "mediaWorkerConfig" JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SiteConfig' AND column_name = 'sequenceConfig'
  ) THEN
    -- Only the `fly` key survives the move; `settings` described the sequence
    -- conversion and means nothing now. Rows that never had one are left null,
    -- which is what "use the defaults" has always looked like.
    EXECUTE $sql$
      UPDATE "SiteConfig"
         SET "mediaWorkerConfig" = jsonb_build_object('fly', "sequenceConfig"->'fly')
       WHERE "mediaWorkerConfig" IS NULL
         AND "sequenceConfig" ? 'fly'
    $sql$;
  END IF;
END $$;
