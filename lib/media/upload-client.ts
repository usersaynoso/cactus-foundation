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
  isDirectUploadType,
  isModelDirectType,
  uploadTypeForFile,
  tooLargeReason,
  uploadErrorMessage,
} from '@/lib/media/limits'

// A picked File is backed by the file on disk and read lazily. Safari grants a
// web page read access to only a prefix of a very large multi-file selection
// (tens of thousands of files at once): reads of the rest fail immediately with
// notReadableError ("WebKitBlobResource error 4"), which reaches the network
// layer as a status-0 "bad URL" and was long misread as a dropped connection.
// The cliff is fixed at pick time - the tail is unreadable from the moment the
// selection is made, so no amount of buffering or retrying rescues it. Probing a
// few bytes up front separates "the browser cannot read this file" from "the
// connection dropped", so an unreadable file fails at once with an honest,
// actionable message instead of three pointless status-0 retries that all blame
// the network. Chrome grants access to the whole selection, so it never trips.
export function isFileReadable(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    // A readable file resolves in a millisecond or two and an unreadable one
    // errors just as fast; the timeout is only a backstop against a read that
    // neither loads nor errors, so a single stuck file can't wedge a batch scan.
    const timer = setTimeout(() => finish(false), 5000)
    reader.onload = () => finish(true)
    reader.onerror = () => finish(false)
    try {
      reader.readAsArrayBuffer(file.slice(0, 16))
    } catch {
      finish(false)
    }
  })
}

// Shown when a file cannot be read (see isFileReadable). Kept in words a site
// owner can act on: the cause is almost always too large a Safari selection.
export const UNREADABLE_FILE_MESSAGE =
  'the browser could not read this file. Safari limits how many files a page may open at once, so the tail of a very large selection cannot be read - upload in smaller batches, or use Chrome or Edge for very large uploads'

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

// Attempts for the two calls that actually move the file bytes, and the pauses
// between them.
//
// ONLY a status-0 result is retried, and that distinction is the whole point: 0
// means the browser gave up before any reply existed, which is a statement about
// the connection, not about the file. A genuinely transient drop mid-transfer
// lands on a short pause and a re-send.
//
// It is NOT retried when the file itself is unreadable: Safari refuses to read
// the tail of a very large multi-file selection, and that also surfaces as
// status 0 (see isFileReadable) - but re-sending a file the browser will never
// read just wastes three attempts. uploadOneFile/replaceOneFile catch that case
// before they ever reach here, so anything that gets this far is a real transfer
// that a retry can plausibly rescue.
//
// Any status the server actually chose (401 on a stale token, 413 too large, 415
// wrong type, 500) is a real answer and is handed straight back - retrying it
// would only arrive at the same answer, more slowly.
const SEND_ATTEMPTS = 3
const SEND_BACKOFF_MS = [400, 1200]

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

async function sendWithRetry(
  method: 'PUT' | 'POST',
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress?: ProgressFn,
): Promise<{ ok: boolean; status: number; text: string }> {
  let result = await xhrSend(method, url, body, headers, onProgress)
  for (let attempt = 1; attempt < SEND_ATTEMPTS && result.status === 0; attempt++) {
    await pause(SEND_BACKOFF_MS[attempt - 1] ?? 1200)
    // Rewind the caller's progress bar first: the retry re-sends every byte from
    // the start, so leaving it where the refused attempt stopped would show the
    // bar running backwards.
    onProgress?.(0)
    result = await xhrSend(method, url, body, headers, onProgress)
  }
  return result
}

// Adapt an xhrSend result to the subset of the fetch Response that
// uploadErrorMessage() reads, so both upload paths share one error formatter.
// text() as well as json(): a platform-level failure (a crashed function, a
// gateway 502/504) returns HTML or an empty body, and uploadErrorMessage now
// reads the body as text so it can fall back to the status rather than swallow
// the failure whole.
function asResponse(r: { ok: boolean; status: number; text: string }): Response {
  return {
    ok: r.ok,
    status: r.status,
    text: async () => r.text,
    json: async () => JSON.parse(r.text),
  } as unknown as Response
}

// Why the direct path stepped aside, in words. Carried into the final error if
// the fallback then fails too, so a two-stage failure names both stages instead
// of blaming whichever path happened to die last. Diagnosing "bulk uploads fail
// sometimes" without this meant guessing at which of five round trips broke.
type DirectFallback = { fallback: string }
function isFallback(x: unknown): x is DirectFallback {
  return typeof x === 'object' && x !== null && 'fallback' in x
}

// Returns the recorded row, or { fallback } to mean "this path isn't available -
// fall back". A thrown error is a hard failure and must not be retried.
// `contentType` is the type the file will be STORED under, which for a 3D model
// is not the type the browser reports (see uploadTypeForFile). The key's extension
// is built from it, and the key is what the upload token signs, so the same value
// has to go to /upload-url and out on the PUT.
async function directUpload(file: File, contentType: string, folderId: string | null, onProgress?: ProgressFn): Promise<UploadedMedia | DirectFallback> {
  // Ask for a signed target. A non-OK response or { available: false } means the
  // direct route isn't on for this provider/file - caller falls back.
  let info: UploadUrlResponse
  try {
    const res = await fetch('/api/admin/media/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType, folderId }),
    })
    if (!res.ok) return { fallback: `the signing call failed (HTTP ${res.status})` }
    info = await res.json()
  } catch {
    return { fallback: 'the signing call never reached the server' }
  }
  if (!info.available) return { fallback: 'direct uploads are not enabled for this storage set-up' }

  // PUT the bytes straight to the Worker. If the Worker is old (no PUT support)
  // or rejects the token, fall back rather than hard-failing.
  const put = await sendWithRetry(
    'PUT',
    info.uploadUrl,
    file,
    { 'content-type': contentType, authorization: `Bearer ${info.token}` },
    onProgress,
  )
  if (!put.ok) {
    return {
      fallback: put.status === 0
        ? 'the connection dropped while sending the file to the media service'
        : `the media service refused the file (HTTP ${put.status})`,
    }
  }

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
  // Deliberately NOT sendWithRetry. A Worker PUT is idempotent - it writes the
  // same bytes to the same signed key, so re-sending one costs nothing. This POST
  // CREATES a Media row, and status 0 only says no reply arrived, not that the
  // server never acted: if a response were ever lost after the row was written, a
  // retry would file the same picture twice. A duplicate nobody asked for is worse
  // than a failure that says so plainly, and the retries on the direct path above
  // mean this one is rarely reached now anyway.
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
  // Fail fast, and honestly, on a file the browser will not read (see
  // isFileReadable): both upload paths carry the file bytes, so an unreadable
  // file dies on either as a status-0 "bad URL" - retried three times, then
  // blamed on the network. Catching it here names the real cause once.
  if (!(await isFileReadable(file))) throw new Error(`${file.name}: ${UNREADABLE_FILE_MESSAGE}`)
  const contentType = uploadTypeForFile(file)
  // Why the direct path stood down, when it did - woven into the error if the
  // fallback then fails as well.
  let directReason: string | null = null
  if (isDirectUploadType(contentType)) {
    // The Worker caps the direct path too - say so plainly here rather than
    // letting it 413 and then falling through to the serverless path, which
    // would blame the (much smaller) serverless limit instead.
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      throw new Error(`${file.name}: ${tooLargeReason(file.size, MAX_DIRECT_UPLOAD_MB)}`)
    }
    const done = await directUpload(file, contentType, folderId, onProgress)
    if (!isFallback(done)) { onProgress?.(1); return done }
    directReason = done.fallback
  }
  // A model has no second path. The serverless route is image-only, so falling
  // through would fail with "not a supported image", which is both wrong and
  // unactionable. Say what stopped the one path it has.
  if (isModelDirectType(contentType)) {
    throw new Error(
      directReason
        ? `“${file.name}” could not be uploaded: ${directReason}. 3D files need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed - check Settings → Media.`
        : `“${file.name}” could not be uploaded. 3D files need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed - check Settings → Media.`
    )
  }
  try {
    const record = await serverlessUpload(file, folderId, onProgress)
    onProgress?.(1)
    return record
  } catch (err) {
    // The fallback failed too. If the direct path also had a reason, report
    // both - otherwise a 50 MB photo dies blaming the 4 MB serverless cap with
    // no hint that the real question is why the direct path stepped aside.
    if (directReason && err instanceof Error) {
      throw new Error(`${err.message} (direct upload was tried first but ${directReason})`)
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Replace — the same two paths, aimed at an item that already exists. The bytes
// take over that row instead of starting a new one, so the app picks the key
// (from the item's own folder and name) rather than the client, and the finishing
// call is /[id]/replace rather than /record.
// ---------------------------------------------------------------------------

// True when the direct path carried it; { fallback } to mean "fall back". A
// thrown error is a hard failure and must not be retried on the other path.
async function directReplace(mediaId: string, file: File, contentType: string, onProgress?: ProgressFn): Promise<true | DirectFallback> {
  let res: Response
  try {
    res = await fetch('/api/admin/media/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType, replaceId: mediaId }),
    })
  } catch {
    return { fallback: 'the signing call never reached the server' }
  }
  // 409 is the app refusing this replacement outright (it would have to rename the
  // file, stranding whatever points at it). The serverless path refuses it for the
  // same reason, so surface it now rather than after pushing the whole file up.
  if (res.status === 409) throw new Error(await uploadErrorMessage(res, file))
  if (!res.ok) return { fallback: `the signing call failed (HTTP ${res.status})` }

  let info: UploadUrlResponse
  try {
    info = await res.json()
  } catch {
    return { fallback: "the signing call's reply could not be read" }
  }
  if (!info.available) return { fallback: 'direct uploads are not enabled for this storage set-up' }

  const put = await sendWithRetry(
    'PUT',
    info.uploadUrl,
    file,
    { 'content-type': contentType, authorization: `Bearer ${info.token}` },
    onProgress,
  )
  if (!put.ok) {
    return {
      fallback: put.status === 0
        ? 'the connection dropped while sending the file to the media service'
        : `the media service refused the file (HTTP ${put.status})`,
    }
  }

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
  // Single-shot for the same reason as the create path above: this one repoints an
  // existing row and drops the blob it superseded, so a retry after a reply that
  // was merely lost would be doing that a second time over.
  const res = await xhrSend('POST', `/api/admin/media/${mediaId}/replace`, fd, {}, onProgress)
  if (!res.ok) throw new Error(await uploadErrorMessage(asResponse(res), file))
}

// Swap one existing item's file for `file`, keeping the item and every reference
// to it. Throws with a user-ready message on failure.
export async function replaceOneFile(mediaId: string, file: File, onProgress?: ProgressFn): Promise<void> {
  // Same unreadable-file guard as the upload path: a file the browser cannot read
  // fails identically on either transport, so name it once rather than after the
  // whole file has appeared to send and then died with a status-0 "bad URL".
  if (!(await isFileReadable(file))) throw new Error(`${file.name}: ${UNREADABLE_FILE_MESSAGE}`)
  // Same type resolution the fresh-upload path uses: a 3D file's browser-reported
  // type is worthless, and the type decides both the key's extension and whether
  // the direct route is on at all. Reading file.type here meant a model always
  // fell through to the serverless route and died on its body cap.
  const contentType = uploadTypeForFile(file)
  let directReason: string | null = null
  if (isDirectUploadType(contentType)) {
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      throw new Error(`${file.name}: ${tooLargeReason(file.size, MAX_DIRECT_UPLOAD_MB)}`)
    }
    const carried = await directReplace(mediaId, file, contentType, onProgress)
    if (carried === true) { onProgress?.(1); return }
    directReason = carried.fallback
  }
  // A model has no serverless path, exactly as on the upload side.
  if (isModelDirectType(contentType)) {
    throw new Error(
      directReason
        ? `“${file.name}” could not be uploaded: ${directReason}. 3D files need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed - check Settings → Media.`
        : `“${file.name}” could not be uploaded. 3D files need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed - check Settings → Media.`
    )
  }
  try {
    await serverlessReplace(mediaId, file, onProgress)
    onProgress?.(1)
  } catch (err) {
    if (directReason && err instanceof Error) {
      throw new Error(`${err.message} (direct upload was tried first but ${directReason})`)
    }
    throw err
  }
}
