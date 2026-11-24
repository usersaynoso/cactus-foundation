// The homepage can be an info page (SiteConfig.homepageId, unchanged) or a piece
// of module content offered through the core.menu-entity-provider extension
// point (SiteConfig.homepageModuleId / homepageEntityKind / homepageEntityId -
// the same three-part reference a MODULE_ENTITY menu item stores). At most one is
// set at a time; homepageWriteFromPatch below is what keeps it that way.
//
// Pure, and safe for a client component to import: nothing here reaches the
// module registry. The half that asks a provider lives in ./module-homepage.ts.

export type HomepageModuleTarget = {
  moduleId: string
  kind: string
  entityId: string
}

type StoredHomepageColumns = {
  homepageModuleId?: string | null
  homepageEntityKind?: string | null
  homepageEntityId?: string | null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** The stored module target, or null unless all three parts are present. */
export function readHomepageModuleTarget(row: StoredHomepageColumns | null | undefined): HomepageModuleTarget | null {
  if (!row) return null
  const { homepageModuleId, homepageEntityKind, homepageEntityId } = row
  if (!nonEmpty(homepageModuleId) || !nonEmpty(homepageEntityKind) || !nonEmpty(homepageEntityId)) return null
  return { moduleId: homepageModuleId, kind: homepageEntityKind, entityId: homepageEntityId }
}

const MAX_HREF = 2048

/**
 * A provider's href, if it is fit to send the root URL to: a path on this site
 * that is not the root itself. Anything else (an absolute URL, a protocol-relative
 * `//host`, a backslash a browser would read as a slash, control characters) is
 * refused, so a misbehaving module can never turn / into an open redirect or a
 * loop.
 */
export function safeHomepageHref(href: unknown): string | null {
  if (typeof href !== 'string' || href.length === 0 || href.length > MAX_HREF) return null
  if (!href.startsWith('/') || href.startsWith('//')) return null
  if (href.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(href)) return null
  const path = href.split(/[?#]/, 1)[0]
  if (path === '/') return null
  return href
}

// The Homepage <select> holds one string per option. A page keeps its bare id,
// exactly as before, so a saved value and an option still line up; module content
// gets a prefix no cuid can start with and a JSON triple, so ids containing any
// separator survive.
const MODULE_PREFIX = 'module:'

export function homepageOptionValue(target: HomepageModuleTarget): string {
  return MODULE_PREFIX + JSON.stringify([target.moduleId, target.kind, target.entityId])
}

export type HomepageChoice =
  | { type: 'none' }
  | { type: 'page'; pageId: string }
  | { type: 'module'; target: HomepageModuleTarget }

export function parseHomepageOptionValue(value: string): HomepageChoice {
  if (!value) return { type: 'none' }
  if (!value.startsWith(MODULE_PREFIX)) return { type: 'page', pageId: value }
  try {
    const parts: unknown = JSON.parse(value.slice(MODULE_PREFIX.length))
    if (Array.isArray(parts) && parts.length === 3 && parts.every(nonEmpty)) {
      const [moduleId, kind, entityId] = parts as [string, string, string]
      return { type: 'module', target: { moduleId, kind, entityId } }
    }
  } catch {
    // fall through
  }
  return { type: 'none' }
}

export type HomepagePatch = {
  homepageId?: string | null
  homepageModuleId?: string | null
  homepageEntityKind?: string | null
  homepageEntityId?: string | null
}

export type HomepageWrite =
  | { ok: true; touched: boolean; data: HomepagePatch }
  | { ok: false; error: string }

const NO_MODULE = { homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null } as const

/**
 * Turns the homepage fields of a Settings PATCH into the columns to write.
 * Choosing a page clears the module target and choosing module content clears
 * the page, so the two can never both be set by the admin screen. A payload that
 * leaves the module fields out (an admin screen loaded before they existed) only
 * ever touches homepageId, as it always did.
 */
export function homepageWriteFromPatch(input: HomepagePatch): HomepageWrite {
  const pageId = input.homepageId === undefined ? undefined : (input.homepageId || null)
  const parts = [input.homepageModuleId, input.homepageEntityKind, input.homepageEntityId]
  const moduleSent = parts.some((p) => p !== undefined)

  if (!moduleSent) {
    if (pageId === undefined) return { ok: true, touched: false, data: {} }
    return { ok: true, touched: true, data: pageId ? { homepageId: pageId, ...NO_MODULE } : { homepageId: null } }
  }

  const allSet = parts.every(nonEmpty)
  const allClear = parts.every((p) => p === null)
  if (!allSet && !allClear) {
    return { ok: false, error: 'A homepage from a module needs its module, kind and item' }
  }

  if (allSet) {
    if (pageId) return { ok: false, error: 'Choose a page or module content for the homepage, not both' }
    return {
      ok: true,
      touched: true,
      data: {
        homepageId: null,
        homepageModuleId: input.homepageModuleId,
        homepageEntityKind: input.homepageEntityKind,
        homepageEntityId: input.homepageEntityId,
      },
    }
  }

  // Clearing the module target says nothing about the page unless the page was sent too.
  return { ok: true, touched: true, data: pageId === undefined ? { ...NO_MODULE } : { homepageId: pageId, ...NO_MODULE } }
}
