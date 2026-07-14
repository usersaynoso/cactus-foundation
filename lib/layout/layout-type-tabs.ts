import { moduleLayoutTypeGroups } from '@/lib/layout/module-layout-types'

// The layout types, and the tabs that present them. Shared by the Layouts list
// and the new-layout picker so the two can never disagree about what a type is
// called - they did, before this existed.

export type CoreLayoutType = {
  key: string
  label: string
  /** Shown on the picker's empty state and the list's blurb. */
  description: string
}

export const CORE_LAYOUT_TYPES: CoreLayoutType[] = [
  { key: 'header',     label: 'Header',       description: 'The bar across the top of every page: logo, navigation, sign-in.' },
  { key: 'footer',     label: 'Footer',       description: 'The strip along the bottom: links, social icons, copyright.' },
  { key: 'infoPage',   label: 'Page Layout',  description: 'The shell your pages sit inside. Where the page content goes, and what sits around it.' },
  { key: 'notFound',   label: '404',          description: 'What a visitor sees when they ask for a page that is not there.' },
  { key: 'statusPage', label: 'Status Page',  description: 'The standalone screen shown before launch, or while the site is down for maintenance.' },
]

export const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  CORE_LAYOUT_TYPES.map((t) => [t.key, t.label]),
)

export type LayoutTypeTab = {
  /** Top-level tab key: a core layout type, or a module name. */
  key: string
  label: string
  /** The layout type this tab selects, or null for a module group (its sub-tabs pick one). */
  type: string | null
}

/** Module group tabs are keyed on moduleName, which is unique per manifest. */
export const MODULE_GROUP_TABS: LayoutTypeTab[] = moduleLayoutTypeGroups.map((g) => ({
  key: g.moduleName,
  label: g.groupLabel,
  type: null,
}))

export const CORE_TYPE_TABS: LayoutTypeTab[] = CORE_LAYOUT_TYPES.map((t) => ({
  key: t.key,
  label: t.label,
  type: t.key,
}))
