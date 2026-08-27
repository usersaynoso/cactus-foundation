import { describe, it, expect } from 'vitest'
import { bottomMarginForFooter, footerTemplateWidthPx } from '@/lib/documents/pdf'
import { docPageSetup } from '@/lib/documents/page-settings'

// Chrome draws the running footer flush with the bottom EDGE of the sheet and
// does not shorten the page to make room for it. A footer taller than the bottom
// margin grows upwards over the last lines of the document and is painted on top
// of them - the terms of sale disappearing behind a registered office address,
// which is how this was reported.
//
// So the printed bottom margin is the owner's setting raised to fit whatever
// they designed. The arithmetic is here because the alternative way to check it
// is to print a PDF and hold a ruler against it.

const A4 = docPageSetup(undefined)

describe('the bottom margin makes room for the footer', () => {
  it('leaves a margin alone when the footer fits inside it', () => {
    // 30px is a shade under 8mm. With the 5mm Chrome holds it off the edge of
    // the sheet by and 3mm of clear air, the default 16mm still swallows it.
    expect(bottomMarginForFooter(A4, 30)).toBe('16mm')
  })

  it('grows the margin when the footer is taller than it', () => {
    // 100px is 26.5mm; plus 5mm of Chrome's own inset and 3mm of clear air.
    expect(bottomMarginForFooter(A4, 100)).toBe('34.5mm')
  })

  it('never shrinks a margin the owner asked for', () => {
    const roomy = docPageSetup({ marginBottom: '40' })
    expect(bottomMarginForFooter(roomy, 30)).toBe('40mm')
  })

  it('leaves the margin exactly as set when nothing could be measured', () => {
    // A page that would not run script, or a content policy that would not have
    // an inline style. The margin then behaves as it did before any of this.
    expect(bottomMarginForFooter(A4, 0)).toBe('16mm')
    expect(bottomMarginForFooter(A4, Number.NaN)).toBe('16mm')
  })

  it('keeps most of the sheet for the document, whatever the footer wants', () => {
    // A footer asking for the whole page gets 40% of it and no more, on the
    // grounds that printing four hundred pages of nothing is not a fix.
    expect(bottomMarginForFooter(A4, 4_000)).toBe('118.8mm')
  })

  it('measures the ceiling against the sheet as it is being printed', () => {
    // Landscape A4 is 210mm tall, not 297 - so the same footer is allowed less.
    const landscape = docPageSetup({ orientation: 'landscape' })
    expect(bottomMarginForFooter(landscape, 4_000)).toBe('84mm')
  })

  it('reads the paper the page settings chose', () => {
    const a5 = docPageSetup({ pageSize: 'a5' })
    expect(bottomMarginForFooter(a5, 4_000)).toBe('84mm')
    const letter = docPageSetup({ pageSize: 'letter' })
    expect(bottomMarginForFooter(letter, 4_000)).toBe('111.8mm')
  })
})

describe('the footer is measured at the width it is printed at', () => {
  it('lays it out across the full sheet, which is what the template spans', () => {
    // 210mm at 96 CSS pixels to the inch. Measuring at the browser's own
    // viewport width would measure a footer that wraps differently.
    expect(footerTemplateWidthPx(A4)).toBe(794)
    expect(footerTemplateWidthPx(docPageSetup({ orientation: 'landscape' }))).toBe(1123)
    expect(footerTemplateWidthPx(docPageSetup({ pageSize: 'letter' }))).toBe(816)
  })
})
