import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

// Why this is a test and not a code review note:
//
// Puck hands a block its site-wide values through a `metadata` prop on `Render`, and
// a `Render` WITHOUT one hands every block inside it nothing. Core's renderInfoPage
// has always passed it. Every module that renders a layout of its own had its own
// bare `<Render>` - 59 of them on public paths - and not one did. The result was that
// three owner-facing settings silently did nothing on those pages:
//
//   - "load images only when they're needed"
//   - the font de-duplication that stops a block re-asking Google for a typeface
//   - "send pictures at the size they are shown"
//
// Nothing failed. No error, no warning, no visual difference in the editor, and every
// test passed. Each setting simply behaved as though it had never been switched on,
// on some pages and not others - and it took a Lighthouse report on one product page
// and an afternoon of tracing to notice. That is precisely the class of defect worth
// spending a static check on.
//
// CactusRender supplies the metadata itself, so the rule is simply: on a public path,
// use it instead of Puck's raw Render.

const ROOT = path.join(__dirname, '..', '..')

/**
 * Documents and client components are the two legitimate exemptions.
 *
 * A printed invoice or purchase order wants its pictures EAGER and full-size - lazy
 * loading and a resized source are both wrong when the renderer is a headless browser
 * taking a single snapshot - so those keep the raw Render on purpose. A client
 * component cannot reach the database at all, so it takes what it needs as a prop
 * from whatever rendered it.
 */
function isExempt(file: string, source: string): boolean {
  if (/use client/.test(source.slice(0, 60))) return true
  if (/(?:^|\/)(?:doc|.*-document|invoice|proforma|packing-slip)/i.test(path.basename(file))) return true
  if (/\/documents?\//.test(file)) return true
  if (/cactus-admin|\/admin\//.test(file)) return true
  // The wrapper itself.
  if (file.endsWith('lib/puck/CactusRender.tsx')) return true
  // A test renders a block's own render function directly, and habitually names the
  // local holding it `Render` - which is a bare `<Render>` that has nothing to do
  // with Puck's. The sweep that introduced this rule mangled exactly one file that
  // way (lib/puck/block-spacing.test.tsx), so the exemption is written down rather
  // than left to be rediscovered.
  if (/\.test\.tsx?$/.test(file)) return true
  return false
}

/**
 * The source with comments taken out, so a `<Render>` MENTIONED in a comment is not
 * mistaken for one that is called.
 *
 * Three files tripped this on the first run - all three only talk about Puck's Render
 * in a note explaining why the block is registered as a server component - and the
 * pattern matched across the comment into an unrelated `/>` further down.
 *
 * Line comments are only stripped when the line is entirely a comment, because a
 * trailing `//` strip would also eat the tail of any line containing an `https://`
 * url and could hide a real call.
 */
function withoutComments(source: string): string {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  return noBlocks
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

function filesWithBareRender(): string[] {
  let listed = ''
  try {
    listed = execFileSync('grep', ['-rl', '--include=*.tsx', '<Render', 'modules', 'lib'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  } catch {
    // grep exits non-zero when nothing matches, which is a pass, not a failure.
    return []
  }
  const offenders: string[] = []
  for (const rel of listed.split('\n').filter(Boolean)) {
    const raw = readFileSync(path.join(ROOT, rel), 'utf8')
    if (isExempt(rel, raw)) continue
    const source = withoutComments(raw)
    // A Render that passes metadata by hand is fine - that is what the wrapper does.
    for (const tag of source.match(/<Render\b[\s\S]{0,400}?\/>/g) ?? []) {
      if (!/metadata/.test(tag)) {
        offenders.push(rel)
        break
      }
    }
  }
  return offenders
}

describe('every public Puck render hands blocks their metadata', () => {
  it('no public module render uses Puck\'s bare Render', () => {
    const offenders = filesWithBareRender()
    expect(
      offenders,
      `These render a Puck layout without metadata, so every block inside them sees\n` +
        `no lazy-image setting, no loaded-font list and no image-resizing origin.\n` +
        `Use CactusRender from '@/lib/puck/CactusRender' instead:\n\n  ` +
        offenders.join('\n  ') +
        '\n',
    ).toEqual([])
  })
})
