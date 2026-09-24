import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { findServerClientValueReads, formatFinding } from '../../scripts/check-server-client-imports.mjs'

// The guard is scripts/check-server-client-imports.mjs, which the prebuild runs.
// It exists because reading a value out of a 'use client' module on the server
// throws in the real framework and passes `tsc`, `eslint` and every test that
// runs the files as ordinary modules - see the script's header. These cases pin
// down what it must catch, and, as importantly, what it must leave alone: a
// server component rendering a client component is the whole point of the model,
// and a guard that fails builds over that would be switched off inside a week.

const roots: string[] = []

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'server-client-imports-'))
  roots.push(root)
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const CLIENT_CONSTANTS = `'use client'
export const KEY = 'marketing-consent'
export const LIMITS = { max: 3 }
export function useThing() { return 1 }
export function Widget() { return null }
`

const errorsIn = (root: string) => findServerClientValueReads(root).filter((f) => f.severity === 'error')

describe('server code reading a value out of a use-client module', () => {
  it('fails an API route that uses a client constant as a key - the original defect', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'app/api/order/route.ts': `import { KEY } from '../../../lib/state'
export async function POST(ticked: Record<string, boolean>) { return ticked[KEY] }`,
    })
    const findings = errorsIn(root)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ name: 'KEY', reason: 'it is used as a key', severity: 'error', shared: false })
    expect(path.relative(root, findings[0]!.file)).toBe(path.join('app', 'api', 'order', 'route.ts'))
    expect(formatFinding(findings[0]!, root)).toContain('read from lib/state.ts')
  })

  it('follows the route into a plain helper, static or dynamic, and names the trail', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/consent.ts': `import { KEY } from './state'
export const has = (t: Record<string, boolean>) => t[KEY]`,
      'lib/loader.ts': `export const load = () => import('./consent')`,
      'app/api/a/route.ts': `import { has } from '../../../lib/consent'
export const GET = () => has({})`,
      'app/api/b/route.ts': `import { load } from '../../../lib/loader'
export const GET = () => load()`,
    })
    const findings = errorsIn(root)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.trail.map((f) => path.relative(root, f))).toEqual([
      path.join('app', 'api', 'a', 'route.ts'),
      path.join('lib', 'consent.ts'),
    ])
  })

  it('fails a client function called on the server, a template string, and a namespace read', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'app/x/page.tsx': `import { useThing, KEY } from '../../lib/state'
import * as Client from '../../lib/state'
export default function Page() {
  const a = useThing()
  const b = \`prefix-\${KEY}\`
  const c = Client.KEY.length
  const d = 'x' + KEY
  return null
}`,
    })
    const reasons = errorsIn(root).map((f) => `${f.name}: ${f.reason}`).sort()
    expect(reasons).toEqual([
      'Client.KEY: a property is read from it',
      'KEY: it is joined into a string',
      'KEY: it is put into a template string',
      'useThing: it is called',
    ])
  })

  it('reports a comparison or a hand-over of client data as a warning, never an error', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'app/x/page.tsx': `import { KEY, LIMITS } from '../../lib/state'
declare function use(v: unknown): void
export default function Page({ kind }: { kind: string }) {
  use(LIMITS)
  return kind === KEY ? null : null
}`,
    })
    const findings = findServerClientValueReads(root)
    expect(findings.map((f) => f.reason).sort()).toEqual([
      'it is compared, and a client reference never equals the real value',
      'it is passed to a function as a value',
    ])
    expect(findings.every((f) => f.severity === 'warn')).toBe(true)
  })

  it('only warns when a client component can reach the file too', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/shared.ts': `import { KEY } from './state'
export const has = (t: Record<string, boolean>) => t[KEY]`,
      'lib/Editor.tsx': `'use client'
import { has } from './shared'
export function Editor() { return has({}) }`,
      'app/x/page.tsx': `import { has } from '../../lib/shared'
export default function Page() { return has({}) }`,
    })
    const findings = findServerClientValueReads(root)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ severity: 'warn', shared: true })
    expect(formatFinding(findings[0]!, root)).toContain('not certain')
  })

  it('is not fooled by a comment that mentions the directive', () => {
    const root = tree({
      'lib/plain.ts': `// Plain module, no 'use client': the server imports it.
export const KEY = 'marketing-consent'`,
      'app/api/route.ts': `import { KEY } from '../../lib/plain'
export const GET = (t: Record<string, boolean>) => t[KEY]`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })

  it('reads the directive after another one, and with double quotes', () => {
    const root = tree({
      'lib/state.ts': `"use strict"
"use client"
export const KEY = 'x'`,
      'app/api/route.ts': `import { KEY } from '../../lib/state'
export const GET = (t: Record<string, boolean>) => t[KEY]`,
    })
    expect(errorsIn(root)).toHaveLength(1)
  })
})

describe('what the guard leaves alone', () => {
  it('lets a server component render a client component', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/ns.tsx': `'use client'
export const Card = () => null`,
      'app/x/page.tsx': `import { Widget } from '../../lib/state'
import * as Ns from '../../lib/ns'
import Wrapper from '../../lib/wrapper'
export default function Page() {
  return <Wrapper icon={Widget} list={[Widget]} map={{ Widget }}><Widget /><Ns.Card /></Wrapper>
}`,
      'lib/wrapper.tsx': `'use client'
export default function Wrapper(p: { children?: unknown }) { return null }`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })

  it('ignores type-only imports, whichever way they are spelt', () => {
    const root = tree({
      'lib/state.ts': `'use client'
export type Shape = { a: string }
export const KEY = 'x'`,
      'app/api/route.ts': `import type { Shape } from '../../lib/state'
import { type Shape as Other, KEY as _unused } from '../../lib/state'
export const GET = (s: Shape, o: Other) => null`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })

  it('lets one client file read another client file freely', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/Panel.tsx': `'use client'
import { KEY, useThing } from './state'
export function Panel(t: Record<string, boolean>) { return t[KEY] && useThing() }`,
      'app/x/page.tsx': `import { Panel } from '../../lib/Panel'
export default function Page() { return <Panel /> }`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })

  it('ignores a helper that only client components import - it is compiled for the browser', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/browser-helper.ts': `import { KEY } from './state'
export const has = (t: Record<string, boolean>) => t[KEY]`,
      'lib/Panel.tsx': `'use client'
import { has } from './browser-helper'
export function Panel() { return has({}) }`,
      'app/x/page.tsx': `import { Panel } from '../../lib/Panel'
export default function Page() { return <Panel /> }`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })

  it('leaves a re-export alone, since nothing is read', () => {
    const root = tree({
      'lib/state.ts': CLIENT_CONSTANTS,
      'lib/index.ts': `export { KEY } from './state'`,
      'app/api/route.ts': `import '../../lib/index'
export const GET = () => null`,
    })
    expect(findServerClientValueReads(root)).toEqual([])
  })
})

describe('the real tree', () => {
  it('has no server-only file that reads a value out of a use-client module', () => {
    const findings = findServerClientValueReads(process.cwd())
    const warnings = findings.filter((f) => f.severity === 'warn')
    if (warnings.length > 0) {
      // Not failed on, because they are not certain - but worth being told about
      // in the one place a developer is guaranteed to be looking.
      console.warn(
        `[server-client-imports] ${warnings.length} uncertain use(s):\n\n${warnings.map((f) => formatFinding(f, process.cwd())).join('\n\n')}`,
      )
    }
    const errors = findings.filter((f) => f.severity === 'error')
    expect(errors.map((f) => formatFinding(f, process.cwd())), 'server code reading a use-client module').toEqual([])
  })
})
