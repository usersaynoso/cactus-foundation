import { Render } from '@puckeditor/core/rsc'
import { fullPagePuckRscConfig } from '@/lib/puck/config.rsc'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { prisma } from '@/lib/db/prisma'
import EmailDeobfuscator from '@/components/EmailDeobfuscator'
import type { Data } from '@puckeditor/core'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function ComingSoonPage() {
  const layout = await resolveThemeLayout('statusPage', { siteStatus: 'coming_soon' }).catch(() => null)
  if (layout?.builderData) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true, adminPath: true, logoMediaId: true, logoDarkMediaId: true },
    }).catch(() => null)
    const [logoMedia, logoDarkMedia] = await Promise.all([
      config?.logoMediaId
        ? prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
        : null,
      config?.logoDarkMediaId
        ? prisma.media.findUnique({ where: { id: config.logoDarkMediaId }, select: { url: true } }).catch(() => null)
        : null,
    ])
    const ctx = { siteName: config?.siteName ?? '', logoUrl: logoMedia?.url ?? null, logoDarkUrl: logoDarkMedia?.url ?? null, isLoggedIn: false, adminPath: config?.adminPath ?? '' }
    const resolved = await resolveTemplateData(layout.builderData, ctx).catch(() => layout.builderData as Data)

    // Renders the site's own chrome but sits outside app/(public)/layout.tsx,
    // so it carries its own email deobfuscator - without it a protected mailto:
    // link on this page would never get its href back (see lib/email-obfuscate).
    return (
      <>
        <EmailDeobfuscator />
        <Render config={fullPagePuckRscConfig as any} data={resolved as Data} />
      </>
    )
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { siteName: true },
  }).catch(() => null)

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cactus.svg" alt="Cactus Foundation" style={{ width: '4rem', height: '4rem', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {config?.siteName ?? 'Coming Soon'}
        </h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Coming soon - we&apos;ll be back shortly.</p>
      </div>
    </main>
  )
}
