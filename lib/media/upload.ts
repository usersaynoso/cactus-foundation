import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import { Prisma, type Media, type MediaProviderType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { isProxied, ALL_PROVIDERS } from '@/lib/media/providers'
import { loadMediaUsageIndex } from '@/lib/media/references'
import { sanitizeSvg } from '@/lib/sanitize'
import { MAX_UPLOAD_BYTES, tooLargeReason, extensionForModelType } from '@/lib/media/limits'
import { exactBaseName, nanoidLabel, isExactNameKey } from '@/lib/media/keys'
import { planAspectChange, ratioLabel } from '@/lib/media/aspect-plan'
import { planResize, sizeLabel, type ResizeBox } from '@/lib/media/resize-plan'

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
//
// Model types are looked up rather than derived, because their subtype is not
// their extension: "model/gltf-binary" has to land as ".glb". The key's extension
// is what the Worker and contentTypeForKey() read the type back out of, so a key
// ending ".gltf-binary" would be one nothing could type — and the octet-stream
// these files used to be stored under produced exactly that, a ".octet-stream".
function extensionForMimeType(mimeType: string): string {
  const model = extensionForModelType(mimeType)
  if (model) return model
  const subtype = mimeType.split('/')[1] ?? 'bin'
  return subtype.split('+')[0] || 'bin'
}

// The human-readable label appended to a generated key, e.g. "-logo". The real
// extension is derived from the validated MIME type and appended separately, so
// the original filename's extension is stripped first — keeping it produced a
// double extension ("logo.png" -> "<id>-logo.png.png").
//
// Clipping rules for both key forms live in lib/media/keys.ts, where they are
// unit-tested: a label may be clipped freely (the nanoid beside it carries
// uniqueness), an exact name may not.
const filenameLabel = nanoidLabel

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
  // the same folder deliberately overwrite in storage, so the basename must
  // preserve whatever made the caller's names distinct (see lib/media/keys.ts).
  // Falls back to the nanoid form when no usable filename is given.
  exactName?: boolean,
): string {
  const ext = extensionForMimeType(mimeType)
  const exactBase = exactName ? exactBaseName(originalFilename) : ''
  const id = exactBase ? `${exactBase}.${ext}` : `${nanoid()}${filenameLabel(originalFilename)}.${ext}`
  const prefix = provider === 'B2' ? 'media' : `media/${provider}`
  const dir = folderPath ? `${prefix}/${folderPath}` : prefix
  return `${dir}/${id}`
}

/** How many "name-2", "name-3" … variants to try before giving up on the name. */
const MAX_NAME_SUFFIX = 50

// Key for a media-library upload, keeping the name the person actually chose.
//
// buildKey's exact form needs the CALLER to guarantee uniqueness, which the shop
// can do (it names product images itself) and a person dragging files onto the
// media library cannot. So uniqueness is established here instead: the exact key
// is taken if no Media row already holds it, otherwise "-2", "-3" and so on, the
// same thing an operating system does when you copy a file into a folder twice.
//
// The folder is part of the key, so two files of the same name in two folders
// never meet. Only when even the suffixes are exhausted does this fall back to
// the opaque nanoid form, which cannot collide at all.
export async function buildLibraryUploadKey(
  provider: MediaProviderType,
  mimeType: string,
  originalFilename?: string,
  folderPath?: string,
): Promise<string> {
  const base = exactBaseName(originalFilename)
  if (!base) return buildKey(provider, mimeType, originalFilename, folderPath)

  const ext = extensionForMimeType(mimeType)
  for (let n = 1; n <= MAX_NAME_SUFFIX; n++) {
    // Round-trips through buildKey (rather than string-building the key here) so
    // the prefix, folder and clipping rules stay in exactly one place.
    const candidate = n === 1 ? base : `${base}-${n}`
    const key = buildKey(provider, mimeType, `${candidate}.${ext}`, folderPath, true)
    const taken = await prisma.media.findUnique({ where: { key }, select: { id: true } })
    if (!taken) return key
  }
  return buildKey(provider, mimeType, originalFilename, folderPath)
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
  // A key the caller has already settled on, used verbatim instead of building
  // one here. The media library passes the key buildLibraryUploadKey chose, so
  // the collision check that picked it and the object actually written cannot
  // disagree. Providers whose "key" is an id they mint (Cloudinary, ImageKit)
  // can only honour the filename part of it.
  presetKey?: string,
): Promise<UploadResult> {
  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const key = presetKey ?? buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
    const key = presetKey ?? buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
    const key = presetKey ?? buildKey(provider, mimeType, originalFilename, folderPath, exactName)
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
    const exactBase = exactName ? exactBaseName(originalFilename) : ''
    // ImageKit mints its own id for the key, so a preset key can only contribute
    // the name the file is stored under.
    const presetName = presetKey ? presetKey.slice(presetKey.lastIndexOf('/') + 1) : ''
    const fileName = presetName || (exactBase ? `${exactBase}.${ext}` : `${nanoid()}${filenameLabel(originalFilename)}.${ext}`)
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
// Inspect what storage actually holds — size of one object, or every object
// under the media prefix. Both are read-only and used to keep Media rows honest
// about the blobs they point at, which nothing else in the pipeline can do: the
// direct-upload path never sees the bytes, so without asking storage the row's
// size is only ever the client's word for it.
// ---------------------------------------------------------------------------

/**
 * The real stored size of an object, or null when the provider can't be asked
 * cheaply (Cloudinary/ImageKit mint their own ids) or the lookup fails. Callers
 * treat null as "no better answer than what I already had" rather than an error:
 * a size that is merely unconfirmed must not fail an upload whose bytes landed.
 */
export async function headMediaSize(provider: MediaProviderType, key: string): Promise<number | null> {
  try {
    if (isS3Provider(provider)) {
      const { client, bucket } = getS3Config(provider)
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return typeof res.ContentLength === 'number' ? res.ContentLength : null
    }

    if (provider === 'VERCEL_BLOB') {
      const { head } = await import('@vercel/blob')
      const meta = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN })
      return typeof meta.size === 'number' ? meta.size : null
    }

    if (provider === 'SUPABASE_STORAGE') {
      const objects = await listStoredMediaKeys(provider, key)
      return objects?.find((o) => o.key === key)?.sizeBytes ?? null
    }

    // CLOUDINARY / IMAGEKIT: the stored "key" is a provider-minted id and both
    // may re-encode on ingest, so a size read here would not describe the bytes
    // this upload sent either. Left unconfirmed on purpose.
    return null
  } catch {
    return null
  }
}

export type StoredObject = { key: string; sizeBytes: number }

/**
 * Every object storage holds under this provider's media prefix. Returns null
 * when the provider has no listing this code supports — the caller must treat
 * that as "cannot tell", never as "found nothing", or a reconcile would report
 * the whole library as missing from storage.
 *
 * `prefix` narrows the scan; omitted, it is the provider's own media namespace.
 */
export async function listStoredMediaKeys(
  provider: MediaProviderType,
  prefix?: string,
): Promise<StoredObject[] | null> {
  const scope = prefix ?? mediaKeyPrefix(provider)

  if (isS3Provider(provider)) {
    const { client, bucket } = getS3Config(provider)
    const out: StoredObject[] = []
    let token: string | undefined
    // ListObjectsV2 returns live objects only — old versions and delete markers
    // (which is most of what a versioned bucket's own file browser counts) are
    // not included, so this matches what the library should be holding.
    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: scope,
        ContinuationToken: token,
      }))
      for (const o of res.Contents ?? []) {
        if (typeof o.Key === 'string') out.push({ key: o.Key, sizeBytes: o.Size ?? 0 })
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return out
  }

  if (provider === 'VERCEL_BLOB') {
    const { list } = await import('@vercel/blob')
    const out: StoredObject[] = []
    let cursor: string | undefined
    do {
      const res = await list({ prefix: scope, cursor, token: process.env.BLOB_READ_WRITE_TOKEN })
      for (const b of res.blobs) out.push({ key: b.pathname, sizeBytes: b.size })
      cursor = res.hasMore ? res.cursor : undefined
    } while (cursor)
    return out
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
    // Supabase lists one folder at a time and reports subfolders as rows with no
    // metadata, so the tree is walked breadth-first rather than in one call.
    const out: StoredObject[] = []
    const queue: string[] = [scope.replace(/\/$/, '')]
    while (queue.length > 0) {
      const dir = queue.shift() as string
      const { data, error } = await storage.from(bucket).list(dir, { limit: 1000 })
      if (error) throw new Error(`Supabase list failed: ${error.message}`)
      for (const entry of data ?? []) {
        const full = dir ? `${dir}/${entry.name}` : entry.name
        const size = (entry.metadata as { size?: number } | null)?.size
        if (typeof size === 'number') out.push({ key: full, sizeBytes: size })
        else queue.push(full)
      }
    }
    return out
  }

  // CLOUDINARY / IMAGEKIT store by provider-minted id in a namespace this code
  // doesn't own end to end. "Cannot tell" is the honest answer.
  return null
}

/** The key prefix every object this provider stores for us sits under. */
export function mediaKeyPrefix(provider: MediaProviderType): string {
  return provider === 'B2' ? 'media/' : `media/${provider}/`
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
    try {
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
    } catch (err) {
      // Server-side copy is the fast path, but it can fail for a single object
      // where a plain re-upload of the same bytes still succeeds (a provider-side
      // copy hiccup, a transient 5xx). Left to throw, it strands the item at its
      // old key - and for product-image filing that surfaces as a picture stuck
      // in the library root, because reorganiseProductMedia swallows the failure.
      // So fall through to downloading the bytes and writing them to the very key
      // the copy was aiming for: buildKey is deterministic, so uploadMedia below
      // lands on that same key.
      console.warn(`[media] server-side copy failed for ${media.key}, falling back to re-upload:`, err)
    }
  }

  // Non-S3 providers (Vercel Blob, Supabase, Cloudinary, ImageKit), and the S3
  // fallback above: download the original bytes and re-upload into the new
  // location. uploadMedia handles each provider's folder convention and returns
  // the new key + serving url.
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
  // Whether these bytes have already been through the optimiser. Only derived
  // images (a resize or reshape of an optimised source) pass this; a fresh
  // upload has not been optimised and leaves it alone.
  optimised?: boolean
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
      optimised: data.optimised ?? false,
    },
  })
}

// Human-readable list of everywhere a media item is referenced. Empty means the
// item is safe to delete. Kept in step with lib/media/references.ts so the delete
// warning and the media library's In Use / Not In Use tabs agree.
export async function getMediaReferences(mediaId: string): Promise<string[]> {
  const refs = await getMediaReferencesBulk([mediaId])
  return refs.get(mediaId) ?? []
}

/**
 * Same verdicts as `getMediaReferences`, but for many items in one pass: the
 * per-id counts become three grouped queries and the usage index is built once,
 * so checking hundreds of items costs the same handful of round-trips as
 * checking one. Ids that do not exist are simply absent from the result.
 */
export async function getMediaReferencesBulk(mediaIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (mediaIds.length === 0) return result

  const [mediaRows, config, ogPages, avatars, exports] = await Promise.all([
    prisma.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, key: true, url: true },
    }),
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
    prisma.infoPage.groupBy({
      by: ['ogImageId'],
      where: { ogImageId: { in: mediaIds } },
      _count: { _all: true },
    }),
    prisma.member.groupBy({
      by: ['avatarMediaId'],
      where: { avatarMediaId: { in: mediaIds } },
      _count: { _all: true },
    }),
    prisma.memberDataExportRequest.groupBy({
      by: ['mediaId'],
      where: { mediaId: { in: mediaIds } },
      _count: { _all: true },
    }),
  ])

  const ogPageCounts = new Map(ogPages.map((g) => [g.ogImageId, g._count._all]))
  const avatarCounts = new Map(avatars.map((g) => [g.avatarMediaId, g._count._all]))
  const exportCounts = new Map(exports.map((g) => [g.mediaId, g._count._all]))

  // Media embedded inside Puck page/layout content is stored by url/key/id, not
  // by a foreign key, so scan the builder JSON for any occurrence. The same
  // haystack carries every reference the installed modules contributed (a product
  // image, an option swatch, a 3D model), which is why the warning names modules
  // as well as pages - core cannot tell from a substring hit which one matched.
  const { haystack } = await loadMediaUsageIndex()

  for (const media of mediaRows) {
    const mediaId = media.id
    const refs: string[] = []
    if (config?.logoMediaId === mediaId || config?.logoDarkMediaId === mediaId) refs.push('site logo')
    if (config?.faviconMediaId === mediaId || config?.faviconDarkMediaId === mediaId) refs.push('site favicon')
    if (config?.appIconMediaId === mediaId) refs.push('app icon')
    if (config?.appleTouchIconMediaId === mediaId) refs.push('apple touch icon')
    if (config?.webManifest192MediaId === mediaId) refs.push('web manifest icon (192px)')
    if (config?.webManifest512MediaId === mediaId) refs.push('web manifest icon (512px)')
    const pageCount = ogPageCounts.get(mediaId) ?? 0
    if (pageCount > 0) refs.push(`${pageCount} page social image${pageCount > 1 ? 's' : ''}`)
    const avatarCount = avatarCounts.get(mediaId) ?? 0
    if (avatarCount > 0) refs.push(`${avatarCount} member avatar${avatarCount > 1 ? 's' : ''}`)
    if ((exportCounts.get(mediaId) ?? 0) > 0) refs.push('a data export')

    const inContent =
      (media.url && haystack.includes(media.url.toLowerCase())) ||
      (media.key && haystack.includes(media.key.toLowerCase())) ||
      haystack.includes(media.id.toLowerCase())
    if (inContent) refs.push('page, layout or module content')

    result.set(mediaId, refs)
  }

  return result
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

// The key an exact-named item should keep through an optimise: its own basename,
// re-extensioned to .webp. Undefined — meaning "build a key the usual way" — when
// the item isn't exact-named to begin with, or when the .webp key it wants is
// already held by a different library item. Overwriting that one's blob would
// leave two rows serving the same bytes, which is exactly the collision the
// nanoid form exists to prevent, so it takes the nanoid form instead.
async function exactOptimisedKey(media: Media, folderPath: string): Promise<string | undefined> {
  if (!isExactNameKey(media.key, media.originalName)) return undefined

  const key = buildKey(media.provider, 'image/webp', media.originalName ?? undefined, folderPath || undefined, true)
  if (key === media.key) return key

  const taken = await prisma.media.findUnique({ where: { key }, select: { id: true } })
  return taken ? undefined : key
}

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

  // Store the WebP under a new key, then point the existing row at it. Keep the
  // item under its current folder path so optimising doesn't quietly shunt it
  // back to the root (lazy import breaks the upload↔organise module cycle).
  // repointMediaToBlob owns the rest: the row swap, the reference rewrite, and
  // dropping the pre-optimise blob last.
  const { resolveFolderPath } = await import('@/lib/media/organise')
  const folderPath = await resolveFolderPath(media.folderId)
  // Keep the name the file is stored under. Every library upload is filed by the
  // name the person chose ("beach-hut.jpg"), and optimising used to mint the
  // opaque nanoid form instead — so a file came back from a single click called
  // "V1StGXR8-beach-hut.webp". Only the extension is allowed to move, because
  // the bytes really are WebP now. Anything already on a nanoid key stays on one:
  // that form exists precisely because its name can't be trusted to be unique.
  const keepName = await exactOptimisedKey(media, folderPath)
  const result = await uploadMedia(
    encoded,
    'image/webp',
    media.provider,
    media.originalName ?? undefined,
    folderPath || undefined,
    undefined,
    keepName,
  )
  await repointMediaToBlob(media, result, { optimised: true })

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

// Re-encode a derived image in the source's own format, so a JPEG stays a JPEG
// (etc.) and the stored extension keeps matching the bytes. Anything sharp can't
// write back in kind falls to WebP. These paths read the first frame only, so an
// animated source becomes a still — acceptable for a crop or a reshape.
function encodeToMime(s: sharp.Sharp, mimeType: string): Promise<Buffer> {
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

// Store a freshly derived blob for an existing item, as either a replacement of
// the original (same Media.id, so every id-based reference survives) or a new
// library row alongside it. Shared by the crop editor and the ratio changer so
// the two can't drift apart on the fiddly bits: folder retention, reference
// rewriting, and deleting the superseded blob only after the row has moved on.
async function persistDerivedImage(
  media: Media,
  encoded: Buffer,
  opts: { mode: 'replace' | 'new'; newName?: string; fallbackSuffix: string },
  userId?: string,
): Promise<Media> {
  const provider = media.provider
  // Keep the derived blob in the source's folder (lazy import breaks the
  // upload↔organise module cycle, as in optimiseMediaInPlace).
  const { resolveFolderPath } = await import('@/lib/media/organise')
  const folderPath = await resolveFolderPath(media.folderId)

  if (opts.mode === 'new') {
    const base = opts.newName?.trim() || `${(media.originalName ?? 'image').replace(/\.[^./\\]+$/, '')} ${opts.fallbackSuffix}`
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
      // A derived copy of an optimised image is still optimised: it comes off
      // the same encoder, at fewer pixels, so it is smaller than the source it
      // was cut from. Dropping the badge here sent people back to optimise an
      // image that was already WebP and already smaller.
      optimised: media.optimised,
    })
  }

  // Replace in place. optimised rides along with the source: the new bytes are
  // the same encoder's output at fewer pixels, so an optimised image stays
  // optimised through a resize rather than being offered up for a second,
  // pointless pass.
  //
  // Keep the key in whichever form it is already in. Reshaping or cropping an
  // exact-named image used to hand it a nanoid key, which renamed the file and
  // moved its url — see repointMediaToBlob for what that cost. An exact name is
  // deterministic, so the derived blob lands back on the very key it came from
  // and no reference has to move at all.
  const exactName = isExactNameKey(media.key, media.originalName)
  const result = await uploadMedia(encoded, media.mimeType, provider, media.originalName ?? undefined, folderPath || undefined, exactName)
  return repointMediaToBlob(media, result, { optimised: media.optimised })
}

// ---------------------------------------------------------------------------
// The tail every in-place rewrite shares — optimise, crop, reshape, resize, and
// swapping the file outright. Point the existing row at the new blob (id
// untouched, so every id-based reference survives), move any embedded url/key
// references on to it, and only then let go of the blob it superseded.
//
// The order is the whole point: a failure at any step leaves the old blob still
// serving the old url, rather than a row pointing at bytes that were never
// written. Its owner is this one function so the five callers can't drift apart
// on the fiddly bits.
// ---------------------------------------------------------------------------
async function repointMediaToBlob(
  media: Media,
  result: UploadResult,
  data: {
    optimised: boolean
    // Only passed when the swap changes the display name (a replacement file of a
    // different type re-extensions it). Omitted leaves the name alone.
    originalName?: string | null
  },
): Promise<Media> {
  const oldKey = media.key
  const oldUrl = media.url

  const updated = await prisma.media.update({
    where: { id: media.id },
    data: {
      key: result.key,
      url: result.url,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      optimised: data.optimised,
      ...(data.originalName !== undefined ? { originalName: data.originalName } : {}),
    },
  })

  // Nothing to rewrite when the blob stayed put: every url, key and id reference
  // to it still resolves, wherever it is held.
  //
  // When it hasn't stayed put, this reaches Puck content and nothing else — a url
  // held in a module's own table (the shop keeps its product images' urls in
  // shp_product_media) is left behind. That is why callers keep an exact-named
  // key exactly where it was: it is the only form whose new key is guaranteed to
  // equal its old one.
  if (result.key !== oldKey || result.url !== oldUrl) {
    await rewriteMediaReferencesInContent(oldUrl, result.url, oldKey, result.key)
  }

  // The same rule moveOrRenameMedia learnt: a write that resolves to the key it
  // started on has just put the new bytes there, so "deleting the old blob"
  // would delete the image itself.
  if (result.key !== oldKey) {
    try {
      await deleteMedia(media.provider, oldKey)
    } catch {
      // Orphaned superseded blob left in storage; harmless, still deletable later.
    }
  }

  return updated
}

// ---------------------------------------------------------------------------
// Replace the file — swap an item's bytes for a freshly uploaded file, keeping
// the item itself. Same Media.id, same folder, same name, same alt text, same
// tags, and every reference to it still resolves; only the pixels change. That
// is the entire difference between this and uploading a new file and deleting
// the old one, which is what people did instead and which broke every page the
// old file was on.
// ---------------------------------------------------------------------------

// A replacement that would have to rename the file to go ahead. Its own type so
// the route can answer 409 with a reason a person can act on, rather than a 500.
export class MediaReplaceTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaReplaceTypeError'
  }
}

// Where a replacement blob for `media` has to land.
//
// The item keeps its identity through a replace, so the key is rebuilt from what
// the row already says — its provider, its folder, its name — and only the
// extension follows the new bytes' type.
//
// Which is why an exact-named item (see lib/media/keys.ts) can only be replaced
// by a file of its own type. Its name IS its key, so a new extension means a new
// key; reference rewriting reaches Puck content and nothing else, so the url the
// shop holds for that product image in its own table would be left pointing at
// the blob this then deletes. The image would vanish from the storefront while
// sitting perfectly intact in the library. Refuse, and say so, instead.
export async function planMediaReplacement(
  media: Media,
  mimeType: string,
): Promise<{ key: string; originalName: string | null; folderPath: string; exactName: boolean }> {
  const exactName = isExactNameKey(media.key, media.originalName)
  if (exactName && mimeType !== media.mimeType) {
    throw new MediaReplaceTypeError(
      `“${media.originalName ?? media.key}” is filed under a fixed name by another part of the site, so its replacement has to be a ${fileKindLabel(media.mimeType)} as well.`
    )
  }

  // Lazy import breaks the upload↔organise module cycle, as in optimiseMediaInPlace.
  const { resolveFolderPath } = await import('@/lib/media/organise')
  const folderPath = await resolveFolderPath(media.folderId)
  // Keep the name the item is known by; only correct its extension so it can't
  // claim to be a PNG while holding JPEG bytes. A row with no name (a generated
  // file) stays nameless and takes the nanoid form.
  const originalName = media.originalName ? withExtensionForMime(media.originalName, mimeType) : null
  const key = buildKey(media.provider, mimeType, originalName ?? undefined, folderPath || undefined, exactName)
  return { key, originalName, folderPath, exactName }
}

// Replace an item's bytes with `buffer`. The serverless path: the bytes came
// through a route, so they have been validated by validateUpload (real image,
// SVG sanitised) before reaching here.
export async function replaceMediaFile(
  media: Media,
  buffer: Buffer,
  mimeType: string,
): Promise<Media> {
  const plan = await planMediaReplacement(media, mimeType)
  // The blob goes to the provider the ROW lives on, not the active selection —
  // an item uploaded before a provider switch still has to be replaced where it
  // actually is.
  const result = await uploadMedia(buffer, mimeType, media.provider, plan.originalName ?? undefined, plan.folderPath || undefined, plan.exactName)
  // A file someone just picked has not been through the optimiser, whatever the
  // item it replaces had been — so the badge clears and the item is offered for
  // optimising again, exactly as a fresh upload of the same file would be.
  return repointMediaToBlob(media, result, { optimised: false, originalName: plan.originalName })
}

// Replace an item's bytes with a blob the client already PUT straight to the
// Worker (the direct path — see /upload-url's replaceId and /[id]/replace). The
// bytes are in storage; this only moves the row and the references on to them.
export async function adoptReplacementBlob(
  media: Media,
  key: string,
  mimeType: string,
  sizeBytes: number,
  originalName: string | null,
): Promise<Media> {
  // The direct path is only ever signed for the S3-compatible family, whose
  // canonical serving url is the Worker's.
  if (!isS3Provider(media.provider)) throw new Error('This item is not stored on a provider the direct upload path can write to.')
  const result: UploadResult = {
    key,
    url: `${workerUrl()}/${key}`,
    mimeType,
    sizeBytes: await confirmedSizeBytes(media.provider, key, sizeBytes),
  }
  return repointMediaToBlob(media, result, { optimised: false, originalName })
}

/**
 * The size to record for a blob the server never held. On the direct-upload
 * paths the bytes go from the browser straight to storage, so the only figure
 * the request carries is the client's own `file.size` — which describes the file
 * it meant to send, not the object that ended up stored. Ask storage instead,
 * and keep the claimed value only when storage cannot say.
 */
export async function confirmedSizeBytes(
  provider: MediaProviderType,
  key: string,
  claimed: number,
): Promise<number> {
  const actual = await headMediaSize(provider, key)
  if (actual === null || actual === claimed) return claimed
  console.warn(`[media] size mismatch for ${key}: client claimed ${claimed}, storage holds ${actual} - recording ${actual}`)
  return actual
}

// Guard shared by every derive path: the row exists and its bytes are something
// sharp can actually rasterise. SVG is vector (nothing to pad or crop in pixels)
// and is excluded deliberately.
async function loadEditableImage(mediaId: string, verb: string): Promise<Media> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) throw new Error('Media item not found')
  if (!media.mimeType.startsWith('image/') || media.mimeType === 'image/svg+xml') {
    throw new Error(`Only raster images can be ${verb}`)
  }
  return media
}

export async function editMediaImage(
  mediaId: string,
  crop: CropRect,
  opts: { mode: 'replace' | 'new'; newName?: string },
  userId?: string,
): Promise<Media> {
  const media = await loadEditableImage(mediaId, 'edited')

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

  const encoded = await encodeToMime(sharp(original).extract({ left, top, width, height }), media.mimeType)

  return persistDerivedImage(media, encoded, { ...opts, fallbackSuffix: '(edited)' }, userId)
}

// ---------------------------------------------------------------------------
// Change aspect ratio — reshape an image to a target ratio by padding it out,
// never by trimming or stretching it. The source is drawn whole and centred on
// a canvas of the requested shape; the two short sides gain padding, which is
// either a colour, transparency, or a blurred blow-up of the image itself.
// Geometry lives in lib/media/aspect-plan.ts (pure, unit-tested); this half is
// the pixels and the persistence.
// ---------------------------------------------------------------------------

export type AspectFill =
  | { kind: 'blur' }
  | { kind: 'transparent' }
  | { kind: 'colour'; colour: string }

export type AspectResult =
  | { changed: true; item: Media; width: number; height: number; downscaled: boolean }
  | { changed: false; reason: string }

// Formats whose bytes can carry an alpha channel. A transparent pad on a JPEG
// would silently come out black, so it's refused rather than fudged.
const ALPHA_CAPABLE = new Set(['image/png', 'image/webp', 'image/avif', 'image/gif'])

export function supportsTransparentFill(mimeType: string): boolean {
  return ALPHA_CAPABLE.has(mimeType)
}

// Blur radius scaled to the canvas, so the backdrop reads as an out-of-focus
// wash at any size instead of a recognisable stretched copy.
function blurSigma(canvasWidth: number, canvasHeight: number): number {
  return Math.min(60, Math.max(6, Math.round(Math.max(canvasWidth, canvasHeight) / 45)))
}

export async function changeMediaAspectRatio(
  mediaId: string,
  opts: { ratioW: number; ratioH: number; fill: AspectFill; mode: 'replace' | 'new'; newName?: string },
  userId?: string,
): Promise<AspectResult> {
  const media = await loadEditableImage(mediaId, 'reshaped')
  const label = ratioLabel(opts.ratioW, opts.ratioH)

  if (opts.fill.kind === 'transparent' && !supportsTransparentFill(media.mimeType)) {
    return { changed: false, reason: `${fileKindLabel(media.mimeType)} images can't have a transparent background - pick a colour or blur instead` }
  }

  const original = await downloadMedia(media.provider, media.key, media.url)
  const meta = await sharp(original).metadata()
  const srcW = meta.width ?? 0
  const srcH = meta.height ?? 0
  if (!srcW || !srcH) throw new Error('Could not read image dimensions')

  const plan = planAspectChange(srcW, srcH, opts.ratioW, opts.ratioH)
  if (!plan) return { changed: false, reason: `Already ${label}` }

  // Resize first when the plan capped the canvas. fit 'inside' keeps the source
  // ratio itself, so the actual output can land a pixel under the planned box —
  // the offsets are therefore measured from the real bytes, not the plan.
  let drawn = original
  if (plan.imageWidth !== srcW || plan.imageHeight !== srcH) {
    drawn = await sharp(original).resize(plan.imageWidth, plan.imageHeight, { fit: 'inside' }).toBuffer()
  }
  const drawnMeta = await sharp(drawn).metadata()
  const dw = drawnMeta.width ?? plan.imageWidth
  const dh = drawnMeta.height ?? plan.imageHeight
  const left = Math.max(0, Math.floor((plan.canvasWidth - dw) / 2))
  const top = Math.max(0, Math.floor((plan.canvasHeight - dh) / 2))

  let pipeline: sharp.Sharp
  if (opts.fill.kind === 'blur') {
    // Cover-crop a copy of the image to fill the canvas, blur it hard, and lay
    // the untouched original over the top. The *backdrop* gets cropped; the
    // image the user actually sees is whole.
    const backdrop = await sharp(drawn)
      .resize(plan.canvasWidth, plan.canvasHeight, { fit: 'cover', position: 'centre' })
      .blur(blurSigma(plan.canvasWidth, plan.canvasHeight))
      .toBuffer()
    pipeline = sharp(backdrop).composite([{ input: drawn, left, top }])
  } else {
    const background = opts.fill.kind === 'transparent'
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : parseHexColour(opts.fill.colour)
    pipeline = sharp(drawn).extend({
      left,
      top,
      right: Math.max(0, plan.canvasWidth - dw - left),
      bottom: Math.max(0, plan.canvasHeight - dh - top),
      background,
    })
  }

  const encoded = await encodeToMime(pipeline, media.mimeType)
  const item = await persistDerivedImage(media, encoded, { mode: opts.mode, newName: opts.newName, fallbackSuffix: `(${label.replace(':', '-')})` }, userId)

  return { changed: true, item, width: plan.canvasWidth, height: plan.canvasHeight, downscaled: plan.downscaled }
}

// ---------------------------------------------------------------------------
// Resize — scale an image down to fit inside a box, keeping its own ratio. The
// sibling of the ratio changer: that one changes an image's shape by padding it,
// this one keeps the shape and changes the size. Nothing is cropped and nothing
// is stretched here either, and the box is a ceiling rather than a target — an
// image already inside it is left alone rather than blown up, because upscaling
// invents no detail and only costs bytes. Geometry lives in
// lib/media/resize-plan.ts (pure, unit-tested); this half is pixels and storage.
// ---------------------------------------------------------------------------

export type ResizeResult =
  | { changed: true; item: Media; width: number; height: number; capped: boolean; before: number; after: number }
  | { changed: false; reason: string }

export async function resizeMediaImage(
  mediaId: string,
  opts: { box: ResizeBox; mode: 'replace' | 'new'; newName?: string },
  userId?: string,
): Promise<ResizeResult> {
  const media = await loadEditableImage(mediaId, 'resized')

  const original = await downloadMedia(media.provider, media.key, media.url)
  const meta = await sharp(original).metadata()
  const srcW = meta.width ?? 0
  const srcH = meta.height ?? 0
  if (!srcW || !srcH) throw new Error('Could not read image dimensions')

  const plan = planResize(srcW, srcH, opts.box)
  if (!plan) return { changed: false, reason: `Already ${sizeLabel(srcW, srcH)} - smaller than that box` }

  // withoutEnlargement belts-and-braces the plan's own never-upscale rule: if the
  // two ever disagreed, sharp would decline to invent pixels rather than obey.
  const pipeline = sharp(original).resize(plan.width, plan.height, { fit: 'inside', withoutEnlargement: true })
  const encoded = await encodeToMime(pipeline, media.mimeType)

  // fit 'inside' keeps the source's own ratio, so the real output can land a
  // pixel under the planned box. Report what the bytes actually are, not what
  // the plan hoped for (the same rule changeMediaAspectRatio learnt).
  const outMeta = await sharp(encoded).metadata()
  const outW = outMeta.width ?? plan.width
  const outH = outMeta.height ?? plan.height

  const before = media.sizeBytes
  const item = await persistDerivedImage(
    media,
    encoded,
    { mode: opts.mode, newName: opts.newName, fallbackSuffix: `(${sizeLabel(outW, outH)})` },
    userId,
  )

  return { changed: true, item, width: outW, height: outH, capped: plan.capped, before, after: item.sizeBytes }
}

// Strict #rgb / #rrggbb parse. An unparseable colour throws rather than quietly
// defaulting to black and baking a wrong border into someone's image.
export function parseHexColour(hex: string): { r: number; g: number; b: number; alpha: number } {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  const digits = m?.[1]
  if (!digits) throw new Error(`Not a valid colour: ${hex}`)
  const h = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  }
}

// "JPEG" / "GIF" etc. for a message aimed at someone who doesn't think in MIME types.
function fileKindLabel(mimeType: string): string {
  const sub = mimeType.split('/')[1] ?? 'image'
  return sub === 'jpeg' ? 'JPEG' : sub.toUpperCase()
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

  // Puck content is core's own. A module may also hold this media's url in its own
  // table - the shop keeps every product image's url in shp_product_media,
  // shop-variations an image-swatch url in svr_option_values - and core has no
  // knowledge of those tables. Each such module registers a rewriter through the
  // core.media-reference-rewriters extension point; run them so an
  // optimise/resize/rename/replace reaches module data too, not just the page
  // builder. A rewriter may throw: this runs before the caller deletes the old
  // blob, so a failure aborts with the old url still serving rather than 404ing.
  const { getMediaReferenceRewriters } = await import('@/lib/media/reference-rewriters')
  for (const rewrite of getMediaReferenceRewriters()) {
    await rewrite({ oldUrl, newUrl, oldKey, newKey })
  }
}
