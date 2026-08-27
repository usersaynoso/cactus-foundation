import type { ReactNode } from 'react'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { moduleRscComponentsByLayoutType } from '@/lib/puck/module-rsc-components'
import { injectDocumentContext } from '@/lib/documents/context'
import { DOCUMENT_FOOTER_LAYOUT_TYPE } from '@/lib/documents/page-settings'

// The RUNNING footer of a printed document: the strip that repeats at the foot
// of every page, drawn by the printing browser into the page's bottom margin.
//
// It is not a block on the document. A footer block on the document itself is
// printed once, after the last line - which is right on a one-page invoice and
// emphatically wrong on a four-page one, where page two ends with a half-finished
// item table and nothing to say whose invoice it is.
//
// So it is a layout of its own, `documentFooter`, rendered into a hidden region
// on the document page (DocumentFooterRegion) and lifted back out of the printed
// page by the capture in lib/documents/pdf.ts.
//
// SERVER ONLY - it reads layouts from the database and pulls in the RSC Puck
// config, which carries every installed module's block. The client-safe half
// (the region, the page settings) lives in lib/documents/page-settings.tsx, and
// the capture lives with the printer, so a PDF route pays for neither.

export { DOCUMENT_FOOTER_LAYOUT_TYPE }

/**
 * The shared PDF footer, as a React tree - or null when nobody has published
 * one, which is every site until somebody makes one.
 *
 * `ctx` is whatever the footer's blocks read, and is deliberately untyped here:
 * an invoice hands over an invoice, a quote a stand-in built from its own
 * trading identity, a purchase order its own document. Core neither knows nor
 * needs to know which - it clones the layout, attaches the object to the part
 * blocks and lets each one read its own slice.
 *
 * `fallbackLayoutTypes` exists for one reason: a module that shipped its own
 * footer layout type before this one existed has owners with a published layout
 * under the old key, and moving them would be a data migration on somebody's
 * live paperwork. Shop passes `['shopDocumentFooter']`, so a site with no
 * `documentFooter` layout keeps printing exactly the footer it printed
 * yesterday.
 */
export async function renderDocumentRunningFooter(
  ctx: unknown,
  opts?: { fallbackLayoutTypes?: string[]; moduleName?: string },
): Promise<ReactNode | null> {
  const types = [DOCUMENT_FOOTER_LAYOUT_TYPE, ...(opts?.fallbackLayoutTypes ?? [])]
  const renderContext = opts?.moduleName ? { moduleName: opts.moduleName } : {}

  for (const layoutType of types) {
    const layout = await resolveThemeLayout(layoutType, renderContext)
    const source = layout?.builderData as Data | undefined
    if (!source) continue

    // Which blocks get the document attached: every block registered for this
    // layout type. A module declares that list in its own manifest
    // (`layoutTypes` on a puckBlock), so the set is exactly the blocks that can
    // appear here - core blocks (a line of text, the site logo) are left alone,
    // as they have no document to read.
    const partTypes = Object.keys(moduleRscComponentsByLayoutType[layoutType] ?? {})
    // Loaded here rather than imported at the top: config.rsc reaches
    // next/headers through other modules' RSC blocks, and a static import would
    // drag that into every caller.
    const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
    const data = injectDocumentContext(source, ctx, partTypes)
    return <Render config={getModuleLayoutPuckRscConfig(layoutType)} data={data as Data} />
  }

  return null
}
