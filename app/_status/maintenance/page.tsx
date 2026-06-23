import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function MaintenancePage() {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, maintenancePageId: true },
  })

  let body: string | null = null
  let title = 'Down for maintenance'

  if (config?.maintenancePageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.maintenancePageId, status: 'published' },
      select: { title: true, body: true },
    })
    if (page) {
      title = page.title
      body = markdownToHtml(page.body)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔧</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {title}
        </h1>
        {body ? (
          <div dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          <p style={{ color: '#6b7280' }}>{config?.siteName ?? 'This site'} is down for scheduled maintenance. We'll be back shortly.</p>
        )}
      </div>
    </main>
  )
}
