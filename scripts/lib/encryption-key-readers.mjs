import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

// Finds code that reads ENCRYPTION_KEY straight out of the environment instead of
// through core's keyring (lib/crypto/keyring.ts).
//
// It matters because a key rotation moves the site onto a new key: anything still
// reading the raw variable signs with whichever key the host happens to hold and
// verifies against that one alone, so every link it ever sent breaks at the swap.
// The rotation screen refuses to run while an installed module does this
// (generate-module-key-readers.mjs), and core's own tree is held to it by
// lib/crypto/no-direct-key-reads.test.ts.

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'migrations'])
const TEST = /\.(test|spec)\.[^.]+$|\.live\.test\.[^.]+$/

// process.env.ENCRYPTION_KEY, process.env['ENCRYPTION_KEY'], and
// const { ENCRYPTION_KEY } = process.env. The _NEXT variant counts too.
const DIRECT_READ = [
  /process\.env\s*(?:\?\.|\.)\s*ENCRYPTION_KEY(?:_NEXT)?\b/,
  /process\.env\s*\[\s*['"`]ENCRYPTION_KEY(?:_NEXT)?['"`]\s*\]/,
  /\{[^{}]*\bENCRYPTION_KEY(?:_NEXT)?\b[^{}]*\}\s*=\s*process\.env\b/,
]

// Comments are prose, not reads: a module explaining what it used to do should
// not block a rotation. Strings stay in, deliberately - a read hidden in a string
// is still a read once something evaluates it, and false positives here only ever
// make the screen more careful.
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')
}

export function readsKeyDirectly(source) {
  const code = stripComments(source)
  return DIRECT_READ.some((re) => re.test(code))
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out)
    } else if (SOURCE.test(entry.name) && !TEST.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/** Files under `dir` (relative to it) that read the key directly. */
export function findDirectKeyReaders(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  return walk(dir, [])
    .filter((file) => readsKeyDirectly(readFileSync(file, 'utf8')))
    .map((file) => relative(dir, file))
    .sort()
}
