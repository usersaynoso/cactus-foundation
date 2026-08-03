-- Links a member account to the staff account it belongs to, so a signed-in
-- site admin lands in the member area as themselves instead of being asked to
-- sign in again. Nullable and unique: at most one member per staff user, none
-- for ordinary members. SET NULL on delete so removing a staff account leaves
-- the member-side history (orders, activity) intact.
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Member_userId_key" ON "Member"("userId");

DO $$
BEGIN
  ALTER TABLE "Member"
    ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
