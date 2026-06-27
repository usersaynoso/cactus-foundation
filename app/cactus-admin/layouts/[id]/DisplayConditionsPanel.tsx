'use client'

import { useState, useEffect } from 'react'

type ConditionType =
  | 'entire_site' | 'homepage' | 'page_id' | 'page_slug'
  | 'module' | 'not_found' | 'coming_soon' | 'maintenance' | 'path_prefix'

type ConditionRule = { type: ConditionType; value?: string }

type DisplayConditions = { include: ConditionRule[]; exclude: ConditionRule[] }

const TYPE_LABELS: Record<ConditionType, string> = {
  entire_site: 'Entire site',
  homepage: 'Homepage',
  page_id: 'Specific page (by ID)',
  page_slug: 'Specific page (by slug)',
  module: 'Module',
  not_found: '404 page',
  coming_soon: 'Coming soon page',
  maintenance: 'Maintenance page',
  path_prefix: 'URL path prefix',
}

const DEFAULT_TYPES: ConditionType[] = ['entire_site', 'homepage', 'page_id', 'page_slug', 'module', 'path_prefix']

const TYPES_BY_LAYOUT: Record<string, ConditionType[]> = {
  infoPage:   DEFAULT_TYPES,
  header:     ['entire_site', 'homepage', 'path_prefix'],
  footer:     ['entire_site', 'homepage', 'path_prefix'],
  notFound:   ['not_found', 'entire_site'],
  statusPage: ['coming_soon', 'maintenance', 'entire_site'],
}

type PageOption = { id: string; title: string; slug: string }

type Props = {
  layoutType: string
  existing: unknown
  onSave: (conditions: DisplayConditions) => void
}

export default function DisplayConditionsPanel({ layoutType, existing, onSave }: Props) {
  const availableTypes: ConditionType[] = TYPES_BY_LAYOUT[layoutType] ?? DEFAULT_TYPES

  const parseExisting = (): DisplayConditions => {
    const c = existing as DisplayConditions | null
    return {
      include: c?.include ?? [],
      exclude: c?.exclude ?? [],
    }
  }

  const [conditions, setConditions] = useState<DisplayConditions>(parseExisting)
  const [pages, setPages] = useState<PageOption[]>([])

  const needsPagePicker = conditions.include.some(r => r.type === 'page_id') ||
    conditions.exclude.some(r => r.type === 'page_id')

  useEffect(() => {
    if (!needsPagePicker) return
    fetch('/api/admin/pages?limit=200')
      .then(r => r.json())
      .then(d => setPages(d.pages ?? []))
      .catch(() => {})
  }, [needsPagePicker])

  function addRule(side: 'include' | 'exclude') {
    const defaultType = availableTypes[0] ?? DEFAULT_TYPES[0] ?? 'entire_site'
    setConditions(c => ({ ...c, [side]: [...c[side], { type: defaultType }] }))
  }

  function removeRule(side: 'include' | 'exclude', i: number) {
    setConditions(c => ({ ...c, [side]: c[side].filter((_, j) => j !== i) }))
  }

  function updateRule(side: 'include' | 'exclude', i: number, patch: Partial<ConditionRule>) {
    setConditions(c => ({
      ...c,
      [side]: c[side].map((r, j) => j === i ? { ...r, ...patch } : r),
    }))
  }

  function summarise(): string {
    if (!conditions.include.length) return 'No include rules - this layout will not be used.'
    return conditions.include
      .map(r => r.type === 'page_slug' || r.type === 'path_prefix' ? `${TYPE_LABELS[r.type]}: ${r.value ?? '…'}` : TYPE_LABELS[r.type])
      .join(', ')
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '1rem', fontSize: '0.8125rem' }}>
      <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Display Conditions
      </div>

      <RuleList
        title="Include"
        rules={conditions.include}
        side="include"
        availableTypes={availableTypes}
        pages={pages}
        onAdd={() => addRule('include')}
        onRemove={(i) => removeRule('include', i)}
        onUpdate={(i, p) => updateRule('include', i, p)}
      />

      <RuleList
        title="Exclude"
        rules={conditions.exclude}
        side="exclude"
        availableTypes={availableTypes}
        pages={pages}
        onAdd={() => addRule('exclude')}
        onRemove={(i) => removeRule('exclude', i)}
        onUpdate={(i, p) => updateRule('exclude', i, p)}
      />

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '0.5rem 0.625rem', fontSize: '0.75rem', color: '#374151', marginBottom: '0.75rem' }}>
        {summarise()}
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', fontSize: '0.8125rem' }}
        onClick={() => onSave(conditions)}
      >
        Save Conditions
      </button>
    </div>
  )
}

type RuleListProps = {
  title: string
  rules: ConditionRule[]
  side: 'include' | 'exclude'
  availableTypes: ConditionType[]
  pages: PageOption[]
  onAdd: () => void
  onRemove: (i: number) => void
  onUpdate: (i: number, patch: Partial<ConditionRule>) => void
}

function RuleList({ title, rules, availableTypes, pages, onAdd, onRemove, onUpdate }: RuleListProps) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
        <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.75rem' }}>{title}</span>
        <button onClick={onAdd} style={{ fontSize: '0.75rem', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem 0.25rem', fontFamily: 'inherit' }}>+ Add</button>
      </div>
      {rules.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 0.375rem' }}>None</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {rules.map((rule, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <select
                value={rule.type}
                onChange={(e) => onUpdate(i, { type: e.target.value as ConditionType, value: undefined })}
                style={{ flex: 1, padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'inherit' }}
              >
                {availableTypes.map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <button onClick={() => onRemove(i)} style={{ padding: '0.25rem 0.375rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', lineHeight: 1, flexShrink: 0 }} title="Remove">✕</button>
            </div>
            {rule.type === 'page_id' && (
              <select
                value={rule.value ?? ''}
                onChange={(e) => onUpdate(i, { value: e.target.value })}
                style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'inherit' }}
              >
                <option value="">Select page…</option>
                {pages.map(p => <option key={p.id} value={p.id}>{p.title} (/{p.slug})</option>)}
              </select>
            )}
            {(rule.type === 'page_slug' || rule.type === 'path_prefix') && (
              <input
                type="text"
                value={rule.value ?? ''}
                onChange={(e) => onUpdate(i, { value: e.target.value })}
                placeholder={rule.type === 'page_slug' ? 'e.g. about' : 'e.g. /blog'}
                style={{ width: '100%', padding: '0.25rem 0.375rem', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
