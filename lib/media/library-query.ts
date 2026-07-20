import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { loadMediaUsageIndex, isMediaInUse } from '@/lib/media/references'
import { OPTIMISABLE_MODEL_TYPES } from '@/lib/media/limits'

// Shared media-library query used by both the server-rendered page and the
// incremental-load API, so the two can never drift apart. Handles folder
// scoping, search, type/tag filters, sort, and the computed "in use" tabs.

export type LibrarySort = 'newest' | 'oldest' | 'name' | 'name_desc' | 'largest' | 'smallest'
export type LibraryTypeFilter = 'all' | 'image' | 'other'
export type LibraryUseFilter = 'all' | 'in-use' | 'unused'

// A folder id scopes to that folder's direct contents; null = the library root;
// 'all' drops the folder constraint (used when searching or filtering by tag).
export type LibraryFolderScope = string | null | 'all'

export type LibraryQuery = {
  folder: LibraryFolderScope
  search?: string
  tag?: string
  type: LibraryTypeFilter
  use: LibraryUseFilter
  /**
   * Narrow to the images the bulk-optimise button would actually act on: raster
   * (not SVG) and not yet re-encoded. The "Optimisable" stat tile counts exactly
   * this set, so clicking it has to filter by it too — it used to fall back to
   * "all images", which listed every already-optimised file alongside them and
   * made a correct count of 12 look like a count of the whole library.
   */
  optimisable: boolean
  sort: LibrarySort
  page: number
  perPage: number
}

export type LibraryItem = {
  id: string
  key: string
  url: string
  altText: string | null
  originalName: string | null
  mimeType: string
  sizeBytes: number
  createdAt: Date
  isDecorative: boolean
  optimised: boolean
  folderId: string | null
  inUse: boolean
  tags: string[]
  uploadedBy: { username: string } | null
}

const SELECT = {
  id: true, key: true, url: true, altText: true, originalName: true, mimeType: true,
  sizeBytes: true, createdAt: true, isDecorative: true, optimised: true, folderId: true,
  uploadedBy: { select: { username: true } },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.MediaSelect

type Row = Prisma.MediaGetPayload<{ select: typeof SELECT }>

function shape(row: Row, inUse: boolean): LibraryItem {
  return { ...row, inUse, tags: row.tags.map((t) => t.tag.name) }
}

// isOptimisableType from lib/media/limits.ts, expressed as a where clause - a
// raster image or a 3D model the optimiser handles. Prisma wants a clause rather
// than a predicate, so the rule genuinely does exist twice; what stops the two
// drifting is library-query.test.ts, which walks every media type the library
// accepts and asserts this clause and that helper reach the same verdict on each.
//
// They must agree or the page contradicts itself: the "Optimisable" tile's number
// comes from the helper, the list behind the tile comes from this, and the ⚡
// button on each card comes from the helper again.
export const OPTIMISABLE_TYPE_WHERE: Prisma.MediaWhereInput = {
  OR: [
    { AND: [{ mimeType: { startsWith: 'image/' } }, { NOT: { mimeType: 'image/svg+xml' } }] },
    { mimeType: { in: [...OPTIMISABLE_MODEL_TYPES] } },
  ],
}

function buildWhere(q: LibraryQuery): Prisma.MediaWhereInput {
  const and: Prisma.MediaWhereInput[] = []

  if (q.folder !== 'all') and.push({ folderId: q.folder })

  if (q.search) {
    and.push({
      OR: [
        { key: { contains: q.search } },
        { originalName: { contains: q.search } },
        { altText: { contains: q.search } },
      ],
    })
  }

  if (q.tag) and.push({ tags: { some: { tag: { name: q.tag } } } })

  if (q.type === 'image') and.push({ mimeType: { startsWith: 'image/' } })
  else if (q.type === 'other') and.push({ NOT: { mimeType: { startsWith: 'image/' } } })

  // isOptimisableType from lib/media/limits.ts, expressed in SQL - a raster image
  // or a 3D model the optimiser handles, not already done. It cannot call that
  // helper (Prisma wants a where clause, not a predicate), so the two are kept in
  // step by the test in library-query.test.ts, which walks every type the library
  // accepts and asserts this clause and that helper agree on each one. The tile's
  // number, the tile's list and the button on the card are the same set or the
  // page contradicts itself.
  if (q.optimisable) {
    and.push({ optimised: false })
    and.push(OPTIMISABLE_TYPE_WHERE)
  }

  return and.length ? { AND: and } : {}
}

function buildOrderBy(sort: LibrarySort): Prisma.MediaOrderByWithRelationInput {
  switch (sort) {
    case 'oldest': return { createdAt: 'asc' }
    case 'name': return { originalName: 'asc' }
    case 'name_desc': return { originalName: 'desc' }
    case 'largest': return { sizeBytes: 'desc' }
    case 'smallest': return { sizeBytes: 'asc' }
    case 'newest':
    default: return { createdAt: 'desc' }
  }
}

export async function queryMediaLibrary(
  q: LibraryQuery,
): Promise<{ items: LibraryItem[]; total: number; hasMore: boolean }> {
  const where = buildWhere(q)
  const orderBy = buildOrderBy(q.sort)
  const skip = (q.page - 1) * q.perPage

  // The "in use" tabs are a computed classification, not a column, so they need
  // every matching row loaded and checked against the usage index before paging.
  // The default "all" tab pages at the database instead — the common, cheap path.
  // The usage index itself is request-cached, so the page's library query and its
  // stats bar build it once between them rather than once each.
  if (q.use === 'all') {
    const [rows, total, usage] = await Promise.all([
      prisma.media.findMany({ where, orderBy, skip, take: q.perPage, select: SELECT }),
      prisma.media.count({ where }),
      loadMediaUsageIndex(),
    ])
    const items = rows.map((r) => shape(r, isMediaInUse(r, usage)))
    return { items, total, hasMore: skip + rows.length < total }
  }

  // No `take` here on purpose: the in-use/unused filter runs in JavaScript after
  // the rows come back, so a database LIMIT would chop off rows that survive the
  // filter and give a short (or empty) page. Bounding it would change results.
  const [rows, usage] = await Promise.all([
    prisma.media.findMany({ where, orderBy, select: SELECT }),
    loadMediaUsageIndex(),
  ])
  const classified = rows.map((r) => shape(r, isMediaInUse(r, usage)))
  const filtered = classified.filter((i) => (q.use === 'in-use' ? i.inUse : !i.inUse))
  const items = filtered.slice(skip, skip + q.perPage)
  return { items, total: filtered.length, hasMore: skip + items.length < filtered.length }
}

/** Parse raw query params into a validated LibraryQuery. */
export function parseLibraryQuery(params: URLSearchParams, perPage: number, page: number): LibraryQuery {
  const rawFolder = params.get('folder')
  const folder: LibraryFolderScope =
    rawFolder === 'all' ? 'all' : rawFolder && rawFolder !== 'root' ? rawFolder : null

  const rawSort = params.get('sort')
  const sort: LibrarySort =
    rawSort === 'oldest' || rawSort === 'name' || rawSort === 'name_desc' || rawSort === 'largest' || rawSort === 'smallest'
      ? rawSort
      : 'newest'

  const rawType = params.get('type')
  const type: LibraryTypeFilter = rawType === 'image' || rawType === 'other' ? rawType : 'all'

  const rawUse = params.get('filter')
  const use: LibraryUseFilter = rawUse === 'in-use' || rawUse === 'unused' ? rawUse : 'all'

  return {
    folder,
    search: params.get('q') || undefined,
    tag: params.get('tag') || undefined,
    type,
    use,
    optimisable: params.get('optimisable') === '1',
    sort,
    page,
    perPage,
  }
}
