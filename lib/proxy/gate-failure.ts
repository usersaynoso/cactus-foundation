// Whether a failed first-run read means "never set up" (show the wizard) rather
// than "database unreachable" (answer 503).
//
// Two failures mean genuinely unconfigured, both of them first-run states the
// wizard exists to get a site out of:
//   - no DATABASE_URL at all - nothing has been provisioned yet;
//   - a connection that works but has no schema behind it - the wizard has
//     written the connection string and the migration runs on the next deploy.
// Anything else (refused, timed out, pool exhausted, server restarted) is an
// outage on a site that is already set up, and the wizard is the last thing it
// should be showing.
//
// Its own import-free file because two places need the Prisma-error reading:
// lib/proxy/data.ts on the Node proxy, and the Netlify proxy's data route, which
// must not import lib/proxy/data (that path is aliased on Netlify builds).
export function prismaGateFailureMeansUnconfigured(err: unknown): boolean {
  if (!process.env.DATABASE_URL?.trim()) return true
  const code = (err as { code?: unknown } | null)?.code
  // P2021 table does not exist, P2022 column does not exist.
  if (code === 'P2021' || code === 'P2022') return true
  const message = err instanceof Error ? err.message : ''
  return /does not exist in the current database|relation "[^"]*" does not exist/i.test(message)
}
