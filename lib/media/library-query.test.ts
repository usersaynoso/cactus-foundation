import { describe, expect, it } from 'vitest'
import { OPTIMISABLE_TYPE_WHERE, TYPE_FILTER_WHERE, parseLibraryQuery } from '@/lib/media/library-query'
import {
  ACCEPTED_UPLOAD_TYPES,
  MODEL_EXTENSION_TYPES,
  isOptimisableType,
} from '@/lib/media/limits'

// The "which files can be optimised" rule is written down twice: once as a
// predicate the UI calls (isOptimisableType) and once as a Prisma where clause
// the library list filters on (OPTIMISABLE_TYPE_WHERE). Prisma takes a clause,
// not a function, so there is no way to have only one - but there is a way to
// stop the two disagreeing, which is this test.
//
// The failure it exists to catch is quiet rather than loud: a type added to one
// and not the other doesn't throw, it just makes the "Optimisable" tile's number
// disagree with the list you get when you click the tile, or offers a ⚡ button
// on a card the filtered view says isn't there. That is a bug report about a
// number being wrong, days later, from someone who cannot say what they did.

// Evaluate the narrow slice of Prisma's where syntax this clause actually uses.
// Deliberately not a general implementation: it understands exactly the four
// operators below and throws on anything else, so a future rewrite of the clause
// into a shape this cannot read fails the test rather than silently passing it.
function matches(where: unknown, mimeType: string): boolean {
  const clause = where as Record<string, unknown>

  if (Array.isArray(clause.OR)) return clause.OR.some((c) => matches(c, mimeType))
  if (Array.isArray(clause.AND)) return clause.AND.every((c) => matches(c, mimeType))
  if (clause.NOT) return !matches(clause.NOT, mimeType)

  if ('mimeType' in clause) {
    const m = clause.mimeType
    if (typeof m === 'string') return mimeType === m
    const op = m as Record<string, unknown>
    if (typeof op.startsWith === 'string') return mimeType.startsWith(op.startsWith)
    if (Array.isArray(op.in)) return op.in.includes(mimeType)
    throw new Error(`Unsupported mimeType operator: ${JSON.stringify(m)}`)
  }

  throw new Error(`Unsupported clause: ${JSON.stringify(where)}`)
}

describe('OPTIMISABLE_TYPE_WHERE', () => {
  // Every type a file in this library can actually have, plus a couple that
  // should never qualify, so the two rules are compared over the whole domain
  // rather than over the handful someone thought to list.
  const everyType = [
    ...ACCEPTED_UPLOAD_TYPES,
    ...Object.values(MODEL_EXTENSION_TYPES),
    'application/pdf',
    'text/plain',
    'video/mp4',
  ]

  it.each(everyType)('agrees with isOptimisableType about %s', (mimeType) => {
    expect(matches(OPTIMISABLE_TYPE_WHERE, mimeType)).toBe(isOptimisableType(mimeType))
  })

  it('admits GLB but not the model formats the optimiser cannot compress', () => {
    // Stated outright as well as compared, because "the two agree" would still
    // pass if both were wrong in the same way.
    expect(matches(OPTIMISABLE_TYPE_WHERE, 'model/gltf-binary')).toBe(true)
    for (const type of ['model/gltf+json', 'model/obj', 'model/x-fbx', 'model/x-3ds']) {
      expect(matches(OPTIMISABLE_TYPE_WHERE, type)).toBe(false)
    }
  })

  it('admits rasters but not SVG', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(matches(OPTIMISABLE_TYPE_WHERE, type)).toBe(true)
    }
    expect(matches(OPTIMISABLE_TYPE_WHERE, 'image/svg+xml')).toBe(false)
  })
})

// Every type a file in this library can have. Shared by the partition test
// below, which cares about the whole domain rather than a chosen few.
const EVERY_TYPE = [
  ...ACCEPTED_UPLOAD_TYPES,
  ...Object.values(MODEL_EXTENSION_TYPES),
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/zip',
  'text/plain',
]

describe('TYPE_FILTER_WHERE', () => {
  // The dropdown's four options have to carve the library up cleanly. A type in
  // none of them cannot be reached by any filter - which is what happened to
  // videos and 3D files while "Other" meant "not an image" and they were also
  // counted as images by nothing at all. A type in two would be listed twice.
  it.each(EVERY_TYPE)('files %s under exactly one option', (mimeType) => {
    const hits = (['image', 'video', 'model', 'other'] as const).filter((key) =>
      matches(TYPE_FILTER_WHERE[key], mimeType),
    )
    expect(hits).toHaveLength(1)
  })

  it('puts videos and 3D files under their own options, not under Other', () => {
    expect(matches(TYPE_FILTER_WHERE.video, 'video/mp4')).toBe(true)
    expect(matches(TYPE_FILTER_WHERE.model, 'model/gltf-binary')).toBe(true)
    expect(matches(TYPE_FILTER_WHERE.other, 'video/mp4')).toBe(false)
    expect(matches(TYPE_FILTER_WHERE.other, 'model/x-fbx')).toBe(false)
    // And the things that genuinely are neither still land somewhere.
    expect(matches(TYPE_FILTER_WHERE.other, 'application/pdf')).toBe(true)
  })

  it('counts SVG as an image', () => {
    // It is not optimisable and it has no pixel size, but it is still a picture
    // as far as "show me the images" is concerned.
    expect(matches(TYPE_FILTER_WHERE.image, 'image/svg+xml')).toBe(true)
  })
})

describe('parseLibraryQuery', () => {
  const parse = (params: Record<string, string>) =>
    parseLibraryQuery(new URLSearchParams(params), 25, 1)

  it.each(['newest', 'oldest', 'name', 'name_desc', 'largest', 'smallest', 'largest_dim', 'smallest_dim'])(
    'accepts the %s sort',
    (sort) => {
      expect(parse({ sort }).sort).toBe(sort)
    },
  )

  it.each(['all', 'image', 'video', 'model', 'other'])('accepts the %s type filter', (type) => {
    expect(parse({ type }).type).toBe(type)
  })

  it('falls back rather than trusting a hand-typed value', () => {
    expect(parse({ sort: 'biggest' }).sort).toBe('newest')
    expect(parse({ type: 'audio' }).type).toBe('all')
  })
})
