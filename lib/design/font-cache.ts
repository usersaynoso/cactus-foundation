import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Last-known-good copies of what the font proxy fetched from Google: stylesheets
// and font files, in memory and on local disk.
//
// WHY. Fonts load nearly always and fail now and then, and every "now and then"
// is the same shape: one upstream request to Google that did not work. A slow
// answer, a 429 because a server's IP asked a lot, a 5xx, a body that was not a
// font. Google's files are content-addressed (the path or kit carries the
// revision), so bytes that were right once are right for good - which means a
// failed refetch should never be the visitor's problem when we have seen the
// answer before. The CDN in front of the site usually hides this; this is for the
// requests that reach the origin anyway (a cold edge, a purge, a new PoP).
//
// Disk is os.tmpdir(): writable on every host Cactus runs on, survives restarts on
// a server install, and on serverless is per-instance scratch that simply starts
// empty. Every disk operation is best effort - a cache that throws is worse than
// no cache.

const MAX_MEMORY_BYTES = 24 * 1024 * 1024
const MAX_ENTRY_BYTES = 2 * 1024 * 1024

const memory = new Map<string, Buffer>()
let memoryBytes = 0

let dir: string | null | undefined
function cacheDir(): string | null {
  if (dir !== undefined) return dir
  try {
    const d = join(tmpdir(), 'cactus-font-cache')
    mkdirSync(d, { recursive: true })
    dir = d
  } catch {
    dir = null
  }
  return dir
}

function fileFor(key: string): string | null {
  const d = cacheDir()
  return d ? join(d, createHash('sha256').update(key).digest('hex')) : null
}

function remember(key: string, value: Buffer) {
  const old = memory.get(key)
  if (old) {
    memory.delete(key)
    memoryBytes -= old.length
  }
  memory.set(key, value)
  memoryBytes += value.length
  while (memoryBytes > MAX_MEMORY_BYTES && memory.size > 1) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memoryBytes -= memory.get(oldest)?.length ?? 0
    memory.delete(oldest)
  }
}

/** Store a known-good answer. Never throws. */
export function putFontCache(key: string, value: Buffer | string): void {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  if (bytes.length === 0 || bytes.length > MAX_ENTRY_BYTES) return
  remember(key, bytes)
  const file = fileFor(key)
  if (!file) return
  try {
    // Written aside and renamed, so a reader never sees half a font.
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, bytes)
    renameSync(temp, file)
  } catch {
    // Disk full or read-only: memory still has it.
  }
}

/** The last known-good answer, or null. Synchronous: memory, then disk. Never throws. */
export function getFontCache(key: string): Buffer | null {
  const hit = memory.get(key)
  if (hit) return hit
  const file = fileFor(key)
  if (!file) return null
  try {
    const bytes = readFileSync(file)
    if (bytes.length === 0) return null
    remember(key, bytes)
    return bytes
  } catch {
    return null
  }
}

/** For tests only. */
export function clearFontCacheMemory(): void {
  memory.clear()
  memoryBytes = 0
}

/**
 * fetch() with a timeout and one retry on the failures worth retrying (network
 * error, timeout, 429, 5xx). A 4xx other than 429 is Google's considered answer
 * and is returned as-is.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = 8000, attempts = 2, backoffMs = 300 }: { timeoutMs?: number; attempts?: number; backoffMs?: number } = {},
): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs * attempt))
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`upstream ${res.status}`)
        continue
      }
      return res
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('upstream unavailable')
}
