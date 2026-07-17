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

export type SetupLink = { label: string; url: string }

// Deep links into each provider's own console, so a site owner can jump straight
// to the page where they create keys or find bucket details. These are generic,
// account-agnostic URLs; the Cloudflare ones use the `?to=/:account/…` form so
// they resolve to whichever account the user is signed in to.
export const PROVIDER_SETUP_LINKS: Record<MediaProviderType, SetupLink[]> = {
  B2: [
    { label: 'View buckets (name + endpoint)', url: 'https://secure.backblaze.com/b2_buckets.htm' },
    { label: 'Create application keys', url: 'https://secure.backblaze.com/app_keys.htm' },
  ],
  R2: [
    { label: 'R2 buckets + account ID', url: 'https://dash.cloudflare.com/?to=/:account/r2/overview' },
    { label: 'Create R2 API tokens', url: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens' },
  ],
  S3: [
    { label: 'View S3 buckets', url: 'https://s3.console.aws.amazon.com/s3/buckets' },
    { label: 'Create access keys (IAM)', url: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
  ],
  SPACES: [
    { label: 'View Spaces buckets', url: 'https://cloud.digitalocean.com/spaces' },
    { label: 'Create Spaces keys', url: 'https://cloud.digitalocean.com/account/api/spaces' },
  ],
  WASABI: [
    { label: 'View buckets', url: 'https://console.wasabisys.com/#/buckets' },
    { label: 'Create access keys', url: 'https://console.wasabisys.com/#/access_keys' },
  ],
  MINIO: [
    { label: 'MinIO Console documentation', url: 'https://min.io/docs/minio/linux/index.html' },
  ],
  VERCEL_BLOB: [
    { label: 'Blob stores + tokens', url: 'https://vercel.com/dashboard/stores' },
  ],
  SUPABASE_STORAGE: [
    { label: 'Storage buckets', url: 'https://supabase.com/dashboard/project/_/storage/buckets' },
    { label: 'Project API keys', url: 'https://supabase.com/dashboard/project/_/settings/api' },
  ],
  CLOUDINARY: [
    { label: 'API keys + cloud name', url: 'https://console.cloudinary.com/settings/api-keys' },
  ],
  IMAGEKIT: [
    { label: 'Developer API keys', url: 'https://imagekit.io/dashboard/developer/api-keys' },
    { label: 'URL endpoints', url: 'https://imagekit.io/dashboard/url-endpoints' },
  ],
}

// The Cloudflare Workers & Pages dashboard, account-agnostic.
export const CLOUDFLARE_DASH_URL = 'https://dash.cloudflare.com/?to=/:account/workers-and-pages'

// Where the admin creates a scoped API token or reads their Global API Key -
// both live on the same Cloudflare profile page.
export const CLOUDFLARE_API_TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

// The permissions a scoped token needs to deploy the media Worker. Shown in the
// UI so the admin ticks the right boxes when creating a Custom Token. Zone · Read
// lets Cactus find the zone that owns your site domain and serve media from a
// tidy media.<your-domain> address instead of the raw workers.dev one; without
// it the deploy still works and falls back to the workers.dev URL.
// Named on its own because it's the one the Worker upload itself needs: listing
// accounts succeeds on far less, so this is what a 10000 on upload points at.
export const CLOUDFLARE_WORKERS_EDIT_PERMISSION = 'Account · Workers Scripts · Edit'

export const CLOUDFLARE_TOKEN_PERMISSIONS = [
  CLOUDFLARE_WORKERS_EDIT_PERMISSION,
  'Account · Account Settings · Read',
  'Zone · Zone · Read',
]

// Vercel env var keys that hold the Cloudflare credentials used to auto-deploy
// the Worker. The two secrets are stored sensitive (see lib/vercel/env.ts); the
// email and account id are plain.
export const CLOUDFLARE_CREDENTIAL_KEYS = {
  apiToken: 'CLOUDFLARE_API_TOKEN',
  globalKey: 'CLOUDFLARE_GLOBAL_API_KEY',
  email: 'CLOUDFLARE_EMAIL',
  accountId: 'CLOUDFLARE_ACCOUNT_ID',
} as const

export const ALL_CLOUDFLARE_CREDENTIAL_KEYS: string[] = Object.values(CLOUDFLARE_CREDENTIAL_KEYS)

// Secret names the media Worker itself needs, per proxied provider. These mirror
// the `wrangler secret put` commands in the Self-hosting wiki page and are NOT
// always identical to the Vercel env vars above: Vercel Blob, for instance, gives
// the Worker a base URL rather than only the read/write token. DIRECT providers
// (Cloudinary, ImageKit) never touch the Worker, so their lists are empty.
// ALLOWED_ORIGIN is required by every proxied provider and is added at render time.
export const WORKER_SECRET_KEYS: Record<MediaProviderType, string[]> = {
  B2: ['B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_ENDPOINT'],
  R2: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'],
  S3: ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME', 'S3_REGION'],
  SPACES: ['SPACES_ACCESS_KEY_ID', 'SPACES_SECRET_ACCESS_KEY', 'SPACES_BUCKET_NAME', 'SPACES_REGION'],
  WASABI: ['WASABI_ACCESS_KEY_ID', 'WASABI_SECRET_ACCESS_KEY', 'WASABI_BUCKET_NAME', 'WASABI_REGION'],
  MINIO: ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY_ID', 'MINIO_SECRET_ACCESS_KEY', 'MINIO_BUCKET_NAME'],
  VERCEL_BLOB: ['BLOB_BASE_URL', 'BLOB_READ_WRITE_TOKEN'],
  SUPABASE_STORAGE: ['SUPABASE_STORAGE_PROJECT_URL', 'SUPABASE_STORAGE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET_NAME'],
  CLOUDINARY: [],
  IMAGEKIT: [],
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
