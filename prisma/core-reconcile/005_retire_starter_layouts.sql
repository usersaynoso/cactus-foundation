-- Retire the read-only starter Layout rows, and drop the isStarter column.
--
-- Starter templates are in-code data now (lib/layout/starter-templates.ts), so
-- nothing writes isStarter any more. The rows the old scheme seeded are dead
-- weight in every install's Layouts list and have to go.
--
-- This has to happen HERE, in build-time SQL, rather than in the runtime prune
-- (lib/setup/starterLayouts.ts). The reconcile runner drops the column during
-- the build; if the runtime prune were still the thing deleting these rows, it
-- would run AFTER the column was already gone, its `where: { isStarter: true }`
-- would throw, the error would be swallowed, the version stamp would never be
-- written, and the rows would survive forever. Delete first, drop second, both
-- in the same file, in that order.
--
-- The runtime prune still handles the `<id>-live`/`<id>-edited` copies the old
-- scheme spawned: deciding those needs a content comparison against the in-code
-- templates, which is not something SQL can do. It keys on row id, display
-- conditions, builderData and the created/updated timestamps - never on this
-- column - so it keeps working once the column is gone.
--
-- Idempotent: the DELETE is guarded on the column still existing, and the drops
-- are IF EXISTS. Re-running on an already-migrated install is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Layout'
      AND column_name = 'isStarter'
  ) THEN
    -- A starter row was read-only and unpublishable (the seeder forced empty
    -- display conditions and the API refused to publish one), so it renders
    -- nowhere and deleting it loses nothing.
    --
    -- The exception is a starter that somehow DOES carry display conditions:
    -- that row is rendering somebody's site right now. It is left alone, and
    -- simply becomes an ordinary layout once the flag column disappears below.
    DELETE FROM "Layout"
    WHERE "isStarter" = true
      AND (
        "displayConditions" IS NULL
        OR "displayConditions" -> 'include' IS NULL
        OR jsonb_typeof("displayConditions" -> 'include') <> 'array'
        OR jsonb_array_length("displayConditions" -> 'include') = 0
      );
  END IF;
END $$;

DROP INDEX IF EXISTS "Layout_isStarter_idx";

ALTER TABLE "Layout" DROP COLUMN IF EXISTS "isStarter";
