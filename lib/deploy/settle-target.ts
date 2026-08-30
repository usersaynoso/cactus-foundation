// Which deployment a settle-before-write should ask about.
//
// Same precedence the Modules page's own status check uses: the module rows carry
// the stronger record (Module.deployId is cleared only when a row is genuinely
// reconciled), and SiteConfig.pendingRedeployId is the fallback for rows queued by
// an older build that never learned an id of its own - it self-expires after four
// minutes, which is shorter than a slow build takes.
//
// Deliberately IO-free so the precedence is testable without Vercel or Prisma.
export function trackedIdForSettle(
  rows: { deployId: string | null }[],
  siteMarker: string | null | undefined
): string | null | undefined {
  return rows.find((r) => r.deployId && r.deployId !== 'pending')?.deployId ?? siteMarker
}
