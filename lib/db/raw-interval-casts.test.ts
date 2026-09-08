import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, relative, resolve } from 'path'

// ---------------------------------------------------------------------------
// make_interval() and Prisma's parameter typing.
//
// Prisma sends a JavaScript integer to a raw query as a Postgres `bigint`. Every
// named argument make_interval() takes is `int4`, apart from `secs`, which is
// `double precision` - and bigint casts implicitly to double but not to int4. So
// this, which reads perfectly well and passes tsc, eslint, the build and every
// module build gate:
//
//     prisma.$executeRaw`... now() - make_interval(days => ${retentionDays})`
//
// fails in Postgres, every single time, with
//
//     42883: function make_interval(days => bigint) does not exist
//
// On 8 September 2026 four separate modules were carrying that line. Two of them
// - search's query purge and live-chat's retention sweep - turned their nightly
// cron into an HTTP 500 that had been failing unnoticed. The third, purchase
// orders' paid sweep, had the statement inside a catch that degrades to "nothing
// to do", so it reported success while quietly drafting nothing for months. The
// fourth was one settings toggle away from the same fate.
//
// Nothing in the standard checks can see this. Raw SQL is a string to the type
// checker, the linter never reads it, and a build never executes a query. Even
// the module's own live SQL test missed it, because it ran the statement through
// node-postgres with a `$1` placeholder - and node-postgres sends an untyped
// parameter that Postgres is free to infer as int4. Only Prisma's own binding
// reproduces it.
//
// Hence a static check: any make_interval() integer argument bound to an
// interpolated value must carry an explicit cast.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..', '..')

// `modules/` is gitignored and cloned at build time, so on a fresh checkout it is
// simply absent. A missing directory is skipped rather than failed - this is a
// backstop, and it should be honest about what it could actually see.
const SCAN_DIRS = ['app', 'components', 'lib', 'modules']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.claude', 'dist'])

// Every make_interval argument that is int4. `secs` is deliberately absent: it is
// double precision, bigint reaches it by implicit cast, and flagging it would be
// noise on code that works.
const INT_ARGS = ['years', 'months', 'weeks', 'days', 'hours', 'mins']

// `make_interval(days => ${x}` up to the interpolation, then whatever follows it.
// Deliberately not trying to parse SQL: the question is only whether a cast comes
// immediately after the closing brace of the interpolation.
const CALL = new RegExp(String.raw`make_interval\s*\(\s*(${INT_ARGS.join('|')})\s*=>\s*\$\{`, 'g')

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    // Test files are skipped, this one included: they quote the broken form on
    // purpose - to describe it, or to prove a matcher can spot it - and none of
    // their SQL is what a cron actually sends.
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** The index just past the `}` that closes the `${` starting at `open`. */
function endOfInterpolation(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function offences(source: string): Array<{ arg: string; line: number }> {
  const found: Array<{ arg: string; line: number }> = []
  for (const match of source.matchAll(CALL)) {
    // Group 1 is one of INT_ARGS, so it always matched; the alternative to this
    // guard is a non-null assertion, and noUncheckedIndexedAccess is on for a reason.
    const arg = match[1]
    if (!arg) continue
    // matchAll on a /g regex always reports an index.
    const braceOpen = match.index + match[0].length - 1
    const after = endOfInterpolation(source, braceOpen)
    if (after < 0) continue
    // Anything that pins the type is fine: ::int4, ::integer, ::int, ::smallint,
    // and the explicit ::int8 of somebody who has read this file and meant it.
    if (/^\s*::\s*(int|int2|int4|int8|integer|smallint|bigint)\b/i.test(source.slice(after))) continue
    found.push({ arg, line: source.slice(0, match.index).split('\n').length })
  }
  return found
}

describe('make_interval integer arguments in raw Prisma queries', () => {
  it('always carry an explicit cast', () => {
    const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
    const bad: string[] = []
    for (const file of files) {
      for (const { arg, line } of offences(readFileSync(file, 'utf8'))) {
        bad.push(
          `${relative(ROOT, file)}:${line} - make_interval(${arg} => \${...}) with no cast. ` +
            `Prisma binds a JS integer as bigint and there is no make_interval(${arg} => bigint); ` +
            `add ::int4.`
        )
      }
    }
    expect(bad, `\n${bad.join('\n')}\n`).toEqual([])
  })

  it('recognises both the trap and the fix', () => {
    // The check is only worth having if it can tell these two apart, and this is
    // cheaper than remembering to re-test the regex by hand.
    expect(offences('make_interval(days => ${n})')).toHaveLength(1)
    expect(offences('make_interval(months => ${n})')).toHaveLength(1)
    expect(offences('make_interval( days  =>  ${obj.days} )')).toHaveLength(1)
    expect(offences('make_interval(days => ${a ? b : c})')).toHaveLength(1)
    expect(offences('make_interval(days => ${n}::int4)')).toEqual([])
    expect(offences('make_interval(days => ${n}::integer)')).toEqual([])
    // secs is double precision, so bigint reaches it without help.
    expect(offences('make_interval(secs => ${n})')).toEqual([])
    // A literal is typed by Postgres, not by Prisma.
    expect(offences('make_interval(days => 30)')).toEqual([])
  })
})
