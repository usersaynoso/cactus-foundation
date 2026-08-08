// File media-library rows for videos already uploaded to B2.
//
// Prisma rather than raw SQL because the ids have to be real cuids, exactly as
// an upload through the library produces. Node resolves @prisma/client from the
// SCRIPT's own directory, so this has to run from inside the Cactus repo - copy
// it to the repo root, run it, delete it:
//
//   cd "/Users/chris/Git Local/Cactus"
//   cp .claude/skills/deskwell-sequence-description/scripts/file-media.mjs ./.file-media.mjs
//   eval "$(grep -E '^(DATABASE_URL|DIRECT_URL)=' .env | sed -E "s/^([A-Z_]+)=(.*)$/export \1='\2'/")"
//   node ./.file-media.mjs <manifest.json>; rm -f ./.file-media.mjs
//
// Manifest shape:
// {
//   "productFolderId": "cmv...",          // Folder row for the product slug
//   "prefix": "media/shop/.../<slug>/video",
//   "uploadedById": "cmre0g0qu0002ld04bknhyfy2",
//   "files": [ { "file": "carter.mp4", "originalName": "Carter.mp4", "sizeBytes": 7819347 } ]
// }
//
// Idempotent: a key already filed is left alone, so a half-finished run is safe
// to repeat.
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const manifestPath = process.argv[2]
if (!manifestPath) {
  console.error('usage: node file-media.mjs <manifest.json>')
  process.exit(1)
}
const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
const prisma = new PrismaClient()

// The library's folder tree has to mirror the storage key, or the item shows up
// in the wrong place in Media even though the url is right.
const folder = await prisma.folder.upsert({
  where: { parentId_name: { parentId: m.productFolderId, name: 'video' } },
  update: {},
  create: { name: 'video', parentId: m.productFolderId },
})
console.log('folder', folder.id, folder.name)

for (const f of m.files) {
  const key = `${m.prefix}/${f.file}`
  const existing = await prisma.media.findUnique({ where: { key }, select: { id: true } })
  if (existing) {
    console.log('already filed', key, existing.id)
    continue
  }
  const row = await prisma.media.create({
    data: {
      key,
      provider: 'B2',
      url: `https://media.deskwell.co.uk/${key}`,
      originalName: f.originalName,
      mimeType: 'video/mp4',
      sizeBytes: f.sizeBytes,
      // The platform marks a video done even when the optimiser beat nothing
      // (markVideoAlreadyOptimised in app/api/webhooks/video-optimise), so every
      // row is flagged the same way whether or not the encode was kept.
      optimised: true,
      folderId: folder.id,
      uploadedById: m.uploadedById,
    },
    select: { id: true, key: true },
  })
  console.log('created', row.id, row.key)
}

await prisma.$disconnect()
