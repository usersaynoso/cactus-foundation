-- Per-job schedule overrides: the frequency the site owner picked for a scheduled job.
--
-- New in this release. Existing installs have no such table, so nothing on the Settings
-- > Schedules tab could load without it - every job would read as "default" and every
-- save would 500. Additive and idempotent, so a site that already took the change (or
-- one installed fresh from the init migration) sails past untouched.
--
-- Deliberately empty of rows: an absent row means "run it exactly as its author set
-- it", which is what every install has been doing until now. Nothing changes about any
-- site's schedule until somebody chooses otherwise.

CREATE TABLE IF NOT EXISTS "CronSchedule" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CronSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CronSchedule_path_key" ON "CronSchedule"("path");
