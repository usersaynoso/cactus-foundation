-- ---------------------------------------------------------------------------
-- 033 - Which layout types a module has already had seeded.
--
-- `Module.layoutsSeededAt` is a single stamp for the whole module, so a module
-- stamped on the day it was installed can never seed a layout type it gains in a
-- later update: the stamp already says "done". That is how supplier pages
-- shipped a `shopSupplier` layout type to a live site and left the owner to
-- build the layout by hand (2026-09-03).
--
-- Looking at Layout rows instead cannot work either: "this type has no rows"
-- reads the same whether the type is new or whether the owner deleted its layout
-- on purpose to fall back to the built-in page. Re-minting the latter would
-- change a live site without asking. So the seeded types are recorded.
--
-- Deliberately back-filled EMPTY rather than from existing Layout rows. The
-- first run of seedPendingModuleLayouts adopts whatever each stamped module
-- declares in that build and writes nothing, so no site gets a layout minted
-- retrospectively - only types added after this lands are ever seeded. See
-- lib/setup/starterLayouts.ts.
-- ---------------------------------------------------------------------------

ALTER TABLE "Module"
  ADD COLUMN IF NOT EXISTS "seededLayoutTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
