// Presigned bucket addresses for direct serving mode (lib/media/serving-mode.ts):
// a short-lived GET/HEAD the /api/media route redirects to, and a PUT the browser
// sends a large upload to without passing through a function.
//
// Imports the S3 client and nothing heavier - see lib/media/s3-config.ts.

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { MediaProviderType } from '@prisma/client'
import { getS3PresignConfig } from '@/lib/media/s3-config'

// A read url is signed as of the start of the current hour and lives for three,
// so every request inside one hour gets the SAME url. That is what lets a
// browser keep the bytes it already has: a fresh signature per request would be
// a fresh cache entry per page view. Signed at the top of the hour with three
// hours of life, a url handed out at any moment is good for at least two more.
export const READ_SIGNING_BUCKET_MS = 60 * 60 * 1000
export const READ_URL_LIFETIME_SECONDS = 3 * 60 * 60

// How long the redirect itself may be cached. Comfortably inside the two hours
// the url it points at is guaranteed to outlive it by.
export const READ_REDIRECT_MAX_AGE_SECONDS = 60 * 60

export function readSigningDate(now: number = Date.now()): Date {
  return new Date(Math.floor(now / READ_SIGNING_BUCKET_MS) * READ_SIGNING_BUCKET_MS)
}

export async function presignMediaRead(
  provider: MediaProviderType,
  key: string,
  opts: { method: 'GET' | 'HEAD'; contentType: string; cacheControl: string; now?: number },
): Promise<string> {
  const { client, bucket } = getS3PresignConfig(provider)
  // A HEAD has to be signed as a HEAD: S3 signs the method, and a presigned GET
  // answered to a HEAD is a 403. Merchant Center's image crawler sends HEAD first.
  // The response overrides make the bucket answer with the type and cache policy
  // the Worker would have sent, rather than whatever the object was stored with.
  const command = opts.method === 'HEAD'
    ? new HeadObjectCommand({ Bucket: bucket, Key: key })
    : new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseCacheControl: opts.cacheControl,
      })
  return getSignedUrl(client, command, {
    expiresIn: READ_URL_LIFETIME_SECONDS,
    signingDate: readSigningDate(opts.now),
  })
}

// Lifetime of a presigned upload. Matches the upload token beside it, which
// /record still checks before a row is written.
export const UPLOAD_URL_LIFETIME_SECONDS = 15 * 60

/**
 * A PUT straight to the bucket. The content type AND the length are part of the
 * signature, so the browser must send exactly the type and exactly the number of
 * bytes it declared: nothing can be stored under another type, and nothing larger
 * than the size the server checked against the ceiling before signing. (That is
 * the job the Worker's own cap does in Worker mode. /record checks the stored
 * size again afterwards, for any provider that does not hold a signature to it.)
 * Needs CORS on the bucket allowing PUT from the site's origin.
 */
export async function presignMediaUpload(
  provider: MediaProviderType,
  key: string,
  contentType: string,
  sizeBytes?: number,
): Promise<string> {
  const { client, bucket } = getS3PresignConfig(provider)
  // Without a known size the length is simply not signed, and the caller checks
  // the stored size afterwards.
  const signed = sizeBytes === undefined ? ['content-type'] : ['content-type', 'content-length']
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ...(sizeBytes === undefined ? {} : { ContentLength: sizeBytes }) }),
    { expiresIn: UPLOAD_URL_LIFETIME_SECONDS, signableHeaders: new Set(signed) },
  )
}
