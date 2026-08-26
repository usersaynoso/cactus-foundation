-- Module.lastFailedVersion and Module.deployId: the two things a deploy has to
-- remember about a module, and used to forget.
--
-- lastFailedVersion. modules.json is committed BEFORE the build runs, so an update
-- whose build fails leaves the repository pinned to a version that cannot build.
-- The database is rolled back to the last good version, but pin-floor - which
-- exists so a pin never moves backwards - then declines to lower the repo pin, and
-- correctly, because it cannot tell a rollback from database drift. The result was
-- a site that could deploy nothing at all: every later build, of core or any other
-- module or a settings change, kept the broken pin and failed identically, until
-- the module's author happened to publish a higher version. Recording the tag that
-- failed is what lets pin-floor make the single exception it should.
--
-- deployId. Which Vercel deployment a module in 'deploying' is actually waiting on.
-- Reconcile had no per-module answer to that and leaned on
-- SiteConfig.pendingRedeployId, which doubles as the admin's live status marker and
-- self-expires after four minutes - shorter than a slow build. Once expired, the
-- status lookup fell through to "newest deployment on the project", so an unrelated
-- build could promote a pendingVersion whose code was never deployed, or roll back
-- an update that was fine.
--
-- Both nullable, so this lands mid-flight harmlessly: a module with no deployId is
-- treated exactly as before, and no lastFailedVersion means no exception is made.

ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "lastFailedVersion" TEXT;
ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "deployId" TEXT;
