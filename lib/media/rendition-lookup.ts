// Finding a picture's shrunk copies again - and nothing else.
//
// Split out of renditions.ts for one reason: that file imports sharp, and sharp
// brings libvips with it. Measured on a real build, the pair accounted for 2 GB of
// written function payload across 130 functions, because the file tracer copies
// them into every function that can reach them. LOOKING a copy up touches the
// database and nothing else, and it is wanted in a great many places - the shop's
// card grids, the gazette's post cards, anything at all that draws a picture small
// - so it must not be the thing that drags an image library into all of them.
//
// The naming rule lives in lib/media/rendition-naming.ts, kept apart for the same
// reason.

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { RENDITION_FOLDER_NAME, renditionFileName } from '@/lib/media/rendition-naming'

/**
 * The `thumb` child folder of each of these parents, keyed by parent id (null for
 * the library root). One query however many parents are asked about, because the
 * caller is a page render resolving the small copy of every picture on it.
 *
 * A deliberate narrow copy of findChildFolders in lib/media/organise.ts. Importing
 * that one would pull organise.ts, which pulls upload.ts, which is where sharp
 * lives - the very thing this file exists to avoid. Both are a handful of lines and
 * neither will drift: each answers "the child folder of X called Y".
 */
async function findRenditionFolders(parentIds: Array<string | null>): Promise<Map<string | null, string>> {
  const out = new Map<string | null, string>()
  const unique = [...new Set(parentIds)]
  const ids = unique.filter((id): id is string => id !== null)
  const wantsRoot = unique.length !== ids.length
  if (ids.length === 0 && !wantsRoot) return out

  // Postgres treats a NULL parentId as its own thing and `in` never matches it, so
  // the root is asked for separately rather than smuggled into the list.
  const or: Prisma.FolderWhereInput[] = []
  if (ids.length > 0) or.push({ parentId: { in: ids } })
  if (wantsRoot) or.push({ parentId: null })

  const found = await prisma.folder.findMany({
    where: { name: RENDITION_FOLDER_NAME, OR: or },
    select: { id: true, parentId: true },
  })
  for (const f of found) out.set(f.parentId, f.id)
  return out
}

// A folder id is nullable (the library root), and null cannot be part of a string
// key that a lookup would also find - so the root is spelled out rather than left
// to coerce into "null" and collide with a folder literally called that.
const ROOT_FOLDER = ' root'

function folderScopedName(folderId: string | null, fileName: string): string {
  return `${folderId ?? ROOT_FOLDER} ${fileName}`
}

/**
 * Find the existing renditions for a batch of original urls.
 *
 * Two queries for the whole batch, whatever its size. This is called on a page
 * render - a category grid resolving the small copy of every picture on it, a
 * product save resolving the copies its images already have - so a query per
 * picture was never on the cards.
 *
 * Returns a map from original url to rendition url. An original with no
 * rendition is simply absent, and callers fall back to the original: always a
 * correct answer, if a heavy one.
 *
 * Matched on folder AND name rather than name alone. A rendition is filed in its
 * original's `thumb` folder, and an original whose key carries no nanoid (an
 * exact-form key - see lib/media/keys.ts) can share a basename with an unrelated
 * picture elsewhere. The name narrows it to a handful; the folder settles it.
 *
 * Two folders are accepted for each original: its `thumb` folder, and the
 * original's own folder, which is where copies were filed before that folder
 * existed. An install part-way through the refile has them in both places, and
 * the `thumb` one wins wherever both answer - so a picture whose copy has been
 * tidied away resolves to the tidied one and never flips back.
 */
export async function findRenditionUrls(
  originalUrls: string[],
  suffix: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(originalUrls)].filter(Boolean)
  if (unique.length === 0) return out

  const originals = await prisma.media.findMany({
    where: { url: { in: unique } },
    select: { url: true, key: true, folderId: true },
  })
  if (originals.length === 0) return out

  // One query for every `thumb` folder in play, whatever the batch size.
  const renditionFolders = await findRenditionFolders(originals.map((o) => o.folderId))

  const wanted = new Map<string, string>()
  const wantedBeside = new Map<string, string>()
  for (const o of originals) {
    const name = renditionFileName(o.key, suffix)
    const renditionFolderId = renditionFolders.get(o.folderId)
    if (renditionFolderId) wanted.set(folderScopedName(renditionFolderId, name), o.url)
    wantedBeside.set(folderScopedName(o.folderId, name), o.url)
  }

  const names = [...new Set(originals.map((o) => renditionFileName(o.key, suffix)))]
  const found = await prisma.media.findMany({
    where: { mimeType: 'image/webp', originalName: { in: names } },
    select: { url: true, originalName: true, folderId: true },
    // Oldest first, so a folder holding a duplicate minted before renditions were
    // deduped resolves to the same file on every run rather than drifting between
    // them - the same tie-break the writer above applies.
    orderBy: { createdAt: 'asc' },
  })

  // Gathered in two passes rather than one, because the rows arrive in age order
  // and the preference is by FOLDER: a copy sitting untidied beside its original
  // is older than the tidied one and would otherwise win on age alone.
  const beside = new Map<string, string>()
  for (const f of found) {
    if (!f.originalName) continue
    const scoped = folderScopedName(f.folderId, f.originalName)
    const tidy = wanted.get(scoped)
    if (tidy) {
      if (!out.has(tidy)) out.set(tidy, f.url)
      continue
    }
    const untidy = wantedBeside.get(scoped)
    if (untidy && !beside.has(untidy)) beside.set(untidy, f.url)
  }
  for (const [originalUrl, renditionUrl] of beside) {
    if (!out.has(originalUrl)) out.set(originalUrl, renditionUrl)
  }
  return out
}
