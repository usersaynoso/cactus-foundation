// One way for the member detail screen to talk to its admin routes, so every
// action reports failure the same way instead of each handler half-doing it.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function memberApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : null
      return { ok: false, error: message ?? `That did not work (error ${res.status}).` }
    }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'Could not reach the site. Check the connection and try again.' }
  }
}
