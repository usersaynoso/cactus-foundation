import { prisma } from '@/lib/db/prisma'
import { scoreConditions, RenderContext, DisplayConditions } from './displayConditions'

export async function resolveThemeLayout(type: string, ctx: RenderContext) {
  const layouts = await prisma.layout.findMany({
    where: { type, status: 'published' },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  }).catch(() => [] as never[])

  let best: (typeof layouts)[0] | null = null
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
