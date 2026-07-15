import { z } from 'zod'

// ---------------------------------------------------------------------------
// Admin sidebar menu — canonical definition, stored customisation, and the pure
// resolver that turns "built-in menu + module links + saved customisation +
// this user's permissions" into the exact list of sections/items to render.
//
// This module is framework-agnostic (zod only) so it is shared by the server
// layout (which renders the sidebar) and the /api/admin/navigation route (which
// validates and stores customisations). The client sidebar renders whatever the
// server resolved here; it never re-implements the visibility rules.
// ---------------------------------------------------------------------------

// ── Canonical menu ──────────────────────────────────────────────────────────

// Stable ids for the built-in items. NEVER change these strings: saved
// customisations key off them, and a renamed id silently resets a site owner's
// customisation for that item back to its default.
export type CoreNavItemId =
  | 'dashboard'
  | 'pages'
  | 'menus'
  | 'media'
  | 'system'
  | 'appearance'
  | 'layouts'
  | 'modules'
  | 'users'

export type CanonicalNavItem = {
  id: string
  /** Default label, before any rename override. */
  label: string
  /** Path relative to the admin root, e.g. '/pages'. Empty string = dashboard. */
  path: string
  /** A NAV_ICONS key (core) or raw sanitised SVG markup (module-provided). */
  icon: string
  /** true => render `icon` as raw SVG markup; false => look `icon` up in NAV_ICONS. */
  iconIsSvg: boolean
  /** Which section this item lives in by default. */
  section: string
  /**
   * Any-of permission keys that make this item useful. Empty = always allowed.
   * Only consulted for the 'default' visibility mode, and never for module items
   * (those are already permission-filtered before they reach the resolver).
   */
  defaultPermissions: string[]
  isModule: boolean
  /** Optional deep-link surfaced in the sidebar's Quick Create ("New…") menu. */
  createAction?: { label: string; path: string }
}

export type CanonicalSection = {
  id: string
  /** Default label. null = the unlabelled top group that holds the dashboard. */
  label: string | null
}

export const CORE_SECTIONS: CanonicalSection[] = [
  { id: 'main', label: null },
  { id: 'content', label: 'Content' },
  { id: 'system', label: 'System' },
]

export const CORE_NAV_ITEMS: CanonicalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '', icon: 'dashboard', iconIsSvg: false, section: 'main', defaultPermissions: [], isModule: false },
  { id: 'pages', label: 'Pages', path: '/pages', icon: 'pages', iconIsSvg: false, section: 'content', defaultPermissions: ['pages.read'], isModule: false, createAction: { label: 'New page', path: '/pages/new' } },
  { id: 'menus', label: 'Menus', path: '/menus', icon: 'menus', iconIsSvg: false, section: 'content', defaultPermissions: ['menus.manage'], isModule: false, createAction: { label: 'New menu', path: '/menus' } },
  { id: 'media', label: 'Media', path: '/media', icon: 'media', iconIsSvg: false, section: 'content', defaultPermissions: ['media.upload', 'media.delete'], isModule: false, createAction: { label: 'Upload media', path: '/media' } },
  { id: 'system', label: 'System', path: '/config', icon: 'config', iconIsSvg: false, section: 'system', defaultPermissions: ['config.manage'], isModule: false },
  { id: 'appearance', label: 'Appearance', path: '/appearance', icon: 'appearance', iconIsSvg: false, section: 'system', defaultPermissions: ['appearance.manage'], isModule: false },
  { id: 'layouts', label: 'Layouts', path: '/layouts', icon: 'layouts', iconIsSvg: false, section: 'system', defaultPermissions: ['layouts.manage'], isModule: false },
  { id: 'modules', label: 'Modules', path: '/modules', icon: 'modules', iconIsSvg: false, section: 'system', defaultPermissions: ['modules.manage'], isModule: false },
  { id: 'users', label: 'Users', path: '/users', icon: 'users', iconIsSvg: false, section: 'system', defaultPermissions: ['users.manage'], isModule: false },
]

/** Every core permission key the sidebar consults — resolved in one batch query. */
export const CORE_NAV_PERMISSION_KEYS = [...new Set(CORE_NAV_ITEMS.flatMap((i) => i.defaultPermissions))]

// ── Stored customisation ─────────────────────────────────────────────────────

export const NAV_VISIBILITY_MODES = ['default', 'everyone', 'admin', 'roles', 'hidden'] as const
export type NavVisibilityMode = (typeof NAV_VISIBILITY_MODES)[number]

const VisibilitySchema = z.object({
  mode: z.enum(NAV_VISIBILITY_MODES),
  // Only meaningful when mode === 'roles'. Role ids allowed to see the item.
  roleIds: z.array(z.string()).max(200).optional(),
})
export type NavVisibility = z.infer<typeof VisibilitySchema>

const ItemOverrideSchema = z.object({
  // null / empty => use the default label. Capped so a rename can't blow out the rail.
  label: z.string().max(60).nullable().optional(),
  order: z.number().int().min(0).max(9999).optional(),
  visibility: VisibilitySchema.optional(),
})
export type NavItemOverride = z.infer<typeof ItemOverrideSchema>

const SectionOverrideSchema = z.object({
  label: z.string().max(60).nullable().optional(),
  order: z.number().int().min(0).max(9999).optional(),
})

export const AdminMenuConfigSchema = z.object({
  items: z.record(z.string(), ItemOverrideSchema).default({}),
  sections: z.record(z.string(), SectionOverrideSchema).default({}),
})
export type AdminMenuConfig = z.infer<typeof AdminMenuConfigSchema>

const EMPTY_CONFIG: AdminMenuConfig = { items: {}, sections: {} }

/**
 * Coerce whatever is stored in SiteConfig.adminMenuConfig (untyped jsonb, possibly
 * written by an older/newer build) into a safe config. Anything malformed falls
 * back to "no customisation" rather than throwing — a corrupt blob must never take
 * the admin sidebar down.
 */
export function parseAdminMenuConfig(raw: unknown): AdminMenuConfig {
  if (raw == null) return EMPTY_CONFIG
  const parsed = AdminMenuConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_CONFIG
}

// ── Resolution ───────────────────────────────────────────────────────────────

export type ModuleNavGroup = {
  label: string | null
  links: Array<{ label: string; path: string; icon?: string }>
}

export type ModuleManifestNav = {
  navEntries?: Array<{ label: string; path: string; icon?: string; permission?: string }>
  navGroupLabel?: string
  navGroupOrder?: number
}

/**
 * Assemble module nav links into groups the way the sidebar has always grouped
 * them: ungrouped links share one flat bucket (label null), a module can claim
 * its own labelled section via navGroupLabel, and labelled sections sort by
 * navGroupOrder (lowest first, unset last). Shared by the admin layout (which
 * renders the sidebar) and the Settings > Navigation editor (which lists every
 * item) so the two never drift on where a module link belongs.
 *
 * `canSee` gates each entry by its permission (the layout passes the real check;
 * the editor passes "all", so an admin can set rules on links some roles can't
 * see). `sanitizeIcon`, when given, is applied to each entry's inline-SVG icon —
 * the layout passes the jsdom sanitiser; the editor omits it (it renders no icons)
 * so untrusted markup never reaches that path.
 */
export function buildModuleNavGroups(
  manifests: Array<ModuleManifestNav | null>,
  opts: {
    canSee: (permission: string | undefined) => boolean
    sanitizeIcon?: (svg: string) => string
  }
): ModuleNavGroup[] {
  const ungrouped: ModuleNavGroup['links'] = []
  const labelled = new Map<string, ModuleNavGroup['links']>()
  const labelledOrder = new Map<string, number>()

  for (const manifest of manifests) {
    if (!manifest?.navEntries) continue
    const links: ModuleNavGroup['links'] = []
    for (const entry of manifest.navEntries) {
      if (!opts.canSee(entry.permission)) continue
      links.push({
        label: entry.label,
        path: entry.path,
        icon: entry.icon && opts.sanitizeIcon ? opts.sanitizeIcon(entry.icon) : undefined,
      })
    }
    if (links.length === 0) continue
    if (manifest.navGroupLabel) {
      labelled.set(manifest.navGroupLabel, [...(labelled.get(manifest.navGroupLabel) ?? []), ...links])
      const order = manifest.navGroupOrder ?? Number.POSITIVE_INFINITY
      const existing = labelledOrder.get(manifest.navGroupLabel)
      if (existing === undefined || order < existing) labelledOrder.set(manifest.navGroupLabel, order)
    } else {
      ungrouped.push(...links)
    }
  }

  const groups: ModuleNavGroup[] = []
  if (ungrouped.length > 0) groups.push({ label: null, links: ungrouped })
  const sortedLabels = [...labelled.keys()].sort(
    (a, b) => (labelledOrder.get(a) ?? Number.POSITIVE_INFINITY) - (labelledOrder.get(b) ?? Number.POSITIVE_INFINITY)
  )
  for (const label of sortedLabels) groups.push({ label, links: labelled.get(label)! })
  return groups
}

export type UserNavContext = {
  roleId: string
  /** isProtected role: bypasses every visibility rule and sees every item. */
  isAdmin: boolean
  /** Whether the user's role holds a given permission key. */
  can: (key: string) => boolean
}

export type ResolvedNavItem = {
  id: string
  label: string
  path: string
  icon: string
  iconIsSvg: boolean
  isModule: boolean
  /**
   * Set only for admins, on items a non-admin would NOT see: 'admin' | 'roles' |
   * 'hidden'. Lets the sidebar mark access-controlled items with a small badge so
   * an admin knows the item is restricted (and, for 'hidden', invisible to others).
   */
  restricted: NavVisibilityMode | null
  createAction?: { label: string; path: string }
}

export type ResolvedNavSection = {
  id: string
  label: string | null
  items: ResolvedNavItem[]
}

function moduleItemFrom(link: { label: string; path: string; icon?: string }): CanonicalNavItem {
  const hasSvg = !!link.icon && link.icon.trimStart().startsWith('<')
  return {
    id: `mod:${link.path}`,
    label: link.label,
    path: link.path,
    icon: hasSvg ? link.icon! : 'modules',
    iconIsSvg: hasSvg,
    section: '',
    defaultPermissions: [],
    isModule: true,
    createAction: undefined,
  }
}

/**
 * Build the full canonical menu — core items plus module links slotted into the
 * same places the sidebar has always put them:
 *   - ungrouped module links   → the top ("main") section, under Dashboard
 *   - a group whose label matches a core section ("Content"/"System") → that section
 *   - any other labelled group → its own section, inserted after "Content"
 * Returns sections in their default order, each with its items in default order.
 * Placement only; visibility and customisation are applied by the caller.
 */
function buildCanonical(moduleGroups: ModuleNavGroup[]): Array<{ section: CanonicalSection; items: CanonicalNavItem[] }> {
  const bucket = new Map<string, CanonicalNavItem[]>()
  for (const s of CORE_SECTIONS) bucket.set(s.id, [])
  for (const item of CORE_NAV_ITEMS) bucket.get(item.section)!.push(item)

  const coreLabelToId = new Map<string, string>()
  for (const s of CORE_SECTIONS) if (s.label) coreLabelToId.set(s.label, s.id)

  const moduleSections: CanonicalSection[] = []
  for (const group of moduleGroups) {
    if (!group.label) {
      for (const link of group.links) bucket.get('main')!.push(moduleItemFrom(link))
      continue
    }
    const coreId = coreLabelToId.get(group.label)
    if (coreId) {
      for (const link of group.links) bucket.get(coreId)!.push(moduleItemFrom(link))
      continue
    }
    const secId = `modgroup:${group.label}`
    if (!bucket.has(secId)) {
      bucket.set(secId, [])
      moduleSections.push({ id: secId, label: group.label })
    }
    for (const link of group.links) bucket.get(secId)!.push(moduleItemFrom(link))
  }

  // Default section order: main, content, <module groups>, system — the labelled
  // module groups slot in just before the System section, matching where the
  // sidebar has always rendered them.
  const ordered: CanonicalSection[] = []
  for (const section of CORE_SECTIONS) {
    if (section.id === 'system') ordered.push(...moduleSections)
    ordered.push(section)
  }
  return ordered.map((section) => ({ section, items: bucket.get(section.id) ?? [] }))
}

function resolveVisibility(
  item: CanonicalNavItem,
  override: NavItemOverride | undefined,
  user: UserNavContext
): { visible: boolean; restricted: NavVisibilityMode | null } {
  const mode = override?.visibility?.mode ?? 'default'
  const roleIds = override?.visibility?.roleIds ?? []

  let passes: boolean
  switch (mode) {
    case 'everyone':
      passes = true
      break
    case 'admin':
      passes = false // admins only (granted below via the isAdmin bypass)
      break
    case 'roles':
      passes = roleIds.includes(user.roleId)
      break
    case 'hidden':
      passes = false
      break
    case 'default':
    default:
      passes = item.defaultPermissions.length === 0 || item.defaultPermissions.some((k) => user.can(k))
      break
  }

  const restrictedMode: NavVisibilityMode | null =
    mode === 'admin' || mode === 'roles' || mode === 'hidden' ? mode : null

  // isProtected admins always see every item so they can never lock themselves
  // out of the very screen that edits these rules. The badge (restricted) is an
  // admin-only affordance, so non-admins never receive it.
  return {
    visible: user.isAdmin ? true : passes,
    restricted: user.isAdmin ? restrictedMode : null,
  }
}

// Sort keys: a saved customisation writes order 0..n for the items/sections it
// knows about; anything without a saved order (e.g. a freshly installed module)
// sorts after them, keeping its natural position.
const UNSAVED_BASE = 100_000

/**
 * Resolve the sidebar for one user: apply the stored customisation (order, rename,
 * visibility) and filter to what this user may see. Empty sections are dropped.
 * Pure — same inputs, same output; no I/O.
 */
export function resolveAdminMenu(
  moduleGroups: ModuleNavGroup[],
  config: AdminMenuConfig,
  user: UserNavContext
): ResolvedNavSection[] {
  const canonical = buildCanonical(moduleGroups)

  const sections = canonical.map((entry, sectionIndex) => {
    const secOverride = config.sections[entry.section.id]

    const items = entry.items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .sort((a, b) => {
        const ao = config.items[a.item.id]?.order ?? UNSAVED_BASE + a.itemIndex
        const bo = config.items[b.item.id]?.order ?? UNSAVED_BASE + b.itemIndex
        return ao - bo
      })
      .map(({ item }): ResolvedNavItem | null => {
        const override = config.items[item.id]
        const { visible, restricted } = resolveVisibility(item, override, user)
        if (!visible) return null
        const label = override?.label?.trim() || item.label
        return {
          id: item.id,
          label,
          path: item.path,
          icon: item.icon,
          iconIsSvg: item.iconIsSvg,
          isModule: item.isModule,
          restricted,
          createAction: item.createAction,
        }
      })
      .filter((i): i is ResolvedNavItem => i !== null)

    return {
      section: entry.section,
      order: secOverride?.order ?? UNSAVED_BASE + sectionIndex,
      label: secOverride?.label?.trim() || entry.section.label,
      items,
    }
  })

  return sections
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.items.length > 0) // hide empty sections
    .map((s) => ({ id: s.section.id, label: s.label, items: s.items }))
}

// ── Editor model ─────────────────────────────────────────────────────────────

export type EditorNavItem = {
  id: string
  defaultLabel: string
  label: string | null
  path: string
  isModule: boolean
  visibility: NavVisibility
}

export type EditorNavSection = {
  id: string
  defaultLabel: string | null
  label: string | null
  items: EditorNavItem[]
}

/**
 * Build the full menu for the Settings > Navigation editor: every section and
 * item (including hidden ones), in saved order, carrying their current overrides.
 * Unlike resolveAdminMenu this applies no visibility filtering — the editor shows
 * everything so an admin can see and change every rule.
 */
export function resolveAdminMenuForEditor(
  moduleGroups: ModuleNavGroup[],
  config: AdminMenuConfig
): EditorNavSection[] {
  const canonical = buildCanonical(moduleGroups)

  return canonical
    .map((entry, sectionIndex) => {
      const secOverride = config.sections[entry.section.id]
      const items = entry.items
        .map((item, itemIndex) => ({ item, itemIndex }))
        .sort((a, b) => {
          const ao = config.items[a.item.id]?.order ?? UNSAVED_BASE + a.itemIndex
          const bo = config.items[b.item.id]?.order ?? UNSAVED_BASE + b.itemIndex
          return ao - bo
        })
        .map(({ item }): EditorNavItem => ({
          id: item.id,
          defaultLabel: item.label,
          label: config.items[item.id]?.label ?? null,
          path: item.path,
          isModule: item.isModule,
          visibility: config.items[item.id]?.visibility ?? { mode: 'default' },
        }))
      return {
        section: entry.section,
        order: secOverride?.order ?? UNSAVED_BASE + sectionIndex,
        defaultLabel: entry.section.label,
        label: secOverride?.label ?? null,
        items,
      }
    })
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.section.id, defaultLabel: s.defaultLabel, label: s.label, items: s.items }))
}
