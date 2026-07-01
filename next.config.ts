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
    return [
      {
        // Allow browsers and DevTools to load static chunks and source maps.
        // These files bypass the proxy middleware (which handles all other
        // security headers), so CORS must be set here via the config instead.
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
