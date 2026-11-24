'use client'

import {
  homepageOptionValue,
  parseHomepageOptionValue,
  readHomepageModuleTarget,
  type HomepageModuleTarget,
} from '@/lib/homepage/module-target'
import type { HomepageOptionGroup } from '@/lib/homepage/module-homepage'

// Settings > General > Homepage. Lists the info pages, as it always has, and -
// when any installed module offers content through core.menu-entity-provider -
// that content too, one group per module and kind ("TG Finance · Money screens").
// Choosing module content makes / redirect to it.

export type HomepageCurrent = HomepageModuleTarget & {
  moduleLabel: string | null
  ok: boolean
  label?: string
  reason?: string
}

export type HomepageOptions = { groups: HomepageOptionGroup[]; current: HomepageCurrent | null }

export type HomepageValue = {
  homepageId: string | null
  homepageModuleId: string | null
  homepageEntityKind: string | null
  homepageEntityId: string | null
}

/**
 * The module options and the saved choice's state, from the server. Called when
 * the page loads and again after every save, so the "Linked content deleted"
 * warning and the kept-as-an-option entry follow what was just saved rather than
 * what was saved when the page opened. Null on any failure: the select then
 * keeps what it had (or lists pages only).
 */
export async function fetchHomepageOptions(fetchImpl: typeof fetch = fetch): Promise<HomepageOptions | null> {
  try {
    const res = await fetchImpl('/api/admin/config/homepage-options')
    if (!res.ok) return null
    const body = (await res.json()) as Partial<HomepageOptions> | null
    if (!body || !Array.isArray(body.groups)) return null
    return { groups: body.groups, current: body.current ?? null }
  } catch {
    return null
  }
}

const sameTarget = (a: HomepageModuleTarget, b: HomepageModuleTarget) =>
  a.moduleId === b.moduleId && a.kind === b.kind && a.entityId === b.entityId

// Why the saved module homepage no longer resolves, in the menu editor's words
// and with its badge levels (app/cactus-admin/menus/[id]/page.tsx, attentionOf).
function problemOf(current: HomepageCurrent): { level: 'error' | 'warn'; text: string } {
  switch (current.reason) {
    case 'not-public': return { level: 'warn', text: 'Not published - hidden from the live site' }
    case 'unsafe-href': return { level: 'error', text: 'Linked content has no address on this site' }
    case 'error': return { level: 'warn', text: 'Linked content could not be checked' }
    default: return { level: 'error', text: 'Linked content deleted' }
  }
}

export default function HomepageField({
  value,
  pages,
  options,
  onChange,
}: {
  value: HomepageValue
  pages: Array<{ id: string; title: string }>
  options: HomepageOptions
  onChange: (next: HomepageValue) => void
}) {
  const target = readHomepageModuleTarget(value)
  const selected = target ? homepageOptionValue(target) : (value.homepageId ?? '')
  const { groups, current } = options

  // The saved module homepage, when it is not among the options (deleted, hidden,
  // past the list's cap): kept as an option so the select still shows the truth.
  const listed = (t: HomepageModuleTarget) =>
    groups.some((g) => g.moduleId === t.moduleId && g.kind === t.kind && g.entries.some((e) => e.id === t.entityId))
  const orphan = current && !listed(current) ? current : null
  const problem = current && !current.ok && target && sameTarget(target, current) ? problemOf(current) : null

  function choose(raw: string) {
    const choice = parseHomepageOptionValue(raw)
    if (choice.type === 'module') {
      onChange({
        homepageId: null,
        homepageModuleId: choice.target.moduleId,
        homepageEntityKind: choice.target.kind,
        homepageEntityId: choice.target.entityId,
      })
    } else {
      onChange({
        homepageId: choice.type === 'page' ? choice.pageId : null,
        homepageModuleId: null,
        homepageEntityKind: null,
        homepageEntityId: null,
      })
    }
  }

  const pageOptions = pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)

  return (
    <div className="field">
      <label htmlFor="homepage-select">Homepage</label>
      <select id="homepage-select" value={selected} onChange={(e) => choose(e.target.value)} aria-describedby="homepage-hint">
        <option value="">None</option>
        {groups.length === 0 && !orphan ? pageOptions : pages.length > 0 && <optgroup label="Pages">{pageOptions}</optgroup>}
        {groups.map((g) => (
          <optgroup key={`${g.moduleId}/${g.kind}`} label={`${g.moduleLabel} · ${g.kindLabel}`}>
            {g.entries.map((e) => (
              <option key={e.id} value={homepageOptionValue({ moduleId: g.moduleId, kind: g.kind, entityId: e.id })} title={e.hint}>
                {e.label}
              </option>
            ))}
          </optgroup>
        ))}
        {orphan && (
          <option value={homepageOptionValue(orphan)}>
            {`${orphan.moduleLabel ?? orphan.moduleId} · ${orphan.label ?? orphan.entityId}${orphan.ok ? '' : ` (${problemOf(orphan).text.toLowerCase()})`}`}
          </option>
        )}
      </select>
      {problem && (
        <span className="field-hint" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${problem.level === 'error' ? 'badge-danger' : 'badge-warning'}`}>
            {problem.level === 'error' ? '⚠ ' : ''}{problem.text}
          </span>
          <span>Visitors to / get the site&apos;s welcome screen until you choose another homepage.</span>
        </span>
      )}
      <span id="homepage-hint" className="field-hint">
        What the root URL (/) shows: an info page, or content from a module, which / then sends visitors on to.
      </span>
    </div>
  )
}
