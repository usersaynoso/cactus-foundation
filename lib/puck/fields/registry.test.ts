import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIELD_WIDGET_NAMES } from '@/lib/puck/fields/registry'

// The custom field widgets reach config.tsx through a registry rather than a direct
// import, to keep the Puck editor out of the public page bundle. The cost of that
// indirection is that a missing registration is invisible: the field just renders as
// nothing in the editor sidebar, and no type error or lint warning says so.
//
// These tests are the guard. They read the two ends of the indirection as text and
// assert they agree, so the failure mode is a red test rather than a silently empty
// field somebody notices weeks later.

const root = join(__dirname, '..', '..', '..')
const editorSource = readFileSync(join(root, 'lib/puck/fields/editor.ts'), 'utf8')
const configSource = readFileSync(join(root, 'lib/puck/config.tsx'), 'utf8')

describe('puck custom field registry', () => {
  it('registers every widget name config.tsx can reference', () => {
    // The object literal passed to registerFieldWidgets in editor.ts.
    const call = editorSource.match(/registerFieldWidgets\(\{([\s\S]*?)\}\)/)
    const body = call?.[1]
    expect(body, 'registerFieldWidgets({ ... }) call not found in editor.ts').toBeTruthy()

    const registered = new Set(
      (body ?? '')
        .split(',')
        .map((line) => line.trim().replace(/:.*$/, ''))
        .filter(Boolean),
    )

    const missing = FIELD_WIDGET_NAMES.filter((name) => !registered.has(name))
    expect(missing, `editor.ts does not register: ${missing.join(', ')}`).toEqual([])
  })

  it('does not let config.tsx import a field widget directly', () => {
    // A direct import is what puts the widget - and, via ResponsiveValueField, the whole
    // Puck editor and its vendored TipTap/ProseMirror - back into every public page's
    // client bundle. It type-checks and it works, which is exactly why it needs a test.
    const directImports = FIELD_WIDGET_NAMES.filter((name) =>
      new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'@/lib/puck/(?!fields/registry)`).test(
        configSource,
      ),
    )
    expect(
      directImports,
      `config.tsx imports these straight from their widget modules instead of @/lib/puck/fields/registry: ${directImports.join(', ')}`,
    ).toEqual([])
  })
})
