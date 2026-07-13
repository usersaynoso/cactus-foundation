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

// Fraction of a file's journey spent transferring bytes. The signing and
// recording round-trips are near-instant, so the progress bar is driven almost
// entirely by the byte transfer - we just leave a sliver at each end for them.
export type ProgressFn = (fraction: number) => void

// Minimal XHR wrapper: fetch can't report upload progress, so the two calls that
// actually move the file bytes (Worker PUT, serverless POST) go through this.
function xhrSend(
  method: 'PUT' | 'POST',
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress?: ProgressFn,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    }
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => resolve({ ok: false, status: 0, text: '' })
    xhr.send(body)
  })
}

// Adapt an xhrSend result to the subset of the fetch Response that
// uploadErrorMessage() reads, so both upload paths share one error formatter.
function asResponse(r: { ok: boolean; status: number; text: string }): Response {
  return {
    ok: r.ok,
    status: r.status,
    json: async () => JSON.parse(r.text),
  } as unknown as Response
}

async function directUpload(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<boolean> {
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
  const put = await xhrSend(
    'PUT',
    info.uploadUrl,
    file,
    { 'content-type': file.type, authorization: `Bearer ${info.token}` },
    onProgress,
  )
  if (!put.ok) return false

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

async function serverlessUpload(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<void> {
  // Guard before the request: the platform 413s bodies over its cap before our
  // route runs, returning a non-JSON body that would otherwise surface as a
  // cryptic parse error.
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: ${tooLargeReason(file.size)}`)
  const fd = new FormData()
  fd.append('file', file)
  fd.append('altText', '')
  if (folderId) fd.append('folderId', folderId)
  const res = await xhrSend('POST', '/api/admin/media', fd, {}, onProgress)
  if (!res.ok) throw new Error(await uploadErrorMessage(asResponse(res), file))
}

// Upload a single file. Throws with a user-ready message on failure. onProgress
// reports a 0..1 transfer fraction so callers can render a live progress bar.
export async function uploadOneFile(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<void> {
  if (isRasterDirectType(file.type)) {
    const done = await directUpload(file, folderId, onProgress)
    if (done) { onProgress?.(1); return }
  }
  await serverlessUpload(file, folderId, onProgress)
  onProgress?.(1)
}
