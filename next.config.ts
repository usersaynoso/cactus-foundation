import type { NextConfig } from 'next'
import pkg from './package.json'

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
        hostname: process.env.CLOUDFLARE_WORKER_HOSTNAME ?? 'placeholder.workers.dev',
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
  },
  // Security headers are applied in proxy.ts
}

export default config
