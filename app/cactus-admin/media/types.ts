import type { MediaCardItem } from './MediaCard'

export type LibraryItem = MediaCardItem & { folderId: string | null; tags: string[] }
export type TagInfo = { id: string; name: string; count: number }

export type Sort =
  | 'newest' | 'oldest' | 'name' | 'name_desc'
  | 'largest' | 'smallest'
  | 'largest_dim' | 'smallest_dim'
export type TypeFilter = 'all' | 'image' | 'video' | 'model' | 'other'
export type ShapeFilter = 'all' | 'square' | 'not-square'
export type UseFilter = 'all' | 'in-use' | 'unused'
export type ViewMode = 'grid' | 'list'

// "File" and "image" are spelt out because they are genuinely different sorts: a
// 40 MB scan of a stamp and a 40 MB photograph weigh the same and are nothing
// like the same picture. The values are unchanged, so a saved preference from
// before the dimension sorts existed still means what it always did.
export const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'largest', label: 'Largest file first' },
  { value: 'smallest', label: 'Smallest file first' },
  { value: 'largest_dim', label: 'Biggest picture first' },
  { value: 'smallest_dim', label: 'Smallest picture first' },
]

/** The sorts that read Media.width/height, so the page knows when to offer to
 *  measure the images that have never been measured. */
export const DIMENSION_SORTS: Sort[] = ['largest_dim', 'smallest_dim']

/** Proportions, read off the recorded pixel size. Both narrowings show only
 *  measured pictures: videos, 3D files, vectors and anything never measured have
 *  no shape to judge, so they are left out rather than guessed at. */
export const SHAPE_FILTERS: { value: ShapeFilter; label: string }[] = [
  { value: 'all', label: 'Any shape' },
  { value: 'square', label: 'Square (1:1)' },
  { value: 'not-square', label: 'Not square' },
]

export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'model', label: '3D files' },
  { value: 'other', label: 'Other files' },
]

/**
 * How the library root is spelt in a list of folder ids - `null` has none. Kept
 * in step with ROOT_FOLDER_KEY in lib/media/library-query.ts, which is where the
 * server reads it back; restated rather than imported because that module talks
 * to Prisma and this one is loaded by client components.
 */
export const ROOT_FOLDER_KEY = 'root'

/** One line of the Unused view's folder filter: a folder with something spare in
 *  it, already resolved to the path the page shows. */
export type UnusedFolderOption = { key: string; label: string; files: number; size: number }
