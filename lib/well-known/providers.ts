import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// Contract for the "core.well-known-files" extension point.
//
// Some third parties will only believe a site owns its own domain if the domain
// serves a file they name, at a path they name, under /.well-known/. Apple Pay
// is the reason this exists (Apple fetches
// /.well-known/apple-developer-merchantid-domain-association and will not follow
// a redirect to somewhere more convenient), but the arrangement is the same for
// every verification file any provider has ever asked for.
//
// The path is fixed by whoever is doing the checking, so it cannot live under
// /api/m/<module>/… where a module's own routes live. Core owns the path and
// nothing else: it knows no filenames, no providers, and no contents. A module
// that needs a file served there registers one provider, keyed by its module id,
// and hands back what it holds - which is normally something the site owner
// pasted into that module's own settings.
//
// Returns a map of path (everything after /.well-known/) to file contents. An
// empty map is the normal answer for a module whose owner has not set anything
// up yet; the route 404s when no module claims the path, which is exactly what
// the site did before this existed.
export type WellKnownFileProvider = () => Promise<Record<string, string>>

/** Every module-registered .well-known file provider, in no guaranteed order. */
export function getWellKnownFileProviders(): WellKnownFileProvider[] {
  const map = moduleExtensionPointComponents['core.well-known-files'] as
    | Record<string, WellKnownFileProvider>
    | undefined
  return map ? Object.values(map) : []
}

// The contents for one /.well-known path, or null if no module serves it.
//
// A provider that throws is skipped rather than allowed to take the request
// down with it: one module with a broken settings read must not stop another
// module's domain verification, and a 500 here reads to the verifying party as
// "this domain is broken" rather than "that file is not here".
export async function readWellKnownFile(path: string): Promise<string | null> {
  for (const provider of getWellKnownFileProviders()) {
    let files: Record<string, string>
    try {
      files = await provider()
    } catch (err) {
      console.error('[well-known] provider failed', err)
      continue
    }
    const contents = files?.[path]
    if (typeof contents === 'string' && contents.length > 0) return contents
  }
  return null
}
