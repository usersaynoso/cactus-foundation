import { describe, expect, it } from 'vitest'
import {
  puckConfig,
  layoutPuckConfig,
  headerPuckConfig,
  footerPuckConfig,
  getModuleLayoutSharedParts,
} from '@/lib/puck/config.core'
import { coreLayoutRoots } from '@/lib/puck/core-layout-roots'
import { colourField, emailPuckConfig, emailSignaturePuckConfig } from '@/lib/puck/email-config'

// Every colour setting on a core Puck block offers the site's colours from
// Appearance > Styles. A plain text box that makes the owner type a hex is the
// thing Chris asked to be rid of, so this fails the moment a new one appears.
//
// A "colour setting" is any field whose name says colour or background, or whose
// label says colour. It must be a custom field (the site colour picker, or one of
// the background fields built on the same swatches). The handful of selects
// below are not colours but preset choices that happen to mention one; each is
// listed with why, and a new one has to be added here on purpose.

const PRESET_SELECTS: Record<string, string> = {
  'CTABanner.background': 'light / white / brand / custom - "custom" opens the site colour pickers',
  'Hero.textScheme': 'dark or light text, a contrast scheme rather than a colour',
  'ImageChipPanel.frameBg': 'none / subtle / gradient frame style',
  'Badge.color': 'preset badge styles, each a tested background and text pair',
}

const COLOURISH_NAME = /colou?r|background$|^bg$|Bg$/i
const COLOURISH_LABEL = /\bcolou?rs?\b/i

type Field = { type?: string; label?: string; arrayFields?: Record<string, Field>; objectFields?: Record<string, Field>; render?: unknown }
type Found = { where: string; type: string; render?: unknown }

function collect(where: string, fields: Record<string, Field> | undefined, out: Found[]) {
  for (const [name, f] of Object.entries(fields ?? {})) {
    if (!f || typeof f !== 'object') continue
    if (COLOURISH_NAME.test(name) || COLOURISH_LABEL.test(f.label ?? '')) out.push({ where: `${where}.${name}`, type: String(f.type), render: f.render })
    if (f.arrayFields) collect(`${where}.${name}[]`, f.arrayFields, out)
    if (f.objectFields) collect(`${where}.${name}`, f.objectFields, out)
  }
}

type AnyConfig = { root?: { fields?: Record<string, Field> }; components?: Record<string, { fields?: Record<string, Field> }> }

function colourFieldsOf(config: AnyConfig): Found[] {
  const out: Found[] = []
  collect('root', config.root?.fields, out)
  for (const [block, def] of Object.entries(config.components ?? {})) collect(block, def?.fields, out)
  return out
}

const shared = getModuleLayoutSharedParts()
const CONFIGS = {
  page: puckConfig as unknown as AnyConfig,
  layout: layoutPuckConfig as unknown as AnyConfig,
  header: headerPuckConfig as unknown as AnyConfig,
  footer: footerPuckConfig as unknown as AnyConfig,
  moduleLayoutShared: { components: shared.sharedComponents } as unknown as AnyConfig,
  ...Object.fromEntries(Object.entries(coreLayoutRoots).map(([type, root]) => [`coreRoot:${type}`, { root } as unknown as AnyConfig])),
  email: emailPuckConfig as unknown as AnyConfig,
  emailSignature: emailSignaturePuckConfig as unknown as AnyConfig,
} as Record<string, AnyConfig> & { page: AnyConfig; email: AnyConfig; emailSignature: AnyConfig }

describe('Puck colour fields', () => {
  for (const [name, config] of Object.entries(CONFIGS)) {
    it(`every colour setting in the ${name} config offers the site colours`, () => {
      const found = colourFieldsOf(config)
      const plain = found.filter((f) => {
        if (f.type === 'custom') return false
        if ((f.type === 'select' || f.type === 'radio') && f.where in PRESET_SELECTS) return false
        return true
      })
      expect(plain.map((f) => `${f.where} (${f.type})`)).toEqual([])
    })
  }

  it('finds the colour fields it is meant to police (the scan is not vacuous)', () => {
    expect(colourFieldsOf(CONFIGS.page).length).toBeGreaterThan(50)
    expect(colourFieldsOf(CONFIGS.email).map((f) => f.where)).toEqual(
      expect.arrayContaining(['root.pageBackground', 'root.cardBackground', 'root.cardBorderColour', 'root.linkColour', 'EmailButton.background', 'EmailBodySlot.textColour']),
    )
  })

  it('uses the shared site colour picker for every email colour', () => {
    const picker = colourField('x').render
    for (const config of [CONFIGS.email, CONFIGS.emailSignature]) {
      for (const f of colourFieldsOf(config)) {
        expect(String(f.render), f.where).toBe(String(picker))
      }
    }
  })

  it('keeps the allow-list honest - every preset select still exists', () => {
    const all = new Set(Object.values(CONFIGS).flatMap((c) => colourFieldsOf(c).map((f) => f.where)))
    for (const key of Object.keys(PRESET_SELECTS)) expect(all.has(key), key).toBe(true)
  })
})
