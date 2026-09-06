import { getSiteConfig } from '@/lib/config/site'

/** The platform's own answer when a site has never been asked. British, like
 *  the rest of the defaults a fresh install starts with. */
export const DEFAULT_DIALLING_CODE = '+44'

// Which country a phone number typed without one belongs to, from Settings >
// General. Alone in its own file for the same reason `timezone.server.ts` is:
// it reaches the database, so anything importing it is server-only from that
// point on - and the arithmetic in `lib/phone.ts` is wanted in the browser too,
// where a box can tidy a number up as somebody leaves it.
export async function siteDiallingCode(): Promise<string> {
  const config = await getSiteConfig().catch(() => null)
  const code = config?.diallingCode?.trim()
  return code ? code : DEFAULT_DIALLING_CODE
}
