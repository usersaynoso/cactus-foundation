import { MAX_RESIZE_DIMENSION } from '@/lib/media/resize-plan'

// Shared request parsing for the single and bulk resize routes, so the two can't
// disagree about what a valid request looks like. Mirrors aspect-request.ts:
// returns either the parsed options or a plain-English error for the caller to
// hand back as a 400.

export type ResizeRequest = {
  /** Max width in pixels, or null for "don't constrain this side". */
  width: number | null
  /** Max height in pixels, or null for "don't constrain this side". */
  height: number | null
  mode: 'replace' | 'new'
}

// A side is optional, but at least one has to be there — a resize with neither
// is not a request, it's a typo.
function parseSide(raw: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: `${label} must be a positive number of pixels` }
  if (n > MAX_RESIZE_DIMENSION) return { ok: false, error: `${label} can't be more than ${MAX_RESIZE_DIMENSION}px` }
  return { ok: true, value: Math.round(n) }
}

export function parseResizeRequest(body: unknown): { ok: true; value: ResizeRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' }
  const b = body as Record<string, unknown>

  const w = parseSide(b.width, 'Width')
  if (!w.ok) return { ok: false, error: w.error }
  const h = parseSide(b.height, 'Height')
  if (!h.ok) return { ok: false, error: h.error }
  if (w.value === null && h.value === null) {
    return { ok: false, error: 'Give a width, a height, or both' }
  }

  const mode = b.mode
  if (mode !== 'replace' && mode !== 'new') return { ok: false, error: "mode must be 'replace' or 'new'" }

  return { ok: true, value: { width: w.value, height: h.value, mode } }
}
