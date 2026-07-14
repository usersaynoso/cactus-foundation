'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { TabStrip } from '@/components/admin/TabStrip'
import { LayoutPreview } from '@/components/admin/LayoutPreview'
import { useModuleLayoutGroups } from '@/components/admin/ModuleLayoutGroupsContext'
import { CORE_TYPE_TABS, moduleGroupTabs, CORE_LAYOUT_TYPES } from '@/lib/layout/layout-type-tabs'
import { getStarterTemplates, type StarterTemplate } from '@/lib/layout/starter-templates'

export default function NewLayoutPage() {
  const router = useRouter()
  const adminPath = useAdminPath()
  const searchParams = useSearchParams()

  // Only the modules this site has installed - every build clones every module in
  // modules.json, so the templates for a Shop are sitting right there whether or not
  // the owner has ever installed one. Offering them was how a Shop-less site ended up
  // with a Shop tab and a screenful of Shop starters.
  const moduleGroups = useModuleLayoutGroups()
  const allTabs = useMemo(
    () => [...CORE_TYPE_TABS, ...moduleGroupTabs(moduleGroups)],
    [moduleGroups],
  )

  // Arriving from a tab on the Layouts list lands on the matching tab here. A
  // module's layout type (e.g. gazetteEntry) selects its group tab *and* the
  // sub-tab within it.
  const typeParam = searchParams.get('type')
  const paramGroup = moduleGroups.find((g) => g.types.some((t) => t.key === typeParam)) ?? null
  const initialTop = paramGroup
    ? paramGroup.moduleName
    : CORE_TYPE_TABS.some((t) => t.key === typeParam) ? typeParam! : 'header'

  const [activeTop, setActiveTop] = useState(initialTop)
  const [activeModuleSub, setActiveModuleSub] = useState<string | null>(paramGroup ? typeParam : null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const activeGroup = moduleGroups.find((g) => g.moduleName === activeTop) ?? null
  const activeType = activeGroup
    ? (activeModuleSub ?? activeGroup.types[0]?.key ?? null)
    : activeTop

  const templates = activeType ? getStarterTemplates(activeType) : []

  const blurb = activeGroup
    ? `Pick a starting point for your ${activeGroup.groupLabel.toLowerCase()} pages. You can change everything afterwards.`
    : CORE_LAYOUT_TYPES.find((t) => t.key === activeType)?.description ?? ''

  function handleTopClick(key: string) {
    setActiveTop(key)
    setActiveModuleSub(null)
    setError('')
  }

  async function handleChoose(template: StarterTemplate) {
    if (creatingId || !activeType) return
    setCreatingId(template.id)
    setError('')
    try {
      const res = await fetch('/api/admin/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          type: activeType,
          builderData: template.data,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create the layout')
        setCreatingId(null)
        return
      }
      const layout = await res.json()
      router.push(`/${adminPath}/layouts/${layout.id}`)
    } catch {
      setError('Failed to create the layout')
      setCreatingId(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={() => router.push(`/${adminPath}/layouts`)}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)', padding: 0, marginBottom: '0.75rem', fontFamily: 'inherit' }}
        >
          ← Back to Layouts
        </button>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>New Layout</h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-base)' }}>
          Choose a starting point. It becomes yours to edit the moment you pick it.
        </p>
      </div>

      <TabStrip
        style={{ marginBottom: activeGroup ? '0.75rem' : '1.25rem' }}
        items={allTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          active: activeTop === tab.key,
          onClick: () => handleTopClick(tab.key),
        }))}
      />

      {activeGroup && (
        <TabStrip
          style={{ marginBottom: '1.25rem' }}
          items={activeGroup.types.map((t) => ({
            key: t.key,
            label: t.label,
            active: activeType === t.key,
            onClick: () => { setActiveModuleSub(t.key); setError('') },
          }))}
        />
      )}

      {blurb && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: '0 0 1.25rem', maxWidth: '52ch' }}>
          {blurb}
        </p>
      )}

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {templates.length === 0 ? (
        <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No starting points for this type yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {templates.map((template) => (
            <StarterCard
              key={template.id}
              template={template}
              type={activeType!}
              busy={creatingId !== null}
              creating={creatingId === template.id}
              onChoose={() => handleChoose(template)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StarterCard({
  template, type, busy, creating, onChoose,
}: {
  template: StarterTemplate
  type: string
  busy: boolean
  creating: boolean
  onChoose: () => void
}) {
  // Highlighted on keyboard focus as well as hover: these cards are the only way
  // to create a layout, and tabbing through fourteen identical-looking outlines
  // with no idea which one Enter would pick is not a way to pick one.
  const [active, setActive] = useState(false)

  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={busy}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        textAlign: 'left',
        padding: 0,
        background: 'var(--color-surface)',
        border: `1px solid ${active && !busy ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: busy ? 'default' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        opacity: busy && !creating ? 0.55 : 1,
        transition: 'border-color var(--dur-base), opacity var(--dur-base)',
      }}
      aria-label={`${template.name} - ${template.description}`}
    >
      <div style={{ padding: '0.75rem', background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }}>
        <LayoutPreview type={type} data={template.data} />
      </div>
      <div style={{ padding: '0.875rem 1rem', flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text)', marginBottom: '0.25rem' }}>
          {creating ? 'Creating…' : template.name}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
          {template.description}
        </div>
      </div>
    </button>
  )
}
