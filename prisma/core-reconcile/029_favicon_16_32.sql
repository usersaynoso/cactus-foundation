-- The 16 and 32 square favicons get somewhere to live.
--
-- Branding generated 96, 180, 192 and 512 from the admin's source image and
-- nothing smaller, so a branded site's only tab-icon candidate was
-- /favicon.ico - an address ending .ico answering with PNG bytes and no `type`
-- or `sizes` on the <link>. Chrome sniffs its way through that. WebKit does
-- not, which is why Safari showed a blank tab on every page of a site whose
-- icon was reachable, decodable and correct.
--
-- Two more Media references, so the generator can produce properly sized PNGs
-- and the root layout can offer them as typed, sized candidates at .png
-- addresses. Both nullable: an install that has not re-generated its icons
-- since updating simply carries on with what it had.
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "favicon16MediaId" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN IF NOT EXISTS "favicon32MediaId" TEXT;
