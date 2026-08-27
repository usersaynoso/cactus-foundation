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

  it('draws an empty header alongside it', () => {
    // Chrome will not draw a footer without also drawing a header, and its
    // default header is today's date and the page URL across the top of
    // somebody's invoice.
    const capture = read('lib/documents/pdf.ts')
    expect(capture).toContain("headerTemplate: '<span></span>'")
  })
})
