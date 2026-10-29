// The hosts a presigned bucket url can live on, for the Content-Security-Policy in
// direct serving mode (lib/media/serving-mode.ts).
//
// /api/media answers with a redirect to the bucket, and a browser applies img-src,
// media-src and connect-src to where a redirect LANDS, not only where it started.
// So without these the redirect is followed and the picture is blocked anyway. The
// browser also PUTs large uploads straight to the bucket (connect-src).
//
// Built from the provider's environment alone - the proxy has no database - for
// every S3-style provider that has its credentials set. Each host is given with a
// `*.` twin, because the S3 client signs virtual-hosted urls (`<bucket>.<host>`)
// for most providers and path-style ones (`<host>/<bucket>`) for MinIO, and which
// a given provider gets is the SDK's business. Empty outside direct mode, so a
// Worker-mode install's policy is exactly what it always was.
//
// A leaf: env and the serving-mode leaf only, because proxy.ts runs on every request.

import { mediaServingMode } from '@/lib/media/serving-mode'

function env(key: string): string {
  return (process.env[key] ?? '').trim()
}

function hostOf(endpoint: string): string | null {
  if (!endpoint) return null
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`).host
  } catch {
    return null
  }
}

function withSubdomains(host: string | null, scheme = 'https'): string[] {
  return host ? [`${scheme}://${host}`, `${scheme}://*.${host}`] : []
}

/** CSP sources for every configured S3-style bucket, or [] outside direct mode. */
export function directBucketCspSources(): string[] {
  if (mediaServingMode() !== 'direct') return []
  const out: string[] = []
  if (env('B2_BUCKET_NAME')) out.push(...withSubdomains(hostOf(env('B2_ENDPOINT'))))
  if (env('R2_BUCKET_NAME') && env('R2_ACCOUNT_ID')) out.push(...withSubdomains(`${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`))
  if (env('S3_BUCKET_NAME')) {
    const region = env('S3_REGION') || 'us-east-1'
    out.push(...withSubdomains(`s3.${region}.amazonaws.com`), 'https://*.s3.amazonaws.com')
  }
  if (env('SPACES_BUCKET_NAME') && env('SPACES_REGION')) out.push(...withSubdomains(`${env('SPACES_REGION')}.digitaloceanspaces.com`))
  if (env('WASABI_BUCKET_NAME')) out.push(...withSubdomains(`s3.${env('WASABI_REGION') || 'us-east-1'}.wasabisys.com`))
  if (env('MINIO_BUCKET_NAME')) {
    const raw = env('MINIO_ENDPOINT')
    const scheme = /^http:\/\//i.test(raw) ? 'http' : 'https'
    const host = hostOf(raw)
    if (host) out.push(`${scheme}://${host}`)
  }
  return [...new Set(out)]
}
