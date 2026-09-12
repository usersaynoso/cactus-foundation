// Collapse duplicate shrunk copies onto one file, and delete the spare blobs.
//
//   export DATABASE_URL=... DIRECT_URL=...   # plus the storage provider's own vars
//   npx tsx --tsconfig tsconfig.json scripts/dedupe-renditions.mts --dry-run
//   npx tsx --tsconfig tsconfig.json scripts/dedupe-renditions.mts
//
// Run from the REPO ROOT - the `@/` paths resolve against the root tsconfig.
//
// Two rows of one name in one folder are two files serving one picture, made
// when several callers each asked for the small copy of the same original at the
// same moment and each wrote one. The OLDEST survives, because that is the row
// every lookup in renditions.ts already resolves to - so this deletes files
// nothing is drawing, rather than substituting one for another.
//
// The losers' references are handed to the survivor before anything is deleted,
// and the loser's address is recorded as a former address of the survivor, so a
// url captured earlier still resolves.
//
// Run it BEFORE the `thumb`-folder sweep: otherwise the sweep dutifully carries
// every duplicate into a thumb folder and they have to be cleared from there.
//
// Flags:
//   --dry-run       report what would go and delete nothing
//   --limit=<n>     stop after n duplicate groups (default: keep going)
//   --batch=<n>     groups per pass (default 100)

import Module from 'module'

type Extensions = Record<string, (m: unknown, filename: string) => void>
;(Module as unknown as { _extensions: Extensions })._extensions['.css'] = () => {}
Module.register?.(new URL('./css-stub-hook.mjs', import.meta.url).href, import.meta.url)

const args = process.argv.slice(2)
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const dryRun = args.includes('--dry-run')
const batch = Number(flag('batch') ?? 100)
const limitArg = flag('limit')
const limit = limitArg ? Number(limitArg) : Number.POSITIVE_INFINITY

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it for this run only - never write it into the repo.')
  process.exit(1)
}

const mod = await import('@/lib/media/rendition-dedupe')
const countDuplicateRenditions = mod.countDuplicateRenditions ?? mod.default?.countDuplicateRenditions
const dedupeRenditions = mod.dedupeRenditions ?? mod.default?.dedupeRenditions

const pending = await countDuplicateRenditions()
console.log(`${pending.toLocaleString()} duplicate copies on file.`)
if (pending === 0) process.exit(0)

if (dryRun) {
  const sample = await dedupeRenditions({ limit: batch, dryRun: true })
  console.log(
    `Dry run over ${sample.groups.toLocaleString()} groups: ` +
    `${sample.deleted.toLocaleString()} rows would go` +
    (sample.more ? ', and there are more groups after them.' : '.'),
  )
  process.exit(0)
}

const started = Date.now()
let groups = 0
let deleted = 0
let blobs = 0
let kept = 0

for (;;) {
  if (groups >= limit) break
  let result
  try {
    result = await dedupeRenditions({ limit: Math.min(batch, limit - groups) })
  } catch (err) {
    console.error('Pass failed, stopping - re-run to carry on:', err)
    break
  }
  if (result.groups === 0) break
  groups += result.groups
  deleted += result.deleted
  blobs += result.blobsDeleted
  kept += result.kept

  const mins = (Date.now() - started) / 60000
  console.log(
    `${groups.toLocaleString()} groups, ${deleted.toLocaleString()}/${pending.toLocaleString()} rows deleted, ` +
    `${blobs.toLocaleString()} blobs removed` +
    (kept > 0 ? `, ${kept.toLocaleString()} left alone` : '') +
    ` - ${Math.round(mins > 0 ? deleted / mins : 0)}/min`,
  )
  if (!result.more) break
}

console.log(
  `Finished: ${deleted.toLocaleString()} duplicate rows collapsed, ${blobs.toLocaleString()} blobs deleted` +
  (kept > 0 ? `, ${kept.toLocaleString()} left alone` : '') +
  `, ${Math.round((Date.now() - started) / 60000)} minutes.`,
)
process.exit(0)
