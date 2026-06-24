import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { markdownToHtml } from '@/lib/sanitize'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { Render } from '@puckeditor/core/rsc'
import puckConfig from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  let setupCompleted = false
  try {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true },
    })
    setupCompleted = cfg?.setupCompleted ?? false
  } catch {
    setupCompleted = false
  }

  if (!setupCompleted) {
    redirect('/setup')
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true, tagline: true, description: true, homepageId: true },
  })

  // If a homepage page is configured, render it inline at /
  if (config?.homepageId) {
    const page = await prisma.infoPage.findUnique({
      where: { id: config.homepageId },
      select: {
        id: true, title: true, body: true, bodyFormat: true, builderData: true,
        status: true,
      },
    }).catch(() => null)

    if (page) {
      // Draft gate
      if (page.status === 'draft') {
        const user = await getSessionFromCookie()
        if (!user || !isAdmin(user)) {
          // Fall through to default
        } else {
          return renderPage(page, true)
        }
      } else {
        return renderPage(page, false)
      }
    }
  }

  // Default welcome screen
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1>{config?.siteName ?? 'Welcome'}</h1>
      {config?.tagline && <p style={{ fontSize: '1.25rem', color: '#6b7280' }}>{config.tagline}</p>}
      {config?.description && <p>{config.description}</p>}
    </div>
  )
}

type PageData = {
  id: string
  title: string
  body: string
  bodyFormat: string
  builderData: unknown
  status: string
}

function renderPage(page: PageData, isDraft: boolean) {
  if (page.bodyFormat === 'builder') {
    const data = page.builderData as Data | null
    if (!data) {
      return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
          {isDraft && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
              This page is a draft and is not visible to the public.
            </div>
          )}
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '4rem 0' }}>
            This page has no builder content yet.
          </p>
        </div>
      )
    }
    return (
      <>
        {isDraft && (
          <div
            className="alert alert-warning"
            style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center' }}
          >
            This page is a draft and is not visible to the public.
          </div>
        )}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Render config={puckConfig} data={data as any} />
      </>
    )
  }

  const html = markdownToHtml(page.body)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      {isDraft && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          This page is a draft and is not visible to the public.
        </div>
      )}
      <article>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 1.5rem', lineHeight: 1.2 }}>
          {page.title}
        </h1>
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ lineHeight: 1.75, color: '#374151' }}
        />
      </article>
    </div>
  )
}
