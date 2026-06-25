import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { Render } from '@puckeditor/core/rsc'
import puckConfig from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function ComingSoonPage() {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, comingSoonPageId: true },
  })

  if (config?.comingSoonPageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.comingSoonPageId, status: 'published' },
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cactus.svg" alt="Cactus" style={{ width: '4rem', height: '4rem', marginBottom: '1rem' }} />
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cactus.svg" alt="Cactus" style={{ width: '4rem', height: '4rem', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {config?.siteName ?? 'Coming Soon'}
        </h1>
        <p style={{ color: '#6b7280' }}>Coming Soon — we&apos;ll be back soon.</p>
      </div>
    </main>
  )
}
