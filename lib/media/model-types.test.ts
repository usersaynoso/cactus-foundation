import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import {
  MAX_DIRECT_UPLOAD_BYTES,
  MODEL_EXTENSION_TYPES,
  contentTypeForKey,
  extensionForModelType,
  isModelDirectType,
  isRasterDirectType,
  modelTypeForExtension,
} from './limits'

// Static proof that the 3D upload path's two halves agree with each other.
//
// The media Worker is a separate deployment with no imports: it cannot share this
// module, so it carries its own copy of the extension table and the size cap, and
// two comments ask the next person to "keep the two in step". Nothing enforced
// that, and the failure it invites is quiet - a model type added here and not
// there uploads fine in dev, then 415s on every real install, which reads as "the
// Worker needs redeploying" and wastes an afternoon. So the comments are checked
// rather than trusted.
//
// The round-trip case is the other half. A model's MIME type exists here mainly to
// carry its extension: buildKey() derives the object key's extension from the
// type, and the Worker reads the type back out of that extension, that being the
// only claim about an upload a client cannot forge. If the two directions ever
// disagree, uploads are signed under keys nothing can type - which is precisely
// how `application/octet-stream` produced `.octet-stream` keys and broke every 3D
// upload in the first place.

const workerSource = readFileSync(
  path.join(process.cwd(), 'workers', 'media-worker', 'index.ts'),
  'utf8',
)

describe('model media types', () => {
  it('round-trips every extension through its type and back', () => {
    for (const [ext, mime] of Object.entries(MODEL_EXTENSION_TYPES)) {
      expect(modelTypeForExtension(ext), `${ext} -> type`).toBe(mime)
      expect(extensionForModelType(mime), `${mime} -> ext`).toBe(ext)
    }
  })

  it('gives every model type a distinct value, or the reverse lookup is a coin toss', () => {
    const values = Object.values(MODEL_EXTENSION_TYPES)
    expect(new Set(values).size).toBe(values.length)
  })

  it('types a signed object key by its extension', () => {
    expect(contentTypeForKey('media/R2/Shop/Chairs/oak-chair/3d/abc123-chair.glb')).toBe('model/gltf-binary')
    expect(contentTypeForKey('media/abc123-chair.3ds')).toBe('model/x-3ds')
    // The shape the old code produced. It must stay untypeable: a key the Worker
    // cannot type is a key it refuses, which is the bug this all came from.
    expect(contentTypeForKey('media/R2/abc123-chair.octet-stream')).toBeNull()
  })

  it('keeps models out of the raster path, so core /record stays image-only', () => {
    for (const mime of Object.values(MODEL_EXTENSION_TYPES)) {
      expect(isModelDirectType(mime), mime).toBe(true)
      expect(isRasterDirectType(mime), mime).toBe(false)
    }
    expect(isModelDirectType('image/png')).toBe(false)
  })
})

describe('the Worker mirrors what this module declares', () => {
  it('carries every model extension, with the same type', () => {
    // The Worker's table is a plain object literal, so the pair appears verbatim.
    for (const [ext, mime] of Object.entries(MODEL_EXTENSION_TYPES)) {
      const key = /^[a-z]/.test(ext) ? ext : `'${ext}'`
      expect(workerSource, `workers/media-worker/index.ts is missing ${ext}: '${mime}'`)
        .toContain(`${key}: '${mime}'`)
    }
  })

  it('caps uploads at the same size', () => {
    const match = workerSource.match(/const UPLOAD_MAX_BYTES = (\d+) \* 1024 \* 1024/)
    expect(match, 'UPLOAD_MAX_BYTES not found in the Worker').not.toBeNull()
    expect(Number(match![1]) * 1024 * 1024).toBe(MAX_DIRECT_UPLOAD_BYTES)
  })

  it('still refuses to serve a model inline', () => {
    // Models are fetched by XHR into a WebGL canvas, which ignores the type and
    // the Content-Disposition, so they have no business in the servable-inline
    // set. Adding one there would make the media origin serve attacker-supplied
    // bytes as something a browser renders.
    const servable = workerSource.match(/const SERVABLE_IMAGE_TYPES = new Set\(\[([^\]]*)\]/s)
    expect(servable, 'SERVABLE_IMAGE_TYPES not found in the Worker').not.toBeNull()
    for (const mime of Object.values(MODEL_EXTENSION_TYPES)) {
      expect(servable![1], `${mime} must not be servable inline`).not.toContain(mime)
    }
  })
})
