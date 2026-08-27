import { moduleLayoutTypeToGroup, type ModuleLayoutTypeGroup } from '@/lib/layout/module-layout-types'

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
  { key: 'emailWrapper', label: 'Email Wrapper', description: 'The design wrapped around the emails your site sends: logo, colours, footer. The message itself drops into the Message block.' },
  // Not a page. The strip that repeats at the foot of EVERY page of a printed
  // document - an invoice, a proforma, a quote, a purchase order - drawn into
  // the bottom margin by the browser making the PDF. One design for all of it,
  // rather than one per document type built four times and drifting three ways.
  // Blocks come from whichever module prints the paperwork, so on a site with
  // none of them the picker offers the core blocks and nothing else.
  { key: 'documentFooter', label: 'Document Footer', description: 'The strip repeated at the foot of every page of a printed document: your registration details, a page number, a rule. Shared by every document your site prints.' },
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

/** Module group tabs are keyed on moduleName, which is unique per manifest.
 *
 * Takes the groups rather than reading the generated list, because that list is
 * every module the *build* cloned - which is every module in modules.json, not the
 * ones this site installed. Callers pass the installed set
 * (useModuleLayoutGroups(), fed by getInstalledModuleLayoutGroups()). */
export function moduleGroupTabs(groups: ModuleLayoutTypeGroup[]): LayoutTypeTab[] {
  return groups.map((g) => ({
    key: g.moduleName,
    label: g.groupLabel,
    type: null,
  }))
}

export const CORE_TYPE_TABS: LayoutTypeTab[] = CORE_LAYOUT_TYPES.map((t) => ({
  key: t.key,
  label: t.label,
  type: t.key,
}))

/** Every layout type the code in this build can render: the five core ones, plus
 * whatever the modules on disk declare. A type outside this set has no editor
 * config and nothing that resolves it, so a layout carrying one would be invisible
 * everywhere but the database.
 *
 * Build-time only, and deliberately so - an existing module layout still has to open
 * in its editor. It is not the test for whether the owner may *create* one: that is
 * isInstalledLayoutType(), which also asks whether the site has the module. */
export function isKnownLayoutType(type: unknown): type is string {
  if (typeof type !== 'string') return false
  return type in TYPE_LABELS || type in moduleLayoutTypeToGroup
}
