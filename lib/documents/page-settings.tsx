// Page settings for a printed document - the paper, the margins, which way up
// and how much everything is scaled by - and the reader that turns them into
// print instructions.
//
// These are settings that belong to the SHEET rather than to any block on it.
// Nothing on the document can express them, because none of them is something a
// block draws: the margins of a PDF are decided by the browser printing it, not
// by the markup.
//
// So they live on the layout's ROOT, which a layout type declares as its page
// settings (a module through `pageSettings` in cactus.module.json, core through
// lib/puck/core-layout-roots.ts). In the layout editor they are the fields shown
// with nothing selected; on the published document they become the @page rule
// below, so pressing Ctrl+P in a browser gives the same margins the Download PDF
// button does; and `docPageSetup` reads them back out of the saved layout for
// the headless browser that makes the file.
//
// This used to live in the shop module (lib/doc-page-settings.tsx) and was
// copied into Quote for Shop, which is why it is here: an invoice, a proforma, a
// credit note, a quote and a purchase order are one filing cabinet, and a module
// that prints paperwork should not have to bring its own idea of what A4 is.
// Shop and Quote both re-export these under their old names, so nothing an owner
// has already published moves.
//
// CLIENT-SAFE, and it has to stay that way: this file is reached from the Puck
// editor bundle as well as from the server. No next/headers, no prisma, nothing
// that touches either.

import type { CSSProperties, ReactNode } from 'react'

/**
 * The one global layout type for a document's RUNNING footer - the strip that
 * repeats at the foot of every page of a PDF.
 *
 * Global on purpose. An invoice, the credit note that reverses it, the proforma
 * that came before it and the purchase order that paid for the goods are all one
 * folder on somebody's desk, and a footer designed once belongs on the lot. One
 * layout type means one design; a type per document type would mean the same
 * small print built four times and drifting three ways.
 */
export const DOCUMENT_FOOTER_LAYOUT_TYPE = 'documentFooter'

/**
 * The id of the region a document page renders its PDF footer layout into.
 *
 * Hidden on screen: it is not part of the document. It is what gets lifted out
 * of the printed page and handed to the browser as a RUNNING footer - the thing
 * that repeats at the foot of every page, rather than sitting once at the end of
 * the last one, which is what a footer block on the document itself does.
 */
export const PDF_FOOTER_REGION_ID = 'cactus-pdf-footer'

/** Wraps the PDF footer layout on a document page. `display: none` rather than
 *  the `hidden` attribute so nothing about it can reach the visible page, and
 *  innerHTML is read out of it all the same - a hidden element still has one. */
export function DocumentFooterRegion({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div id={PDF_FOOTER_REGION_ID} className="cactus-pdf-footer" style={{ display: 'none' }}>
      {children}
    </div>
  )
}

/** Paper. The four an English small business ever asks for, plus the two an
 *  American customer's accountant does. */
const A4 = { css: 'A4', pdf: 'a4' }

const PAGE_SIZES: Record<string, { css: string; pdf: string }> = {
  a4: A4,
  a5: { css: 'A5', pdf: 'a5' },
  a3: { css: 'A3', pdf: 'a3' },
  letter: { css: 'Letter', pdf: 'letter' },
  legal: { css: 'Legal', pdf: 'legal' },
  tabloid: { css: 'Tabloid', pdf: 'tabloid' },
}

/** Millimetres, as a menu. A margin is not a number anybody wants to type - it
 *  is one of about a dozen sensible amounts, and typing 1.6 when you meant 16
 *  produces a document nobody can file. */
const MARGIN_MM = [0, 5, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40, 50]

const marginField = (label: string) => ({
  type: 'select' as const,
  label,
  options: MARGIN_MM.map((mm) => ({ value: String(mm), label: mm === 0 ? 'None' : `${mm}mm` })),
})

/** What the document looked like before any of this existed. Every default here
 *  is the figure the PDF renderer used to hard-code, so a layout nobody has
 *  touched prints byte-for-byte the PDF it printed last week. */
export const DOC_PAGE_DEFAULTS = {
  pageSize: 'a4',
  orientation: 'portrait',
  marginTop: '16',
  marginBottom: '16',
  marginLeft: '14',
  marginRight: '14',
  scale: '100',
  printBackground: 'yes',
}

export type DocPageProps = Partial<Record<keyof typeof DOC_PAGE_DEFAULTS, string>>

/** One margin in millimetres, defaulting to what the PDF always used. */
function mm(value: string | undefined, fallback: string): number {
  const n = Number((value ?? '').trim() === '' ? fallback : value)
  return Number.isFinite(n) && n >= 0 ? n : Number(fallback)
}

/** Everything the printing browser needs, read off a saved layout's root props. */
export type DocPageSetup = {
  format: string
  landscape: boolean
  margin: { top: string; bottom: string; left: string; right: string }
  scale: number
  printBackground: boolean
}

export function docPageSetup(props: DocPageProps | undefined | null): DocPageSetup {
  const p = props ?? {}
  const size = PAGE_SIZES[p.pageSize ?? DOC_PAGE_DEFAULTS.pageSize] ?? A4
  // Clamped rather than trusted: `page.pdf` refuses a scale outside 0.1-2 with
  // an exception, and a layout carrying nonsense must still produce a document.
  const rawScale = Number(p.scale ?? DOC_PAGE_DEFAULTS.scale)
  const scale = Number.isFinite(rawScale) ? Math.min(200, Math.max(50, rawScale)) / 100 : 1
  return {
    format: size.pdf,
    landscape: p.orientation === 'landscape',
    margin: {
      top: `${mm(p.marginTop, DOC_PAGE_DEFAULTS.marginTop)}mm`,
      bottom: `${mm(p.marginBottom, DOC_PAGE_DEFAULTS.marginBottom)}mm`,
      left: `${mm(p.marginLeft, DOC_PAGE_DEFAULTS.marginLeft)}mm`,
      right: `${mm(p.marginRight, DOC_PAGE_DEFAULTS.marginRight)}mm`,
    },
    scale,
    printBackground: p.printBackground !== 'no',
  }
}

/** The same thing, from a saved layout's whole builderData. Undefined data - no
 *  published layout at all - gives the defaults, which is what the fallback
 *  starter is drawn at. */
export function docPageSetupFromLayout(data: unknown): DocPageSetup {
  const root = (data as { root?: { props?: DocPageProps } } | null | undefined)?.root
  return docPageSetup(root?.props)
}

/**
 * The @page rule, so a browser printing the page by hand lands on the same
 * paper as the Download PDF button.
 *
 * Rendered ahead of the document's own blocks by the layout root. It is a
 * document-wide at-rule and cannot be scoped to a subtree, which is exactly why
 * it is here on the root and not on a block: one document, one sheet.
 */
export function DocumentPageStyle(props: DocPageProps) {
  const size = PAGE_SIZES[props.pageSize ?? DOC_PAGE_DEFAULTS.pageSize] ?? A4
  const setup = docPageSetup(props)
  const css = `@page { size: ${size.css} ${setup.landscape ? 'landscape' : 'portrait'}; margin: ${setup.margin.top} ${setup.margin.right} ${setup.margin.bottom} ${setup.margin.left}; }`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

/** The root config a document layout type hands to Puck. */
export const documentPageSettings = {
  fields: {
    pageSize: { type: 'select' as const, label: 'Paper', options: [
      { value: 'a4', label: 'A4' },
      { value: 'a5', label: 'A5' },
      { value: 'a3', label: 'A3' },
      { value: 'letter', label: 'US Letter' },
      { value: 'legal', label: 'US Legal' },
      { value: 'tabloid', label: 'Tabloid' },
    ] },
    orientation: { type: 'select' as const, label: 'Which way up', options: [
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
    ] },
    marginTop: marginField('Margin at the top'),
    marginBottom: marginField('Margin at the bottom (the repeating footer sits in it)'),
    marginLeft: marginField('Margin at the left'),
    marginRight: marginField('Margin at the right'),
    scale: { type: 'select' as const, label: 'Print everything at', options: [
      { value: '70', label: '70% - squeezes a long invoice onto fewer pages' },
      { value: '80', label: '80%' },
      { value: '90', label: '90%' },
      { value: '100', label: '100%' },
      { value: '110', label: '110%' },
      { value: '120', label: '120% - larger, for a document that gets read across a desk' },
    ] },
    printBackground: { type: 'select' as const, label: 'Backgrounds and shading', options: [
      { value: 'yes', label: 'Print them' },
      { value: 'no', label: 'Leave them off - ink is expensive' },
    ] },
  },
  defaultProps: DOC_PAGE_DEFAULTS,
  before: DocumentPageStyle,
}

const FOOTER_ALIGN: Record<string, CSSProperties> = {
  stretch: {},
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
}

/** The running footer's own alignment and inset, as a scoped rule. Scoped by
 *  class rather than emitted as an at-rule, because this one IS a subtree. */
export function DocumentFooterPageStyle(props: { align?: string; inset?: string }) {
  const align = FOOTER_ALIGN[props.align ?? 'stretch'] ?? {}
  const inset = Number(props.inset ?? '0')
  const padding = Number.isFinite(inset) && inset > 0 ? `padding: 0 ${inset}mm;` : ''
  const textAlign = align.textAlign ? `text-align: ${String(align.textAlign)};` : ''
  const css = padding || textAlign ? `.cactus-pdf-footer { ${padding} ${textAlign} }` : ''
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null
}

/** Nothing but the sheet - no margins to speak of and no @page rule that would
 *  fight the document's own. Used by the PDF footer layout types, whose blocks
 *  are drawn into the margin of a page somebody else has already sized. */
export const documentFooterPageSettings = {
  fields: {
    align: { type: 'select' as const, label: 'The footer sits', options: [
      { value: 'stretch', label: 'Across the full width' },
      { value: 'left', label: 'At the left' },
      { value: 'center', label: 'Centred' },
      { value: 'right', label: 'At the right' },
    ] },
    inset: { type: 'select' as const, label: 'Kept in from the page edges by', options: [
      { value: '0', label: 'Nothing - the page margin already does it' },
      { value: '4', label: '4mm' },
      { value: '8', label: '8mm' },
      { value: '12', label: '12mm' },
    ] },
  },
  defaultProps: { align: 'stretch', inset: '0' },
  before: DocumentFooterPageStyle,
}
