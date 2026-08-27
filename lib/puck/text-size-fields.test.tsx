import { describe, it, expect } from 'vitest'
import React from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { puckConfig } from '@/lib/puck/config.core'

// The Text and Rich Text blocks got a font size menu in PIXELS, because the two
// of them are what a printed document's footer is built from and paperwork is
// measured against a sheet of A4 rather than against the browser's root font.
//
// Two things worth pinning, both of which are invisible to tsc:
//
//  - the three named sizes kept their STORED values (`base`, `md`, `lg`). Only
//    their labels changed. Swap a value for a pixel string and every layout that
//    already carries one silently falls back to the default size.
//  - the Rich Text size has to be applied on BOTH render paths. The editor's
//    lives in config.core.tsx and the published one in config.rsc.tsx, in
//    different files, and a size applied to one and not the other is a footer
//    that looks right in the builder and wrong in the PDF.

type FieldDef = { options?: { value: string; label: string }[] }
type BlockDef = { fields: Record<string, FieldDef | undefined>; render: (props: Record<string, unknown>) => React.ReactElement }

/** The block, or a failure naming it - an absent block would otherwise read as a
 *  field with no options, which is a passing test for the wrong reason. */
function blockDef(name: string): BlockDef {
  const def = (puckConfig.components as Record<string, BlockDef | undefined>)[name]
  if (!def) throw new Error(`no such core block: ${name}`)
  return def
}

function optionsOf(block: string, field: string): { value: string; label: string }[] {
  const def = blockDef(block).fields[field]
  if (!def?.options) throw new Error(`${block}.${field} has no options`)
  return def.options
}

describe('the text size menus are in pixels', () => {
  it('Text keeps base/md/lg as stored values', () => {
    expect(optionsOf('TextBlock', 'size').map((o) => o.value).slice(0, 3)).toEqual(['base', 'md', 'lg'])
  })

  it('Text offers pixel sizes and mentions rem nowhere', () => {
    const options = optionsOf('TextBlock', 'size')
    expect(options.map((o) => o.value)).toContain('12px')
    expect(options.filter((o) => /rem/i.test(o.label))).toEqual([])
  })

  it('Rich Text offers a size, defaulting to whatever the page gives it', () => {
    const options = optionsOf('RichTextBlock', 'fontSize')
    expect(options[0]).toEqual({ value: '', label: 'Default' })
    expect(options.map((o) => o.value)).toContain('12px')
    expect(options.filter((o) => /rem/i.test(o.label))).toEqual([])
  })
})

describe('the sizes reach the markup', () => {
  const render = (props: Record<string, unknown>) => {
    const Block = blockDef('TextBlock').render
    return renderToStaticMarkup(<Block id="t1" content="Small print" {...props} />)
  }

  it('a named size renders exactly what it always did', () => {
    expect(render({ size: 'base' })).toContain('font-size:1rem')
  })

  it('a pixel size renders as those pixels', () => {
    expect(render({ size: '12px' })).toContain('font-size:12px')
  })

  it('anything unrecognised falls back rather than emitting nonsense', () => {
    expect(render({ size: 'enormous' })).toContain('font-size:1rem')
  })
})

describe('Rich Text applies its size on both render paths', () => {
  // Grep, not a render: RichTextBlockRsc is module-private and the published path
  // runs through the RSC config. What matters is that the same helper is what
  // both files reach for, so the two cannot drift apart.
  const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8')

  it.each(['config.core.tsx', 'config.rsc.tsx'])('%s uses richTextFontSize', (file) => {
    expect(read(file)).toContain('richTextFontSize(fontSize)')
  })
})
