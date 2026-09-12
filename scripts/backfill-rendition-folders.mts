// Tidy an established library's shrunk copies into `thumb` folders, from a
// terminal.
//
//   export DATABASE_URL=... DIRECT_URL=...   # plus the storage provider's own vars
//   npx tsx --tsconfig tsconfig.json scripts/backfill-rendition-folders.mts --dry-run
//   npx tsx --tsconfig tsconfig.json scripts/backfill-rendition-folders.mts
//
// Run from the REPO ROOT - the `@/` paths resolve against the root tsconfig.
//
// Copies used to be filed in the original's own folder. They now go one level
// down, so a product's folder reads as the product's pictures rather than as each
// picture twice over. This walks what is already on the shelves and moves it.
//
// A terminal job rather than a button because every file moved is a blob copy and
// a delete at the storage provider - 40,314 of them on the catalogue this was
// written for. Everything it does is restartable and idempotent: it works folder
// by folder in id order, prints the last folder it finished, and a folder already
// tidied costs one query and moves nothing. While it is outstanding, every lookup
// accepts a copy in either place, so a half-finished sweep is untidy and never
// broken.
//
// Run it AFTER any job that moves originals around (the shop's variation refile,
// say) - a copy follows its original automatically, so tidying first simply means
// tidying twice.
//
// Flags:
//   --dry-run          report what would move and move nothing
//   --after=<id>       resume from the folder id the last run reported
//   --limit=<n>        stop after n folders (default: keep going until done)
//   --batch=<n>        folders per pass (default 50)

import Module from 'module'

// The media library's move path reaches the module extension points, and a module
// can pull Puck's stylesheet in behind it. Stubbed both ways - the CJS extension
// hook for require(), a loader hook for import - because which one fires depends
// on how far down the graph the stylesheet sits.
type Extensions = Record<string, (m: unknown, filename: string) => void>
;(Module as unknown as { _extensions: Extensions })._extensions['.css'] = () => {}
// The hook's own url, used as-is. Round-tripping it through pathToFileURL()
// encodes the already-encoded space in "Git Local" a second time and node then
// looks for a directory called "Git%20Local".
Module.register?.(new URL('./css-stub-hook.mjs', import.meta.url).href, import.meta.url)

const args = process.argv.slice(2)
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const dryRun = args.includes('--dry-run')
const batch = Number(flag('batch') ?? 50)
const limitArg = flag('limit')
const limit = limitArg ? Number(limitArg) : Number.POSITIVE_INFINITY

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it for this run only - never write it into the repo.')
  process.exit(1)
}

// Destructured off the namespace rather than imported by name: the lib compiles
// to CJS here and a static named import finds nothing.
const mod = await import('@/lib/media/rendition-refile')
const countRenditionsToRefile = mod.countRenditionsToRefile ?? mod.default?.countRenditionsToRefile
const refileRenditionsIntoThumbFolders = mod.refileRenditionsIntoThumbFolders ?? mod.default?.refileRenditionsIntoThumbFolders

const pending = await countRenditionsToRefile()
console.log(`${pending.toLocaleString()} shrunk copies still sitting beside their originals.`)

if (dryRun) {
  const sample = await refileRenditionsIntoThumbFolders({ limit: batch, dryRun: true })
  console.log(
    `Dry run over ${sample.foldersSeen.toLocaleString()} folders: ` +
    `${sample.moved.toLocaleString()} copies would move` +
    (sample.more ? ', and there are more folders after them.' : '.'),
  )
  process.exit(0)
}

const started = Date.now()
let after: string | null = flag('after') ?? null
let folders = 0
let moved = 0
let left = 0

for (;;) {
  if (folders >= limit) break
  let result
  try {
    result = await refileRenditionsIntoThumbFolders({ after, limit: Math.min(batch, limit - folders) })
  } catch (err) {
    // A pass that throws outright has taken its whole page of folders with it.
    // Report where it stopped rather than looping on it - re-running from the id
    // printed picks up exactly where this left off.
    console.error(`Pass starting after '${after ?? 'the library root'}' failed:`, err)
    break
  }
  if (result.foldersSeen === 0) break
  folders += result.foldersSeen
  moved += result.moved
  left += result.left
  after = result.lastFolderId

  const mins = (Date.now() - started) / 60000
  console.log(
    `${folders.toLocaleString()} folders, ${moved.toLocaleString()} copies moved` +
    (left > 0 ? `, ${left.toLocaleString()} left where they were` : '') +
    ` - ${Math.round(mins > 0 ? moved / mins : 0)}/min - resume with --after='${after ?? ''}'`,
  )
  if (!result.more) break
}

console.log(
  `Finished: ${moved.toLocaleString()} copies tidied away over ${folders.toLocaleString()} folders` +
  (left > 0 ? `, ${left.toLocaleString()} left where they were` : '') +
  `, ${Math.round((Date.now() - started) / 60000)} minutes.`,
)
process.exit(0)
