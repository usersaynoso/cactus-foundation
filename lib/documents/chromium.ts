// Finding a browser to print with.
//
// Two environments, deliberately different:
//
//  - Deployed (Linux serverless): @sparticuz/chromium-min supplies a chromium
//    built to survive a read-only filesystem with almost no /dev/shm, along with
//    the launch args that make it do so.
//  - A developer's own machine: there is no Linux binary to fetch, so a locally
//    installed Chrome is used. CHROME_PATH names it; failing that the usual macOS
//    and Linux install paths are tried. If none is there the caller gets a clear
//    refusal rather than a stack trace.
//
// Why the "-min" package rather than @sparticuz/chromium, which ships the browser
// with it: the full package puts 66 MB of brotli packs in node_modules, and
// node_modules is half of what Vercel saves as the build cache. That cache has a
// hard 1.5 GB limit, and going over it does not cost a little - the WHOLE cache is
// thrown away, so the next deploy pays a cold install, a cold Turbopack compile
// and a full output re-upload, about two and a half minutes. See
// scripts/prune-build-cache.mjs. The 66 MB also rode into the deployed function,
// because the packs are read with fs against the package's own directory and so
// had to be named in next.config.ts's outputFileTracingIncludes.
//
// What it costs instead: the first print in a cold container downloads the pack
// (~70 MB) and unpacks it to /tmp. Every print in that container afterwards reuses
// it. A site that would rather not reach out at all - or has no route to GitHub -
// can put the pack on its own storage and set CHROMIUM_PACK_URL to it.
//
// THE PACK MUST MATCH THE PACKAGE. @sparticuz/chromium-min is pinned to an exact
// version in package.json (no caret) precisely so this constant can name the same
// one. Move them together or the browser will not start.
const CHROMIUM_VERSION = '149.0.0'
const CHROMIUM_PACK_URL =
  `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.x64.tar`

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MAC_CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium'
const LINUX_CHROME = '/usr/bin/google-chrome'
const LINUX_CHROMIUM = '/usr/bin/chromium'

/** True on a serverless/Linux deployment, where the packaged chromium is the one
 *  to use. AWS_LAMBDA_FUNCTION_NAME is set on Vercel's Node runtime. */
export function isServerless(): boolean {
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

/** A browser to hand puppeteer, or null when this machine has none. */
export type PrintBrowser = {
  executablePath: string
  /** The launch args that go with it - the packaged chromium needs its own set. */
  args: string[]
}

/**
 * Resolve a browser to print with.
 *
 * Returns null when there is simply no browser to be had (a developer's machine
 * with no Chrome on it), which is a different thing from a browser that would not
 * come: fetching or unpacking the packaged chromium throws, and the caller is
 * expected to turn that into its own "the PDF service is not available" refusal.
 *
 * The heavy package is imported dynamically, so a site where nobody presses the
 * button never loads it. It is declared in next.config.ts's serverExternalPackages
 * because it resolves paths against its own directory at runtime.
 */
export async function resolvePrintBrowser(): Promise<PrintBrowser | null> {
  if (!isServerless()) {
    const executablePath = await localChromePath()
    return executablePath
      ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
      : null
  }

  const chromium = (await import('@sparticuz/chromium-min')).default
  const packUrl = process.env.CHROMIUM_PACK_URL?.trim() || CHROMIUM_PACK_URL
  const executablePath = await chromium.executablePath(packUrl)
  return executablePath ? { executablePath, args: chromium.args } : null
}
