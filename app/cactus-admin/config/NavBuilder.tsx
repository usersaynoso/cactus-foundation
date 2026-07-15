'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EditorNavSection, NavVisibilityMode, AdminMenuConfig } from '@/lib/nav/admin-menu'

type Role = { id: string; name: string; isProtected: boolean }

type Props = {
  sections: EditorNavSection[]
  roles: Role[]
}

type WorkItem = {
  id: string
  defaultLabel: string
  label: string
  isModule: boolean
  mode: NavVisibilityMode
  roleIds: string[]
}
type WorkSection = {
  id: string
  defaultLabel: string | null
  label: string
  items: WorkItem[]
}

const MODE_OPTIONS: Array<{ value: NavVisibilityMode; label: string }> = [
  { value: 'default', label: 'Default (based on permissions)' },
  { value: 'everyone', label: 'Everyone with admin access' },
  { value: 'admin', label: 'Administrators only' },
  { value: 'roles', label: 'Only chosen roles' },
  { value: 'hidden', label: 'Hidden from the menu' },
]

function initWork(sections: EditorNavSection[]): WorkSection[] {
  return sections.map((s) => ({
    id: s.id,
    defaultLabel: s.defaultLabel,
    label: s.label ?? '',
    items: s.items.map((it) => ({
      id: it.id,
      defaultLabel: it.defaultLabel,
      label: it.label ?? '',
      isModule: it.isModule,
      mode: it.visibility.mode,
      roleIds: it.visibility.roleIds ?? [],
    })),
  }))
}

function toConfig(work: WorkSection[]): AdminMenuConfig {
  const items: AdminMenuConfig['items'] = {}
  const sections: AdminMenuConfig['sections'] = {}
  work.forEach((sec, si) => {
    const secOverride: AdminMenuConfig['sections'][string] = { order: si }
    const secLabel = sec.label.trim()
    if (sec.defaultLabel !== null && secLabel && secLabel !== sec.defaultLabel) secOverride.label = secLabel
    sections[sec.id] = secOverride
    sec.items.forEach((it, ii) => {
      const override: AdminMenuConfig['items'][string] = { order: ii }
      const itLabel = it.label.trim()
      if (itLabel && itLabel !== it.defaultLabel) override.label = itLabel
      if (it.mode !== 'default') {
        override.visibility = it.mode === 'roles' ? { mode: 'roles', roleIds: it.roleIds } : { mode: it.mode }
      }
      items[it.id] = override
    })
  })
  return { items, sections }
}

export default function NavBuilder({ sections, roles }: Props) {
  const router = useRouter()
  const [work, setWork] = useState<WorkSection[]>(() => initWork(sections))
  const [savedJson, setSavedJson] = useState<string>(() => JSON.stringify(toConfig(initWork(sections))))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)

  const selectableRoles = useMemo(() => roles.filter((r) => !r.isProtected), [roles])
  const currentJson = useMemo(() => JSON.stringify(toConfig(work)), [work])
  const dirty = currentJson !== savedJson

  function update(next: WorkSection[]) {
    setWork(next)
    setResetArmed(false)
  }

  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= work.length) return
    const next = [...work]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    update(next)
  }

  function moveItem(sectionIndex: number, itemIndex: number, dir: -1 | 1) {
    const items = work[sectionIndex]!.items
    const target = itemIndex + dir
    if (target < 0 || target >= items.length) return
    const nextItems = [...items]
    ;[nextItems[itemIndex], nextItems[target]] = [nextItems[target]!, nextItems[itemIndex]!]
    const next = [...work]
    next[sectionIndex] = { ...next[sectionIndex]!, items: nextItems }
    update(next)
  }

  function patchItem(sectionIndex: number, itemIndex: number, patch: Partial<WorkItem>) {
    const next = [...work]
    const items = [...next[sectionIndex]!.items]
    items[itemIndex] = { ...items[itemIndex]!, ...patch }
    next[sectionIndex] = { ...next[sectionIndex]!, items }
    update(next)
  }

  function setSectionLabel(sectionIndex: number, label: string) {
    const next = [...work]
    next[sectionIndex] = { ...next[sectionIndex]!, label }
    update(next)
  }

  function toggleRole(sectionIndex: number, itemIndex: number, roleId: string) {
    const item = work[sectionIndex]!.items[itemIndex]!
    const roleIds = item.roleIds.includes(roleId)
      ? item.roleIds.filter((r) => r !== roleId)
      : [...item.roleIds, roleId]
    patchItem(sectionIndex, itemIndex, { roleIds })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = toConfig(work)
      const res = await fetch('/api/admin/navigation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save the menu')
      }
      setSavedJson(JSON.stringify(payload))
      setFlash(true)
      setTimeout(() => setFlash(false), 2500)
      // Re-render the admin layout so the sidebar reflects the new menu at once.
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the menu')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/navigation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: {}, sections: {} }),
      })
      if (!res.ok) throw new Error('Could not reset the menu')
      // Full reload so the editor re-reads the default order/labels from the server.
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the menu')
      setSaving(false)
      setResetArmed(false)
    }
  }

  return (
    <div className="navb">
      <p className="navb-intro">
        Reorder, rename and control who sees each item in the admin menu on the left. Drag isn’t needed - use the
        arrows to move things. Administrators always see every item, so you can’t lock yourself out.
      </p>

      <div className="navb-actionbar">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save menu'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={reset} disabled={saving}>
          {resetArmed ? 'Click again to reset everything' : 'Reset to defaults'}
        </button>
        {dirty && !saving && <span className="navb-status navb-status--dirty">Unsaved changes</span>}
        {flash && <span className="navb-status navb-status--ok">Saved</span>}
        {error && <span className="navb-status navb-status--err">{error}</span>}
      </div>

      <div className="navb-sections">
        {work.map((section, si) => (
          <div className="navb-section" key={section.id}>
            <div className="navb-section-head">
              <div className="navb-move">
                <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0} aria-label="Move section up" title="Move section up">↑</button>
                <button type="button" onClick={() => moveSection(si, 1)} disabled={si === work.length - 1} aria-label="Move section down" title="Move section down">↓</button>
              </div>
              {section.defaultLabel === null ? (
                <span className="navb-section-name navb-section-name--fixed">Top of menu</span>
              ) : (
                <input
                  className="navb-section-name"
                  value={section.label}
                  placeholder={section.defaultLabel}
                  onChange={(e) => setSectionLabel(si, e.target.value)}
                  aria-label={`Rename the ${section.defaultLabel} section`}
                />
              )}
            </div>

            {section.items.length === 0 ? (
              <p className="navb-empty">No items in this section.</p>
            ) : (
              <ul className="navb-items">
                {section.items.map((item, ii) => (
                  <li className="navb-item" key={item.id}>
                    <div className="navb-item-main">
                      <div className="navb-move">
                        <button type="button" onClick={() => moveItem(si, ii, -1)} disabled={ii === 0} aria-label="Move item up" title="Move item up">↑</button>
                        <button type="button" onClick={() => moveItem(si, ii, 1)} disabled={ii === section.items.length - 1} aria-label="Move item down" title="Move item down">↓</button>
                      </div>
                      <input
                        className="navb-item-name"
                        value={item.label}
                        placeholder={item.defaultLabel}
                        onChange={(e) => patchItem(si, ii, { label: e.target.value })}
                        aria-label={`Rename ${item.defaultLabel}`}
                      />
                      {item.isModule && <span className="navb-badge">Module</span>}
                      <select
                        className="navb-visibility"
                        value={item.mode}
                        onChange={(e) => patchItem(si, ii, { mode: e.target.value as NavVisibilityMode })}
                        aria-label={`Who can see ${item.defaultLabel}`}
                      >
                        {MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    {item.mode === 'roles' && (
                      <div className="navb-roles">
                        {selectableRoles.length === 0 ? (
                          <span className="navb-roles-empty">No roles yet - create some under Users, then choose them here.</span>
                        ) : (
                          selectableRoles.map((role) => (
                            <label key={role.id} className="navb-role">
                              <input
                                type="checkbox"
                                checked={item.roleIds.includes(role.id)}
                                onChange={() => toggleRole(si, ii, role.id)}
                              />
                              {role.name}
                            </label>
                          ))
                        )}
                        <span className="navb-roles-note">Administrators always have access.</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
