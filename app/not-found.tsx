import { Render } from '@puckeditor/core/rsc'
import { fullPagePuckRscConfig } from '@/lib/puck/config.rsc'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { prisma } from '@/lib/db/prisma'
import AosInit from '@/lib/puck/components/AosInit'
import EmailDeobfuscator from '@/components/EmailDeobfuscator'
import { buildTokenStyles, buildFontHref } from '@/lib/design/tokens'
import type { DesignTokens } from '@/lib/design/tokens'
import type { Data } from '@puckeditor/core'

export const dynamic = 'force-dynamic'

export default async function NotFound() {
  const layout = await resolveThemeLayout('notFound', { is404: true }).catch(() => null)
  if (layout?.builderData) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true, adminPath: true, logoMediaId: true, logoDarkMediaId: true, designTokens: true },
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

    const tokens = config?.designTokens as DesignTokens | undefined
    const cssStyles = buildTokenStyles(tokens)
    const fontHref = buildFontHref(tokens)

    // This page renders the site's own chrome (header, menu, footer) but sits
    // outside app/(public)/layout.tsx, so it carries its own copies of what that
    // layout provides, as the status pages do: the design token CSS vars and font
    // (without them the 404 design drew in the Cactus defaults rather than the
    // site's own colours and typeface), AOS init, and the email deobfuscator - a
    // protected mailto: link here would never get its href back otherwise (see
    // lib/email-obfuscate).
    return (
      <>
        {fontHref && <link rel="stylesheet" href={fontHref} />}
        {cssStyles && <style dangerouslySetInnerHTML={{ __html: cssStyles }} />}
        <AosInit />
        <EmailDeobfuscator />
        <Render config={fullPagePuckRscConfig as any} data={resolved as Data} metadata={await getPuckRenderMetadata()} />
      </>
    )
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--color-text)' }}>404</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.125rem', margin: 0 }}>This page doesn&apos;t exist.</p>
      </div>
    </main>
  )
}
