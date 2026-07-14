-- Module.layoutsSeededAt: records the one time a module's default layouts were
-- stamped, so a later *update* redeploy (which lands on the same code path as the
-- install) cannot re-mint layouts the owner has since deleted.

ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "layoutsSeededAt" TIMESTAMP(3);

-- Existing installs have already had whatever layouts they were ever going to get:
-- the old seeder stamped every module's publishByDefault template at setup time,
-- whether or not the module was installed. Backfill those rows as seeded so the
-- first deploy after this update does not seed them a second time.
--
-- Only modules that have actually been live in a build are backfilled. A module
-- still mid-install (pending_install / deploying / pending_deploy) or one whose
-- install failed has never had its code in a build, so it has no layouts yet and
-- must stay NULL - that is what tells markModulesDeploySucceeded() to seed it when
-- its deploy finally lands.
UPDATE "Module"
   SET "layoutsSeededAt" = "installedAt"
 WHERE "layoutsSeededAt" IS NULL
   AND "status" IN ('active', 'inactive', 'update_available');
