// S3-compatible client construction (B2, R2, S3, Spaces, Wasabi, MinIO), on its
// own so that code needing only a client - the public /api/media route presigning
// a read - does not import lib/media/upload.ts and with it sharp, the glTF
// optimiser and jsdom. See the note in lib/media/worker-url.ts on what that costs.

import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import type { MediaProviderType } from '@prisma/client'

// User-supplied S3-compatible endpoints (B2, MinIO) are routinely pasted the way
// the provider's console shows them - without a scheme, e.g.
// "s3.eu-central-003.backblazeb2.com". The AWS SDK runs new URL() on the endpoint
// internally and throws "Invalid URL" for a scheme-less value, which fails every
// upload before it leaves the box. Prepend https:// when no scheme is present; an
// explicit http:// is preserved so a self-hosted MinIO over plain HTTP still works.
function normalizeS3Endpoint(endpoint: string | undefined): string | undefined {
  const trimmed = endpoint?.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// ---------------------------------------------------------------------------
// S3-compatible client construction (B2, R2, S3, Spaces, Wasabi, MinIO)
// ---------------------------------------------------------------------------

export type S3Config = { client: S3Client; bucket: string }

// Read an S3 credential from the environment, stripping surrounding whitespace.
// Keys, secrets and bucket names pasted from a provider console routinely arrive
// with a trailing space or newline; S3 request signing then rejects the tainted
// value ("Malformed Access Key Id" for the key id, "SignatureDoesNotMatch" for
// the secret). Trimming at the point of use also heals a value that was already
// stored with a stray space, without the admin having to spot and re-enter it.
// (Endpoints go through normalizeS3Endpoint, which trims separately.)
function s3Env(key: string): string {
  return (process.env[key] ?? '').trim()
}

function s3Options(provider: MediaProviderType): { config: S3ClientConfig; bucket: string } {
  switch (provider) {
    case 'B2':
      return {
        config: {
          endpoint: normalizeS3Endpoint(process.env.B2_ENDPOINT),
          region: 'auto',
          credentials: {
            accessKeyId: s3Env('B2_APPLICATION_KEY_ID'),
            secretAccessKey: s3Env('B2_APPLICATION_KEY'),
          },
        },
        bucket: s3Env('B2_BUCKET_NAME'),
      }
    case 'R2':
      return {
        config: {
          endpoint: `https://${s3Env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
          region: 'auto',
          credentials: {
            accessKeyId: s3Env('R2_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('R2_SECRET_ACCESS_KEY'),
          },
        },
        bucket: s3Env('R2_BUCKET_NAME'),
      }
    case 'S3':
      return {
        config: {
          region: s3Env('S3_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('S3_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('S3_SECRET_ACCESS_KEY'),
          },
        },
        bucket: s3Env('S3_BUCKET_NAME'),
      }
    case 'SPACES':
      return {
        config: {
          endpoint: `https://${s3Env('SPACES_REGION')}.digitaloceanspaces.com`,
          region: s3Env('SPACES_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('SPACES_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('SPACES_SECRET_ACCESS_KEY'),
          },
        },
        bucket: s3Env('SPACES_BUCKET_NAME'),
      }
    case 'WASABI':
      return {
        config: {
          endpoint: `https://s3.${s3Env('WASABI_REGION') || 'us-east-1'}.wasabisys.com`,
          region: s3Env('WASABI_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('WASABI_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('WASABI_SECRET_ACCESS_KEY'),
          },
        },
        bucket: s3Env('WASABI_BUCKET_NAME'),
      }
    case 'MINIO':
      return {
        config: {
          endpoint: normalizeS3Endpoint(process.env.MINIO_ENDPOINT),
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: s3Env('MINIO_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('MINIO_SECRET_ACCESS_KEY'),
          },
        },
        bucket: s3Env('MINIO_BUCKET_NAME'),
      }
    default:
      throw new Error(`Provider ${provider} is not S3-compatible`)
  }
}

const S3_PROVIDERS: MediaProviderType[] = ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO']
export function isS3Provider(provider: MediaProviderType): boolean {
  return S3_PROVIDERS.includes(provider)
}

export function getS3Config(provider: MediaProviderType): S3Config {
  const { config, bucket } = s3Options(provider)
  return { client: new S3Client(config), bucket }
}

/**
 * The same client, for signing urls a BROWSER will use. Recent SDK versions add
 * a CRC32 checksum to every PutObject by default, and when presigning they have
 * no body to compute it over - the url ends up carrying the checksum of nothing,
 * and the bucket refuses the real upload against it. Checksums only when the
 * operation demands one, which a plain GET, HEAD or PUT does not.
 */
export function getS3PresignConfig(provider: MediaProviderType): S3Config {
  const { config, bucket } = s3Options(provider)
  return {
    client: new S3Client({ ...config, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }),
    bucket,
  }
}
