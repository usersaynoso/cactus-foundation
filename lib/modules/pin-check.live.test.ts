import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  planPinCheck,
  isPinCheckClean,
  formatPinCheckReport,
  manifestKey,
  type ModuleManifestFacts,
  type RegistryEntry,
} from './pin-check'

// The network half of the module pin check: asks GitHub for each module's latest release
// and the manifest at the tags that matter, then hands the facts to the pure planner.
//
// Gated on CHECK_MODULE_PINS=1 and deliberately NOT part of the commit gate. Two reasons:
//   1. It needs network + gh auth. In CI it would skip, and a check that skips where it
//      matters is a false pass - the backup round-trip already taught us that one.
//   2. Pin lag is not a property of the working tree. It appears when someone ELSE
//      publishes a module release, so wiring it into `npm test` would fail an unrelated
//      commit for something the committer did not do.
// The resolution logic it depends on is covered offline, with no skip, in pin-check.test.ts.
//
// Run it: npm run check:module-pins

const ENABLED = process.env.CHECK_MODULE_PINS === '1'
const rootDir = join(__dirname, '..', '..')

type GhResult = { ok: true; out: string } | { ok: false; err: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function ghOnce(args: string[]): GhResult {
  try {
    return { ok: true, out: execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  } catch (err) {
    const e = err as { stderr?: unknown; message?: unknown }
    return { ok: false, err: String(e.stderr ?? e.message ?? '').trim() }
  }
}

// A 404 is an answer - the tag or the file genuinely isn't there. Anything else (a 5xx, a
// secondary rate limit, a dropped connection) is the network being unreliable, and one
// blip must not fail the check: a first run of this suite failed on exactly that, reading
// a manifest that was plainly there by hand a second later.
function isDefinitive(err: string): boolean {
  return /HTTP 404|Not Found|release not found/i.test(err)
}

async function gh(args: string[]): Promise<GhResult> {
  let last: GhResult = { ok: false, err: 'not attempted' }
  for (let attempt = 0; attempt < 3; attempt++) {
    last = ghOnce(args)
    if (last.ok || isDefinitive(last.err)) return last
    await sleep(500 * 2 ** attempt)
  }
  return last
}

// modules.json records a browser URL; the API wants owner/repo.
function repoSlug(entry: RegistryEntry): string | null {
  return entry.repoUrl?.match(/github\.com\/([^/]+\/[^/.]+)/)?.[1] ?? null
}

async function latestRelease(slug: string): Promise<string | null> {
  const res = await gh(['release', 'list', '--repo', slug, '--limit', '1', '--json', 'tagName', '--jq', '.[0].tagName'])
  // No releases yet, or the repo is unreadable: there is no latest to lag behind. The
  // manifest read is judged separately, so this can't quietly wave a module through.
  return res.ok && res.out ? res.out : null
}

async function manifestAt(slug: string, tag: string): Promise<ModuleManifestFacts | null> {
  const res = await gh([
    'api',
    `repos/${slug}/contents/cactus.module.json?ref=${tag}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ])
  if (!res.ok) return null
  try {
    const parsed = JSON.parse(res.out)
    if (typeof parsed?.name !== 'string' || typeof parsed?.version !== 'string') return null
    return parsed as ModuleManifestFacts
  } catch {
    return null
  }
}

// Short-circuits, so `npm test` never spawns gh: ENABLED is false there.
const CAN_CHECK = ENABLED && ghOnce(['auth', 'status']).ok

if (ENABLED && !CAN_CHECK) {
  // A skip is a pass to whatever called this, so say plainly why nothing was checked -
  // a cron that logs "0 failed" while never reaching GitHub is worse than no cron.
  console.warn(
    '[check-module-pins] SKIPPED: gh is unavailable or not authenticated, so the pins were NOT checked.\n' +
      '[check-module-pins] Install the GitHub CLI and run `gh auth login`, then try again.'
  )
}

describe('module pins in modules.json', () => {
  it.skipIf(!CAN_CHECK)(
    'match each module latest release, and the set resolves',
    async () => {
      const registry = JSON.parse(readFileSync(join(rootDir, 'modules.json'), 'utf8'))
      const entries: RegistryEntry[] = registry.modules ?? []
      const coreVersion = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version

      const latestByName = new Map<string, string>()
      const manifests = new Map<string, ModuleManifestFacts>()

      // Serial on purpose. execFileSync blocks the event loop, so fanning these out with
      // Promise.all would buy nothing anyway, and a burst of ~30 calls is what invites the
      // secondary rate limit the retry above exists to survive. The whole sweep is ~11s.
      for (const entry of entries) {
        const slug = repoSlug(entry)
        if (!slug) continue

        const latest = await latestRelease(slug)
        if (latest) latestByName.set(entry.name, latest)

        // The manifest is per-tag: the pinned tag says whether the set is coherent today,
        // the latest tag says whether bumping to it would be.
        const tags = [...new Set([entry.version, latest].filter((t): t is string => Boolean(t)))]
        for (const tag of tags) {
          const manifest = await manifestAt(slug, tag)
          if (manifest) manifests.set(manifestKey(entry.name, tag), manifest)
        }
      }

      const plan = planPinCheck({ entries, latestByName, manifests, coreVersion })

      // The report is the point - a bare "expected false to be true" would tell whoever
      // runs this nothing about which pin rotted or what it drags with it.
      expect(isPinCheckClean(plan), `\n${formatPinCheckReport(plan)}\n`).toBe(true)
    },
    180_000
  )
})
