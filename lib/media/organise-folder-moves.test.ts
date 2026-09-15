import { describe, it, expect, vi, beforeEach } from 'vitest'

// An in-memory library: just enough of the Folder and Media tables for the
// folder move, rename and merge paths, so what they do to keys and rows can be
// read back rather than inferred from call counts.
type FolderRow = { id: string; name: string; parentId: string | null }
type MediaRow = {
  id: string; key: string; url: string; provider: string; mimeType: string
  folderId: string | null; originalName: string | null
}

let folders: FolderRow[] = []
let media: MediaRow[] = []
const copies: Array<{ from: string; to: string }> = []
const deleted: string[] = []

type Where = Record<string, unknown>
// Prisma hands back a copy of a row, never the row itself - a caller holding one
// must not see it change when the table is updated underneath it.
const copy = <T extends object>(row: T | undefined): T | null => (row ? { ...row } : null)
function matches<T extends Record<string, unknown>>(row: T, where: Where = {}): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field]
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as { in?: unknown[]; not?: unknown }
      if (c.in) return c.in.includes(value)
      if ('not' in c) return value !== c.not
    }
    return value === cond
  })
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    folder: {
      findMany: async ({ where }: { where?: Where }) => folders.filter((f) => matches(f, where)).map((f) => ({ ...f })),
      findFirst: async ({ where }: { where?: Where }) => copy(folders.find((f) => matches(f, where))),
      findUnique: async ({ where }: { where: { id: string } }) => copy(folders.find((f) => f.id === where.id)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<FolderRow> }) => {
        const row = folders.find((f) => f.id === where.id)!
        Object.assign(row, data)
        return { ...row }
      },
      count: async ({ where }: { where?: Where }) => folders.filter((f) => matches(f, where)).length,
      deleteMany: async ({ where }: { where: { id: string } }) => {
        folders = folders.filter((f) => f.id !== where.id)
        return { count: 1 }
      },
    },
    media: {
      findMany: async ({ where }: { where?: Where }) => media.filter((m) => matches(m, where)).map((m) => ({ ...m })),
      findUnique: async ({ where }: { where: { id?: string; key?: string } }) =>
        copy(media.find((m) => (where.id ? m.id === where.id : m.key === where.key))),
      updateMany: async ({ where, data }: { where: Where; data: Partial<MediaRow> }) => {
        const rows = media.filter((m) => {
          const { id, ...rest } = where
          if (typeof id === 'object' && id !== null && 'in' in id) return (id as { in: string[] }).in.includes(m.id) && matches(m, rest)
          return m.id === id && matches(m, rest)
        })
        for (const row of rows) Object.assign(row, data)
        return { count: rows.length }
      },
      count: async ({ where }: { where?: Where }) => media.filter((m) => matches(m, where)).length,
    },
  },
}))

vi.mock('@/lib/media/upload', async () => {
  const { exactBaseName, keyDirectory } = await import('@/lib/media/keys')
  let minted = 0
  const buildKey = (provider: string, _mime: string, name?: string, folderPath?: string, exact?: boolean) => {
    const base = exact && name ? exactBaseName(name) : `nano${++minted}-${exactBaseName(name)}`
    return `${keyDirectory(provider, folderPath)}/${base}.webp`
  }
  return {
    buildKey,
    relocateMediaBlob: async (m: MediaRow, folderPath: string | undefined, _name: string | undefined, exact?: boolean) => {
      const key = buildKey(m.provider, m.mimeType, m.originalName ?? undefined, folderPath, exact)
      copies.push({ from: m.key, to: key })
      return { key, url: `https://media.example/${key}`, mimeType: m.mimeType, sizeBytes: 1 }
    },
    rewriteMediaReferencesInContent: vi.fn(async () => {}),
    deleteMedia: async (_provider: string, key: string) => { deleted.push(key) },
  }
})
// Superseded blobs are queued rather than deleted; for these tests "let go of" is
// what matters, so a queued one is recorded the same way as a deleted one.
vi.mock('@/lib/media/retired-blobs', () => ({
  retireMediaBlob: async (_provider: string, key: string) => { deleted.push(key) },
}))
vi.mock('@/lib/media/former-addresses', () => ({ recordFormerMediaAddress: vi.fn(async () => {}) }))
vi.mock('@/lib/media/detach', () => ({ detachMediaReferences: vi.fn() }))

const { rekeyFolderSubtree, relocateFolderInto, renameFolder } = await import('@/lib/media/organise')

function image(id: string, folderId: string, key: string, originalName: string): MediaRow {
  return { id, key, url: `https://media.example/${key}`, provider: 'B2', mimeType: 'image/webp', folderId, originalName }
}

beforeEach(() => {
  copies.length = 0
  deleted.length = 0
  // shop / chairs / old-name / { variations, 3d }
  folders = [
    { id: 'shop', name: 'shop', parentId: null },
    { id: 'chairs', name: 'chairs', parentId: 'shop' },
    { id: 'old', name: 'old-name', parentId: 'chairs' },
    { id: 'old-var', name: 'variations', parentId: 'old' },
  ]
  media = [
    image('a', 'old', 'media/shop/chairs/old-name/front.webp', 'front.webp'),
    image('b', 'old-var', 'media/shop/chairs/old-name/variations/sf1_1.webp', 'sf1_1.webp'),
    image('c', 'old-var', 'media/shop/chairs/old-name/variations/xyz-blue-thumb.webp', 'blue-thumb.webp'),
  ]
})

describe('renaming a folder', () => {
  it('moves every file under it onto the new path and keeps exact names exact', async () => {
    await renameFolder('old', 'new-name')

    expect(media.find((m) => m.id === 'a')!.key).toBe('media/shop/chairs/new-name/front.webp')
    // An exact-name key is a name somebody files by: it must not gain a nanoid.
    expect(media.find((m) => m.id === 'b')!.key).toBe('media/shop/chairs/new-name/variations/sf1_1.webp')
    // A nanoid-form key is an opaque handle and is simply reminted on the new path.
    expect(media.find((m) => m.id === 'c')!.key).toMatch(/^media\/shop\/chairs\/new-name\/variations\/nano\d+-blue-thumb\.webp$/)
    expect(deleted).toEqual(expect.arrayContaining([
      'media/shop/chairs/old-name/front.webp',
      'media/shop/chairs/old-name/variations/sf1_1.webp',
    ]))
  })

  it('finishes a rename that was cut off, without copying what already moved', async () => {
    folders.find((f) => f.id === 'old')!.name = 'new-name'
    media.find((m) => m.id === 'a')!.key = 'media/shop/chairs/new-name/front.webp'

    await renameFolder('old', 'new-name')

    expect(copies.map((c) => c.from)).not.toContain('media/shop/chairs/new-name/front.webp')
    expect(copies).toHaveLength(2)
  })
})

describe('rekeyFolderSubtree', () => {
  it('stops starting new files at the deadline and says how many are left', async () => {
    folders.find((f) => f.id === 'old')!.name = 'new-name'
    const result = await rekeyFolderSubtree('old', { deadline: Date.now() - 1 })
    expect(result).toEqual({ moved: 0, remaining: 3 })
    expect(copies).toHaveLength(0)
  })

  it('is a no-op when every key already matches its folder', async () => {
    const result = await rekeyFolderSubtree('old')
    expect(result).toEqual({ moved: 0, remaining: 0 })
    expect(copies).toHaveLength(0)
  })

  it('falls back to a fresh key when the exact one belongs to another file', async () => {
    folders.find((f) => f.id === 'old')!.name = 'new-name'
    media.push(image('squatter', 'chairs', 'media/shop/chairs/new-name/front.webp', 'front.webp'))

    await rekeyFolderSubtree('old')

    const moved = media.find((m) => m.id === 'a')!.key
    expect(moved).not.toBe('media/shop/chairs/new-name/front.webp')
    expect(media.find((m) => m.id === 'squatter')!.key).toBe('media/shop/chairs/new-name/front.webp')
  })
})

describe('relocateFolderInto', () => {
  it('renames and re-parents in one step when nothing is in the way', async () => {
    folders.push({ id: 'desks', name: 'desks', parentId: 'shop' })
    const id = await relocateFolderInto('old', 'desks', 'new-name')
    expect(id).toBe('old')
    expect(folders.find((f) => f.id === 'old')).toMatchObject({ name: 'new-name', parentId: 'desks' })
    // Rows only - the files follow when the subtree is re-keyed.
    expect(copies).toHaveLength(0)
  })

  it('merges into a folder of the same name, subfolders included, and removes the emptied source', async () => {
    // The state a rename used to leave: pictures already under the new name, the
    // variations and models still under the old one.
    folders.push({ id: 'new', name: 'new-name', parentId: 'chairs' })
    folders.push({ id: 'new-var', name: 'variations', parentId: 'new' })
    folders.push({ id: 'old-3d', name: '3d', parentId: 'old' })
    media.push({ ...image('m', 'old-3d', 'media/shop/chairs/old-name/3d/chair.glb', 'chair.glb'), mimeType: 'model/gltf-binary' })

    const id = await relocateFolderInto('old', 'chairs', 'new-name')

    expect(id).toBe('new')
    expect(media.find((m) => m.id === 'a')!.folderId).toBe('new')
    expect(media.find((m) => m.id === 'b')!.folderId).toBe('new-var')
    expect(folders.find((f) => f.id === 'old-3d')!.parentId).toBe('new')
    expect(folders.some((f) => f.id === 'old' || f.id === 'old-var')).toBe(false)

    const { remaining } = await rekeyFolderSubtree(id)
    expect(remaining).toBe(0)
    expect(media.find((m) => m.id === 'b')!.key).toBe('media/shop/chairs/new-name/variations/sf1_1.webp')
  })

  it('refuses to merge a folder into one inside itself', async () => {
    folders.push({ id: 'inner', name: 'old-name', parentId: 'old' })
    await expect(relocateFolderInto('old', 'old', 'old-name')).rejects.toThrow()
  })
})
