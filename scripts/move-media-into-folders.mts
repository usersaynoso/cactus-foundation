// Move a given list of library items into given folders, one shard of the list
// at a time.
//
//   npx tsx --tsconfig tsconfig.json scripts/move-media-into-folders.mts \
//       --list=/path/to/pairs.tsv --shard=0 --shards=24
//
// Run from the REPO ROOT - the `@/` paths resolve against the root tsconfig.
//
// The list is one "<media id><TAB><target folder id>" per line. A shard takes
// every Nth line, so shards never meet on a row however the list is ordered and
// no shard has to know what the others are doing.
//
// WHY THIS EXISTS. The re-filing backfills shard by the thing they walk - a
// product, a folder - which balances well until the tail, where the remainder
// sits inside one or two enormous items. On the catalogue this was written for
// the last 970 pictures were six listings, 393 of them in a single one, so
// nine workers were really two workers that mattered and the tail was worth
// three hours. Sharding by the PICTURE rather than by its owner puts every
// worker back to work.
//
// Every move goes through core's moveOrRenameMedia, exactly as the backfills do,
// so the blob relocates, the references are rewritten, the former address is
// recorded and the item's shrunk copies follow it. Nothing here reimplements any
// of that.
//
// Restartable: an item already in its target folder is skipped, so re-running
// over the same list costs one lookup each and moves nothing.

import Module from 'module'
import { readFileSync } from 'fs'

type Extensions = Record<string, (m: unknown, filename: string) => void>
;(Module as unknown as { _extensions: Extensions })._extensions['.css'] = () => {}
Module.register?.(new URL('./css-stub-hook.mjs', import.meta.url).href, import.meta.url)

const args = process.argv.slice(2)
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const listPath = flag('list')
const shard = Number(flag('shard') ?? 0)
const shards = Number(flag('shards') ?? 1)

if (!listPath) {
  console.error('--list=<file> is required: one "<media id>\\t<target folder id>" per line.')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it for this run only - never write it into the repo.')
  process.exit(1)
}

const pairs = readFileSync(listPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split('\t'))
  .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])

// ONE LINE PER ITEM, before the shard split. The split is by line index, so two
// lines naming the SAME media id land on different shards and two workers move
// one row at once - and neither sees the other, because both read the row's
// folder before either writes it. What comes out is a blob per worker, a former
// address per worker, and a reference rewrite per worker: the row ends on the
// address the last UPDATE wrote while the columns end on the address the last
// REWRITE wrote, which need not be the same one. On the catalogue this was
// written for that left 128 items moved between 2 and 24 times inside three
// seconds, 125 orphaned blobs in storage, and 2,443 swatch columns naming a file
// with no library entry - all of it serving, none of it findable.
//
// The list is a query's output and a query is free to return an id twice. So the
// guard belongs here rather than in whoever wrote the list.
const unique = new Map(pairs)
const work = [...unique].filter((_, i) => i % shards === shard)
if (unique.size !== pairs.length) {
  console.log(`list had ${pairs.length - unique.size} duplicate item(s); ${unique.size} unique`)
}

const { prisma } = await import('@/lib/db/prisma')
const { moveOrRenameMedia } = await import('@/lib/media/organise')

console.log(`shard ${shard}/${shards}: ${work.length} items`)

const started = Date.now()
let moved = 0
let skipped = 0
let failed = 0

for (const [mediaId, folderId] of work) {
  try {
    const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { folderId: true } })
    if (!media) { skipped += 1; continue }
    if (media.folderId === folderId) { skipped += 1; continue }
    // The same two flags a product save files under: an exact-name key so the url
    // still reads as the uploaded name, and 'suffix' so two pictures that happen
    // to share a name are kept apart rather than one replacing the other.
    await moveOrRenameMedia(mediaId, { targetFolderId: folderId, exactName: true, collision: 'suffix' })
    moved += 1
  } catch (err) {
    // One picture failing must not end the shard: it keeps its current url, which
    // still serves, and a re-run picks it up.
    console.warn(`could not move ${mediaId}:`, err instanceof Error ? err.message : err)
    failed += 1
  }
  if ((moved + skipped + failed) % 25 === 0) {
    const mins = (Date.now() - started) / 60000
    console.log(`shard ${shard}: ${moved} moved, ${skipped} skipped, ${failed} failed - ${Math.round(mins > 0 ? moved / mins : 0)}/min`)
  }
}

console.log(`shard ${shard} finished: ${moved} moved, ${skipped} skipped, ${failed} failed, ${Math.round((Date.now() - started) / 60000)} min.`)
process.exit(0)
