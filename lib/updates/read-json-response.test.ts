import { describe, it, expect } from 'vitest'
import { readJsonResponse, UPDATE_TIMED_OUT_MESSAGE } from './read-json-response'

// The case that started this: an update killed at the platform's 60s ceiling answers with
// an HTML timeout page. res.json() on that throws a browser-specific parser message
// ("The string did not match the expected pattern." in Safari), which surfaced to the site
// owner as the entire explanation for a failed update.

const res = (body: string, status: number, contentType = 'application/json') =>
  new Response(body, { status, headers: { 'content-type': contentType } })

describe('readJsonResponse', () => {
  it('returns parsed data on success', async () => {
    const out = await readJsonResponse<{ ok?: boolean; error?: string }>(
      res(JSON.stringify({ ok: true }), 200),
      'fallback',
    )
    expect(out.ok).toBe(true)
    expect(out.data).toEqual({ ok: true })
    expect(out.error).toBeNull()
  })

  it("prefers the handler's own error message", async () => {
    const out = await readJsonResponse(res(JSON.stringify({ error: 'Already on the latest version.' }), 400), 'fallback')
    expect(out.ok).toBe(false)
    expect(out.error).toBe('Already on the latest version.')
  })

  it('turns an HTML timeout page into an explanation, not a parser error', async () => {
    const out = await readJsonResponse(
      res('<!DOCTYPE html><html><body>FUNCTION_INVOCATION_TIMEOUT</body></html>', 504, 'text/html'),
      'Update failed',
    )
    expect(out.ok).toBe(false)
    expect(out.error).toBe(UPDATE_TIMED_OUT_MESSAGE)
  })

  it('treats a gateway status with an empty body as a timeout too', async () => {
    const out = await readJsonResponse(res('', 502), 'Update failed')
    expect(out.error).toBe(UPDATE_TIMED_OUT_MESSAGE)
  })

  it('falls back to the caller message for an unparseable non-gateway failure', async () => {
    const out = await readJsonResponse(res('nonsense', 418), 'Update failed')
    expect(out.error).toBe('Update failed')
  })

  it('never throws on a malformed body', async () => {
    await expect(readJsonResponse(res('{"half":', 200), 'Update failed')).resolves.toMatchObject({ ok: true })
  })
})
