// Small shared formatters for the media library UI, so the grid, list, detail
// panel and stat bar all render sizes, dates and filenames identically.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function filenameOf(item: { originalName: string | null; key: string }): string {
  return item.originalName || item.key.split('/').pop() || 'Untitled'
}

/** Short, human label for a MIME type, e.g. "image/svg+xml" -> "SVG". */
export function fileKind(mimeType: string): string {
  if (mimeType === 'image/svg+xml') return 'SVG'
  const [group, sub] = mimeType.split('/')
  if (sub) return sub.toUpperCase()
  return group ? group.toUpperCase() : 'File'
}
