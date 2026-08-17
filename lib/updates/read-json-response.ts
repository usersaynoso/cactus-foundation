/**
 * Reads a JSON API response without ever throwing a parser error at the site owner.
 *
 * Install and update calls run long enough to hit the platform's function ceiling. When
 * they do, the reply is not JSON at all - it is the host's HTML timeout page - and calling
 * res.json() on it throws a browser-flavoured parser message. Safari's is the worst of the
 * bunch: "The string did not match the expected pattern.", which tells the owner nothing
 * and reads like the site is broken. This turns any such response into an explanation.
 */

/** Signal from the host that the request ran out of time rather than failing properly. */
const GATEWAY_STATUSES = new Set([502, 503, 504])

export const UPDATE_TIMED_OUT_MESSAGE =
  'The update ran out of time before your site heard back. Nothing was changed. This is usually GitHub responding slowly, so wait a couple of minutes and try again.'

export type JsonResult<T> = { ok: boolean; status: number; data: T | null; error: string | null }

export async function readJsonResponse<T extends { error?: string }>(
  res: Response,
  fallback: string,
): Promise<JsonResult<T>> {
  const text = await res.text()

  let data: T | null = null
  try {
    data = text ? (JSON.parse(text) as T) : null
  } catch {
    data = null
  }

  if (res.ok) return { ok: true, status: res.status, data, error: null }

  // A parsed error from our own handler is always the most useful thing to show.
  if (data?.error) return { ok: false, status: res.status, data, error: data.error }

  // No JSON: the response came from the platform, not the app. A gateway status (or an
  // HTML body) here means the function was killed mid-flight.
  const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(text)
  if (GATEWAY_STATUSES.has(res.status) || looksLikeHtml) {
    return { ok: false, status: res.status, data: null, error: UPDATE_TIMED_OUT_MESSAGE }
  }

  return { ok: false, status: res.status, data: null, error: fallback }
}
