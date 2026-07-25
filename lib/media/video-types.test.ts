import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import {
  IMAGE_ACCEPT_ATTR,
  UPLOAD_ACCEPT_ATTR,
  VIDEO_DIRECT_TYPES,
  contentTypeForKey,
  isDirectUploadType,
  isModelDirectType,
  isRasterDirectType,
  isUploadableType,
  isVideoDirectType,
} from './limits'

// Static proof that the video upload path's two halves agree - the sibling of
// model-types.test.ts, for the same reason. The media Worker is a separate
// deployment that cannot import this module, so it carries its own copy of the
// extension table and the servable set; a type added here and not there uploads
// fine in dev, then 415s on every real install until someone redeploys the
// Worker. So the "keep the two in step" comments are checked, not trusted.
//
// The round-trip half matters just as much: buildKey() derives a video's object
// key from its MIME type and both the Worker and contentTypeForKey() read the
// type back out of that key's extension. mp4 and webm round-trip through the
// generic MIME-subtype path for free; .mov would not (its subtype is
// "quicktime", not "mov"), which is exactly why it is left unsupported.

const workerSource = readFileSync(
  path.join(process.cwd(), 'workers', 'media-worker', 'index.ts'),
  'utf8',
)

describe('video media types', () => {
  it('types a signed object key by its extension', () => {
    expect(contentTypeForKey('media/shop/office-chairs/ergonomic/chiro-plus/height-adjustable.mp4')).toBe('video/mp4')
    expect(contentTypeForKey('media/promo-clip.webm')).toBe('video/webm')
  })

  it('accepts video for upload but keeps it off the raster and model paths', () => {
    for (const mime of VIDEO_DIRECT_TYPES) {
      expect(isVideoDirectType(mime), mime).toBe(true)
      expect(isUploadableType(mime), mime).toBe(true)
      expect(isDirectUploadType(mime), mime).toBe(true)
      // Not raster: no optimise, no crop/resize, no image "Replace". Not a model.
      expect(isRasterDirectType(mime), mime).toBe(false)
      expect(isModelDirectType(mime), mime).toBe(false)
    }
  })

  it('leaves .mov / quicktime unsupported on purpose', () => {
    expect(isVideoDirectType('video/quicktime')).toBe(false)
    expect(isUploadableType('video/quicktime')).toBe(false)
    // A ".mov" key cannot be typed, so the Worker would refuse it - stated here so
    // the omission reads as a decision rather than a gap someone should "fix".
    expect(contentTypeForKey('media/clip.mov')).toBeNull()
  })
})

describe('every media-library file picker offers video too', () => {
  it('offers each video type through the shared attribute', () => {
    for (const mime of VIDEO_DIRECT_TYPES) {
      expect(UPLOAD_ACCEPT_ATTR.split(','), `${mime} must be offered by the file picker`).toContain(mime)
    }
    // Image-only pickers (Replace, branding, avatars) stay image-only - a video
    // has nothing an image picker could swap it for.
    expect(IMAGE_ACCEPT_ATTR).not.toContain('video/')
  })
})

describe('the Worker mirrors what this module declares', () => {
  it('carries every video extension, with the same type', () => {
    // The Worker's table is a plain object literal, so the pair appears verbatim.
    expect(workerSource, "workers/media-worker/index.ts is missing mp4: 'video/mp4'").toContain("mp4: 'video/mp4'")
    expect(workerSource, "workers/media-worker/index.ts is missing webm: 'video/webm'").toContain("webm: 'video/webm'")
  })

  it('serves video inline, in its own set kept apart from images', () => {
    const video = workerSource.match(/const SERVABLE_VIDEO_TYPES = new Set\(\[([^\]]*)\]/s)
    expect(video, 'SERVABLE_VIDEO_TYPES not found in the Worker').not.toBeNull()
    for (const mime of VIDEO_DIRECT_TYPES) {
      expect(video![1], `${mime} must be servable inline`).toContain(mime)
    }
    // Video is not an image: it needs Range handling images do not, and the image
    // set has a static test asserting it never gains a non-image type.
    const image = workerSource.match(/const SERVABLE_IMAGE_TYPES = new Set\(\[([^\]]*)\]/s)
    expect(image, 'SERVABLE_IMAGE_TYPES not found in the Worker').not.toBeNull()
    expect(image![1], 'video must not be folded into the image set').not.toContain('video/')
  })
})
