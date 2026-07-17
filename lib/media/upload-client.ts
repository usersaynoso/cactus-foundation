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
import {
  MAX_UPLOAD_BYTES,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_DIRECT_UPLOAD_MB,
  isRasterDirectType,
  tooLargeReason,
  uploadErrorMessage,
} from '@/lib/media/limits'

type UploadUrlResponse =
  | { available: true; uploadUrl: string; key: string; token: string }
  | { available: false }

// The Media row both upload paths end up creating. Callers that only want the
// bytes stored can ignore it; callers that need to point something at the new
// file (a product image, a variant image) need the url without re-querying the
// library and guessing which row is theirs.
export type UploadedMedia = {
  id: string
  url: string
  key: string
  altText: string | null
  mimeType: string
}

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

// Returns the recorded row, or null to mean "this path isn't available - fall
// back". A thrown error is a hard failure and must not be retried.
async function directUpload(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<UploadedMedia | null> {
  // Ask for a signed target. A non-OK response or { available: false } means the
  // direct route isn't on for this provider/file - caller falls back.
  let info: UploadUrlResponse
  try {
    const res = await fetch('/api/admin/media/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, folderId }),
    })
    if (!res.ok) return null
    info = await res.json()
  } catch {
    return null
  }
  if (!info.available) return null

  // PUT the bytes straight to the Worker. If the Worker is old (no PUT support)
  // or rejects the token, fall back rather than hard-failing.
  const put = await xhrSend(
    'PUT',
    info.uploadUrl,
    file,
    { 'content-type': file.type, authorization: `Bearer ${info.token}` },
    onProgress,
  )
  if (!put.ok) return null

  // Record the row. This one must succeed - the bytes are already stored. The
  // token goes back with it: /record re-checks the same signature the Worker did,
  // so the row can only ever point at the key this upload was issued for. The
  // content type isn't sent at all - the server reads it from the signed key.
  const rec = await fetch('/api/admin/media/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: info.key,
      token: info.token,
      sizeBytes: file.size,
      originalName: file.name,
      folderId,
    }),
  })
  if (!rec.ok) throw new Error(await uploadErrorMessage(rec, file))
  return await rec.json() as UploadedMedia
}

async function serverlessUpload(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<UploadedMedia> {
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
  try {
    return JSON.parse(res.text) as UploadedMedia
  } catch {
    // A 2xx with an unreadable body means the bytes are stored but we cannot say
    // where. Callers that need the url must not be handed a half-built record.
    throw new Error(`${file.name}: upload finished but the server's reply could not be read.`)
  }
}

// Upload a single file and return the Media row it created. Throws with a
// user-ready message on failure. onProgress reports a 0..1 transfer fraction so
// callers can render a live progress bar.
export async function uploadOneFile(file: File, folderId: string | null, onProgress?: ProgressFn): Promise<UploadedMedia> {
  if (isRasterDirectType(file.type)) {
    // The Worker caps the direct path too - say so plainly here rather than
    // letting it 413 and then falling through to the serverless path, which
    // would blame the (much smaller) serverless limit instead.
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      throw new Error(`${file.name}: ${tooLargeReason(file.size, MAX_DIRECT_UPLOAD_MB)}`)
    }
    const done = await directUpload(file, folderId, onProgress)
    if (done) { onProgress?.(1); return done }
  }
  const record = await serverlessUpload(file, folderId, onProgress)
  onProgress?.(1)
  return record
}

// ---------------------------------------------------------------------------
// Replace — the same two paths, aimed at an item that already exists. The bytes
// take over that row instead of starting a new one, so the app picks the key
// (from the item's own folder and name) rather than the client, and the finishing
// call is /[id]/replace rather than /record.
// ---------------------------------------------------------------------------

// True when the direct path carried it; false to mean "fall back". A thrown error
// is a hard failure and must not be retried on the other path.
async function directReplace(mediaId: string, file: File, onProgress?: ProgressFn): Promise<boolean> {
  let res: Response
  try {
    res = await fetch('/api/admin/media/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, replaceId: mediaId }),
    })
  } catch {
    return false
  }
  // 409 is the app refusing this replacement outright (it would have to rename the
  // file, stranding whatever points at it). The serverless path refuses it for the
  // same reason, so surface it now rather than after pushing the whole file up.
  if (res.status === 409) throw new Error(await uploadErrorMessage(res, file))
  if (!res.ok) return false

  let info: UploadUrlResponse
  try {
    info = await res.json()
  } catch {
    return false
  }
  if (!info.available) return false

  const put = await xhrSend(
    'PUT',
    info.uploadUrl,
    file,
    { 'content-type': file.type, authorization: `Bearer ${info.token}` },
    onProgress,
  )
  if (!put.ok) return false

  // The bytes are stored; this one must succeed or the item is left pointing at
  // its old file with no sign anything happened.
  const done = await fetch(`/api/admin/media/${mediaId}/replace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: info.key, token: info.token, sizeBytes: file.size }),
  })
  if (!done.ok) throw new Error(await uploadErrorMessage(done, file))
  return true
}

async function serverlessReplace(mediaId: string, file: File, onProgress?: ProgressFn): Promise<void> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: ${tooLargeReason(file.size)}`)
  const fd = new FormData()
  fd.append('file', file)
  const res = await xhrSend('POST', `/api/admin/media/${mediaId}/replace`, fd, {}, onProgress)
  if (!res.ok) throw new Error(await uploadErrorMessage(asResponse(res), file))
}

// Swap one existing item's file for `file`, keeping the item and every reference
// to it. Throws with a user-ready message on failure.
export async function replaceOneFile(mediaId: string, file: File, onProgress?: ProgressFn): Promise<void> {
  if (isRasterDirectType(file.type)) {
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      throw new Error(`${file.name}: ${tooLargeReason(file.size, MAX_DIRECT_UPLOAD_MB)}`)
    }
    if (await directReplace(mediaId, file, onProgress)) { onProgress?.(1); return }
  }
  await serverlessReplace(mediaId, file, onProgress)
  onProgress?.(1)
}
