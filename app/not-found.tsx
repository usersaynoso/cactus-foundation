import { Render } from '@puckeditor/core/rsc'
import { fullPagePuckRscConfig } from '@/lib/puck/config'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { prisma } from '@/lib/db/prisma'
import type { Data } from '@puckeditor/core'

export const dynamic = 'force-dynamic'

export default async function NotFound() {
  const layout = await resolveThemeLayout('notFound', { is404: true }).catch(() => null)
  if (layout?.builderData) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true, adminPath: true, logoMediaId: true },
    }).catch(() => null)
    const logoMedia = config?.logoMediaId
      ? await prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
      : null
    const ctx = { siteName: config?.siteName ?? '', logoUrl: logoMedia?.url ?? null, isLoggedIn: false, adminPath: config?.adminPath ?? '' }
    const resolved = await resolveTemplateData(layout.builderData, ctx).catch(() => layout.builderData as Data)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <Render config={fullPagePuckRscConfig as any} data={resolved as Data} />
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#111827' }}>404</h1>
        <p style={{ color: '#6b7280', fontSize: '1.125rem', margin: 0 }}>This page doesn&apos;t exist.</p>
      </div>
    </main>
  )
}
