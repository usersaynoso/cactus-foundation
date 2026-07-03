// Pure, unit-testable matching logic for proxy.ts's site-wide members-only
// mode and module-declared route tiers (MEMBERS_SPEC.md Phase 8). Kept free
// of any I/O so the matching rules themselves can be reasoned about/tested
// in isolation from the session/DB lookups that surround them in proxy.ts.

export type RouteTier = 'PUBLIC' | 'MEMBER' | 'TRUSTED_MEMBER'

function normalizePrefix(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function matchesPrefix(pathname: string, rawPrefix: string): boolean {
  const prefix = normalizePrefix(rawPrefix)
  if (prefix === '/') return true
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// siteWideMembersOnlyExceptions - any exact/prefix match excepts the path
// from the members-only gate entirely.
export function isPathExcepted(pathname: string, exceptions: string[]): boolean {
  return exceptions.some((raw) => raw.trim() !== '' && matchesPrefix(pathname, raw))
}

// Longest matching prefix wins (most specific module rule takes priority);
// no match = PUBLIC (the implicit default for anything a module hasn't
// declared a tier for).
export function resolveRouteTier(
  pathname: string,
  routeTiers: Array<{ pathPrefix: string; tier: RouteTier }>
): RouteTier {
  let best: { prefix: string; tier: RouteTier } | null = null
  for (const rule of routeTiers) {
    if (!matchesPrefix(pathname, rule.pathPrefix)) continue
    const prefix = normalizePrefix(rule.pathPrefix)
    if (!best || prefix.length > best.prefix.length) {
      best = { prefix, tier: rule.tier }
    }
  }
  return best?.tier ?? 'PUBLIC'
}
