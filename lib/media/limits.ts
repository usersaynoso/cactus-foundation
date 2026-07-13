// Client-safe upload limits. Kept in its own module (no sharp / no server deps)
// so browser components can import it without dragging the whole media pipeline
// into the client bundle.
//
// The hard ceiling is the hosting platform, not our own rules: Vercel's
// serverless functions reject any request body over 4.5 MB with a 413 *before*
// our route handler ever runs — so the file never reaches validateUpload(), and
// the 413 body isn't JSON. We advertise a slightly lower number to leave room
// for multipart form overhead and to fail fast on the client with a clear
// message rather than letting the platform swallow the request silently.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4 MB

export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024

// Raster image types eligible for the direct-to-Worker upload path (no size
// limit). SVG is deliberately excluded: it's text that must be sanitised
// server-side against script injection, and it's always tiny anyway, so it
// stays on the size-guarded serverless path. The 4 MB guard above applies only
// to that fallback path.
export const RASTER_DIRECT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function isRasterDirectType(mimeType: string): boolean {
  return RASTER_DIRECT_TYPES.has(mimeType)
}

// Every type the library accepts. Rasters go direct-to-Worker (no size cap);
// SVG is sanitised on the size-guarded serverless path. Anything else is
// rejected on the client before a request is made, so the user gets an instant,
// plain reason instead of a failed upload.
export const ACCEPTED_UPLOAD_TYPES = new Set([...RASTER_DIRECT_TYPES, 'image/svg+xml'])

export function isAcceptedUploadType(mimeType: string): boolean {
  return ACCEPTED_UPLOAD_TYPES.has(mimeType)
}

// Client-side pre-flight for a picked/dropped file. Returns a human reason if the
// file can't be uploaded, or null if it's fine to enqueue. Mirrors the server's
// own rules so failures surface immediately rather than after a round trip.
export function preflightUploadError(file: { name: string; type: string; size: number }): string | null {
  if (!isAcceptedUploadType(file.type)) {
    return `“${file.name}” isn’t a supported image (JPEG, PNG, WebP, GIF or SVG).`
  }
  // Only the serverless path (SVG and any non-raster-direct type) is size-capped;
  // rasters upload straight to the Worker with no ceiling.
  if (!isRasterDirectType(file.type) && file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name}”: ${tooLargeReason(file.size)}`
  }
  return null
}

// Shared, human-readable reason string so the client guard, the server
// validator, and the 413 fallback all say the same thing.
export function tooLargeReason(sizeBytes: number): string {
  return `File size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the ${MAX_UPLOAD_MB} MB limit.`
}

// Turn a failed upload Response into a message safe to show the user. A 413 from
// the hosting platform's edge never reaches our route, so its body is HTML/empty
// rather than our JSON error shape — calling res.json() on it throws and buries
// the real cause. Special-case it; otherwise read our own JSON error.
export async function uploadErrorMessage(res: Response, file?: { name?: string; size?: number }): Promise<string> {
  if (res.status === 413) {
    const size = file?.size ? tooLargeReason(file.size) : `File exceeds the ${MAX_UPLOAD_MB} MB limit.`
    return file?.name ? `${file.name}: ${size}` : size
  }
  try {
    const d = await res.json()
    return typeof d?.error === 'string' ? d.error : 'Upload failed'
  } catch {
    return 'Upload failed'
  }
}
