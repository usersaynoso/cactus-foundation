-- SiteConfig.sequenceConfig: scroll-sequence conversion presets (Fast / High
-- quality) - the engine, frames-per-second and max width each preset feeds the
-- sequence worker, set in Media > Scroll sequences. Null means "use the built-in
-- defaults" (see lib/media/sequence-presets.ts), so existing installs need no
-- backfill - the first deploy after this update just gains an empty column and
-- the convert dialog keeps offering the default Fast / High-quality presets until
-- an admin saves a customisation.

ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "sequenceConfig" JSONB;
