-- Member usernames may now carry capitals ("ChrisTG"), but stay unique whatever
-- the capitals, so nobody can register "christg" beside them. Every username
-- written before this was forced to lowercase, so an existing install has no
-- two names that clash and the unique index builds cleanly. The guard is there
-- anyway: if some hand-made row did collide, the update carries on without the
-- index (the application still refuses clashing names on every write) instead
-- of failing the whole update over it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Member" GROUP BY lower("username") HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "Member_username_lower_key" ON "Member"(lower("username"));
  ELSE
    RAISE NOTICE 'Member_username_lower_key not created: two members share a username in different capitals';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Member_previousUsername_lower_idx" ON "Member"(lower("previousUsername"));
