// Shared browser-side uploader for the media library. Two components use it:
// the header Upload button and the drag-drop targets. Kept dependency-free (only
// fetch) so it stays client-safe.
//
// Path per file:
//  1. Raster images try the direct-to-Worker route: ask the app for a signed
//     target, PUT the bytes straight to the Cloudflare Worker (no 4.5 MB
//     serverless body cap), then ask the app to record the row. The file never
//     passes through a Vercel function, so there's no size limit.
//  2. Anything else - SVGs (must be sanitised server-side), or when the direct
//     route is unavailable or fails (e.g. the Worker hasn't been redeployed with
//     upload support yet) - falls back to the original serverless multipart
//     upload, which is size-guarded so an oversized file fails with a clear
//     message rather than a silent platform 413.
import { MAX_UPLOAD_BYTES, isRasterDirectType, tooLargeReason, uploadErrorMessage } from '@/lib/media/limits'

type UploadUrlResponse =
  | { available: true; uploadUrl: string; key: string; token: string }
  | { available: false }

async function directUpload(file: File, folderId: string | null): Promise<boolean> {
  // Ask for a signed target. A non-OK response or { available: false } means the
  // direct route isn't on for this provider/file - caller falls back.
  let info: UploadUrlResponse
  try {
    const res = await fetch('/api/admin/media/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, folderId }),
    })
    if (!res.ok) return false
    info = await res.json()
  } catch {
    return false
  }
  if (!info.available) return false

  // PUT the bytes straight to the Worker. If the Worker is old (no PUT support)
  // or rejects the token, fall back rather than hard-failing.
  const put = await fetch(info.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type, authorization: `Bearer ${info.token}` },
    body: file,
  }).catch(() => null)
  if (!put || !put.ok) return false

  // Record the row. This one must succeed - the bytes are already stored.
  const rec = await fetch('/api/admin/media/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: info.key,
      contentType: file.type,
      sizeBytes: file.size,
      originalName: file.name,
      folderId,
    }),
  })
  if (!rec.ok) throw new Error(await uploadErrorMessage(rec, file))
  return true
}

async function serverlessUpload(file: File, folderId: string | null): Promise<void> {
  // Guard before the request: the platform 413s bodies over its cap before our
  // route runs, returning a non-JSON body that would otherwise surface as a
  // cryptic parse error.
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: ${tooLargeReason(file.size)}`)
  const fd = new FormData()
  fd.append('file', file)
  fd.append('altText', '')
  if (folderId) fd.append('folderId', folderId)
  const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await uploadErrorMessage(res, file))
}

// Upload a single file. Throws with a user-ready message on failure.
export async function uploadOneFile(file: File, folderId: string | null): Promise<void> {
  if (isRasterDirectType(file.type)) {
    const done = await directUpload(file, folderId)
    if (done) return
  }
  await serverlessUpload(file, folderId)
}
