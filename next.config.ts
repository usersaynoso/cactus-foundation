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
    // what actually changed is recompiled.
    turbopackFileSystemCacheForBuild: true,
  },
  // draco3d ships an Emscripten glue file whose only way to find its sibling
  // `.wasm` is `readFileSync(__dirname + '/draco_decoder.wasm')`. Bundling that
  // glue into a serverless function rewrites `__dirname` to a placeholder base
  // (`/ROOT/node_modules/draco3d/...`), where no wasm sits, so the 3D-model
  // optimiser aborts with ENOENT on the deployed build while working fine in
  // dev. Keeping the package external preserves the real `__dirname`; the trace
  // include below then makes sure the wasm actually ships next to it. meshopt
  // needs neither - it base64-inlines its wasm.
  // puppeteer-core and @sparticuz/chromium must stay external for the same class
  // of reason: the chromium package ships a brotli-packed browser it unpacks from
  // its own directory at runtime and then hands the path to puppeteer, so bundling
  // either one breaks the paths they resolve against themselves. Only a module
  // that prints a document (Quote for Shop's PDF route) loads them, and it does so
  // through a dynamic import, so nothing else pays for them being here.
  serverExternalPackages: ['draco3d', 'puppeteer-core', '@sparticuz/chromium'],
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
    '/api/m/**': [
      './modules/*/assets/**',
      // @sparticuz/chromium ships its browser as brotli packs and finds them by
      // resolving `../bin` against its own file URL, then reading them with fs -
      // invisible to the file tracer, exactly like draco3d's wasm above. Without
      // this the deployed function has the package but not its browser, and
      // executablePath() throws "The input directory does not exist", which is
      // what made quote-for-shop's PDF route 500 on the first live shop to press
      // the button. ~66MB into the module-API function, which is the price of a
      // PDF; the alternative (@sparticuz/chromium-min) trades it for a required
      // env var and a download on every cold start.
      './node_modules/@sparticuz/chromium/bin/**',
    ],
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
