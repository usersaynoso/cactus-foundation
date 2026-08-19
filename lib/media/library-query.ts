import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { loadMediaUsageIndex, isMediaInUse } from '@/lib/media/references'
import { OPTIMISABLE_MODEL_TYPES, MODEL_EXTENSION_TYPES, VIDEO_DIRECT_TYPES } from '@/lib/media/limits'

// Shared media-library query used by both the server-rendered page and the
// incremental-load API, so the two can never drift apart. Handles folder
// scoping, search, type/tag filters, sort, and the computed "in use" tabs.

export type LibrarySort =
  | 'newest' | 'oldest' | 'name' | 'name_desc'
  // By file size on disc.
  | 'largest' | 'smallest'
  // By pixel area - a different question entirely from file size, and the one
  // people mean by "the big pictures". Rows never measured sort last either way
  // (see buildOrderBy), so an unmeasured library doesn't quietly reorder itself.
  | 'largest_dim' | 'smallest_dim'
export type LibraryTypeFilter = 'all' | 'image' | 'video' | 'model' | 'other'
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
  width: number | null
  height: number | null
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
  sizeBytes: true, width: true, height: true, createdAt: true, isDecorative: true,
  optimised: true, folderId: true,
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

// The two named non-image kinds, as lists a where clause can use. Taken from the
// same tables the upload path keys off, so a type the library learns to accept
// turns up in its own filter rather than silently in "Other".
const VIDEO_TYPES = [...VIDEO_DIRECT_TYPES]
const MODEL_TYPES = Object.values(MODEL_EXTENSION_TYPES)

/**
 * The File type dropdown, as where clauses.
 *
 * Videos and 3D files were both filed under "Other files" until they became
 * categories in their own right - a library with a couple of thousand models in
 * it has no use for a bucket labelled "not a picture". "Other" is therefore
 * everything the three named kinds leave behind: PDFs, zips, the odd font.
 *
 * The four have to partition the library between them - every file in exactly
 * one - or the dropdown lies in one of two directions: a file in none of them is
 * unreachable however you filter, and a file in two is counted twice. That is
 * what library-query.test.ts checks, across every type the library accepts.
 */
export const TYPE_FILTER_WHERE: Record<Exclude<LibraryTypeFilter, 'all'>, Prisma.MediaWhereInput> = {
  image: { mimeType: { startsWith: 'image/' } },
  video: { mimeType: { in: VIDEO_TYPES } },
  model: { mimeType: { in: MODEL_TYPES } },
  other: {
    AND: [
      { NOT: { mimeType: { startsWith: 'image/' } } },
      { NOT: { mimeType: { in: VIDEO_TYPES } } },
      { NOT: { mimeType: { in: MODEL_TYPES } } },
    ],
  },
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

  if (q.type !== 'all') and.push(TYPE_FILTER_WHERE[q.type])

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
    // Nulls last in both directions, deliberately. An unmeasured row is not a
    // small picture, and "smallest first" opening on a screenful of files whose
    // size nobody knows would read as a broken sort rather than as an honest
    // one. They sit at the end until the "Measure image sizes" action reaches
    // them - videos and 3D files included, which never carry a measurement.
    case 'largest_dim': return { pixels: { sort: 'desc', nulls: 'last' } }
    case 'smallest_dim': return { pixels: { sort: 'asc', nulls: 'last' } }
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
    const [rows, total] = await Promise.all([
      prisma.media.findMany({ where, orderBy, skip, take: q.perPage, select: SELECT }),
      prisma.media.count({ where }),
    ])
    // The usage index exists only to stamp each row's "in use" flag. Building it
    // scans every page's and every layout's whole builder JSON, so an empty page -
    // the library root on a fresh install, or any folder with nothing in it - has
    // no reason to pay for it. This is exactly the first-paint case that made the
    // media page feel slow "even when there's nothing in the root".
    if (rows.length === 0) return { items: [], total, hasMore: false }
    const usage = await loadMediaUsageIndex()
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

/** Every accepted value of each, so the parser below stays one edit rather than
 *  a chain of comparisons that quietly drops whatever was added last. */
const SORT_VALUES = ['newest', 'oldest', 'name', 'name_desc', 'largest', 'smallest', 'largest_dim', 'smallest_dim'] as const
const TYPE_VALUES = ['all', 'image', 'video', 'model', 'other'] as const

/** Parse raw query params into a validated LibraryQuery. */
export function parseLibraryQuery(params: URLSearchParams, perPage: number, page: number): LibraryQuery {
  const rawFolder = params.get('folder')
  const folder: LibraryFolderScope =
    rawFolder === 'all' ? 'all' : rawFolder && rawFolder !== 'root' ? rawFolder : null

  const rawSort = params.get('sort')
  const sort: LibrarySort = (SORT_VALUES as readonly string[]).includes(rawSort ?? '')
    ? (rawSort as LibrarySort)
    : 'newest'

  const rawType = params.get('type')
  const type: LibraryTypeFilter = (TYPE_VALUES as readonly string[]).includes(rawType ?? '')
    ? (rawType as LibraryTypeFilter)
    : 'all'

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
