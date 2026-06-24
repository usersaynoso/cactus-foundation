import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { Render } from '@puckeditor/core/rsc'
import puckConfig from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function MaintenancePage() {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, maintenancePageId: true },
  })

  if (config?.maintenancePageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.maintenancePageId, status: 'published' },
      select: { title: true, body: true, bodyFormat: true, builderData: true },
    })
    if (page) {
      if (page.bodyFormat === 'builder' && page.builderData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return <Render config={puckConfig} data={page.builderData as any} />
      }
      const html = markdownToHtml(page.body)
      return (
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔧</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>{page.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </main>
      )
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔧</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Down for maintenance
        </h1>
        <p style={{ color: '#6b7280' }}>{config?.siteName ?? 'This site'} is down for scheduled maintenance. We&apos;ll be back shortly.</p>
      </div>
    </main>
  )
}
