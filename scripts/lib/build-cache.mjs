// A complete Turbopack snapshot, compressed file by file with bounded memory.
// The manifest is published last. Restores happen in a staging directory and
// check every byte before replacing the raw cache; partial snapshots never run.
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createBrotliCompress, createBrotliDecompress, constants } from 'node:zlib'

export const PACKED_CACHE = 'cactus-turbopack-v1'
const MAX_BYTES = 8 * 1024 ** 3

function locations(rootDir) {
  const cache = path.join(rootDir, '.next', 'cache')
  return { cache, raw: path.join(cache, 'turbopack'), packed: path.join(cache, PACKED_CACHE) }
}

async function exists(file) {
  try { await lstat(file); return true } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function identity(rootDir) {
  const pkg = JSON.parse(await readFile(path.join(rootDir, 'node_modules/next/package.json'), 'utf8'))
  return JSON.stringify([pkg.version, process.platform, process.arch, process.versions.node.split('.')[0], await realpath(rootDir)])
}

function checksumStream(limit) {
  const hash = createHash('sha256')
  let bytes = 0
  const stream = new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length
      if (bytes > limit) return done(new Error('Compilation cache exceeds its declared size'))
      hash.update(chunk)
      done(null, chunk)
    },
  })
  return { stream, result: () => ({ bytes, hash: hash.digest('hex') }) }
}

async function inventory(dir, prefix = '') {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await inventory(path.join(dir, entry.name), relative))
    else if (entry.isFile()) files.push(relative)
    else throw new Error('Compilation cache contains a link or special file')
  }
  return files.sort()
}

/** Compress before touching dependencies. Returns false if compression cannot help. */
export async function packBuildCache(rootDir, log = console.log) {
  const { raw, packed } = locations(rootDir)
  if (!await exists(raw)) return false
  if (!(await lstat(raw)).isDirectory()) throw new Error('Compilation cache is not a directory')
  const temporary = `${packed}.tmp`
  await rm(temporary, { recursive: true, force: true })
  try {
    const files = await inventory(raw)
    if (files.length === 0 || files.length > 100_000) return false
    await mkdir(temporary, { recursive: true })
    const manifest = { version: 1, identity: await identity(rootDir), files: [] }
    let rawBytes = 0
    let packedBytes = 0
    const started = Date.now()
    for (const [index, relative] of files.entries()) {
      const source = path.join(raw, relative)
      const info = await lstat(source)
      if (!info.isFile()) throw new Error('Compilation cache changed while packing')
      rawBytes += info.size
      if (rawBytes > MAX_BYTES) throw new Error('Compilation cache is too large to pack')
      const check = checksumStream(info.size)
      const target = path.join(temporary, `${index}.br`)
      await pipeline(createReadStream(source), check.stream, createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }), createWriteStream(target))
      const result = check.result()
      if (result.bytes !== info.size) throw new Error('Compilation cache changed while packing')
      packedBytes += (await stat(target)).size
      manifest.files.push({ path: relative, size: info.size, mtime: info.mtimeMs, hash: result.hash })
    }
    const json = JSON.stringify(manifest)
    if (packedBytes + Buffer.byteLength(json) >= rawBytes) return false
    await writeFile(path.join(temporary, 'manifest.json'), json)
    await rm(packed, { recursive: true, force: true })
    await rename(temporary, packed)
    await rm(raw, { recursive: true, force: true })
    log(`Packed complete compilation cache: ${(rawBytes / 1024 ** 2).toFixed(0)} MB to ${(packedBytes / 1024 ** 2).toFixed(0)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s.`)
    return true
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function validateManifest(value) {
  if (value?.version !== 1 || typeof value.identity !== 'string' || !Array.isArray(value.files)
    || value.files.length === 0 || value.files.length > 100_000) throw new Error('Invalid compilation cache manifest')
  const paths = new Set()
  let total = 0
  for (const file of value.files) {
    if (typeof file?.path !== 'string' || path.win32.isAbsolute(file.path) || file.path.includes('\\') || /[\x00-\x1f]/.test(file.path)
      || file.path.split('/').some((part) => !part || part === '.' || part === '..')
      || paths.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0
      || !Number.isFinite(file.mtime) || typeof file.hash !== 'string' || !/^[a-f0-9]{64}$/.test(file.hash)) {
      throw new Error('Invalid compilation cache file')
    }
    paths.add(file.path)
    total += file.size
    if (total > MAX_BYTES) throw new Error('Compilation cache is too large to restore')
  }
  return value
}

/** Always restore an earlier packed cache, even if pruning has since been disabled. */
export async function restoreBuildCache(rootDir, { enabled = true, log = console.log } = {}) {
  const { raw, packed } = locations(rootDir)
  if (!await exists(packed)) return false
  const staging = `${packed}.restore`
  try {
    if (!enabled) return false
    if (!(await lstat(packed)).isDirectory()) throw new Error('Packed compilation cache is not a directory')
    const manifestPath = path.join(packed, 'manifest.json')
    const info = await lstat(manifestPath)
    if (!info.isFile() || info.size > 32 * 1024 ** 2) throw new Error('Invalid compilation cache manifest')
    const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
    if (manifest.identity !== await identity(rootDir)) {
      log('Packed compilation cache belongs to a different compiler or machine; starting cold.')
      return false
    }
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    const started = Date.now()
    for (const [index, file] of manifest.files.entries()) {
      const source = path.join(packed, `${index}.br`)
      if (!(await lstat(source)).isFile()) throw new Error('Invalid packed compilation cache file')
      const target = path.join(staging, file.path)
      await mkdir(path.dirname(target), { recursive: true })
      const check = checksumStream(file.size)
      await pipeline(createReadStream(source), createBrotliDecompress(), check.stream, createWriteStream(target, { flags: 'wx' }))
      const result = check.result()
      if (result.bytes !== file.size || result.hash !== file.hash) throw new Error('Compilation cache failed its checksum')
      await utimes(target, file.mtime / 1000, file.mtime / 1000)
    }
    await rm(raw, { recursive: true, force: true })
    await rename(staging, raw)
    log(`Restored and verified ${manifest.files.length} compilation cache files in ${((Date.now() - started) / 1000).toFixed(1)}s.`)
    return true
  } catch (err) {
    log(`Packed compilation cache unavailable: ${err.message}. Next.js will rebuild it.`)
    return false
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(packed, { recursive: true, force: true })
  }
}

export async function discardBuildCache(rootDir) {
  const { raw, packed } = locations(rootDir)
  for (const file of [raw, packed, `${packed}.tmp`, `${packed}.restore`]) {
    await rm(file, { recursive: true, force: true })
  }
}
