'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  CONDITION_TYPE_LABELS as TYPE_LABELS,
  conditionTypesForLayout,
  isCompleteRule,
  type ConditionType,
  type ConditionRule,
  type DisplayConditions,
} from '@/lib/layout/displayConditions'

type PageOption = { id: string; title: string; slug: string }

type Props = {
  layoutType: string
  existing: unknown
  onSave: (conditions: DisplayConditions) => void
  saving?: boolean
  saved?: boolean
}

export default function DisplayConditionsPanel({ layoutType, existing, onSave, saving, saved }: Props) {
  // Which rules this layout type is allowed to be shown by, and what each one is
  // called, both come from lib/layout/displayConditions - the same module the
  // renderer scores against, so the panel cannot offer a rule the site ignores.
  const availableTypes = useMemo(() => conditionTypesForLayout(layoutType), [layoutType])

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
    const defaultType = availableTypes[0] ?? 'entire_site'
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

  // A rule with its value still blank shows the layout on nothing. Saying so here
  // beats letting it through and having Update bounce with a 400 that names no rule.
  const unfinished = [...conditions.include, ...conditions.exclude].filter(r => !isCompleteRule(r)).length

  function summarise(): string {
    const usable = conditions.include.filter(isCompleteRule)
    if (!usable.length) return 'No usable include rules - this layout will not be shown anywhere.'
    return usable
      .map(r => r.type === 'page_slug' || r.type === 'path_prefix' || r.type === 'module'
        ? `${TYPE_LABELS[r.type]}: ${r.value}`
        : TYPE_LABELS[r.type])
      .join(', ')
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '1rem', fontSize: '0.8125rem' }}>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
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

      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
        {summarise()}
      </div>

      {unfinished > 0 && (
        <div style={{ color: 'var(--color-warning)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
          {unfinished === 1 ? 'One rule still needs' : `${unfinished} rules still need`} a value filling in.
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ width: '100%', fontSize: '0.8125rem' }}
        disabled={saving || unfinished > 0}
        onClick={() => onSave(conditions)}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Conditions'}
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
  const fieldStyle = (incomplete: boolean): React.CSSProperties => ({
    width: '100%', padding: '0.25rem 0.375rem',
    border: `1px solid ${incomplete ? 'var(--color-warning)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontFamily: 'inherit',
    background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box',
  })

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>{title}</span>
        <button onClick={onAdd} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--space-1)', fontFamily: 'inherit' }}>+ Add</button>
      </div>
      {rules.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '0 0 0.375rem' }}>None</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {rules.map((rule, i) => {
          const incomplete = !isCompleteRule(rule)
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <select
                  aria-label={`${title} rule ${i + 1}`}
                  value={rule.type}
                  onChange={(e) => onUpdate(i, { type: e.target.value as ConditionType, value: undefined })}
                  style={{ ...fieldStyle(false), flex: 1 }}
                >
                  {availableTypes.map(t => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <button onClick={() => onRemove(i)} style={{ padding: 'var(--space-1)', background: 'none', border: 'none', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: 'var(--text-sm)', lineHeight: 1, flexShrink: 0 }} title="Remove" aria-label={`Remove ${title.toLowerCase()} rule ${i + 1}`}>✕</button>
              </div>
              {rule.type === 'page_id' && (
                <select
                  aria-label="Page"
                  value={rule.value ?? ''}
                  onChange={(e) => onUpdate(i, { value: e.target.value })}
                  style={fieldStyle(incomplete)}
                >
                  <option value="">Select page…</option>
                  {pages.map(p => <option key={p.id} value={p.id}>{p.title} (/{p.slug})</option>)}
                </select>
              )}
              {(rule.type === 'page_slug' || rule.type === 'path_prefix' || rule.type === 'module') && (
                <input
                  type="text"
                  aria-label={TYPE_LABELS[rule.type]}
                  value={rule.value ?? ''}
                  onChange={(e) => onUpdate(i, { value: e.target.value })}
                  placeholder={rule.type === 'page_slug' ? 'e.g. about' : rule.type === 'module' ? 'e.g. shop' : 'e.g. /blog'}
                  style={fieldStyle(incomplete)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
