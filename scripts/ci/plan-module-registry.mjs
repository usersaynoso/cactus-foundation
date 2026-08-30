/**
 * Decides the modules.json a module's build gate builds against.
 *
 * Pure so the decision can be tested without a checkout: the CLI next door does
 * the reading and writing. See compose-module-registry.mjs for why the candidate
 * carries no version and why nothing beyond requiresModules is added.
 */

// `requiresModules` entries are `{ name, minVersion }` objects in every manifest
// that has one, but the field has carried bare strings before and a hand-written
// manifest may still. Both mean the same thing to a build.
function normaliseRequirement(entry) {
  if (typeof entry === 'string') return { name: entry, minVersion: undefined }
  return { name: entry?.name, minVersion: entry?.minVersion }
}

// Tag comparison, numeric segment by numeric segment, tolerating the leading 'v'
// core's registry uses and the bare form manifests write. Not a full semver
// implementation and does not need to be: module tags are v<major>.<minor>.<patch>.
function compareTags(a, b) {
  const parts = (v) => String(v).replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const [pa, pb] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

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
  for (const requirement of manifest.requiresModules ?? []) {
    const { name: required, minVersion } = normaliseRequirement(requirement)
    const entry = required ? byName.get(required) : undefined
    if (!entry) {
      missing.push(required ?? JSON.stringify(requirement))
      continue
    }
    // minVersion is a floor the candidate declares it needs. Core's pin is normally
    // well above it, but a sibling core has yet to catch up on would otherwise be
    // built at a version the candidate has already been written against - a red
    // gate whose message points at the wrong module entirely.
    const version =
      minVersion && compareTags(minVersion, entry.version) > 0 ? `v${String(minVersion).replace(/^v/, '')}` : entry.version
    entries.push({ name: entry.name, repoUrl: entry.repoUrl, version })
  }

  if (missing.length > 0) {
    throw new Error(
      `requiresModules names ${missing.join(', ')}, which core's registry does not know. ` +
      `Either the name is wrong in cactus.module.json, or core has yet to learn the module.`
    )
  }

  return { modules: entries }
}
