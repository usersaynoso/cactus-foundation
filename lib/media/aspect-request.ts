import type { AspectFill } from '@/lib/media/upload'

// Shared request parsing for the single and bulk ratio routes, so the two can't
// disagree about what a valid request looks like. Returns either the parsed
// options or a plain-English error for the caller to hand back as a 400.

export type AspectRequest = {
  ratioW: number
  ratioH: number
  fill: AspectFill
  mode: 'replace' | 'new'
}

// Sanity bound on the ratio itself. Beyond roughly 20:1 the result is a sliver
// of image adrift in an ocean of padding - almost certainly a typo, and the
// pixel cap would then shrink the real image to nothing.
const MAX_RATIO = 20

export function parseAspectRequest(body: unknown): { ok: true; value: AspectRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' }
  const b = body as Record<string, unknown>

  const ratioW = Number(b.ratioW)
  const ratioH = Number(b.ratioH)
  if (!Number.isFinite(ratioW) || !Number.isFinite(ratioH) || ratioW <= 0 || ratioH <= 0) {
    return { ok: false, error: 'ratioW and ratioH must be positive numbers' }
  }
  if (ratioW / ratioH > MAX_RATIO || ratioH / ratioW > MAX_RATIO) {
    return { ok: false, error: `That ratio is beyond ${MAX_RATIO}:1 - check the numbers` }
  }

  const mode = b.mode
  if (mode !== 'replace' && mode !== 'new') return { ok: false, error: "mode must be 'replace' or 'new'" }

  const rawFill = b.fill
  if (!rawFill || typeof rawFill !== 'object') return { ok: false, error: 'fill is required' }
  const f = rawFill as Record<string, unknown>

  let fill: AspectFill
  if (f.kind === 'blur') fill = { kind: 'blur' }
  else if (f.kind === 'transparent') fill = { kind: 'transparent' }
  else if (f.kind === 'colour') {
    if (typeof f.colour !== 'string' || !/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(f.colour.trim())) {
      return { ok: false, error: 'fill.colour must be a hex colour like #ffffff' }
    }
    fill = { kind: 'colour', colour: f.colour.trim() }
  } else {
    return { ok: false, error: "fill.kind must be 'blur', 'colour' or 'transparent'" }
  }

  return { ok: true, value: { ratioW, ratioH, fill, mode } }
}
