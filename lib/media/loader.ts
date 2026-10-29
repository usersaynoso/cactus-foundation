// Custom Next.js image loader. It branches on the stored Media.url itself, since
// it runs client-side and has no database access. The url already encodes which
// provider serves the image:
//
//   - Proxied providers (B2, R2, S3, Spaces, Wasabi, MinIO, Vercel Blob, Supabase)
//     store a Cloudflare Worker url. The loader appends ?w=&q= for the Worker to
//     drive Cloudflare Image Resizing — served from the Worker's edge, never a
//     Vercel function.
//   - Cloudinary (direct) stores a res.cloudinary.com url. The loader inserts a
//     transformation segment into the /upload/ path: /upload/w_<width>,q_<quality>/
//   - ImageKit (direct) stores an ik.imagekit.io url. The loader appends the
//     ImageKit transformation query: ?tr=w-<width>,q-<quality>
//
// Direct-provider requests go straight to that provider's CDN; the Worker is
// never involved.
//
//   - An S3-style provider in DIRECT SERVING mode (lib/media/serving-mode.ts)
//     stores `<site>/api/media/<key>`, which redirects to the bucket. There is no
//     Worker to resize it, so the original is served at every width. (When the
//     owner turns on the platform's own optimisation instead, next.config swaps
//     this loader out for Next's default one at build time and nothing here runs.)
//     Recognised by its path, so a Worker url can never be mistaken for one and
//     keeps exactly the handling below.

import { isDirectMediaUrl } from '@/lib/media/serving-mode'

type LoaderParams = {
  src: string
  width: number
  quality?: number
}

export default function mediaLoader({ src, width, quality = 80 }: LoaderParams): string {
  let hostname = ''
  try {
    hostname = new URL(src.startsWith('http') ? src : `https://placeholder/${src}`).hostname
  } catch {
    hostname = ''
  }

  // Cloudinary — insert transformation into the /upload/ path segment.
  if (hostname.includes('cloudinary.com')) {
    return src.replace('/upload/', `/upload/w_${width},q_${quality}/`)
  }

  // ImageKit — append the transformation query.
  if (hostname.includes('imagekit.io')) {
    const separator = src.includes('?') ? '&' : '?'
    return `${src}${separator}tr=w-${width},q-${quality}`
  }

  // Directly served from the bucket — no resizer in front of it.
  if (isDirectMediaUrl(src)) return src

  // Proxied providers — Worker url with width/quality params.
  const workerUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''
  const out = new URL(src.startsWith('http') ? src : `${workerUrl}/${src}`)
  out.searchParams.set('w', String(width))
  out.searchParams.set('q', String(quality))
  return out.toString()
}
