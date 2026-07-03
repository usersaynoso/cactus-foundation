import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import type { Media, MediaProviderType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { isProxied } from '@/lib/media/providers'

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Maps each allowed client-supplied MIME type to the image format sharp
// reports after decoding the actual bytes — used to catch a mismatched
// content-type (e.g. a polyglot file) that the client's declared type alone
// wouldn't reveal.
const MIME_TO_SHARP_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type UploadResult = {
  key: string
  url: string
  mimeType: string
  sizeBytes: number
}

export type UploadValidationError = {
  valid: false
  reason: string
}

export async function validateUpload(
  mimeType: string,
  sizeBytes: number,
  buffer: Buffer
): Promise<UploadValidationError | { valid: true }> {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return {
      valid: false,
      reason: `File type "${mimeType}" is not allowed. Accepted: JPEG, PNG, WebP, GIF.`,
    }
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return {
      valid: false,
      reason: `File size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`,
    }
  }

  let actualFormat: string | undefined
  try {
    actualFormat = (await sharp(buffer).metadata()).format
  } catch {
    return { valid: false, reason: 'File could not be read as a valid image.' }
  }
  if (actualFormat !== MIME_TO_SHARP_FORMAT[mimeType]) {
    return {
      valid: false,
      reason: `File content does not match declared type "${mimeType}".`,
    }
  }

  return { valid: true }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .toLowerCase()
}

function workerUrl(): string {
  return process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''
}

// ---------------------------------------------------------------------------
// S3-compatible client construction (B2, R2, S3, Spaces, Wasabi, MinIO)
// ---------------------------------------------------------------------------

type S3Config = { client: S3Client; bucket: string }

function getS3Config(provider: MediaProviderType): S3Config {
  switch (provider) {
    case 'B2':
      return {
        client: new S3Client({
          endpoint: process.env.B2_ENDPOINT,
          region: 'auto',
          credentials: {
            accessKeyId: process.env.B2_APPLICATION_KEY_ID ?? '',
            secretAccessKey: process.env.B2_APPLICATION_KEY ?? '',
          },
        }),
        bucket: process.env.B2_BUCKET_NAME ?? '',
      }
    case 'R2':
      return {
        client: new S3Client({
          endpoint: `https://${process.env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
          region: 'auto',
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
          },
        }),
        bucket: process.env.R2_BUCKET_NAME ?? '',
      }
    case 'S3':
      return {
        client: new S3Client({
          region: process.env.S3_REGION ?? 'us-east-1',
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
          },
        }),
        bucket: process.env.S3_BUCKET_NAME ?? '',
      }
    case 'SPACES':
      return {
        client: new S3Client({
          endpoint: `https://${process.env.SPACES_REGION ?? ''}.digitaloceanspaces.com`,
          region: process.env.SPACES_REGION ?? 'us-east-1',
          credentials: {
            accessKeyId: process.env.SPACES_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY ?? '',
          },
        }),
        bucket: process.env.SPACES_BUCKET_NAME ?? '',
      }
    case 'WASABI':
      return {
        client: new S3Client({
          endpoint: `https://s3.${process.env.WASABI_REGION ?? 'us-east-1'}.wasabisys.com`,
          region: process.env.WASABI_REGION ?? 'us-east-1',
          credentials: {
            accessKeyId: process.env.WASABI_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY ?? '',
          },
        }),
        bucket: process.env.WASABI_BUCKET_NAME ?? '',
      }
    case 'MINIO':
      return {
        client: new S3Client({
          endpoint: process.env.MINIO_ENDPOINT,
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY ?? '',
          },
        }),
        bucket: process.env.MINIO_BUCKET_NAME ?? '',
      }
    default:
      throw new Error(`Provider ${provider} is not S3-compatible`)
  }
}

const S3_PROVIDERS: MediaProviderType[] = ['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO']
function isS3Provider(provider: MediaProviderType): boolean {
  return S3_PROVIDERS.includes(provider)
}

// Object key for a new upload. B2 keeps the legacy `media/<id>.ext` form for
// backward compatibility; every other proxied provider is namespaced with its
// provider so the Worker can resolve which provider holds the key from the path.
function buildKey(provider: MediaProviderType, mimeType: string, originalFilename?: string): string {
  const ext = mimeType.split('/')[1] ?? 'bin'
  const suffix = originalFilename ? `-${sanitizeFilename(originalFilename)}` : ''
  const id = `${nanoid()}${suffix}.${ext}`
  if (provider === 'B2') return `media/${id}`
  return `media/${provider}/${id}`
}

// ---------------------------------------------------------------------------
// Upload — branches by provider, returns the stored key + public/serving url.
// ---------------------------------------------------------------------------

export async function uploadMedia(
  buffer: Buffer,
  mimeType: string,
  provider: MediaProviderType,
  originalFilename?: string
): Promise<UploadResult> {
  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const key = buildKey(provider, mimeType, originalFilename)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'private',
      })
    )
    return { key, url: `${workerUrl()}/${key}`, mimeType, sizeBytes: buffer.length }
  }

  if (provider === 'VERCEL_BLOB') {
    const { put } = await import('@vercel/blob')
    const key = buildKey(provider, mimeType, originalFilename)
    // access 'public' returns a stable blob URL; the Worker fetches it by key.
    await put(key, buffer, {
      access: 'public',
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    })
    return { key, url: `${workerUrl()}/${key}`, mimeType, sizeBytes: buffer.length }
  }

  if (provider === 'SUPABASE_STORAGE') {
    const { StorageClient } = await import('@supabase/storage-js')
    const storage = new StorageClient(
      `${(process.env.SUPABASE_STORAGE_PROJECT_URL ?? '').replace(/\/$/, '')}/storage/v1`,
      {
        apikey: process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? ''}`,
      }
    )
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_NAME ?? ''
    const key = buildKey(provider, mimeType, originalFilename)
    const { error } = await storage.from(bucket).upload(key, buffer, { contentType: mimeType, upsert: true })
    if (error) throw new Error(`Supabase upload failed: ${error.message}`)
    return { key, url: `${workerUrl()}/${key}`, mimeType, sizeBytes: buffer.length }
  }

  if (provider === 'CLOUDINARY') {
    const { v2: cloudinary } = await import('cloudinary')
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    const result = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'image' },
        (err, res) => {
          if (err || !res) return reject(err ?? new Error('Cloudinary upload failed'))
          resolve({ public_id: res.public_id, secure_url: res.secure_url })
        }
      )
      stream.end(buffer)
    })
    // Direct provider: key is the public_id, url is the provider's own CDN url.
    return { key: result.public_id, url: result.secure_url, mimeType, sizeBytes: buffer.length }
  }

  if (provider === 'IMAGEKIT') {
    const { default: ImageKit, toFile } = await import('@imagekit/nodejs')
    const ik = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '' })
    const ext = mimeType.split('/')[1] ?? 'bin'
    const fileName = `${nanoid()}${originalFilename ? `-${sanitizeFilename(originalFilename)}` : ''}.${ext}`
    const uploadable = await toFile(buffer, fileName, { type: mimeType })
    const result = await ik.files.upload({ file: uploadable, fileName })
    // Direct provider: store the fileId as key (needed for deletes), url is the CDN url.
    return { key: result.fileId ?? '', url: result.url ?? '', mimeType, sizeBytes: buffer.length }
  }

  throw new Error(`Unsupported media provider: ${provider}`)
}

// ---------------------------------------------------------------------------
// Download original bytes (used by migration — always the untransformed asset).
// ---------------------------------------------------------------------------

export async function downloadMedia(
  provider: MediaProviderType,
  key: string,
  url: string
): Promise<Buffer> {
  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes) throw new Error('Empty object body')
    return Buffer.from(bytes)
  }

  if (provider === 'VERCEL_BLOB') {
    const { head } = await import('@vercel/blob')
    const meta = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN })
    const res = await fetch(meta.url)
    if (!res.ok) throw new Error(`Vercel Blob fetch failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  if (provider === 'SUPABASE_STORAGE') {
    const { StorageClient } = await import('@supabase/storage-js')
    const storage = new StorageClient(
      `${(process.env.SUPABASE_STORAGE_PROJECT_URL ?? '').replace(/\/$/, '')}/storage/v1`,
      {
        apikey: process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? ''}`,
      }
    )
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_NAME ?? ''
    const { data, error } = await storage.from(bucket).download(key)
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? 'no data'}`)
    return Buffer.from(await data.arrayBuffer())
  }

  if (provider === 'CLOUDINARY') {
    // Fetch the ORIGINAL asset (no transformation segment) to avoid compounding
    // a lossy resize across repeated migrations.
    const { v2: cloudinary } = await import('cloudinary')
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    const originalUrl = cloudinary.url(key, { resource_type: 'image', secure: true })
    const res = await fetch(originalUrl)
    if (!res.ok) throw new Error(`Cloudinary fetch failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  if (provider === 'IMAGEKIT') {
    // Resolve the original (untransformed) file url from the stored fileId.
    const { default: ImageKit } = await import('@imagekit/nodejs')
    const ik = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '' })
    const details = await ik.files.get(key)
    const res = await fetch(details.url ?? '')
    if (!res.ok) throw new Error(`ImageKit fetch failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  // Fallback: fetch the stored serving url directly.
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Delete — branches by provider.
// ---------------------------------------------------------------------------

export async function deleteMedia(provider: MediaProviderType, key: string): Promise<void> {
  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    return
  }

  if (provider === 'VERCEL_BLOB') {
    const { del, head } = await import('@vercel/blob')
    // del() takes the blob url, not the pathname; resolve it via head first.
    const meta = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN })
    await del(meta.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return
  }

  if (provider === 'SUPABASE_STORAGE') {
    const { StorageClient } = await import('@supabase/storage-js')
    const storage = new StorageClient(
      `${(process.env.SUPABASE_STORAGE_PROJECT_URL ?? '').replace(/\/$/, '')}/storage/v1`,
      {
        apikey: process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ?? ''}`,
      }
    )
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_NAME ?? ''
    const { error } = await storage.from(bucket).remove([key])
    if (error) throw new Error(`Supabase delete failed: ${error.message}`)
    return
  }

  if (provider === 'CLOUDINARY') {
    const { v2: cloudinary } = await import('cloudinary')
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    await cloudinary.uploader.destroy(key, { resource_type: 'image' })
    return
  }

  if (provider === 'IMAGEKIT') {
    const { default: ImageKit } = await import('@imagekit/nodejs')
    const ik = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '' })
    await ik.files.delete(key)
    return
  }

  throw new Error(`Unsupported media provider: ${provider}`)
}

// ---------------------------------------------------------------------------
// Persist a Media row. `url` differs by kind: proxied providers serve through the
// Worker; direct providers store the provider's own CDN url returned by the SDK.
// ---------------------------------------------------------------------------

export async function saveMediaRecord(data: {
  key: string
  url: string
  provider: MediaProviderType
  mimeType: string
  sizeBytes: number
  // Optional: Media.uploadedById is a FK to the core User table, so uploads
  // from a Member (a separate table entirely, see MEMBERS_SPEC.md) have no
  // valid value to put here and just leave it null.
  uploadedById?: string
  altText?: string
  isDecorative?: boolean
}): Promise<Media> {
  // For proxied providers the canonical serving url is always the Worker url.
  const url = isProxied(data.provider) ? `${workerUrl()}/${data.key}` : data.url
  return prisma.media.create({
    data: {
      key: data.key,
      provider: data.provider,
      url,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      uploadedById: data.uploadedById ?? null,
      altText: data.altText ?? null,
      isDecorative: data.isDecorative ?? false,
    },
  })
}

export async function getMediaReferences(mediaId: string): Promise<string[]> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { logoMediaId: true, faviconMediaId: true },
  })
  const refs: string[] = []
  if (config?.logoMediaId === mediaId) refs.push('site logo')
  if (config?.faviconMediaId === mediaId) refs.push('site favicon')
  const infoPages = await prisma.infoPage.count({ where: { ogImageId: mediaId } })
  if (infoPages > 0) refs.push(`${infoPages} info page${infoPages > 1 ? 's' : ''}`)
  return refs
}
