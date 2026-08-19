import type { MediaCardItem } from './MediaCard'

export type LibraryItem = MediaCardItem & { folderId: string | null; tags: string[] }
export type TagInfo = { id: string; name: string; count: number }

export type Sort =
  | 'newest' | 'oldest' | 'name' | 'name_desc'
  | 'largest' | 'smallest'
  | 'largest_dim' | 'smallest_dim'
export type TypeFilter = 'all' | 'image' | 'video' | 'model' | 'other'
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

export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'model', label: '3D files' },
  { value: 'other', label: 'Other files' },
]
