import { describe, it, expect } from 'vitest'
import http from 'http'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { renderDocumentPdf } from '@/lib/documents/pdf'
import { docPageSetup } from '@/lib/documents/page-settings'

// A REAL document page, printed by a REAL browser, kept in the repo on purpose.
//
// The running footer printing over the last lines of every invoice took three
// goes to fix, and the reason each fix "worked" was the same both times: it was
// verified against a made-up document page that was missing something a real one
// has. First it was the chrome-stripping rule; then it was the `@page` rule.
// Nothing else in this suite can see either, because none of it prints anything.
//
// So the fixture below is the guard, and EVERY line of it is load-bearing:
//
//   - `body > *:not(main) { display: none !important; }` - what a document page
//     uses to hide the site header and footer. It hid the iframe the footer's
//     height was measured in, so the measurement came back zero and the margin
//     never grew (fixed in 0.5.1360, by measuring off `documentElement`).
//   - `@page { margin: … }` - what DocumentPageStyle emits so Ctrl+P matches the
//     Download button. A CSS @page margin BEATS the margin handed to page.pdf(),
//     so the fitted margin was computed, accepted, and thrown away (fixed by
//     injecting the fitted bottom margin back as CSS).
//   - a footer region taller than the page's own bottom margin - the whole point.
//
// Do not "simplify" the fixture. Every simplification so far has been the bug.
//
// Gated because it needs a browser: RENDER_PDF_CHECKS=1 npx vitest run
// lib/documents/pdf-print-harness.test.ts
// It writes the PDFs to a temp directory and prints the path, because the only
// honest way to finish this job is to look at one.

const BARE_CSS = `
  body > *:not(main) { display: none !important; }
  body > main { display: block !important; margin: 0 !important; padding: 0 !important; }
  body { margin: 0; background: #fff; }
`

/** Exactly what DocumentPageStyle emits for a layout nobody has touched. */
const AT_PAGE = `@page { size: A4 portrait; margin: 16mm 14mm 16mm 14mm; }`

const BODY = Array.from({ length: 26 }, (_, i) =>
  `<p>Paragraph ${i + 1}. Prices exclude VAT unless stated. VAT is charged at the rate shown on the tax point date. Title passes on payment in full.</p>`,
).join('\n')

/** Four lines of footer in a 16mm margin: taller than the space it is given,
 *  which is the ordinary case and the one that used to overprint. */
const FOOTER = `
  <hr style="border:0;border-top:1px solid #c8c8c8;margin:0 0 4px">
  <p style="text-align:center;margin:0 0 2px">example.co.uk &middot; hi@example.co.uk</p>
  <p style="text-align:center;margin:0">Example Limited, registered in England and Wales, company number 00000000. VAT number GB 000 000 000.<br>Registered office: 1 Example Street, London E1 1AA.</p>
  <p style="text-align:right;margin:2px 0 0">Page <span class="pageNumber"></span> of <span class="totalPages"></span></p>
`

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; font-family: Georgia, serif; color: #111; font-size: 13px; line-height: 1.5; }
${BARE_CSS}
${AT_PAGE}
</style></head><body>
<header>site chrome</header>
<main>${BODY}
<div id="cactus-pdf-footer" class="cactus-pdf-footer" style="display:none">${FOOTER}</div>
</main>
<footer>site footer</footer>
</body></html>`

describe.skipIf(!process.env.RENDER_PDF_CHECKS)('a document page printed by a real browser', () => {
  it('prints a footer that does not land on the document', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(PAGE)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const previousSiteUrl = process.env.SITE_URL
    process.env.SITE_URL = `http://127.0.0.1:${port}`
    try {
      const pdf = await renderDocumentPdf({ path: '/doc', pageSetup: docPageSetup(undefined), label: 'invoice' })
      expect(pdf.byteLength).toBeGreaterThan(1000)
      const dir = mkdtempSync(join(tmpdir(), 'cactus-pdf-'))
      const file = join(dir, 'document.pdf')
      writeFileSync(file, pdf)
      console.log(`\nPrinted: ${file}\nOpen it. The small print must sit BELOW the last line of the document, not across it.\n`)
    } finally {
      server.close()
      if (previousSiteUrl === undefined) delete process.env.SITE_URL
      else process.env.SITE_URL = previousSiteUrl
    }
  }, 180_000)
})
