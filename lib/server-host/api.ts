import { DEFAULT_LISTEN_PORT, type ErrorBody } from '@/cactus-host/protocol'

// Thin client for cactus-host, the companion service that runs a Cactus site on the
// owner's own server (see cactus-host/ and its RUNBOOK.md). The twin of
// lib/netlify/api.ts: one fetch helper, one error type, the handful of calls Cactus
// needs in ./env and ./deploy.
//
// cactus-host listens on localhost on the same box as the site, so the address is
// fixed unless CACTUS_HOST_URL says otherwise. The token is per-site.

export class ServerHostApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export function serverHostBaseUrl(): string {
  const configured = process.env.CACTUS_HOST_URL?.trim()
  return (configured || `http://127.0.0.1:${DEFAULT_LISTEN_PORT}`).replace(/\/+$/, '')
}

export async function serverHostFetch(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<Response> {
  return fetch(`${serverHostBaseUrl()}/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    cache: 'no-store',
  })
}

/** Throws a ServerHostApiError carrying the status and cactus-host's own explanation. */
export async function assertServerHostOk(res: Response, what: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    detail = ((await res.json()) as Partial<ErrorBody>).error ?? ''
  } catch {
    // Not JSON - the status alone will have to do.
  }
  throw new ServerHostApiError(
    `Your server could not ${what} (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    res.status
  )
}

export function sitePath(siteId: string, rest = ''): string {
  return `/sites/${encodeURIComponent(siteId)}${rest}`
}
