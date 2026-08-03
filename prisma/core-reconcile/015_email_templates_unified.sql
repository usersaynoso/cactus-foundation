-- Every email on the site now lives in one registry and one editor: core's own
-- member/auth/system copy, plus whatever the installed modules declare. Three
-- things change on the EmailTemplate table, which until now held member
-- overrides only.
--
-- 1. subject/bodyHtml become nullable. A row used to mean "the admin has
--    rewritten this email", and resetting to default deleted it. A row now also
--    carries the wrapper choice and the on/off switch, so reset has to be able
--    to null the copy without throwing those away.
-- 2. wrapperLayoutId: which emailWrapper Layout dresses this particular email.
--    Null means "whichever wrapper is the site default". No foreign key on
--    purpose - deleting a wrapper design must fall back to the default, not
--    cascade away someone's rewritten order confirmation.
-- 3. isActive: the on/off switch for non-transactional emails. Existing rows are
--    on, which is what they were before the column existed.
--
-- Idempotent throughout: this file re-runs on every deploy.

ALTER TABLE "EmailTemplate" ALTER COLUMN "subject" DROP NOT NULL;
ALTER TABLE "EmailTemplate" ALTER COLUMN "bodyHtml" DROP NOT NULL;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "wrapperLayoutId" TEXT;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- The permission that guards the editor was 'members.email-templates' back when
-- the editor only covered member emails. It covers the shop's order emails and
-- everything else now, so it is renamed rather than left describing a third of
-- what it does. Roles that had the old key keep the access they were granted.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Permission" WHERE "key" = 'members.email-templates') THEN
    INSERT INTO "Permission" ("key", "description")
    VALUES ('emails.templates', 'Edit email templates and wrapper designs')
    ON CONFLICT ("key") DO NOTHING;

    UPDATE "RolePermission"
       SET "permissionKey" = 'emails.templates'
     WHERE "permissionKey" = 'members.email-templates'
       AND NOT EXISTS (
         SELECT 1 FROM "RolePermission" existing
          WHERE existing."roleId" = "RolePermission"."roleId"
            AND existing."permissionKey" = 'emails.templates'
       );

    DELETE FROM "RolePermission" WHERE "permissionKey" = 'members.email-templates';
    DELETE FROM "Permission" WHERE "key" = 'members.email-templates';
  END IF;
END $$;
