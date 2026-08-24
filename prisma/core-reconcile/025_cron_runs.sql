-- Scheduled jobs now run through core's own dispatcher rather than through a Vercel
-- cron entry each (see lib/cron/jobs.ts for the whole story - the short version is that
-- the generated vercel.json was written during the build, and Vercel reads that file
-- when it creates the deployment, so no install has ever had a cron registered).
--
-- The dispatcher needs to remember when each job last ran, because the tick it is woken
-- on is Vercel's, not the job's. One row per job path.
--
-- Idempotent: this file re-runs on every deploy.

CREATE TABLE IF NOT EXISTS "CronRun" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CronRun_path_key" ON "CronRun"("path");
