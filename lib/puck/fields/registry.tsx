// Server-safe stand-ins for the Puck editor's custom field widgets.
//
// Every widget under lib/puck/*Field.tsx is a 'use client' component, and one of
// them (ResponsiveValueField) imports the Puck editor entrypoint for createUsePuck.
// config.tsx carries no 'use client' of its own, so importing a widget from there
// opened a client boundary in every graph that reaches config.tsx - and
// config.rsc.tsx, the public render path, reaches it. That put the whole Puck
// editor runtime, plus the TipTap/ProseMirror editor it vendors, into the client
// bundle of every public page, to power sidebar fields a visitor can never see.
//
// config.tsx references these proxies instead. Each one resolves the real widget
// from the registry at render time, which only ever happens inside the editor:
// lib/puck/fields/editor.ts holds the actual imports and registers them, and only
// the two admin Puck editors import that. On the RSC path the registry stays empty
// and no field is ever rendered, so the proxies are inert and the widgets stay out
// of the graph entirely.
//
// Widget types come in via `import type`, which is erased at build time and adds no
// runtime edge, so config.tsx type-checks exactly as it did against the real thing.

import React from 'react'
import type { SiteColourField as SiteColourFieldImpl } from '@/lib/puck/SiteColourField'
import type { SiteFontField as SiteFontFieldImpl } from '@/lib/puck/SiteFontField'
import type { BorderField as BorderFieldImpl } from '@/lib/puck/BorderField'
import type {
  SectionBgColorField as SectionBgColorFieldImpl,
  HeroBgColorField as HeroBgColorFieldImpl,
  HeaderBgColorField as HeaderBgColorFieldImpl,
  PageBgColorField as PageBgColorFieldImpl,
} from '@/lib/puck/BgColorField'
import type { LayoutPickerField as LayoutPickerFieldImpl } from '@/lib/puck/LayoutPickerField'
import type {
  ResponsiveTextField as ResponsiveTextFieldImpl,
  ResponsiveSelectField as ResponsiveSelectFieldImpl,
  ResponsiveNumberField as ResponsiveNumberFieldImpl,
} from '@/lib/puck/ResponsiveValueField'
import type { VisibilityField as VisibilityFieldImpl } from '@/lib/puck/VisibilityField'
import type { MinMaxPairField as MinMaxPairFieldImpl } from '@/lib/puck/MinMaxPairField'
import type { ClearableNumberField as ClearableNumberFieldImpl } from '@/lib/puck/ClearableNumberField'
import type {
  UnitValueField as UnitValueFieldImpl,
  ResponsiveUnitValueField as ResponsiveUnitValueFieldImpl,
} from '@/lib/puck/UnitValueField'

// Every widget config.tsx can name. The editor must register all of them - see the
// guard test in lib/puck/fields/registry.test.ts, which fails if the two lists drift
// and a field would silently render as nothing in the sidebar.
export const FIELD_WIDGET_NAMES = [
  'SiteColourField',
  'SiteFontField',
  'BorderField',
  'SectionBgColorField',
  'HeroBgColorField',
  'HeaderBgColorField',
  'PageBgColorField',
  'LayoutPickerField',
  'ResponsiveTextField',
  'ResponsiveSelectField',
  'ResponsiveNumberField',
  'VisibilityField',
  'MinMaxPairField',
  'ClearableNumberField',
  'UnitValueField',
  'ResponsiveUnitValueField',
] as const

export type FieldWidgetName = (typeof FIELD_WIDGET_NAMES)[number]

// Widgets have unrelated prop shapes, so the registry is deliberately loose in the
// middle. Each proxy is re-typed back to its own implementation on the way out, which
// is what config.tsx and the editor actually see.
type AnyFieldWidget = React.ComponentType<any>

const registry = new Map<FieldWidgetName, AnyFieldWidget>()

export function registerFieldWidgets(widgets: Record<FieldWidgetName, AnyFieldWidget>): void {
  for (const name of FIELD_WIDGET_NAMES) registry.set(name, widgets[name])
}

export function registeredFieldWidgetNames(): FieldWidgetName[] {
  return [...registry.keys()]
}

function fieldProxy(name: FieldWidgetName): AnyFieldWidget {
  const Field = (props: Record<string, unknown>) => {
    const Widget = registry.get(name)
    // Only reachable if a Puck field is rendered outside the editor, which nothing
    // does. Rendering nothing beats throwing inside someone's page.
    if (!Widget) return null
    return <Widget {...props} />
  }
  Field.displayName = `PuckField(${name})`
  return Field
}

export const SiteColourField = fieldProxy('SiteColourField') as typeof SiteColourFieldImpl
export const SiteFontField = fieldProxy('SiteFontField') as typeof SiteFontFieldImpl
export const BorderField = fieldProxy('BorderField') as typeof BorderFieldImpl
export const SectionBgColorField = fieldProxy('SectionBgColorField') as typeof SectionBgColorFieldImpl
export const HeroBgColorField = fieldProxy('HeroBgColorField') as typeof HeroBgColorFieldImpl
export const HeaderBgColorField = fieldProxy('HeaderBgColorField') as typeof HeaderBgColorFieldImpl
export const PageBgColorField = fieldProxy('PageBgColorField') as typeof PageBgColorFieldImpl
export const LayoutPickerField = fieldProxy('LayoutPickerField') as typeof LayoutPickerFieldImpl
export const ResponsiveTextField = fieldProxy('ResponsiveTextField') as typeof ResponsiveTextFieldImpl
export const ResponsiveSelectField = fieldProxy('ResponsiveSelectField') as typeof ResponsiveSelectFieldImpl
export const ResponsiveNumberField = fieldProxy('ResponsiveNumberField') as typeof ResponsiveNumberFieldImpl
export const VisibilityField = fieldProxy('VisibilityField') as typeof VisibilityFieldImpl
export const MinMaxPairField = fieldProxy('MinMaxPairField') as typeof MinMaxPairFieldImpl
export const ClearableNumberField = fieldProxy('ClearableNumberField') as typeof ClearableNumberFieldImpl
export const UnitValueField = fieldProxy('UnitValueField') as typeof UnitValueFieldImpl
export const ResponsiveUnitValueField = fieldProxy('ResponsiveUnitValueField') as typeof ResponsiveUnitValueFieldImpl
