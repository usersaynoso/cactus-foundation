// @vitest-environment jsdom
//
// isFileReadable is the guard that turned the worst bulk-upload failure this
// project has had - Safari refusing to read the tail of a 26k-file selection,
// surfacing as a status-0 "bad URL" - into an honest, up-front error. jsdom
// gives us a real FileReader, so the readable path and the refused-read path can
// both be exercised without a browser.
import { describe, it, expect } from 'vitest'
import { isFileReadable, UNREADABLE_FILE_MESSAGE } from '@/lib/media/upload-client'

describe('isFileReadable', () => {
  it('resolves true for a file the browser can read', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'ok.webp', { type: 'image/webp' })
    expect(await isFileReadable(file)).toBe(true)
  })

  it('resolves false when the bytes cannot be read at all (Safari refuses the tail of a huge selection)', async () => {
    // The real failure is a FileReader "error" event with notReadableError; the
    // slice throwing is the same outcome by the shortest deterministic route.
    const refused = {
      name: 'refused.webp',
      slice() { throw new Error('WebKitBlobResource error 4') },
    } as unknown as File
    expect(await isFileReadable(refused)).toBe(false)
  })
})

describe('UNREADABLE_FILE_MESSAGE', () => {
  it('tells the site owner what to actually do', () => {
    expect(UNREADABLE_FILE_MESSAGE).toMatch(/smaller batches/)
    expect(UNREADABLE_FILE_MESSAGE).toMatch(/Chrome/)
  })
})
