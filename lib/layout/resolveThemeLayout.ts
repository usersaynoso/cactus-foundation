import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { scoreConditions, RenderContext, DisplayConditions } from './displayConditions'

// Neither `history` nor `publishedData` is selected. Both hold whole Puck
// payloads (history up to ten of them per layout - see the Layout model in
// prisma/schema.prisma), which would dwarf every other column on a query that
// runs three times or more per page render, and no caller reads either: a
// layout keeps one content blob, and every consumer renders `builderData`.
const LAYOUT_SELECT = {
  id: true,
  name: true,
  type: true,
  builderData: true,
  displayConditions: true,
  priority: true,
  updatedAt: true,
  status: true,
} as const

// Keyed on `type` alone so that header, footer and infoPage resolves each cost
// one query per request no matter how many components ask. React cache() keys on
// argument identity, so the RenderContext object must stay out of the cached
// function - a fresh object literal on every call would never hit the cache.
const getPublishedLayoutsOfType = cache(async (type: string) => {
  return prisma.layout
    .findMany({
      where: { type, status: 'published' },
      select: LAYOUT_SELECT,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    })
    .catch(() => [])
})

export async function resolveThemeLayout(type: string, ctx: RenderContext) {
  const layouts = await getPublishedLayoutsOfType(type)

  let best: (typeof layouts)[number] | null = null
  let bestScore = -1

  for (const layout of layouts) {
    const conditions = layout.displayConditions as DisplayConditions | null
    if (!conditions?.include?.length) continue
    const score = scoreConditions(conditions, ctx)
    if (score > bestScore) {
      best = layout
      bestScore = score
    }
  }

  return best
}
