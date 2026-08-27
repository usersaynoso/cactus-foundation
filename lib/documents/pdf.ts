import type { PaperFormat, Page } from 'puppeteer-core'
import { getSiteUrl } from '@/lib/config/env'
import { docPageSetup, PDF_FOOTER_REGION_ID, type DocPageSetup } from '@/lib/documents/page-settings'

// Turning a designed document into a PDF.
//
// The document is printed by a headless browser opening the document's own page,
// so the PDF is the layout the owner designed - the same markup, the same CSS,
// the same figures - rather than a second rendering of it that would drift the
// first time somebody moved a block.
//
// This used to exist twice, once in the shop module and once, copied wholesale,
// in Quote for Shop. Every hard-won detail below had to be got right in both
// places, and the second copy was already a release behind on one of them. It is
// core's now, so the next module that prints something inherits the lot.
//
// Both heavy packages are dynamically imported, so a site that never presses the
// button never loads a browser. They are declared in next.config.ts's
// serverExternalPackages, and @sparticuz/chromium's brotli packs are traced into
// every /api/m/** function there - which is what makes this work deployed as
// well as locally.
//
// Two environments, deliberately different:
//
//  - Deployed (Linux serverless): @sparticuz/chromium supplies the binary, and
//    its args are the ones that make chromium survive a read-only filesystem
//    with no /dev/shm worth speaking of.
//  - A developer's own machine: there is no Linux binary to unpack, so it uses a
//    locally installed Chrome. CHROME_PATH names it; failing that the usual
//    macOS and Linux install paths are tried. If none is there, the caller gets
//    a clear refusal rather than a stack trace.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MAC_CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium'
const LINUX_CHROME = '/usr/bin/google-chrome'
const LINUX_CHROMIUM = '/usr/bin/chromium'

/** True on a serverless/Linux deployment, where the packaged chromium is the one
 *  to use. AWS_LAMBDA_FUNCTION_NAME is set on Vercel's Node runtime. */
function isServerless(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL)
}

async function localChromePath(): Promise<string | null> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const { existsSync } = await import('fs')
  for (const candidate of [MAC_CHROME, MAC_CHROMIUM, LINUX_CHROME, LINUX_CHROMIUM]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * The site-relative URL a document is printed from, with a nonce on the end.
 *
 * The nonce is not decoration. `renderDocumentPdf` prints by opening the
 * document's own page over HTTP from the site's public address, which means the
 * request leaves the box and comes back in through whatever sits in front of it.
 * That layer caches, and it does so in spite of the `no-store` this page and
 * every one of these routes answers with - a print URL is a fixed string (the
 * number, its signed token, `print=1`), so once one copy is held, every PDF made
 * afterwards is that copy.
 *
 * What that looked like: an owner published a redesigned proforma layout, saw it
 * on screen, and kept getting PDFs of the old one - for half an hour, from a URL
 * reporting `age: 1671` on a cache MISS. The on-screen page was fine throughout,
 * because a human opens it WITHOUT `print=1` and so never touches the poisoned
 * key. Invoices and credit notes had the same fault and nobody had caught it,
 * because a layout is usually designed once and then left alone.
 *
 * A unique URL per render cannot be served from a cache, whoever is caching and
 * whatever they think of our headers. It costs one query parameter that the page
 * itself never reads.
 */
export function printPath(page: string, token: string): string {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${page}?t=${encodeURIComponent(token)}&print=1&r=${nonce}`
}

/** No browser, or a browser that would not start or would not load the page.
 *  Always a plain refusal the owner can act on, never a stack trace. */
export class DocumentPdfUnavailableError extends Error {}

/**
 * Chrome draws a running header and footer in a document of its own, with no
 * access to the page's stylesheets, no network and a root font-size of zero -
 * so `0.75rem` in the document's own CSS comes out as nothing at all there.
 *
 * These rules go in FIRST, ahead of the page's own, so every relative size in
 * the document stylesheet has a sane base to be relative to and anything the
 * document says about itself still wins.
 */
const RUNNING_FOOTER_RESET = `
html, body { margin: 0; padding: 0; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cactus-pdf-footer { width: 100%; box-sizing: border-box; font-size: 9px; line-height: 1.4; color: #444; }
.cactus-pdf-footer * { box-sizing: border-box; }
`

/**
 * And the last word, after the document's own rules have had theirs.
 *
 * The template is a document of its own, and the footer sits directly under its
 * body - a place the document's stylesheet has opinions about that make no sense
 * here. Whatever those rules decide, the footer is the only thing on the page
 * and it is not optional.
 */
const RUNNING_FOOTER_FORCE = `
.cactus-pdf-footer, .cactus-pdf-footer * { visibility: visible !important; }
.cactus-pdf-footer { display: block !important; }
`

type RunningFooter = { html: string; css: string }

/**
 * Lifts the footer region out of the printed page, with the stylesheets it
 * carries, so the running footer is drawn from the same blocks and the same
 * rules as the document itself. Null when nobody has published a PDF footer
 * layout, which is the ordinary case and costs one query selector.
 *
 * Only the stylesheets INSIDE THE REGION, which is the whole trick and was
 * learned the hard way. Every document part emits the shared document stylesheet
 * itself, so the region already carries everything the footer's own blocks need
 * - and the page's `<style>` tags carry things that have no business in a footer
 * template. `body > *:not(main) { display: none !important }` is the one that
 * mattered: it strips the site chrome off the document page, and copied into the
 * template it matched the footer's own wrapper and printed nothing at all, on
 * every page, silently. A page-wide sweep for `<style>` looked like the obvious
 * way to make the footer match the document; it was the way to make the footer
 * disappear. Pinned by lib/documents/pdf-footer-scope.test.ts.
 *
 * It lives beside the printer rather than beside the footer renderer on purpose:
 * this half only ever runs against a puppeteer Page, and the other half drags in
 * the database and every module's RSC block map, which a PDF route has no reason
 * to carry.
 */
async function captureRunningFooter(page: Page): Promise<RunningFooter | null> {
  try {
    return await page.evaluate((id: string) => {
      const region = document.getElementById(id)
      const html = region?.innerHTML?.trim() ?? ''
      if (!html) return null
      const css = Array.from(region!.querySelectorAll('style'))
        .map((node) => node.textContent ?? '')
        .join('\n')
      return { html, css }
    }, PDF_FOOTER_REGION_ID)
  } catch {
    // A page that would not run script is still a page worth printing. The
    // footer is a nicety; the document is the point.
    return null
  }
}

export type RenderDocumentPdfOptions = {
  /** The document's own page, site-relative, token and all. Build it with
   *  `printPath`. Not an absolute URL: it is resolved against the site's own
   *  address here, because that is the address the browser has to be able to
   *  reach. */
  path: string
  /** The paper, margins and scale the layout's page settings asked for. Absent
   *  falls back to exactly the figures this used to hard-code. */
  pageSetup?: DocPageSetup
  /** Extra rules for the running-footer template, injected between the reset
   *  above and the footer region's own stylesheets. A module whose footer blocks
   *  need a nudge inside the template (their top margin dropped, say) puts it
   *  here rather than in core, which has never heard of its class names. */
  footerCss?: string
  /** What to call the document in a refusal: "The invoice page could not be
   *  loaded to print". */
  label?: string
}

/**
 * Prints one document to PDF bytes.
 *
 * The page is fetched over HTTP from the site's own address rather than rendered
 * in-process, because that is the only way to be certain the PDF and the page
 * agree - and because a Puck layout of async server components cannot be
 * rendered to a string by hand.
 */
export async function renderDocumentPdf(options: RenderDocumentPdfOptions): Promise<Uint8Array> {
  const { path, pageSetup, footerCss = '', label = 'document' } = options

  const [{ default: puppeteer }, chromiumModule] = await Promise.all([
    import('puppeteer-core'),
    isServerless() ? import('@sparticuz/chromium') : Promise.resolve(null),
  ])
  const chromium = chromiumModule?.default ?? null

  // executablePath() unpacks the brotli-packed browser, so it throws when the
  // packs are missing from the deployment - the file tracer cannot see them
  // (they are read by fs against the package's own directory), which is why
  // next.config.ts names them in outputFileTracingIncludes. Reported as an
  // unavailable browser rather than a generic fault, because that is what it is
  // and the fix is a build setting.
  let executablePath: string | null = null
  try {
    executablePath = chromium ? await chromium.executablePath() : await localChromePath()
  } catch (error) {
    throw new DocumentPdfUnavailableError(
      `The packaged browser could not be unpacked: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!executablePath) {
    throw new DocumentPdfUnavailableError(
      'No browser is available to make a PDF. Install Google Chrome locally, or set CHROME_PATH.',
    )
  }

  // A launch failure is the other half of the same story: the binary is there
  // but will not run (a missing shared library, no memory left in the function).
  // Same treatment - a plain refusal the owner can act on.
  let browser
  try {
    browser = await puppeteer.launch({
      executablePath,
      args: chromium ? chromium.args : ['--no-sandbox', '--disable-dev-shm-usage'],
      headless: true,
      // Sized to a sheet of A4 at 96dpi, so a layout with a breakpoint in it
      // prints its desktop shape rather than its phone one.
      defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
    })
  } catch (error) {
    throw new DocumentPdfUnavailableError(
      `The browser would not start: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    const page = await browser.newPage()
    // The site's own address. A deployment that keeps its preview URLs behind
    // Vercel's protection cannot be fetched by its own function without a bypass
    // token, which is why this can fail on a preview and work in production.
    const url = `${getSiteUrl()}${path}`
    // 25s of the dispatcher's 60s ceiling. A document page is one database read
    // and a logo; anything slower than this is broken, not busy.
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 25_000 })
    if (!response || !response.ok()) {
      throw new DocumentPdfUnavailableError(
        `The ${label} page could not be loaded to print (${response?.status() ?? 'no response'}).`,
      )
    }
    // Print rules, not screen ones - the document's own @media print block is
    // what turns a dark-mode page back into ink on paper.
    await page.emulateMediaType('print')
    const paper = pageSetup ?? docPageSetup(undefined)
    const footer = await captureRunningFooter(page)
    const pdf = await page.pdf({
      format: paper.format as PaperFormat,
      // Backgrounds on by default, or every rule and border in the document
      // prints white. An owner who would rather save the ink can say so.
      printBackground: paper.printBackground,
      margin: paper.margin,
      scale: paper.scale,
      preferCSSPageSize: false,
      // The running footer, when one has been designed. Chrome will not draw a
      // footer without also drawing a header, so an empty one is supplied -
      // otherwise it helpfully prints today's date and the page URL across the
      // top of somebody's invoice.
      ...(footer
        ? {
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `<style>${RUNNING_FOOTER_RESET}${footerCss}${footer.css}${RUNNING_FOOTER_FORCE}</style><div class="cactus-pdf-footer" style="padding: 0 ${paper.margin.right} 0 ${paper.margin.left};">${footer.html}</div>`,
          }
        : {}),
    })
    return pdf
  } finally {
    // Always, even when the print threw: a leaked browser on a warm serverless
    // instance is a memory leak that outlives the request that caused it.
    await browser.close().catch(() => {})
  }
}

/** The filename a browser saves it as. */
export function documentPdfFilename(prefix: string, number: string, fallbackPrefix = 'document'): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${clean(prefix) || fallbackPrefix}-${clean(number) || 'document'}.pdf`
}
