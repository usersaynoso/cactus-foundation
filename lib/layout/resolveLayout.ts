import { prisma } from '@/lib/db/prisma'

export async function resolveLayout(pageLayoutId: string | null | undefined, moduleName: string) {
  // 1. Explicit page override
  if (pageLayoutId) {
    const layout = await prisma.layout.findFirst({ where: { id: pageLayoutId, status: 'published' } }).catch(() => null)
    if (layout) return layout
  }
  // 2. Module default
  const moduleDefault = await prisma.moduleLayoutDefault.findUnique({
    where: { moduleName },
    include: { layout: true },
  }).catch(() => null)
  if (moduleDefault?.layout?.status === 'published') return moduleDefault.layout
  // 3. Site default
  const siteConfig = await prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { defaultLayoutId: true } }).catch(() => null)
  if (siteConfig?.defaultLayoutId) {
    const layout = await prisma.layout.findFirst({ where: { id: siteConfig.defaultLayoutId, status: 'published' } }).catch(() => null)
    if (layout) return layout
  }
  return null
}
