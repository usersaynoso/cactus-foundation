// Static, app-code-only metadata for the media providers.
// The PROXIED/DIRECT distinction (MediaProviderKind in the spec) is deliberately
// NOT a database column — it never changes per-install, so it lives here as a lookup.
//
// PROXIED  — private object storage fetched + resized by the Cloudflare Worker,
//            served from CLOUDFLARE_WORKER_URL (B2, R2, S3, Spaces, Wasabi, MinIO,
//            Vercel Blob, Supabase Storage).
// DIRECT   — the provider has its own CDN and URL-based transforms; the Worker is
//            never involved and the Next.js loader builds the provider's own URL
//            (Cloudinary, ImageKit).

import type { MediaProviderType } from '@prisma/client'

export type ProviderKind = 'PROXIED' | 'DIRECT'

export type ProviderEnvVar = {
  key: string
  label: string
  type?: 'password'
  placeholder?: string
  hint?: string
}

export const PROVIDER_KIND: Record<MediaProviderType, ProviderKind> = {
  B2: 'PROXIED',
  R2: 'PROXIED',
  S3: 'PROXIED',
  SPACES: 'PROXIED',
  WASABI: 'PROXIED',
  MINIO: 'PROXIED',
  VERCEL_BLOB: 'PROXIED',
  SUPABASE_STORAGE: 'PROXIED',
  CLOUDINARY: 'DIRECT',
  IMAGEKIT: 'DIRECT',
}

export const PROVIDER_LABELS: Record<MediaProviderType, string> = {
  B2: 'Backblaze B2',
  R2: 'Cloudflare R2',
  S3: 'AWS S3',
  SPACES: 'DigitalOcean Spaces',
  WASABI: 'Wasabi',
  MINIO: 'MinIO',
  VERCEL_BLOB: 'Vercel Blob',
  SUPABASE_STORAGE: 'Supabase Storage',
  CLOUDINARY: 'Cloudinary',
  IMAGEKIT: 'ImageKit',
}

export const PROVIDER_ENV_VARS: Record<MediaProviderType, ProviderEnvVar[]> = {
  B2: [
    { key: 'B2_APPLICATION_KEY_ID', label: 'B2_APPLICATION_KEY_ID', placeholder: 'Key ID' },
    { key: 'B2_APPLICATION_KEY', label: 'B2_APPLICATION_KEY', type: 'password', placeholder: 'Application key' },
    { key: 'B2_BUCKET_NAME', label: 'B2_BUCKET_NAME', placeholder: 'my-bucket' },
    { key: 'B2_ENDPOINT', label: 'B2_ENDPOINT', placeholder: 'https://s3.us-east-005.backblazeb2.com' },
  ],
  R2: [
    { key: 'R2_ACCOUNT_ID', label: 'R2_ACCOUNT_ID', placeholder: 'Account ID' },
    { key: 'R2_ACCESS_KEY_ID', label: 'R2_ACCESS_KEY_ID', placeholder: 'Access key ID' },
    { key: 'R2_SECRET_ACCESS_KEY', label: 'R2_SECRET_ACCESS_KEY', type: 'password', placeholder: 'Secret access key' },
    { key: 'R2_BUCKET_NAME', label: 'R2_BUCKET_NAME', placeholder: 'my-bucket' },
  ],
  S3: [
    { key: 'S3_ACCESS_KEY_ID', label: 'S3_ACCESS_KEY_ID', placeholder: 'Access key ID' },
    { key: 'S3_SECRET_ACCESS_KEY', label: 'S3_SECRET_ACCESS_KEY', type: 'password', placeholder: 'Secret access key' },
    { key: 'S3_BUCKET_NAME', label: 'S3_BUCKET_NAME', placeholder: 'my-bucket' },
    { key: 'S3_REGION', label: 'S3_REGION', placeholder: 'us-east-1' },
  ],
  SPACES: [
    { key: 'SPACES_ACCESS_KEY_ID', label: 'SPACES_ACCESS_KEY_ID', placeholder: 'Access key ID' },
    { key: 'SPACES_SECRET_ACCESS_KEY', label: 'SPACES_SECRET_ACCESS_KEY', type: 'password', placeholder: 'Secret access key' },
    { key: 'SPACES_BUCKET_NAME', label: 'SPACES_BUCKET_NAME', placeholder: 'my-space' },
    { key: 'SPACES_REGION', label: 'SPACES_REGION', placeholder: 'nyc3' },
  ],
  WASABI: [
    { key: 'WASABI_ACCESS_KEY_ID', label: 'WASABI_ACCESS_KEY_ID', placeholder: 'Access key ID' },
    { key: 'WASABI_SECRET_ACCESS_KEY', label: 'WASABI_SECRET_ACCESS_KEY', type: 'password', placeholder: 'Secret access key' },
    { key: 'WASABI_BUCKET_NAME', label: 'WASABI_BUCKET_NAME', placeholder: 'my-bucket' },
    { key: 'WASABI_REGION', label: 'WASABI_REGION', placeholder: 'us-east-1' },
  ],
  MINIO: [
    { key: 'MINIO_ENDPOINT', label: 'MINIO_ENDPOINT', placeholder: 'https://minio.example.com' },
    { key: 'MINIO_ACCESS_KEY_ID', label: 'MINIO_ACCESS_KEY_ID', placeholder: 'Access key ID' },
    { key: 'MINIO_SECRET_ACCESS_KEY', label: 'MINIO_SECRET_ACCESS_KEY', type: 'password', placeholder: 'Secret access key' },
    { key: 'MINIO_BUCKET_NAME', label: 'MINIO_BUCKET_NAME', placeholder: 'my-bucket' },
    { key: 'MINIO_USE_SSL', label: 'MINIO_USE_SSL', placeholder: 'true' },
  ],
  VERCEL_BLOB: [
    { key: 'BLOB_READ_WRITE_TOKEN', label: 'BLOB_READ_WRITE_TOKEN', type: 'password', placeholder: 'vercel_blob_rw_…', hint: 'Vercel Dashboard → Storage → Blob → your store → Tokens' },
  ],
  SUPABASE_STORAGE: [
    { key: 'SUPABASE_STORAGE_PROJECT_URL', label: 'SUPABASE_STORAGE_PROJECT_URL', placeholder: 'https://xxxx.supabase.co' },
    { key: 'SUPABASE_STORAGE_SERVICE_ROLE_KEY', label: 'SUPABASE_STORAGE_SERVICE_ROLE_KEY', type: 'password', placeholder: 'Service role key (not anon key)', hint: 'Supabase Dashboard → Settings → API → service_role key' },
    { key: 'SUPABASE_STORAGE_BUCKET_NAME', label: 'SUPABASE_STORAGE_BUCKET_NAME', placeholder: 'media' },
  ],
  CLOUDINARY: [
    { key: 'CLOUDINARY_CLOUD_NAME', label: 'CLOUDINARY_CLOUD_NAME', placeholder: 'mycloud' },
    { key: 'CLOUDINARY_API_KEY', label: 'CLOUDINARY_API_KEY', placeholder: 'API key' },
    { key: 'CLOUDINARY_API_SECRET', label: 'CLOUDINARY_API_SECRET', type: 'password', placeholder: 'API secret' },
  ],
  IMAGEKIT: [
    { key: 'IMAGEKIT_PUBLIC_KEY', label: 'IMAGEKIT_PUBLIC_KEY', placeholder: 'Public key' },
    { key: 'IMAGEKIT_PRIVATE_KEY', label: 'IMAGEKIT_PRIVATE_KEY', type: 'password', placeholder: 'Private key' },
    { key: 'IMAGEKIT_URL_ENDPOINT', label: 'IMAGEKIT_URL_ENDPOINT', placeholder: 'https://ik.imagekit.io/yourId' },
  ],
}

// Shared Worker URL for every proxied provider — it's one Worker regardless of
// which proxied provider sits behind it.
export const CLOUDFLARE_WORKER_VAR: ProviderEnvVar = {
  key: 'CLOUDFLARE_WORKER_URL',
  label: 'CLOUDFLARE_WORKER_URL',
  placeholder: 'https://media.example.com',
  hint: 'Shared URL for your Cloudflare Worker — all proxied providers use the same Worker.',
}

export const ALL_PROVIDERS = Object.keys(PROVIDER_KIND) as MediaProviderType[]

export function isProxied(provider: MediaProviderType): boolean {
  return PROVIDER_KIND[provider] === 'PROXIED'
}

export function isDirect(provider: MediaProviderType): boolean {
  return PROVIDER_KIND[provider] === 'DIRECT'
}

// The full set of env var keys a given provider needs configured. For proxied
// providers, CLOUDFLARE_WORKER_URL is included.
export function envKeysForProvider(provider: MediaProviderType): string[] {
  const keys = PROVIDER_ENV_VARS[provider].map((v) => v.key)
  if (isProxied(provider)) keys.push(CLOUDFLARE_WORKER_VAR.key)
  return keys
}
