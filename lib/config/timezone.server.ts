import { getSiteConfig } from '@/lib/config/site'
import { normaliseTimezone } from '@/lib/config/timezone'

// Server components render on a machine whose clock is UTC, so any date they
// format without naming a zone comes out an hour behind for half the British
// year. Everything server-rendered that shows a clock time reads this first,
// then hands the answer to the pure formatters in `timezone.ts`.
//
// Deliberately alone in its own file. It reaches the database, so anything that
// imports it is server-only from that moment on - keeping it apart from the
// formatting means a client component can use those without inheriting Prisma.
export async function getSiteTimezone(): Promise<string> {
  const config = await getSiteConfig().catch(() => null)
  return normaliseTimezone(config?.timezone)
}
