import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// The running PDF footer is drawn by handing Chrome a `footerTemplate` built
// from two things lifted out of the printed page: the footer region's markup,
// and the stylesheets that go with it.
//
// WHICH stylesheets is the whole thing, and getting it wrong is invisible to
// every other check in this suite. The first version swept the page for every
// `<style>` on it, on the reasoning that the footer should look like the
// document. What that actually copied into the template was the document page's
// own chrome-stripping rule:
//
//     body > *:not(main) { display: none !important; }
//
// which is there to hide the site header and footer around the document. Inside
// the template the footer's own wrapper IS a child of body and is not `main`, so
// the rule matched it and the PDF printed no footer at all - on every page, with
// no error, for every document. tsc, eslint and every test here passed
// throughout; it took printing a PDF and looking at it.
//
// The capture used to live in the shop module and, copied, in Quote for Shop.
// It is core's now, so this guard is core's too - and there is one of it rather
// than one per module that prints something.

const repoRoot = join(__dirname, '..', '..')
const read = (relative: string) => readFileSync(join(repoRoot, relative), 'utf8')

describe('the running footer takes only the stylesheets its own region carries', () => {
  it('scopes the stylesheet capture to the region', () => {
    const capture = read('lib/documents/pdf.ts')
    // The capture runs inside page.evaluate. It must read <style> out of the
    // footer region, never out of the whole document - see the note above.
    expect(capture).toContain("region!.querySelectorAll('style')")
    expect(capture).not.toContain("document.querySelectorAll('style')")
  })

  it('forces the footer visible whatever the captured rules decide', () => {
    // Belt and braces on top of the scoping: the region's own stylesheet is the
    // document's, written for a document, and the template is not one.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('RUNNING_FOOTER_FORCE')
    expect(capture).toContain('.cactus-pdf-footer { display: block !important; }')
  })

  it('carries the theme tokens across with the markup', () => {
    // The other half of the same story, and the same silent failure. The
    // region's stylesheet READS tokens (`var(--color-border)`) that the theme
    // sets on :root, several levels above the region - so the template got the
    // rules without the values, and a declaration whose var() cannot be resolved
    // is thrown away WHOLE. `border-top: 1px solid var(--color-border)` lost its
    // border-STYLE along with its colour, and the rule above the small print
    // printed as no rule at all, on every document, for months.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('getComputedStyle(region!)')
    expect(capture).toContain(':root { ')
    // Read at the region, not at :root - custom properties inherit, so this is
    // the theme's values plus anything the document narrowed on the way down.
    expect(capture).toContain('footer.tokens')
  })

  it('makes the bottom margin deep enough to hold the footer', () => {
    // Chrome draws the footer flush with the bottom of the sheet and does not
    // shorten the page for it, so a footer taller than the margin is painted
    // over the last lines of the document. The arithmetic is pinned separately
    // in pdf-footer-fit.test.ts; what matters here is that it is actually used.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('bottomMarginForFooter(')
    expect(capture).toContain('measureFooterHeight(page, footerTemplate')
    expect(capture).toContain('margin,')
  })

  it('hangs the measuring iframe off the root, not off the body', () => {
    // Third time the same rule has bitten. Every document page strips the site
    // chrome with `body > *:not(main) { display: none !important; }` - it once
    // ate the footer, and it then ate the iframe the footer is MEASURED in: an
    // element with no display has no layout, a document inside a frame with no
    // layout measures zero, and a zero measurement leaves the margin exactly as
    // it was. Which is how a fix that worked on a test page shipped without
    // fixing a single live document.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('document.documentElement.appendChild(frame)')
    expect(capture).not.toContain('document.body.appendChild(frame)')
    // And an inline !important on top, for whatever the next page hides.
    expect(capture).toContain('display: block !important; visibility: visible !important;')
  })

  it('says the fitted margin again in CSS, or Chrome ignores it', () => {
    // The third and worst of the three. A document page emits its own
    // `@page { margin: … }` (DocumentPageStyle) so Ctrl+P matches the Download
    // button - and a CSS @page margin BEATS the margin handed to page.pdf().
    // `preferCSSPageSize` governs the page SIZE and does nothing about this. So
    // the fitted bottom margin was computed, passed, accepted and thrown away,
    // and the footer went on printing across the last two lines of every
    // invoice through two releases that each claimed to have fixed it.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('@page { margin-bottom: ${margin.bottom}; }')
    // Last element of the body, so it is last in document order and wins the
    // cascade against the layout's own rule.
    expect(capture).toContain('document.body.appendChild(style)')
    // Only the bottom, and only when the footer actually needed more room: the
    // other three sides are the owner's and must not be rewritten.
    expect(capture).toContain('if (margin.bottom !== paper.margin.bottom)')
  })

  it('measures the same template it prints', () => {
    // Measuring anything else - the region on the document page, say, where the
    // page's own stylesheet applies and the template's does not - measures a
    // different document from the one being printed.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain('const footerTemplate = footer ? runningFooterTemplate(')
    expect(capture).toContain('footerTemplate,')
  })

  it('draws an empty header alongside it', () => {
    // Chrome will not draw a footer without also drawing a header, and its
    // default header is today's date and the page URL across the top of
    // somebody's invoice.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain("headerTemplate: '<span></span>'")
  })
})
