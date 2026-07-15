-- MenuItem.visibility: per-item audience targeting for site navigation menus
-- (Everyone / signed-in / signed-out / admins). Null-free with a PUBLIC default,
-- so existing installs need no backfill - every current item keeps rendering to
-- everyone exactly as before once this column lands. Fully idempotent: the enum
-- create is guarded, the column add is IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "MenuItemVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'GUEST', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "visibility" "MenuItemVisibility" NOT NULL DEFAULT 'PUBLIC';
