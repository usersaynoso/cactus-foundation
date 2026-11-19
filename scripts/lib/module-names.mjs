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

  for (const name of getLocalModuleNames(rootDir)) registered.add(name)

  const skipped = onDisk.filter((name) => !registered.has(name))
  if (skipped.length > 0) {
    console.log(`[generate] ignoring ${skipped.length} module dir(s) not in modules.json: ${skipped.join(', ')}`)
  }

  return onDisk.filter((name) => registered.has(name)).sort()
}

// modules.local.json: extra module names for THIS checkout only, for working on
// a module that is not (or not yet) in modules.json - a private one, say -
// without editing the tracked registry and risking that edit being committed.
// Same shape as modules.json, and only `name` is read:
//
//   { "modules": [{ "name": "my-module" }] }
//
// The file is gitignored, so it never reaches a commit, a release or an install.
// It only widens what the generators wire from code already on disk under
// /modules: it clones nothing (checkout-modules.mjs reads modules.json alone),
// and a listed name with no directory is ignored like any other.
//
// Any build ignores it as well: scripts/prebuild.mjs sets
// CACTUS_IGNORE_LOCAL_MODULES=1 for everything it runs, so what a build wires
// is exactly what modules.json says, on this machine as on Vercel. It is for
// `npm run dev` and `npm run typecheck`.
//
// No file, no change. A malformed file is reported and ignored, never allowed
// to throw the real registry away.
export const LOCAL_REGISTRY_FILE = 'modules.local.json'

export function getLocalModuleNames(rootDir, env = process.env) {
  if (env.CACTUS_IGNORE_LOCAL_MODULES === '1') return []
  const localPath = join(rootDir, LOCAL_REGISTRY_FILE)
  if (!existsSync(localPath)) return []

  let names
  try {
    const parsed = JSON.parse(readFileSync(localPath, 'utf8'))
    if (!Array.isArray(parsed?.modules)) throw new Error('no "modules" array')
    names = parsed.modules.map((m) => m?.name).filter((n) => typeof n === 'string' && n.length > 0)
  } catch (err) {
    console.warn(`[generate] ${LOCAL_REGISTRY_FILE} could not be read (${err instanceof Error ? err.message : err}) - ignoring it`)
    return []
  }
  if (names.length > 0) {
    console.log(`[generate] ${LOCAL_REGISTRY_FILE} adds module(s) for this checkout only: ${names.join(', ')}`)
  }
  return names
}
