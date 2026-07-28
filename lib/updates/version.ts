// Version comparison for core and module tags.
//
// Its own module purely so the pure helpers that need it (lib/modules/pin-floor.ts)
// can be imported BY lib/updates/core.ts without the two forming an import cycle.
// `compareVersions` is still re-exported from lib/updates/core, which is where every
// existing caller imports it from.

// Strips a leading "v" and compares numeric major.minor.patch.
// Returns positive if a > b, negative if a < b, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return (aMaj ?? 0) - (bMaj ?? 0)
  if (aMin !== bMin) return (aMin ?? 0) - (bMin ?? 0)
  return (aPat ?? 0) - (bPat ?? 0)
}
