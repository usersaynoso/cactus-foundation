import type { NextConfig } from 'next'
import pkg from './package.json'

// Prefer an explicit CLOUDFLARE_WORKER_HOSTNAME, else derive it from
// CLOUDFLARE_WORKER_URL — the admin auto-deploy sets the URL but not the bare
// hostname. Mirrors workerImageHost() in proxy.ts (kept in sync by hand; a
// config file can't cleanly share a runtime helper).
function workerImageHost(): string | undefined {
  const explicit = process.env.CLOUDFLARE_WORKER_HOSTNAME?.trim()
  if (explicit) return explicit
  const url = process.env.CLOUDFLARE_WORKER_URL?.trim()
  if (!url) return undefined
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
  } catch {
    return undefined
  }
}

// The Turbopack build cache is the one part of the build that cannot be debugged
// from here: when it goes wrong the symptom is a build that produces no output at
// all and is killed by Vercel's 45-minute limit, which is also long enough to make
// bisecting it by pushing commits impractical. So it is a switch rather than a
// constant. Set CACTUS_TURBOPACK_BUILD_CACHE=0 in the site's environment variables
// and redeploy to take it out of the picture; that is an env-var-only change, so it
// ships through the redeploy API in seconds instead of needing a code change to
// reach a build that is already broken. scripts/next-build.mjs sets the same
// variable on itself when it has to retry a stalled build.
function turbopackBuildCache(): boolean {
  return process.env.CACTUS_TURBOPACK_BUILD_CACHE !== '0'
}

const config: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_TELEMETRY_DISABLED: '1',
  },
  images: {
    remotePatterns: [
      {
        // Cloudflare Worker URL for proxied object-storage providers
        // Set CLOUDFLARE_WORKER_HOSTNAME in environment variables
        protocol: 'https',
        hostname: workerImageHost() ?? 'placeholder.workers.dev',
      },
      // Direct providers serve straight from their own CDN domains.
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'ik.imagekit.io' },
      { protocol: 'https', hostname: '*.imagekit.io' },
    ],
    loader: 'custom',
    loaderFile: './lib/media/loader.ts',
  },
  async rewrites() {
    return {
      // beforeFiles runs ahead of the static file handler, which is the whole
      // point: /favicon.ico has to reach the branding route rather than a file
      // in /public. Everything that has no document head - /sitemap.xml,
      // /robots.txt, a JSON response - falls back to this address for its tab
      // icon, so it must answer with the site's own favicon and not Cactus's.
      beforeFiles: [
        { source: '/favicon.ico', destination: '/api/branding/favicon' },
        // The rest of the icon set, for the second half of the same problem.
        // These used to be emitted as media-host addresses, so on a page
        // carrying hundreds of images from that host the icon fetch queued
        // behind every one of them and Safari was left with no icon for that
        // page. Routed here they are same-origin like the favicon. Safari also
        // probes both apple-touch paths at the root when it wants an icon and
        // the document has none, and those must answer with the site's own,
        // not Cactus's.
        { source: '/favicon-16x16.png', destination: '/api/branding/favicon?icon=icon-16' },
        { source: '/favicon-32x32.png', destination: '/api/branding/favicon?icon=icon-32' },
        { source: '/apple-touch-icon.png', destination: '/api/branding/favicon?icon=apple-touch' },
        { source: '/apple-touch-icon-precomposed.png', destination: '/api/branding/favicon?icon=apple-touch' },
        { source: '/web-app-manifest-192x192.png', destination: '/api/branding/favicon?icon=icon-192' },
        { source: '/web-app-manifest-512x512.png', destination: '/api/branding/favicon?icon=icon-512' },
      ],
      // afterFiles, so a real file in /public/.well-known still wins and this
      // only answers paths nothing else does. Domain-verification files (Apple
      // Pay's, say) are demanded at a fixed path by whoever is checking, which
      // is out of reach of a module's own /api/m/<module>/… routes - so core
      // owns the path and asks the modules what belongs at it. See
      // lib/well-known/providers.ts.
      afterFiles: [
        { source: '/.well-known/:path*', destination: '/api/well-known/:path*' },
      ],
      fallback: [],
    }
  },
  async headers() {
    // In development, static chunks and source maps are same-origin. Adding an
    // Access-Control-Allow-Origin header makes WebKit/Safari treat them as CORS
    // resources and then reject them ("access control checks"), which breaks
    // source-map loading and Turbopack HMR. Only emit CORS for production, where
    // assets may be served from a separate CDN origin.
    if (process.env.NODE_ENV !== 'production') return []
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
  experimental: {
    // typedRoutes: true, // enable once stable in Next.js 16
    // Barrel-file packages: import only the modules actually used rather than the
    // whole index. date-fns in particular is enormous on disk and only a handful of
    // its functions are ever called.
    optimizePackageImports: ['date-fns', 'date-fns-tz'],
    // Turbopack writes its compilation cache to .next/cache, which Vercel already
    // restores from the previous deployment. Without this, the 40s compile is paid
    // in full on every deploy even when the diff is a version bump; with it, only
    // what actually changed is recompiled. On by default from Next 16.3, stated
    // here anyway because the value is a switch - see turbopackBuildCache().
    turbopackFileSystemCacheForBuild: turbopackBuildCache(),
  },
  // draco3d ships an Emscripten glue file whose only way to find its sibling
  // `.wasm` is `readFileSync(__dirname + '/draco_decoder.wasm')`. Bundling that
  // glue into a serverless function rewrites `__dirname` to a placeholder base
  // (`/ROOT/node_modules/draco3d/...`), where no wasm sits, so the 3D-model
  // optimiser aborts with ENOENT on the deployed build while working fine in
  // dev. Keeping the package external preserves the real `__dirname`; the trace
  // include below then makes sure the wasm actually ships next to it. meshopt
  // needs neither - it base64-inlines its wasm.
  // puppeteer-core and @sparticuz/chromium-min must stay external for the same
  // class of reason: the chromium package unpacks a browser into /tmp at runtime
  // and then hands the path to puppeteer, so bundling either one breaks the paths
  // they resolve against themselves. Only a route that prints a document loads
  // them, and it does so through a dynamic import, so nothing else pays for them
  // being here. See lib/documents/chromium.ts for why it is the "-min" package
  // and where the browser itself now comes from.
  serverExternalPackages: ['draco3d', 'puppeteer-core', '@sparticuz/chromium-min'],
  typescript: {
    // `next build` runs a full tsc pass that duplicates the `tsc --noEmit` gate
    // every change already goes through (see CLAUDE.md work loop). On Vercel it
    // was 26s of a 123s build, sat squarely on the deploy critical path. The type
    // check is not dropped, only moved off the deploy: run `npm run typecheck`.
    ignoreBuildErrors: true,
  },
  // The database backup route reads this file at runtime via fs, not a static
  // import - the file tracer can't see it otherwise, so it'd be missing from
  // the deployed function bundle on Vercel despite working fine in dev.
  // Keys here are ROUTE-PATH GLOBS matched with `contains` semantics against the
  // normalized route (e.g. `/app/api/m/[module]/[...path]/route`), NOT file paths.
  // A file-path key like 'app/api/x/route.ts' never matches - and literal `[id]`
  // segments in a key are parsed as glob character classes, so dynamic routes must
  // be written with `*` instead. Both the webpack matcher (collect-build-traces.js)
  // and the Turbopack one (crates/next-api/src/nft_json.rs) agree on this; every
  // key below is written to match under both.
  outputFileTracingIncludes: {
    '/api/admin/backup/database': ['./prisma/migrations/**'],
    // Modules can ship browser assets (e.g. ML model + wasm) served same-origin
    // by a module route that reads them via fs. Generic glob (no module name)
    // so any module's assets/ dir is traced into the module-API function.
    // @sparticuz/chromium's brotli packs used to be forced in here: the full
    // package finds its browser by resolving `../bin` against its own file URL
    // and reading it with fs, invisible to the file tracer exactly like draco3d's
    // wasm above, and without the include executablePath() threw "The input
    // directory does not exist" - which is what made the first live shop's PDF
    // route 500. That cost ~66MB in this function and another 66MB in
    // node_modules, and node_modules is half of what Vercel keeps as the build
    // cache, which has a hard 1.5GB limit that this site was going over on every
    // other deploy. It is @sparticuz/chromium-min now, which has no bin directory
    // to trace: see lib/documents/chromium.ts.
    '/api/m/**': ['./modules/*/assets/**'],
    // draco3d's decoder wasm is read via fs at runtime (see serverExternalPackages
    // above), so the file tracer can't see it statically. Force it into every
    // function that can run the 3D-model optimiser: the two explicit optimise
    // routes and the upload record route, which auto-optimises new GLB uploads.
    '/api/admin/media/*/optimise': ['./node_modules/draco3d/draco_decoder.wasm'],
    '/api/admin/media/bulk-optimise': ['./node_modules/draco3d/draco_decoder.wasm'],
    '/api/admin/media/record': ['./node_modules/draco3d/draco_decoder.wasm'],
  },
  // Security headers are applied in proxy.ts
}

export default config
