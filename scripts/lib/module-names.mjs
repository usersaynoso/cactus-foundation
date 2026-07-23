import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// The list of modules the generators are allowed to wire into the build.
//
// This used to be a plain directory listing of /modules, which trusts whatever
// happens to be on disk. A module that has been uninstalled - or removed from
// modules.json - leaves its checkout behind, and a directory listing carries on
// wiring it in: its routes, settings tabs and Puck blocks all reappear in the
// generated files, for a module whose database tables may never have been
// created. On Vercel that cannot bite (a build starts from a fresh clone and
// /modules is gitignored, so only registry entries are ever cloned), but locally
// a stale directory silently resurrects a module the owner thought was gone.
//
// So: the registry is the source of truth, and the directory only says whether
// the code is actually present to import. A directory with no registry entry is
// ignored rather than deleted - nobody's uncommitted work gets thrown away to
// tidy a build list.
export function getModuleNames(rootDir) {
  const modulesDir = join(rootDir, 'modules')
  if (!existsSync(modulesDir)) return []

  const onDisk = readdirSync(modulesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const registryPath = join(rootDir, 'modules.json')
  if (!existsSync(registryPath)) {
    // No registry at all: fall back to the directory, which is the historical
    // behaviour and the right answer for a checkout that never had one.
    return onDisk.sort()
  }

  let registered
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8'))
    registered = new Set((parsed.modules ?? []).map((m) => m.name))
  } catch {
    // A malformed registry must not silently drop every module and produce an
    // empty, "successful" build. Fall back loudly to the directory instead.
    console.warn('[generate] modules.json could not be read - falling back to the directory listing')
    return onDisk.sort()
  }

  const skipped = onDisk.filter((name) => !registered.has(name))
  if (skipped.length > 0) {
    console.log(`[generate] ignoring ${skipped.length} module dir(s) not in modules.json: ${skipped.join(', ')}`)
  }

  return onDisk.filter((name) => registered.has(name)).sort()
}
