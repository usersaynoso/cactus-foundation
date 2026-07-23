import { nanoid } from 'nanoid'

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

export function generateId(prefix?: string): string {
  const id = nanoid(12)
  return prefix ? `${prefix}_${id}` : id
}

// Returns { page, perPage, skip } for pagination
export function parsePaginationParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
  defaultPerPage = 25
) {
  const get = (key: string) => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) ?? undefined
    }
    const val = searchParams[key]
    return Array.isArray(val) ? val[0] : val
  }

  const page = Math.max(1, parseInt(get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(get('perPage') ?? String(defaultPerPage), 10)))
  const skip = (page - 1) * perPage
  return { page, perPage, skip }
}

// JSON error response helper for API routes
export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export function successResponse<T>(data: T, status = 200) {
  return Response.json(data, { status })
}

// Scheme allow-list for user-supplied "website" fields. A value that parses as
// an http(s) URL is safe to place in an href/src; anything else - a
// "javascript:"/"data:" scheme (stored XSS), or a mailto/tel/relative value a
// website field is never meant to hold - is rejected. Used at every write path
// that stores such a URL and at every render path that emits it.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Truncate a string to a max length, appending ellipsis if truncated
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

// Convert a UTC Date to the site's configured timezone for display
export function formatInTimezone(
  date: Date,
  timezone: string,
  formatStr: string
): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: formatStr.includes('YYYY') ? 'numeric' : undefined,
      month: formatStr.includes('MM') ? '2-digit' : undefined,
      day: formatStr.includes('DD') ? '2-digit' : undefined,
      hour: formatStr.includes('HH') ? '2-digit' : undefined,
      minute: formatStr.includes('mm') ? '2-digit' : undefined,
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}
