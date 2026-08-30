/**
 * Decides the modules.json a module's build gate builds against.
 *
 * Pure so the decision can be tested without a checkout: the CLI next door does
 * the reading and writing. See compose-module-registry.mjs for why the candidate
 * carries no version and why nothing beyond requiresModules is added.
 */

export function planModuleRegistry({ manifest, coreRegistry, candidateRepoUrl }) {
  const name = manifest?.name
  if (!name) throw new Error('cactus.module.json has no "name"')

  const byName = new Map((coreRegistry?.modules ?? []).map((m) => [m.name, m]))

  // Core's committed registry is the only place a module NAME maps to a repo URL.
  // A module core has never heard of (a new one, mid-review) falls back to the
  // repo the gate is running in.
  const repoUrl = byName.get(name)?.repoUrl ?? candidateRepoUrl
  if (!repoUrl) {
    throw new Error(
      `"${name}" is not in core's registry and no candidate repo URL was given. ` +
      `Add the module to core's modules.json, or pass CANDIDATE_REPO_URL.`
    )
  }

  // No `version`: the directory is already on disk at the commit under test and
  // checkout-modules keeps it. A version here would be a lie about what was built.
  const entries = [{ name, repoUrl }]

  const missing = []
  for (const required of manifest.requiresModules ?? []) {
    const entry = byName.get(required)
    if (!entry) {
      missing.push(required)
      continue
    }
    entries.push({ name: entry.name, repoUrl: entry.repoUrl, version: entry.version })
  }

  if (missing.length > 0) {
    throw new Error(
      `requiresModules names ${missing.join(', ')}, which core's registry does not know. ` +
      `Either the name is wrong in cactus.module.json, or core has yet to learn the module.`
    )
  }

  return { modules: entries }
}
