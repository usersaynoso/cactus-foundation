-- Performance indexes for the hot read paths, plus removal of three indexes that
-- never earned their keep. Idempotent: the init migration already carries all of
-- this for fresh installs, so this file exists purely to bring existing installs
-- into line on their next deploy.

-- Layout had no indexes at all. resolveThemeLayout() filters on (type, status) and
-- orders by (priority, updatedAt), and runs three times on every public page render
-- (header, footer, body), so every page view was three sequential scans of the whole
-- table plus a sort.
CREATE INDEX IF NOT EXISTS "Layout_type_status_priority_updatedAt_idx"
  ON "Layout" ("type", "status", "priority", "updatedAt");

-- Module.status is filtered on every admin page load and by the proxy's module route
-- tier lookup.
CREATE INDEX IF NOT EXISTS "Module_status_idx" ON "Module" ("status");

-- These three duplicate a unique constraint on the very same column. The unique index
-- already serves every lookup, so the plain index was pure write amplification: two
-- index writes per row change instead of one, for no read benefit.
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "User_username_idx";
DROP INDEX IF EXISTS "InfoPage_slug_idx";
