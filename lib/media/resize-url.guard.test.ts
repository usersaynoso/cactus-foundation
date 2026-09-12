import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

// Why this is a test and not a code review note:
//
// "Send pictures at the size they are shown" reads as a single switch to a site
// owner, but the value has to be walked by hand from the site config to every
// <img> that draws a picture. A component takes it as a `resizing` prop; the
// thing rendering that component has to pass it. Miss one hand-off and the
// switch silently does nothing on that surface: no error, no warning, no visual
// difference, every test green, and an owner who has turned it on and is still
// serving 1,920px originals.
//
// That is exactly what happened. The add-on showcase read the setting off Puck's
// metadata on the BLOCK surface and was measured that way - while the TAB
// surface, which is the one nearly every shop actually uses, rendered the same
// component with no `resizing` at all. Shop's own gallery had it; the gallery a
// companion module contributes in its place, which is what a product with
// options gets, did not. So on a live product page the setting reached one
// mascot photograph in the footer and nothing else, and it took a Lighthouse
// report plus a morning of tracing to find out.
//
// The rule is mechanical, so it may as well be checked: if a component accepts
// `resizing`, every place that renders it has to hand it over.

const ROOT = path.join(__dirname, '..', '..')

// Source only. A module keeps its own `node_modules` when it has been worked on
// locally, and sweeping those took the check from under a second to half a
// minute for no extra cover.
const GREP_SCOPE = [
  '-r',
  '--include=*.ts',
  '--include=*.tsx',
  '--exclude-dir=node_modules',
  '--exclude-dir=.git',
  '--exclude-dir=.next',
]

/** Component names whose props include `resizing?: ImageResizing`. */
function componentsTakingResizing(): { name: string; file: string }[] {
  const listed = execFileSync('grep', [...GREP_SCOPE, '-n', 'resizing?: ImageResizing', 'lib', 'modules'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const found: { name: string; file: string }[] = []
  for (const line of listed.split('\n').filter(Boolean)) {
    const [file, , ...restParts] = line.split(':')
    const rest = restParts.join(':')
    // A component, not a plain helper: `export function Name(` on the same line
    // as the prop, which is how a destructured props signature is written.
    const m = /export function ([A-Z][A-Za-z0-9_]*)\s*\(/.exec(rest)
    if (m?.[1] && file) found.push({ name: m[1], file })
  }
  return found
}

/**
 * A rendering of `<Name ...>` is fine when it passes `resizing`, or spreads a
 * props object that carries it, or is the Puck EDITOR's own draw.
 *
 * The editor exemption is real rather than convenient: the builder's canvas is a
 * client component with no route to the site config, and a preview drawn at the
 * original size is not a page a shopper downloads. Those call sites pass
 * `preview`, which is the same flag the component already uses to stand its
 * interactive half down.
 */
function isSatisfied(tag: string): boolean {
  return /\bresizing\b/.test(tag) || /\{\s*\.\.\./.test(tag) || /\bpreview\b/.test(tag)
}

function unpassedRenderings(): string[] {
  const offenders: string[] = []
  for (const { name } of componentsTakingResizing()) {
    let listed = ''
    try {
      listed = execFileSync('grep', [...GREP_SCOPE, '-l', `<${name}`, 'lib', 'modules'], { cwd: ROOT, encoding: 'utf8' })
    } catch {
      // grep exits non-zero with no matches, which means nothing renders it in
      // JSX - a component registered as a `Panel` or a slot, say. A pass.
      continue
    }
    for (const rel of listed.split('\n').filter(Boolean)) {
      const source = readFileSync(path.join(ROOT, rel), 'utf8')
      // Bounded so a tag whose closing bracket is far away cannot swallow an
      // unrelated `resizing` further down the file.
      for (const tag of source.match(new RegExp(`<${name}\\b[\\s\\S]{0,700}?/?>`, 'g')) ?? []) {
        if (!isSatisfied(tag)) offenders.push(`${rel}: <${name}>`)
      }
    }
  }
  return offenders
}

describe('the picture-resizing setting is handed on wherever it is accepted', () => {
  it('every rendering of a component that takes `resizing` passes it', () => {
    const offenders = unpassedRenderings()
    expect(
      offenders,
      `These render a component that accepts the owner's "send pictures at the size\n` +
        `they are shown" setting without passing it, so the setting does nothing on\n` +
        `that surface. Pass \`resizing\` down - from \`puck?.metadata?.imageResizing\` in\n` +
        `a Puck block, or from the prop whatever rendered this was handed:\n\n  ` +
        offenders.join('\n  ') +
        '\n',
    ).toEqual([])
  })
})
