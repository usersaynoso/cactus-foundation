-- Module.layoutsSeededAt was being stamped by reconciles that ran on a build with
-- no copy of the module's code (lib/deploy/reconcile.ts marks a deploy succeeded
-- from whichever instance is serving, routinely the previous build). Seeding there
-- had no templates to copy, so it wrote nothing and stamped the module as done -
-- turning "seed these once" into "never seed these". A Shop install lost its
-- product, index, checkout and confirmation layouts that way, and since those pages
-- are Puck-only with no hardcoded fallback, every product URL 404ed.
--
-- Clear the stamp on the rows that provably never seeded, so the running app seeds
-- them on the next request (lib/setup/starterLayouts.ts seedPendingModuleLayouts).
--
-- The proof is ModuleMigration.appliedAt: those rows are written by the build step
-- (scripts/run-module-migrations.mjs) with the module's code present, so the
-- earliest one is the first moment that module's code was ever in a build. A stamp
-- older than it cannot have had any template to copy. No timing heuristic, and
-- nothing is cleared for a module whose seed ran after its code landed - those
-- either have their layouts or the owner has since deleted them, and re-minting
-- deleted layouts is precisely what the stamp exists to prevent.
--
-- Modules with no migrations at all are left alone: nothing to prove it against.
-- They are also the modules with no tables, and none of them declare layout types.
UPDATE "Module" m
   SET "layoutsSeededAt" = NULL
 WHERE m."layoutsSeededAt" IS NOT NULL
   AND m."layoutsSeededAt" < (
     SELECT MIN(mm."appliedAt")
       FROM "ModuleMigration" mm
      WHERE mm."moduleName" = m."name"
   );
