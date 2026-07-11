import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import { Prisma, type Media, type MediaProviderType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { isProxied, ALL_PROVIDERS } from '@/lib/media/providers'
import { loadMediaUsageIndex } from '@/lib/media/references'
import { sanitizeSvg } from '@/lib/sanitize'
import { MAX_UPLOAD_BYTES, tooLargeReason } from '@/lib/media/limits'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

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
): Promise<UploadValidationError | { valid: true; buffer: Buffer }> {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return {
      valid: false,
      reason: `File type "${mimeType}" is not allowed. Accepted: JPEG, PNG, WebP, GIF, SVG.`,
    }
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      reason: tooLargeReason(sizeBytes),
    }
  }

  // SVG is text, not a raster sharp can decode - validate as XML and strip any
  // executable content (script tags, event handlers, external refs) instead of
  // the magic-byte sniff below, then hand back the sanitised bytes so the
  // caller stores those rather than the original upload.
  if (mimeType === 'image/svg+xml') {
    const text = buffer.toString('utf-8')
    if (!/^\s*(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/is.test(text)) {
      return { valid: false, reason: 'File could not be read as a valid SVG.' }
    }
    return { valid: true, buffer: Buffer.from(sanitizeSvg(text), 'utf-8') }
  }

  let actualFormat: string | undefined
  try {
    // `failOn: 'none'` so the format sniff doesn't abort on recoverable libwebp
    // warnings — plenty of perfectly good WebP files (Photoshop / cwebp exports,
    // animated WebP) emit a warning that sharp otherwise escalates to a thrown
    // error, which was rejecting valid uploads. We only need the container
    // format here, not a pedantic decode.
    actualFormat = (await sharp(buffer, { failOn: 'none' }).metadata()).format
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
    return { valid: false, reason: `File could not be read as a valid image${detail}.` }
  }
  if (actualFormat !== MIME_TO_SHARP_FORMAT[mimeType]) {
    return {
      valid: false,
      reason: `File content does not match declared type "${mimeType}".`,
    }
  }

  return { valid: true, buffer }
}

// PROTECTED - non-image upload support (Shop module digital files, Q5).
// Additive only: existing validateUpload/uploadMedia/deleteMedia/downloadMedia
// are untouched and remain image-only via ALLOWED_TYPES above. Callers that
// need a non-image file (e.g. a digital product download) declare their own
// mime/size policy and skip the sharp decode sniff entirely - there's no
// universal "valid PDF/zip" check the way there is for image bytes, so this
// trusts the declared content-type instead of a magic-byte fingerprint.
export type NonImageUploadMode = {
  allowedMimeTypes: string[]
  maxSizeBytes: number
}

export async function validateNonImageUpload(
  mimeType: string,
  sizeBytes: number,
  mode: NonImageUploadMode
): Promise<UploadValidationError | { valid: true }> {
  if (!mode.allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      reason: `File type "${mimeType}" is not allowed for this upload.`,
    }
  }
  if (sizeBytes > mode.maxSizeBytes) {
    return {
      valid: false,
      reason: `File size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the ${(mode.maxSizeBytes / 1024 / 1024).toFixed(0)} MB limit.`,
    }
  }
  return { valid: true }
}

// Structured MIME subtypes carry a "+xml"/"+json" etc. suffix (RFC 6839) that
// is not a valid object-key extension — a raw split produced keys like
// "…-favicon.svg+xml", and the literal "+" broke the Worker's B2 signing/fetch
// (confirmed 502 in production while plain-extension icons served fine).
function extensionForMimeType(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? 'bin'
  return subtype.split('+')[0] || 'bin'
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .toLowerCase()
}

// The human-readable label appended to a generated key, e.g. "-logo". The real
// extension is derived from the validated MIME type and appended separately, so
// the original filename's extension is stripped first — keeping it produced a
// double extension ("logo.png" -> "<id>-logo.png.png").
function filenameLabel(originalFilename?: string): string {
  if (!originalFilename) return ''
  const base = originalFilename.replace(/\.[^./\\]+$/, '')
  const safe = sanitizeFilename(base)
  return safe ? `-${safe}` : ''
}

export function workerUrl(): string {
  return process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, '') ?? ''
}

// Rewrite every proxied provider's stored Media.url so it sits under `base` (the
// active Worker origin), rebuilt from the immutable storage key. Direct providers
// (Cloudinary, ImageKit) serve from their own CDN and keep their url untouched.
// Called after a Worker deploy so existing images move onto the new address (e.g.
// media.<your-domain>) alongside new uploads, instead of only future uploads
// picking it up. Idempotent - the guard skips rows already on `base`. Returns the
// number of rows changed.
export async function rebaseProxiedMediaUrls(base: string): Promise<number> {
  const origin = base.replace(/\/$/, '')
  if (!origin) return 0
  const proxied = ALL_PROVIDERS.filter(isProxied)
  if (proxied.length === 0) return 0
  return prisma.$executeRaw`
    UPDATE "Media"
    SET "url" = ${origin} || '/' || "key"
    WHERE "provider"::text IN (${Prisma.join(proxied)})
      AND "url" <> ${origin} || '/' || "key"
  `
}

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

type S3Config = { client: S3Client; bucket: string }

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

function getS3Config(provider: MediaProviderType): S3Config {
  switch (provider) {
    case 'B2':
      return {
        client: new S3Client({
          endpoint: normalizeS3Endpoint(process.env.B2_ENDPOINT),
          region: 'auto',
          credentials: {
            accessKeyId: s3Env('B2_APPLICATION_KEY_ID'),
            secretAccessKey: s3Env('B2_APPLICATION_KEY'),
          },
        }),
        bucket: s3Env('B2_BUCKET_NAME'),
      }
    case 'R2':
      return {
        client: new S3Client({
          endpoint: `https://${s3Env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
          region: 'auto',
          credentials: {
            accessKeyId: s3Env('R2_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('R2_SECRET_ACCESS_KEY'),
          },
        }),
        bucket: s3Env('R2_BUCKET_NAME'),
      }
    case 'S3':
      return {
        client: new S3Client({
          region: s3Env('S3_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('S3_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('S3_SECRET_ACCESS_KEY'),
          },
        }),
        bucket: s3Env('S3_BUCKET_NAME'),
      }
    case 'SPACES':
      return {
        client: new S3Client({
          endpoint: `https://${s3Env('SPACES_REGION')}.digitaloceanspaces.com`,
          region: s3Env('SPACES_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('SPACES_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('SPACES_SECRET_ACCESS_KEY'),
          },
        }),
        bucket: s3Env('SPACES_BUCKET_NAME'),
      }
    case 'WASABI':
      return {
        client: new S3Client({
          endpoint: `https://s3.${s3Env('WASABI_REGION') || 'us-east-1'}.wasabisys.com`,
          region: s3Env('WASABI_REGION') || 'us-east-1',
          credentials: {
            accessKeyId: s3Env('WASABI_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('WASABI_SECRET_ACCESS_KEY'),
          },
        }),
        bucket: s3Env('WASABI_BUCKET_NAME'),
      }
    case 'MINIO':
      return {
        client: new S3Client({
          endpoint: normalizeS3Endpoint(process.env.MINIO_ENDPOINT),
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: s3Env('MINIO_ACCESS_KEY_ID'),
            secretAccessKey: s3Env('MINIO_SECRET_ACCESS_KEY'),
          },
        }),
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

// Object key for a new upload. B2 keeps the legacy `media/<id>.ext` form for
// backward compatibility; every other proxied provider is namespaced with its
// provider so the Worker can resolve which provider holds the key from the path.
//
// `folderPath` (already sanitised, slash-joined ancestor names) slots in *after*
// the provider segment so the Worker still resolves the provider from the path,
// while the URL mirrors the media library's folder tree. The nanoid stays in the
// filename so two files with the same name in one folder never collide in storage.
export function buildKey(
  provider: MediaProviderType,
  mimeType: string,
  originalFilename?: string,
  folderPath?: string,
  // When true, the sanitised original filename becomes the key basename verbatim,
  // with no nanoid prefix — the caller guarantees uniqueness within the folder
  // (the shop names product images <product-slug><n>). Two exact-named uploads to
  // the same folder deliberately overwrite in storage. Falls back to the nanoid
  // form when no usable filename is given.
  exactName?: boolean,
): string {
  const ext = extensionForMimeType(mimeType)
  const exactBase = exactName ? sanitizeFilename((originalFilename ?? '').replace(/\.[^./\\]+$/, '')) : ''
  const id = exactBase ? `${exactBase}.${ext}` : `${nanoid()}${filenameLabel(originalFilename)}.${ext}`
  const prefix = provider === 'B2' ? 'media' : `media/${provider}`
  const dir = folderPath ? `${prefix}/${folderPath}` : prefix
  return `${dir}/${id}`
}

// ---------------------------------------------------------------------------
// Upload — branches by provider, returns the stored key + public/serving url.
// ---------------------------------------------------------------------------

export async function uploadMedia(
  buffer: Buffer,
  mimeType: string,
  provider: MediaProviderType,
  originalFilename?: string,
  // Sanitised, slash-joined folder path the item should live under. Omitted for
  // uploads into the library root and for all generated media (icons, avatars).
  folderPath?: string,
  // Opt-in: use the exact (sanitised) filename as the key basename, no nanoid.
  // Callers that pass this own uniqueness within the folder. See buildKey.
  exactName?: boolean,
): Promise<UploadResult> {
  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const key = buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
    const key = buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
    const key = buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
        { resource_type: 'image', ...(folderPath ? { folder: folderPath } : {}) },
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
    const ext = extensionForMimeType(mimeType)
    const exactBase = exactName ? sanitizeFilename((originalFilename ?? '').replace(/\.[^./\\]+$/, '')) : ''
    const fileName = exactBase ? `${exactBase}.${ext}` : `${nanoid()}${filenameLabel(originalFilename)}.${ext}`
    const uploadable = await toFile(buffer, fileName, { type: mimeType })
    const result = await ik.files.upload({ file: uploadable, fileName, ...(folderPath ? { folder: `/${folderPath}` } : {}) })
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
// Relocate a blob to a new folder path and/or a new filename. Creates the new
// blob only — the old one is left in place so the caller can rewrite references
// first and delete the original last (the same failure-safe order the optimise
// flow uses). For S3-compatible providers this is a cheap server-side copy; for
// everyone else the original bytes are downloaded and re-uploaded into the new
// location. The returned key/url point at the freshly-created blob.
// ---------------------------------------------------------------------------
export async function relocateMediaBlob(
  media: { provider: MediaProviderType; key: string; url: string; mimeType: string; sizeBytes: number; originalName: string | null },
  folderPath: string | undefined,
  newOriginalName?: string,
  // Opt-in exact-name keying (no nanoid) — see buildKey. Used by callers that
  // organise blobs under a deterministic name (the shop's product images).
  exactName?: boolean,
): Promise<UploadResult> {
  const provider = media.provider
  const name = newOriginalName ?? media.originalName ?? undefined

  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const key = buildKey(provider, media.mimeType, name, folderPath, exactName)
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        // Keys only contain [a-z0-9._-/]; encodeURI keeps the slashes intact.
        CopySource: encodeURI(`${bucket}/${media.key}`),
        Key: key,
        ContentType: media.mimeType,
        MetadataDirective: 'COPY',
        ACL: 'private',
      })
    )
    return { key, url: `${workerUrl()}/${key}`, mimeType: media.mimeType, sizeBytes: media.sizeBytes }
  }

  // Vercel Blob, Supabase, Cloudinary, ImageKit: download the original bytes and
  // re-upload into the new location. uploadMedia handles each provider's folder
  // convention and returns the new key + serving url.
  const buffer = await downloadMedia(provider, media.key, media.url)
  return uploadMedia(buffer, media.mimeType, provider, name, folderPath, exactName)
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
  // The filename the user uploaded, kept for display. Omitted by generated-file
  // callers (icons, avatars, exports) that have no user-facing name.
  originalName?: string
  // The folder the item was uploaded into. Null/omitted = the library root.
  folderId?: string | null
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
      originalName: data.originalName ?? null,
      folderId: data.folderId ?? null,
    },
  })
}

// Human-readable list of everywhere a media item is referenced. Empty means the
// item is safe to delete. Kept in step with lib/media/references.ts so the delete
// warning and the media library's In Use / Not In Use tabs agree.
export async function getMediaReferences(mediaId: string): Promise<string[]> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, key: true, url: true },
  })
  if (!media) return []

  const [config, ogPages, avatars, exports] = await Promise.all([
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        logoMediaId: true,
        logoDarkMediaId: true,
        faviconMediaId: true,
        faviconDarkMediaId: true,
        appIconMediaId: true,
        appleTouchIconMediaId: true,
        webManifest192MediaId: true,
        webManifest512MediaId: true,
      },
    }),
    prisma.infoPage.count({ where: { ogImageId: mediaId } }),
    prisma.member.count({ where: { avatarMediaId: mediaId } }),
    prisma.memberDataExportRequest.count({ where: { mediaId } }),
  ])

  const refs: string[] = []
  if (config?.logoMediaId === mediaId || config?.logoDarkMediaId === mediaId) refs.push('site logo')
  if (config?.faviconMediaId === mediaId || config?.faviconDarkMediaId === mediaId) refs.push('site favicon')
  if (config?.appIconMediaId === mediaId) refs.push('app icon')
  if (config?.appleTouchIconMediaId === mediaId) refs.push('apple touch icon')
  if (config?.webManifest192MediaId === mediaId) refs.push('web manifest icon (192px)')
  if (config?.webManifest512MediaId === mediaId) refs.push('web manifest icon (512px)')
  if (ogPages > 0) refs.push(`${ogPages} page social image${ogPages > 1 ? 's' : ''}`)
  if (avatars > 0) refs.push(`${avatars} member avatar${avatars > 1 ? 's' : ''}`)
  if (exports > 0) refs.push('a data export')

  // Media embedded inside Puck page/layout content is stored by url/key/id, not
  // by a foreign key, so scan the builder JSON for any occurrence.
  const { haystack } = await loadMediaUsageIndex()
  const inContent =
    (media.url && haystack.includes(media.url.toLowerCase())) ||
    (media.key && haystack.includes(media.key.toLowerCase())) ||
    haystack.includes(media.id.toLowerCase())
  if (inContent) refs.push('page or layout content')

  return refs
}

// ---------------------------------------------------------------------------
// In-place optimise — re-encode an existing media item to WebP without changing
// its identity. Powers the media library's single + bulk "Optimise" actions.
//
// Unlike the Branding tab's /optimise route (which mints a *new* Media row and
// repoints one config field at it), this keeps the same Media.id, so every
// existing reference — config icons, member avatars, page social images — stays
// valid untouched. The re-encoded blob lands at a fresh storage key; any url/key
// embedded in Puck builder content is rewritten to match; the pre-optimise blob
// is then deleted so no orphan is left behind ("delete the originals").
// ---------------------------------------------------------------------------

export type OptimiseResult =
  | { optimised: false; reason: string; before?: number; after?: number }
  | { optimised: true; before: number; after: number }

export async function optimiseMediaInPlace(mediaId: string, userId?: string): Promise<OptimiseResult> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) return { optimised: false, reason: 'Media item not found' }
  if (media.optimised) return { optimised: false, reason: 'Already optimised' }
  if (!media.mimeType.startsWith('image/') || media.mimeType === 'image/svg+xml') {
    return { optimised: false, reason: 'Only raster images can be optimised' }
  }

  const original = await downloadMedia(media.provider, media.key, media.url)

  // Lossy WebP (quality 82) is the sweet spot for library media: near-invisible
  // quality loss for a big weight saving, and — unlike lossless — reliably
  // smaller than an already-compressed JPEG source. Dimensions are preserved
  // (no downscale): library images are used at many sizes across the site,
  // unlike a logo. Animated sources keep their frames.
  const encoded = await sharp(original, { animated: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer()

  const before = original.length
  const after = encoded.length
  if (after >= before) {
    // Source was already smaller than we can manage — mark it optimised so it
    // isn't offered again, but leave the original bytes in place.
    await prisma.media.update({ where: { id: media.id }, data: { optimised: true } })
    return { optimised: false, reason: 'Already as small as it gets', before, after }
  }

  const oldKey = media.key
  const oldUrl = media.url

  // Store the WebP under a new key, then point the existing row at it. Id is
  // untouched, so id-based references need no change. Keep the item under its
  // current folder path so optimising doesn't quietly shunt it back to the root
  // (lazy import breaks the upload↔organise module cycle).
  const { resolveFolderPath } = await import('@/lib/media/organise')
  const folderPath = await resolveFolderPath(media.folderId)
  const result = await uploadMedia(encoded, 'image/webp', media.provider, media.originalName ?? undefined, folderPath || undefined)

  await prisma.media.update({
    where: { id: media.id },
    data: {
      key: result.key,
      url: result.url,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      optimised: true,
    },
  })

  // Rewrite url/key references embedded in Puck content before deleting the old
  // blob, so a failure here leaves the old blob still serving the old url.
  await rewriteMediaReferencesInContent(oldUrl, result.url, oldKey, result.key)

  // Delete the pre-optimise blob. Best-effort: a storage hiccup shouldn't undo
  // an otherwise-successful optimise (the row already points at the new blob).
  try {
    await deleteMedia(media.provider, oldKey)
  } catch {
    // Orphaned original left in storage; harmless, still deletable later.
  }

  return { optimised: true, before, after }
}

// ---------------------------------------------------------------------------
// Crop / edit — extract a rectangle from an existing raster image and either
// replace the original in place (same Media.id, every reference preserved — the
// optimise-in-place pattern) or mint a fresh Media row (leaving the original
// untouched). The crop rectangle is in the source image's own pixels; it is
// clamped to the image bounds server-side so a stale client rect can't fail the
// extract. The output keeps the source format so the extension and every
// embedded reference stay coherent.
// ---------------------------------------------------------------------------

export type CropRect = { left: number; top: number; width: number; height: number }

// Re-encode a cropped buffer in the source's own format, so a JPEG stays a JPEG
// (etc.) and the stored extension keeps matching the bytes. Anything sharp can't
// write back in kind falls to WebP. Cropping reads the first frame only, so an
// animated source becomes a still — acceptable for a crop tool.
function encodeCrop(input: Buffer, mimeType: string, rect: CropRect): Promise<Buffer> {
  const s = sharp(input).extract(rect)
  switch (mimeType) {
    case 'image/jpeg':
      return s.jpeg({ quality: 90 }).toBuffer()
    case 'image/png':
      return s.png().toBuffer()
    case 'image/webp':
      return s.webp({ quality: 90 }).toBuffer()
    case 'image/gif':
      return s.gif().toBuffer()
    case 'image/avif':
      return s.avif({ quality: 60 }).toBuffer()
    default:
      return s.webp({ quality: 90 }).toBuffer()
  }
}

// Ensure a user-typed filename carries the extension its bytes actually need, so
// "logo" saved from a PNG source lands as "logo.png".
function withExtensionForMime(name: string, mimeType: string): string {
  const ext = extensionForMimeType(mimeType)
  const trimmed = name.trim()
  return new RegExp(`\\.${ext}$`, 'i').test(trimmed) ? trimmed : `${trimmed.replace(/\.[^./\\]+$/, '')}.${ext}`
}

export async function editMediaImage(
  mediaId: string,
  crop: CropRect,
  opts: { mode: 'replace' | 'new'; newName?: string },
  userId?: string,
): Promise<Media> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) throw new Error('Media item not found')
  if (!media.mimeType.startsWith('image/') || media.mimeType === 'image/svg+xml') {
    throw new Error('Only raster images can be edited')
  }

  const original = await downloadMedia(media.provider, media.key, media.url)
  const meta = await sharp(original).metadata()
  const iw = meta.width ?? 0
  const ih = meta.height ?? 0
  if (!iw || !ih) throw new Error('Could not read image dimensions')

  // Clamp the requested rect to the image so a rounding error or a stale client
  // rect can't push extract() past an edge.
  const left = Math.max(0, Math.min(Math.round(crop.left), iw - 1))
  const top = Math.max(0, Math.min(Math.round(crop.top), ih - 1))
  const width = Math.max(1, Math.min(Math.round(crop.width), iw - left))
  const height = Math.max(1, Math.min(Math.round(crop.height), ih - top))

  const encoded = await encodeCrop(original, media.mimeType, { left, top, width, height })

  const provider = media.provider
  // Keep the edited blob in the source's folder (lazy import breaks the
  // upload↔organise module cycle, as in optimiseMediaInPlace).
  const { resolveFolderPath } = await import('@/lib/media/organise')
  const folderPath = await resolveFolderPath(media.folderId)

  if (opts.mode === 'new') {
    const base = opts.newName?.trim() || `${(media.originalName ?? 'image').replace(/\.[^./\\]+$/, '')} (edited)`
    const finalName = withExtensionForMime(base, media.mimeType)
    const result = await uploadMedia(encoded, media.mimeType, provider, finalName, folderPath || undefined)
    return saveMediaRecord({
      key: result.key,
      url: result.url,
      provider,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      uploadedById: userId,
      altText: media.altText ?? undefined,
      isDecorative: media.isDecorative,
      originalName: finalName,
      folderId: media.folderId,
    })
  }

  // Replace in place — mirror optimiseMediaInPlace: store the new blob, repoint
  // the existing row (id untouched), rewrite embedded url/key references, then
  // delete the pre-edit blob. optimised is reset because the bytes changed.
  const oldKey = media.key
  const oldUrl = media.url
  const result = await uploadMedia(encoded, media.mimeType, provider, media.originalName ?? undefined, folderPath || undefined)

  const updated = await prisma.media.update({
    where: { id: media.id },
    data: {
      key: result.key,
      url: result.url,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      optimised: false,
    },
  })

  await rewriteMediaReferencesInContent(oldUrl, result.url, oldKey, result.key)

  try {
    await deleteMedia(provider, oldKey)
  } catch {
    // Orphaned pre-edit blob left in storage; harmless, still deletable later.
  }

  return updated
}

// Rewrite every occurrence of a media item's old url/key to its new url/key
// inside Puck builder JSON (page draft + published content, and layouts). Only
// touches rows whose blob actually mentions the old value, and only writes back
// the columns that changed. The url/key are long unique strings (nanoid), so a
// plain string swap can't collide with unrelated content.
export async function rewriteMediaReferencesInContent(
  oldUrl: string,
  newUrl: string,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const swap = (json: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined => {
    if (json == null) return undefined
    const before = JSON.stringify(json)
    let text = before
    if (oldUrl && oldUrl !== newUrl) text = text.split(oldUrl).join(newUrl)
    if (oldKey && oldKey !== newKey) text = text.split(oldKey).join(newKey)
    if (text === before) return undefined
    return JSON.parse(text) as Prisma.InputJsonValue
  }

  const pages = await prisma.infoPage.findMany({ select: { id: true, builderData: true, publishedData: true } })
  for (const p of pages) {
    const nextBuilder = swap(p.builderData)
    const nextPublished = swap(p.publishedData)
    if (nextBuilder !== undefined || nextPublished !== undefined) {
      await prisma.infoPage.update({
        where: { id: p.id },
        data: {
          ...(nextBuilder !== undefined ? { builderData: nextBuilder } : {}),
          ...(nextPublished !== undefined ? { publishedData: nextPublished } : {}),
        },
      })
    }
  }

  const layouts = await prisma.layout.findMany({ select: { id: true, builderData: true, publishedData: true } })
  for (const l of layouts) {
    const nextBuilder = swap(l.builderData)
    const nextPublished = swap(l.publishedData)
    if (nextBuilder !== undefined || nextPublished !== undefined) {
      await prisma.layout.update({
        where: { id: l.id },
        data: {
          ...(nextBuilder !== undefined ? { builderData: nextBuilder } : {}),
          ...(nextPublished !== undefined ? { publishedData: nextPublished } : {}),
        },
      })
    }
  }
}
