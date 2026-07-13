import type { MediaCardItem } from './MediaCard'

export type LibraryItem = MediaCardItem & { folderId: string | null; tags: string[] }
export type TagInfo = { id: string; name: string; count: number }

export type Sort = 'newest' | 'oldest' | 'name' | 'name_desc' | 'largest' | 'smallest'
export type TypeFilter = 'all' | 'image' | 'other'
export type UseFilter = 'all' | 'in-use' | 'unused'
export type ViewMode = 'grid' | 'list'

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'largest', label: 'Largest first' },
  { value: 'smallest', label: 'Smallest first' },
]
