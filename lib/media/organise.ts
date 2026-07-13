import type { Media } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { relocateMediaBlob, rewriteMediaReferencesInContent, deleteMedia } from '@/lib/media/upload'

// ---------------------------------------------------------------------------
// Media library organisation: folders, moves, physical renames, cascade delete.
//
// Folders are "physical" — a folder's path (every ancestor name, sanitised and
// slash-joined) is baked into each contained item's storage key and serving url.
// So moving an item, renaming it, or renaming a folder relocates the blob(s) and
// rewrites every reference to the old url/key across page and layout content.
// Every relocation follows the same failure-safe order the optimise flow uses:
// create the new blob → update the row → rewrite references → delete the old
// blob (best-effort). A failure before the last step leaves the old blob still
// serving the old url, so nothing on the site breaks half-way.
// ---------------------------------------------------------------------------

const MAX_FOLDER_DEPTH = 50

export class MediaNameCollisionError extends Error {
  constructor(public readonly collidingName: string) {
    super(`An item named "${collidingName}" already exists in this folder`)
    this.name = 'MediaNameCollisionError'
  }
}

/** How to resolve a filename clash within the target folder. */
export type CollisionMode = 'error' | 'suffix' | 'replace' | 'skip'

/** Sanitise one folder name into a url-safe path segment. */
export function sanitizeFolderSegment(name: string): string {
  return name
    .trim()
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .toLowerCase()
}

/** A trimmed, display-safe folder name (what the user sees, not the path slug). */
export function cleanFolderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

/**
 * The sanitised, slash-joined storage path for a folder (its ancestors' names,
 * root first). Empty string for the library root (null folderId). Walks parents
 * with a depth cap so a corrupt cycle can't loop forever.
 */
export async function resolveFolderPath(folderId: string | null): Promise<string> {
  if (!folderId) return ''
  const segments: string[] = []
  let currentId: string | null = folderId
  for (let i = 0; i < MAX_FOLDER_DEPTH && currentId; i++) {
    const folder: { name: string; parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { name: true, parentId: true },
    })
    if (!folder) break
    segments.unshift(sanitizeFolderSegment(folder.name) || 'folder')
    currentId = folder.parentId
  }
  return segments.join('/')
}

/** Every folder from the root down to (and including) the given folder. */
export async function getFolderTrail(
  folderId: string | null,
): Promise<Array<{ id: string; name: string }>> {
  if (!folderId) return []
  const trail: Array<{ id: string; name: string }> = []
  let currentId: string | null = folderId
  for (let i = 0; i < MAX_FOLDER_DEPTH && currentId; i++) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      })
    if (!folder) break
    trail.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
  }
  return trail
}

/**
 * Ids of every folder nested under `folderId` (inclusive), breadth-first. Bounded
 * by MAX_FOLDER_DEPTH — the same cap that governs key building, so a tree deeper
 * than that is already unsupported (folders that deep can't be created normally).
 */
export async function collectFolderSubtree(folderId: string): Promise<string[]> {
  const ids: string[] = [folderId]
  let frontier = [folderId]
  for (let depth = 0; depth < MAX_FOLDER_DEPTH && frontier.length; depth++) {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    frontier = children.map((c) => c.id)
    ids.push(...frontier)
  }
  return ids
}

/**
 * Would moving `folderId` under `newParentId` create a cycle? True if the new
 * parent is the folder itself or one of its descendants.
 */
export async function wouldCreateCycle(folderId: string, newParentId: string | null): Promise<boolean> {
  if (!newParentId) return false
  if (newParentId === folderId) return true
  const subtree = await collectFolderSubtree(folderId)
  return subtree.includes(newParentId)
}

// --- filename collision handling ------------------------------------------

/** Is there another item with this display name already in the target folder? */
async function findCollision(
  name: string,
  folderId: string | null,
  excludeMediaId: string,
): Promise<Media | null> {
  return prisma.media.findFirst({
    where: { folderId, originalName: name, id: { not: excludeMediaId } },
  })
}

/** Append " (1)", " (2)"… to a name until it's free in the target folder. */
async function suffixUntilFree(name: string, folderId: string | null, excludeMediaId: string): Promise<string> {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 1; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!(await findCollision(candidate, folderId, excludeMediaId))) return candidate
  }
  // Astronomically unlikely; fall back to a name that can't collide.
  return `${stem} (${Date.now()})${ext}`
}

/**
 * Resolve a display-name collision in `folderId` per `mode`. Returns the name the
 * item should end up with (and, for 'replace', the item currently holding that
 * name, to be superseded *after* the incoming item is safely in place — never
 * before), or a skip signal. Throws MediaNameCollisionError under 'error'.
 */
async function resolveCollision(
  desiredName: string | null,
  folderId: string | null,
  mediaId: string,
  mode: CollisionMode,
): Promise<{ name: string | null; victim?: Media } | { skip: true }> {
  if (!desiredName) return { name: desiredName }
  const clash = await findCollision(desiredName, folderId, mediaId)
  if (!clash) return { name: desiredName }

  switch (mode) {
    case 'skip':
      return { skip: true }
    case 'suffix':
      return { name: await suffixUntilFree(desiredName, folderId, mediaId) }
    case 'replace':
      // Hand the victim back so the caller can transfer its references onto the
      // replacement and delete it LAST — deleting it here would destroy data if
      // the replacement's relocation then failed.
      return { name: desiredName, victim: clash }
    case 'error':
    default:
      throw new MediaNameCollisionError(desiredName)
  }
}

/**
 * Move every reference that points at `victim` onto `replacement`, so a "replace"
 * collision leaves nothing dangling: url/key/id occurrences in Puck builder JSON,
 * plus the id-held foreign-key-style columns (branding icons, page OG images,
 * member avatars, data exports).
 */
async function takeOverMediaReferences(victim: Media, replacement: Media): Promise<void> {
  // Puck content: swap the victim's url + key, then its id, onto the replacement.
  await rewriteMediaReferencesInContent(victim.url, replacement.url, victim.key, replacement.key)
  await rewriteMediaReferencesInContent(victim.url, replacement.url, victim.id, replacement.id)

  const ICON_FIELDS = [
    'logoMediaId', 'logoDarkMediaId', 'faviconMediaId', 'faviconDarkMediaId',
    'appIconMediaId', 'appleTouchIconMediaId', 'webManifest192MediaId', 'webManifest512MediaId',
  ] as const
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: Object.fromEntries(ICON_FIELDS.map((f) => [f, true])) as Record<(typeof ICON_FIELDS)[number], true>,
  })
  if (config) {
    const data: Record<string, string> = {}
    for (const f of ICON_FIELDS) if (config[f] === victim.id) data[f] = replacement.id
    if (Object.keys(data).length) await prisma.siteConfig.update({ where: { id: 'singleton' }, data })
  }

  await prisma.infoPage.updateMany({ where: { ogImageId: victim.id }, data: { ogImageId: replacement.id } })
  await prisma.member.updateMany({ where: { avatarMediaId: victim.id }, data: { avatarMediaId: replacement.id } })
  await prisma.memberDataExportRequest.updateMany({ where: { mediaId: victim.id }, data: { mediaId: replacement.id } })
}

// --- core relocation -------------------------------------------------------

/**
 * Move an item into `targetFolderId` (null = root) and/or rename it, physically
 * relocating the blob and rewriting references. Skips all storage work when
 * neither the folder nor the name actually change. Returns the updated row, or
 * null when a collision under 'skip' means the item was left untouched.
 */
export async function moveOrRenameMedia(
  mediaId: string,
  // exactName: opt into deterministic, nanoid-free storage keys (the shop's
  // product images). The caller owns uniqueness within the target folder.
  opts: { targetFolderId?: string | null; newName?: string; collision?: CollisionMode; exactName?: boolean },
): Promise<Media | null> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) throw new Error('Media item not found')

  const targetFolderId = opts.targetFolderId === undefined ? media.folderId : opts.targetFolderId
  const folderChanged = targetFolderId !== media.folderId
  const renaming = opts.newName !== undefined && opts.newName !== media.originalName

  if (!folderChanged && !renaming) return media

  const desiredName = renaming ? opts.newName ?? null : media.originalName
  const resolved = await resolveCollision(desiredName, targetFolderId, mediaId, opts.collision ?? 'error')
  if ('skip' in resolved) return null

  const folderPath = await resolveFolderPath(targetFolderId)
  const relocated = await relocateMediaBlob(media, folderPath || undefined, resolved.name ?? undefined, opts.exactName)

  const updated = await prisma.media.update({
    where: { id: mediaId },
    data: {
      folderId: targetFolderId,
      key: relocated.key,
      url: relocated.url,
      originalName: resolved.name,
    },
  })

  await rewriteMediaReferencesInContent(media.url, relocated.url, media.key, relocated.key)

  // 'replace' collision: the incoming item is now safely in place under the
  // clashing name, so hand every reference from the item it replaces over to it,
  // then remove that item — deleting it last keeps the operation failure-safe.
  if ('victim' in resolved && resolved.victim) {
    await takeOverMediaReferences(resolved.victim, updated)
    try {
      await deleteMedia(resolved.victim.provider, resolved.victim.key)
    } catch {
      /* orphaned victim blob; harmless, still deletable later */
    }
    await prisma.media.delete({ where: { id: resolved.victim.id } })
  }

  try {
    await deleteMedia(media.provider, media.key)
  } catch {
    /* orphaned original; harmless, still deletable later */
  }

  return updated
}

/**
 * Duplicate an item into `targetFolderId` (null = root) as a brand-new library
 * item. Copies the blob (the source is left untouched) and never rewrites
 * references — nothing points at the new copy yet. The copy's name is auto-
 * suffixed so it never clashes with what's already in the target folder.
 */
export async function duplicateMedia(mediaId: string, targetFolderId: string | null): Promise<Media> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) throw new Error('Media item not found')

  let name = media.originalName
  if (name && (await findCollision(name, targetFolderId, mediaId))) {
    // Exclude nothing real so the source's own name also forces a suffix.
    name = await suffixUntilFree(name, targetFolderId, '__copy__')
  }

  const folderPath = await resolveFolderPath(targetFolderId)
  const relocated = await relocateMediaBlob(media, folderPath || undefined, name ?? undefined)

  return prisma.media.create({
    data: {
      key: relocated.key,
      url: relocated.url,
      provider: media.provider,
      mimeType: media.mimeType,
      sizeBytes: relocated.sizeBytes,
      altText: media.altText,
      isDecorative: media.isDecorative,
      // Carry the optimised flag: the relocated blob is a byte copy of the
      // source's already-WebP file, so the copy is optimised too. Without this
      // it defaults to false and the copy is wrongly offered for optimising.
      optimised: media.optimised,
      originalName: name,
      folderId: targetFolderId,
      uploadedById: null,
    },
  })
}

// --- folders ---------------------------------------------------------------

/** Create a folder. Enforces name uniqueness within the parent (root included). */
export async function createFolder(name: string, parentId: string | null): Promise<{ id: string; name: string }> {
  const clean = cleanFolderName(name)
  if (!clean) throw new Error('Folder name is required')

  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId }, select: { id: true } })
    if (!parent) throw new Error('Parent folder not found')
  }

  const existing = await prisma.folder.findFirst({ where: { parentId, name: clean }, select: { id: true } })
  if (existing) throw new Error(`A folder named "${clean}" already exists here`)

  const folder = await prisma.folder.create({ data: { name: clean, parentId } })
  return { id: folder.id, name: folder.name }
}

/**
 * Walk (creating as needed) a chain of folders by display name, root first, and
 * return the leaf folder's id. Idempotent — an existing folder at each level is
 * reused rather than duplicated. Empty/blank segments are skipped; an empty
 * result path returns null (the library root). Used to auto-file items into a
 * known tree (the shop puts product images under Shop / <master category>).
 */
export async function getOrCreateFolderByPath(names: string[]): Promise<string | null> {
  let parentId: string | null = null
  for (const raw of names) {
    const clean = cleanFolderName(raw)
    if (!clean) continue
    const existing: { id: string } | null = await prisma.folder.findFirst({ where: { parentId, name: clean }, select: { id: true } })
    parentId = existing ? existing.id : (await prisma.folder.create({ data: { name: clean, parentId } })).id
  }
  return parentId
}

/**
 * Rename a folder. Because the folder's name is part of every contained item's
 * storage path, every descendant item is relocated so its url reflects the new
 * name. Items sitting directly in this folder and in every subfolder are covered.
 */
export async function renameFolder(folderId: string, newName: string): Promise<void> {
  const clean = cleanFolderName(newName)
  if (!clean) throw new Error('Folder name is required')

  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) throw new Error('Folder not found')
  if (clean === folder.name) return

  const clash = await prisma.folder.findFirst({
    where: { parentId: folder.parentId, name: clean, id: { not: folderId } },
    select: { id: true },
  })
  if (clash) throw new Error(`A folder named "${clean}" already exists here`)

  await prisma.folder.update({ where: { id: folderId }, data: { name: clean } })

  // Relocate every item whose path includes this folder. Its own name change is
  // now reflected by resolveFolderPath, so moving each item "to its own folder"
  // rebuilds the key/url under the new path.
  const subtreeIds = await collectFolderSubtree(folderId)
  const items = await prisma.media.findMany({ where: { folderId: { in: subtreeIds } }, select: { id: true, folderId: true } })
  for (const item of items) {
    await relocateWithinSameFolder(item.id)
  }
}

/**
 * Rebuild an item's key/url from its current folder path without changing which
 * folder it's in — used after a folder rename shifts the path underneath it.
 */
async function relocateWithinSameFolder(mediaId: string): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) return
  const folderPath = await resolveFolderPath(media.folderId)
  const relocated = await relocateMediaBlob(media, folderPath || undefined)
  await prisma.media.update({
    where: { id: mediaId },
    data: { key: relocated.key, url: relocated.url },
  })
  await rewriteMediaReferencesInContent(media.url, relocated.url, media.key, relocated.key)
  try {
    await deleteMedia(media.provider, media.key)
  } catch {
    /* orphaned original; harmless */
  }
}

/**
 * Move a folder under `newParentId` (null = the library root). Rejects cycles
 * (into itself or one of its own descendants) and name clashes in the
 * destination. Because a folder's name is part of every contained item's storage
 * path, every descendant item is relocated so its url reflects the new ancestry.
 */
export async function moveFolder(folderId: string, newParentId: string | null): Promise<void> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) throw new Error('Folder not found')
  if (newParentId === folder.parentId) return

  if (await wouldCreateCycle(folderId, newParentId)) {
    throw new Error("A folder can't be moved inside itself")
  }
  if (newParentId) {
    const parent = await prisma.folder.findUnique({ where: { id: newParentId }, select: { id: true } })
    if (!parent) throw new Error('Target folder not found')
  }

  const clash = await prisma.folder.findFirst({
    where: { parentId: newParentId, name: folder.name, id: { not: folderId } },
    select: { id: true },
  })
  if (clash) throw new Error(`A folder named "${folder.name}" already exists here`)

  await prisma.folder.update({ where: { id: folderId }, data: { parentId: newParentId } })

  // The path prefix for everything under this folder just changed; rebuild each
  // descendant item's key/url from its (now-relocated) folder path.
  const subtreeIds = await collectFolderSubtree(folderId)
  const items = await prisma.media.findMany({ where: { folderId: { in: subtreeIds } }, select: { id: true } })
  for (const item of items) {
    await relocateWithinSameFolder(item.id)
  }
}

/**
 * Permanently delete a folder, every subfolder, and every file inside — blobs
 * and rows. This is the destructive "cascade" the admin explicitly confirms.
 * Returns how many media items were removed.
 */
export async function deleteFolderCascade(folderId: string): Promise<{ deletedMedia: number }> {
  const subtreeIds = await collectFolderSubtree(folderId)
  const items = await prisma.media.findMany({ where: { folderId: { in: subtreeIds } } })

  for (const item of items) {
    try {
      await deleteMedia(item.provider, item.key)
    } catch {
      /* orphaned blob; still remove the row so the library is consistent */
    }
  }

  // deleteMany is idempotent: a row that's already gone (a double-submitted
  // confirm, or a subfolder swept up in the same subtree) removes zero rows
  // instead of throwing P2025. Deleting the whole subtree by id also removes
  // children directly rather than leaning on the FK cascade firing in order.
  await prisma.media.deleteMany({ where: { id: { in: items.map((i) => i.id) } } })
  await prisma.folder.deleteMany({ where: { id: { in: subtreeIds } } })
  return { deletedMedia: items.length }
}

/** Summary of what a cascade delete would remove, for the confirm dialog. */
export async function summariseFolderDeletion(
  folderId: string,
): Promise<{ folders: number; media: number; inUseNames: string[] }> {
  const subtreeIds = await collectFolderSubtree(folderId)
  const items = await prisma.media.findMany({
    where: { folderId: { in: subtreeIds } },
    select: { id: true, key: true, url: true, originalName: true },
  })
  const { loadMediaUsageIndex, isMediaInUse } = await import('@/lib/media/references')
  const usage = await loadMediaUsageIndex()
  const inUseNames = items
    .filter((i) => isMediaInUse(i, usage))
    .map((i) => i.originalName || i.key.split('/').pop() || i.id)
  return { folders: subtreeIds.length, media: items.length, inUseNames }
}
