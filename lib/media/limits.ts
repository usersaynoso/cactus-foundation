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

// Ceiling for the direct-to-Worker path. That path skips the serverless body cap,
// but "no platform limit" is not the same as "no limit": the Worker buffers the
// whole body in memory to hash it, so an unbounded PUT is a cheap way to exhaust
// it, and the media library is not meant to be free unmetered storage. Generous
// for a photograph, nowhere near the Worker's memory ceiling. Mirrored as
// UPLOAD_MAX_BYTES in workers/media-worker/index.ts - keep the two in step.
//
// Raised from 25 MB when 3D models joined this path: a detailed FBX runs to tens
// of megabytes, and a limit a real model cannot clear is a feature that does not
// work. Photographs inherit the same headroom, which is harmless - nothing forces
// a 50 MB photograph, and the Worker's own guard is what this number exists for.
export const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

export const MAX_DIRECT_UPLOAD_MB = MAX_DIRECT_UPLOAD_BYTES / 1024 / 1024

// Raster image types eligible for the direct-to-Worker upload path (no size
// limit). SVG is deliberately excluded: it's text that must be sanitised
// server-side against script injection, and it's always tiny anyway, so it
// stays on the size-guarded serverless path. The 4 MB guard above applies only
// to that fallback path.
export const RASTER_DIRECT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function isRasterDirectType(mimeType: string): boolean {
  return RASTER_DIRECT_TYPES.has(mimeType)
}

// The 3D model types the direct-to-Worker path will carry, keyed by the file
// extension that identifies them.
//
// Keyed by extension, and not by the browser's declared type, because a 3D file's
// declared type is worth nothing: browsers report .glb as
// application/octet-stream, .obj as anything from text/plain to nothing at all,
// and .fbx almost always as an empty string. The extension is the only claim
// worth making about one, and on the direct path it is also the only claim a
// client cannot forge - it is baked into the object key the upload token signs.
//
// glTF and OBJ have registered IANA types; FBX and 3DS have none, so they take
// the conventional x- form. Every value is distinct, which is what lets a type
// round-trip back to its extension.
//
// Nothing on the server parses these files, so a wrong guess costs nothing: they
// are stored as opaque bytes and handed to a loader in the shopper's browser,
// inside a canvas. The Worker refuses to serve any of them inline in any case.
//
// Mirrored in workers/media-worker/index.ts - keep the two in step.
export const MODEL_EXTENSION_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'model/obj',
  fbx: 'model/x-fbx',
  '3ds': 'model/x-3ds',
}

const MODEL_DIRECT_TYPES = new Set(Object.values(MODEL_EXTENSION_TYPES))

export function isModelDirectType(mimeType: string): boolean {
  return MODEL_DIRECT_TYPES.has(mimeType)
}

// What a file picker's `accept` must list for 3D files: extensions, not types.
// Listing "model/gltf-binary" would offer the admin nothing at all, because the
// browser does not agree that a .glb is one - see the note above.
export const MODEL_ACCEPT_EXTENSIONS = Object.keys(MODEL_EXTENSION_TYPES).map((e) => `.${e}`).join(',')

/**
 * The type a picked file should be uploaded and stored under.
 *
 * For an image this is what the browser says, which is worth trusting because the
 * server sniffs the bytes afterwards anyway. For a 3D file it is emphatically not:
 * a browser reports .glb as application/octet-stream and .fbx as nothing at all,
 * so the extension is the only claim about one worth making, and the whole media
 * pipeline keys off the type. Without this a model reached the library as
 * "octet-stream", failed the accepted-type check, and the media page appeared not
 * to support 3D files at all.
 */
export function uploadTypeForFile(file: { name: string; type: string }): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return modelTypeForExtension(ext) ?? file.type
}

export function modelTypeForExtension(extension: string): string | null {
  return MODEL_EXTENSION_TYPES[extension.toLowerCase()] ?? null
}

// The extension a model type must be stored under, so buildKey() produces a key
// contentTypeForKey() can read the type back out of. Unlike an image type this
// cannot be taken from the MIME subtype: "model/gltf-binary" has to become
// ".glb", not ".gltf-binary". See extensionForMimeType in lib/media/upload.ts.
export function extensionForModelType(mimeType: string): string | null {
  for (const [ext, type] of Object.entries(MODEL_EXTENSION_TYPES)) {
    if (type === mimeType) return ext
  }
  return null
}

// The image types the library accepts. Rasters go direct-to-Worker (no size cap);
// SVG is sanitised on the size-guarded serverless path.
//
// Not the whole of what can be uploaded any more - 3D models can be too, and they
// live in MODEL_EXTENSION_TYPES. Use isUploadableType for "will the library take
// this", and this set only where the question is specifically about images (the
// Replace action, the optimiser, the reshape tools) - none of which mean anything
// for a file the server never decodes.
export const ACCEPTED_UPLOAD_TYPES = new Set([...RASTER_DIRECT_TYPES, 'image/svg+xml'])

export function isAcceptedUploadType(mimeType: string): boolean {
  return ACCEPTED_UPLOAD_TYPES.has(mimeType)
}

// Everything the media library will take, images and 3D models alike. Kept apart
// from ACCEPTED_UPLOAD_TYPES rather than folded into it because the two answer
// different questions: that set is "types this library can produce and work on",
// which is what gates Replace and the image tools, and a model has neither a
// replacement the file picker could offer nor pixels to optimise.
export function isUploadableType(mimeType: string): boolean {
  return isAcceptedUploadType(mimeType) || isModelDirectType(mimeType)
}

// Types that go straight to the Worker, skipping the serverless body cap. Models
// join the rasters here: they are far too big for the fallback path, and the
// Worker has accepted them since 3D views arrived.
export function isDirectUploadType(mimeType: string): boolean {
  return isRasterDirectType(mimeType) || isModelDirectType(mimeType)
}

// The content type an object key claims, from its extension. buildKey() derives
// every extension from an already-validated MIME type, and the key is what the
// upload token signs - so on the direct-to-Worker path this is the only type
// claim a client cannot forge, and both the Worker and /record read the type
// from here rather than from a request header or body field.
//
// Model extensions are in the table because the Worker accepts them, and a caller
// that signs a model key needs the same round-trip. They stay out of
// isRasterDirectType - that one means "has pixels a server can decode", which
// gates the optimiser and the reshape tools - but they are in isDirectUploadType,
// so the library's own upload accepts a model dropped onto the media page as
// readily as the 3D module's own route does.
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  ...MODEL_EXTENSION_TYPES,
}

export function contentTypeForKey(key: string): string | null {
  const dot = key.lastIndexOf('.')
  if (dot === -1) return null
  return EXTENSION_TYPES[key.slice(dot + 1).toLowerCase()] ?? null
}

// Client-side pre-flight for a picked/dropped file. Returns a human reason if the
// file can't be uploaded, or null if it's fine to enqueue. Mirrors the server's
// own rules so failures surface immediately rather than after a round trip.
export function preflightUploadError(file: { name: string; type: string; size: number }): string | null {
  // The type a 3D file will actually be stored under comes from its extension,
  // not from the browser - see uploadTypeForFile.
  const type = uploadTypeForFile(file)
  if (!isUploadableType(type)) {
    return `“${file.name}” isn’t a supported image (JPEG, PNG, WebP, GIF or SVG) or 3D model (GLB, glTF, OBJ, FBX or 3DS).`
  }
  // Two different ceilings: rasters and models go straight to the Worker (50 MB),
  // everything else takes the size-guarded serverless path (4 MB). Both are
  // enforced server-side too - this just fails fast with a clear reason.
  const limitMb = isDirectUploadType(type) ? MAX_DIRECT_UPLOAD_MB : MAX_UPLOAD_MB
  if (file.size > limitMb * 1024 * 1024) {
    return `“${file.name}”: ${tooLargeReason(file.size, limitMb)}`
  }
  return null
}

// Shared, human-readable reason string so the client guard, the server
// validator, and the 413 fallback all say the same thing.
export function tooLargeReason(sizeBytes: number, limitMb: number = MAX_UPLOAD_MB): string {
  return `File size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the ${limitMb} MB limit.`
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
