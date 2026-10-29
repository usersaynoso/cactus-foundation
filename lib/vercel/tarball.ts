import { gunzipSync } from 'node:zlib'

// Reads a gzipped tarball into memory, which is what GitHub hands back for a
// repository at a commit (`GET /repos/{owner}/{repo}/tarball/{ref}`). Written here
// rather than pulled in as a dependency because the subset GitHub produces is small:
// ustar headers, a pax global header carrying the commit sha, and pax per-file
// headers for paths longer than 100 bytes.
//
// GitHub wraps everything in one top-level directory (`owner-repo-sha/`), which is
// stripped so paths come back relative to the repository root.
//
// Never guesses. A header it cannot read, or an entry type it does not know, throws -
// a deployment missing a file is worse than one that never starts.

export type TarFile = {
  /** Path relative to the repository root, forward slashes. */
  path: string
  data: Buffer
  /** Full stat-style mode, file type bits included (0o100644, 0o100755, 0o120777). */
  mode: number
}

const BLOCK = 512

function readString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8')
}

function readOctal(buf: Buffer, start: number, length: number): number {
  // Base-256 (GNU) for sizes past 8 GiB - nothing in a site repository, so refuse.
  if ((buf[start] ?? 0) & 0x80) throw new Error('Tarball entry uses a base-256 size, which is not supported')
  const text = readString(buf, start, length).trim()
  if (text === '') return 0
  const value = parseInt(text, 8)
  if (!Number.isFinite(value)) throw new Error(`Tarball header has an unreadable number: "${text}"`)
  return value
}

// "<len> <key>=<value>\n" records.
function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let pos = 0
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos)
    if (space === -1) break
    const len = parseInt(data.subarray(pos, space).toString('utf8'), 10)
    if (!Number.isFinite(len) || len <= 0) throw new Error('Tarball has an unreadable extended header')
    const record = data.subarray(space + 1, pos + len - 1).toString('utf8')
    const eq = record.indexOf('=')
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1)
    pos += len
  }
  return out
}

function stripTopDirectory(path: string): string | null {
  const slash = path.indexOf('/')
  if (slash === -1) return null
  const rest = path.slice(slash + 1)
  return rest === '' ? null : rest
}

export function parseTarball(gzipped: Buffer): TarFile[] {
  const tar = gunzipSync(gzipped)
  const files: TarFile[] = []
  let pending: Record<string, string> = {}
  let offset = 0
  let ended = false

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    // Two zero blocks end the archive; one is enough to stop reading.
    if (header.every((b) => b === 0)) {
      ended = true
      break
    }

    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const dataStart = offset + BLOCK
    const data = tar.subarray(dataStart, dataStart + size)
    if (data.length !== size) throw new Error('Tarball is truncated')
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'g') continue // Global pax header (GitHub's commit comment).
    if (type === 'x') {
      pending = parsePax(data)
      continue
    }

    const prefix = readString(header, 345, 155)
    const name = readString(header, 0, 100)
    const fullName = pending.path ?? (prefix ? `${prefix}/${name}` : name)
    const linkName = pending.linkpath ?? readString(header, 157, 100)
    const perms = readOctal(header, 100, 8) & 0o777
    pending = {}

    if (type === '5') continue // Directory.
    const path = stripTopDirectory(fullName)
    if (path === null) continue

    if (type === '0' || type === '\0') {
      files.push({ path, data: Buffer.from(data), mode: 0o100000 | perms })
    } else if (type === '2') {
      // What the Vercel CLI sends for a symlink: the target as the content, link mode.
      files.push({ path, data: Buffer.from(linkName, 'utf8'), mode: 0o120000 | perms })
    } else {
      throw new Error(`Tarball entry "${path}" has unsupported type "${type}"`)
    }
  }

  // No end-of-archive block: the download stopped short, and what was read is not the commit.
  if (!ended) throw new Error('Tarball is truncated')
  return files
}
