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
  },
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
  outputFileTracingIncludes: {
    'app/api/admin/backup/database/route.ts': ['./prisma/migrations/**'],
    // Modules can ship browser assets (e.g. ML model + wasm) served same-origin
    // by a module route that reads them via fs. Generic glob (no module name)
    // so any module's assets/ dir is traced into the module-API function.
    'app/api/m/[module]/[...path]/route.ts': ['./modules/*/assets/**'],
  },
  // Security headers are applied in proxy.ts
}

export default config
