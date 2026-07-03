'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { DesignTokens, GlobalColour, GlobalFont, Typo, ColourPreset } from '@/lib/design/tokens'
import { DEFAULT_DESIGN_TOKENS, COLOUR_PRESETS } from '@/lib/design/tokens'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'
import { TabStrip } from '@/components/admin/TabStrip'

const POPULAR_FONTS = [
  'system-ui, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Helvetica, sans-serif',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Montserrat',
  'Raleway',
  'Oswald',
  'Nunito',
  'Ubuntu',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
  'Source Serif Pro',
  'PT Sans',
  'PT Serif',
  'Noto Sans',
  'Noto Serif',
  'Libre Baskerville',
  'Libre Franklin',
  'Work Sans',
  'DM Sans',
  'DM Serif Display',
  'Outfit',
  'Figtree',
  'Plus Jakarta Sans',
  'Sora',
  'Space Grotesk',
  'Manrope',
  'Barlow',
  'Josefin Sans',
  'Cormorant Garamond',
  'EB Garamond',
  'Crimson Text',
  'Lora',
  'Bitter',
  'Spectral',
  'Mulish',
  'Quicksand',
  'Cabin',
  'Karla',
  'Rubik',
  'Jost',
  'Lexend',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Fira Sans',
  'Inconsolata',
]

const FONT_WEIGHT_OPTIONS = [
  { value: '100', label: '100 - Thin' },
  { value: '200', label: '200 - Extra Light' },
  { value: '300', label: '300 - Light' },
  { value: '400', label: '400 - Regular' },
  { value: '500', label: '500 - Medium' },
  { value: '600', label: '600 - Semi Bold' },
  { value: '700', label: '700 - Bold' },
  { value: '800', label: '800 - Extra Bold' },
  { value: '900', label: '900 - Black' },
]

const TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
]

const FONT_STYLE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'italic', label: 'Italic' },
  { value: 'oblique', label: 'Oblique' },
]

const TEXT_DECORATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'underline', label: 'Underline' },
  { value: 'overline', label: 'Overline' },
  { value: 'line-through', label: 'Line-through' },
]

export default function StylesPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_DESIGN_TOKENS)
  const [activeTab, setActiveTab] = useState<'colours' | 'typography' | 'headings' | 'buttons' | 'images' | 'formFields' | 'spacing'>('colours')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [openHeadings, setOpenHeadings] = useState<Set<string>>(new Set(['h1']))
  const { dirtyRef, pendingHref, setPendingHref } = useUnsavedChanges()
  const presetsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const activePreset = useMemo(() => {
    const primaryColour = tokens.designSystem.colours.find(c => c.id === 'primary')
      ?? tokens.designSystem.colours[0]
    if (!primaryColour) return null
    return COLOUR_PRESETS.find(p =>
      p.primary.light === primaryColour.light &&
      p.primary.dark === primaryColour.dark &&
      p.linkColour === (tokens.themeStyle.links.colour ?? '') &&
      p.linkHoverColour === (tokens.themeStyle.links.hoverColour ?? '')
    ) ?? null
  }, [tokens])

  useEffect(() => {
    if (loading || activeTab !== 'colours') return
    const el = presetsScrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }
    check()
    el.addEventListener('scroll', check)
    window.addEventListener('resize', check)
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check) }
  }, [loading, activeTab])

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(d => {
        if (d.designTokens?.version === 2) setTokens(d.designTokens as DesignTokens)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load styles'); setLoading(false) })
  }, [])

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch('/api/admin/appearance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designTokens: tokens }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed'); return false }
      setSaved(true); dirtyRef.current = false
      // Re-render the server admin layout so its injected theme (primary colour +
      // font) updates immediately, without needing a manual page reload.
      router.refresh()
      return true
    } catch { setError('Save failed'); return false }
    finally { setSaving(false) }
  }, [tokens, dirtyRef, router])

  const leaveNow = useCallback((href: string) => {
    dirtyRef.current = false
    setPendingHref(null)
    router.push(href)
  }, [router, dirtyRef, setPendingHref])

  const saveAndLeave = useCallback(async () => {
    const href = pendingHref
    const ok = await handleSave()
    if (ok && href) { setPendingHref(null); router.push(href) }
    else setPendingHref(null) // save failed - stay put so the error toast is visible
  }, [pendingHref, handleSave, router, setPendingHref])

  const handleApplyPreset = useCallback((preset: ColourPreset) => {
    if (dirtyRef.current && !confirm(`Apply the "${preset.name}" preset? Your unsaved colour changes will be replaced.`)) return
    setTokens(t => {
      const hasPrimary = t.designSystem.colours.some(c => c.id === 'primary')
      return {
        ...t,
        designSystem: {
          ...t.designSystem,
          colours: t.designSystem.colours.map((c, i) =>
            (c.id === 'primary' || (!hasPrimary && i === 0))
              ? { ...c, light: preset.primary.light, dark: preset.primary.dark }
              : c
          ),
        },
        themeStyle: {
          ...t.themeStyle,
          links: { ...t.themeStyle.links, colour: preset.linkColour, hoverColour: preset.linkHoverColour },
        },
      }
    })
    dirtyRef.current = false
    setSaved(false)
  }, [dirtyRef])

  const setDsColours = (colours: GlobalColour[]) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, designSystem: { ...t.designSystem, colours } }))
  }

  const setDsFonts = (fonts: GlobalFont[]) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, designSystem: { ...t.designSystem, fonts } }))
  }

  const setBackground = (patch: Partial<DesignTokens['themeStyle']['background']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, background: { ...t.themeStyle.background, ...patch } } }))
  }

  const setBody = (patch: Partial<DesignTokens['themeStyle']['body']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, body: { ...t.themeStyle.body, ...patch } } }))
  }

  const setLinks = (patch: Partial<DesignTokens['themeStyle']['links']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, links: { ...t.themeStyle.links, ...patch } } }))
  }

  const setHeading = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', patch: Record<string, unknown>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, headings: { ...t.themeStyle.headings, [tag]: { ...t.themeStyle.headings[tag], ...patch } } } }))
  }

  const setButtons = (patch: Partial<DesignTokens['themeStyle']['buttons']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, ...patch } } }))
  }

  const setButtonTypo = (patch: Partial<Typo>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, typo: { ...t.themeStyle.buttons.typo, ...patch } } } }))
  }

  const setButtonHover = (patch: Partial<DesignTokens['themeStyle']['buttons']['hover']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, hover: { ...t.themeStyle.buttons.hover, ...patch } } } }))
  }

  const setImages = (patch: Partial<DesignTokens['themeStyle']['images']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, images: { ...t.themeStyle.images, ...patch } } }))
  }

  const setFormFields = (patch: Partial<DesignTokens['themeStyle']['formFields']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, ...patch } } }))
  }

  const setSpacing = (patch: Partial<NonNullable<DesignTokens['themeStyle']['spacing']>>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, spacing: { ...t.themeStyle.spacing, ...patch } } }))
  }

  const setFieldTypo = (patch: Partial<Typo>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, typo: { ...t.themeStyle.formFields.typo, ...patch } } } }))
  }

  const setLabelTypo = (patch: Partial<Typo>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, labelTypo: { ...t.themeStyle.formFields.labelTypo, ...patch } } } }))
  }

  const colours = tokens.designSystem.colours

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-muted)' }}>Loading…</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Styles</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Styles'}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 60, maxWidth: 360, margin: 0, boxShadow: 'var(--shadow-elevated)' }}>
          {error}
        </div>
      )}

      <UnsavedChangesModal
        pendingHref={pendingHref}
        saving={saving}
        message="You have unsaved style changes. Would you like to save them before leaving?"
        onCancel={() => setPendingHref(null)}
        onDiscard={() => leaveNow(pendingHref!)}
        onSave={saveAndLeave}
      />

      <TabStrip
        items={([
          ['colours',    'Colours'],
          ['typography', 'Fonts & Typography'],
          ['headings',   'Headings'],
          ['buttons',    'Buttons'],
          ['images',     'Images'],
          ['formFields', 'Form Fields'],
          ['spacing',    'Spacing'],
        ] as const).map(([id, label]) => ({ key: id, label, active: activeTab === id, onClick: () => setActiveTab(id) }))}
      />

      <div style={{ padding: '2rem' }}>

        {activeTab === 'colours' && (
          <>
            <Section
              title="Colour Presets"
              aside={!activePreset ? <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>Customised</span> : undefined}
            >
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Quick-start colour schemes. Applying a preset updates your colour palette and link colours - everything else stays as you left it.</p>
              <div style={{ position: 'relative' }}>
                <div ref={presetsScrollRef} className="no-scrollbar" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {COLOUR_PRESETS.map(preset => {
                    const isActive = activePreset?.id === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        style={{ border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, padding: '0.625rem 0.875rem', background: isActive ? 'var(--color-success-bg)' : 'var(--color-bg)', cursor: 'pointer', textAlign: 'left', minWidth: 110, fontFamily: 'inherit', flexShrink: 0 }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem', color: 'var(--color-fg)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          {preset.name}
                          {isActive && <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)' }}>✓</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.3125rem' }}>
                          <div style={{ width: 18, height: 18, borderRadius: 3, background: preset.primary.light, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Light mode" />
                          <div style={{ width: 18, height: 18, borderRadius: 3, background: preset.primary.dark, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Dark mode" />
                        </div>
                      </button>
                    )
                  })}
                </div>
                {canScrollLeft && (
                  <>
                    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: '0.25rem', width: 68, background: 'linear-gradient(to right, var(--color-bg) 40%, transparent)', pointerEvents: 'none' }} />
                    <button type="button" onClick={() => presetsScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} aria-label="Scroll presets left" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-fg)', fontSize: '1.125rem', padding: 0, fontFamily: 'inherit' }}>‹</button>
                  </>
                )}
                {canScrollRight && (
                  <>
                    <div aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: '0.25rem', width: 68, background: 'linear-gradient(to left, var(--color-bg) 40%, transparent)', pointerEvents: 'none' }} />
                    <button type="button" onClick={() => presetsScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} aria-label="Scroll presets right" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-fg)', fontSize: '1.125rem', padding: 0, fontFamily: 'inherit' }}>›</button>
                  </>
                )}
              </div>
            </Section>

            <Section title="Global colours">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Named colours with light and dark variants. These become the colour palette available throughout Layouts.</p>
              {tokens.designSystem.colours.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--admin-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Name</label>
                    <input type="text" value={c.name} onChange={e => { setDsColours(colours.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setSaved(false) }} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Light mode</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={c.light.startsWith('#') ? c.light : '#ffffff'} onChange={e => { setDsColours(colours.map((x, j) => j === i ? { ...x, light: e.target.value } : x)); setSaved(false) }} style={{ width: 32, height: 32, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                      <input type="text" value={c.light} onChange={e => { setDsColours(colours.map((x, j) => j === i ? { ...x, light: e.target.value } : x)); setSaved(false) }} placeholder="#000000" style={{ fontSize: '0.8125rem' }} />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Dark mode</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={(c.dark || c.light).startsWith('#') ? (c.dark || c.light) : '#ffffff'} onChange={e => { setDsColours(colours.map((x, j) => j === i ? { ...x, dark: e.target.value } : x)); setSaved(false) }} style={{ width: 32, height: 32, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                      <input type="text" value={c.dark} onChange={e => { setDsColours(colours.map((x, j) => j === i ? { ...x, dark: e.target.value } : x)); setSaved(false) }} placeholder="#000000" style={{ fontSize: '0.8125rem' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingBottom: '0.25rem' }}>
                    <div style={{ width: 28, height: 28, background: c.light, borderRadius: 4, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Light" />
                    <div style={{ width: 28, height: 28, background: c.dark || c.light, borderRadius: 4, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Dark" />
                    {colours.length > 1 && (
                      <button onClick={() => { setDsColours(colours.filter((_, j) => j !== i)); setSaved(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', lineHeight: 1 }} title="Remove colour">✕</button>
                    )}
                  </div>
                </div>
              ))}
              {colours.length < 12 && (
                <button onClick={() => { setDsColours([...colours, { id: `colour-${Date.now()}`, name: `Colour ${colours.length + 1}`, light: '#cccccc', dark: '#888888' }]); setSaved(false) }} style={{ background: 'none', border: '1px dashed var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', color: 'var(--color-muted)', fontSize: '0.875rem', fontFamily: 'inherit', width: '100%' }}>
                  + Add colour ({colours.length}/12)
                </button>
              )}
            </Section>

            <Section title="Page background">
              <ColourInput label="Background colour" value={tokens.themeStyle.background.colour} onChange={v => { setBackground({ colour: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>

            <Section title="Links">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <ColourInput label="Link colour" value={tokens.themeStyle.links.colour} onChange={v => { setLinks({ colour: v || undefined }); setSaved(false) }} colours={colours} />
                <ColourInput label="Hover colour" value={tokens.themeStyle.links.hoverColour} onChange={v => { setLinks({ hoverColour: v || undefined }); setSaved(false) }} colours={colours} />
              </div>
            </Section>
          </>
        )}

        {activeTab === 'typography' && (
          <>
            <Section title="Global fonts">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Named font definitions. Reference these when choosing fonts in other typography settings on this page.</p>
              {tokens.designSystem.fonts.map((f, i) => (
                <div key={i} style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--admin-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Name</label>
                      <input type="text" value={f.name} onChange={e => { setDsFonts(tokens.designSystem.fonts.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setSaved(false) }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Weight</label>
                      <select value={f.weight} onChange={e => { setDsFonts(tokens.designSystem.fonts.map((x, j) => j === i ? { ...x, weight: e.target.value } : x)); setSaved(false) }}>
                        {f.weight && !FONT_WEIGHT_OPTIONS.some(o => o.value === f.weight) && (
                          <option value={f.weight}>{f.weight} (custom)</option>
                        )}
                        {FONT_WEIGHT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    {tokens.designSystem.fonts.length > 1 && (
                      <button onClick={() => { setDsFonts(tokens.designSystem.fonts.filter((_, j) => j !== i)); setSaved(false) }} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', lineHeight: 1, alignSelf: 'end', paddingBottom: '0.5rem' }} title="Remove font">✕</button>
                    )}
                  </div>
                  <FontPickerField label="Family" value={f.family} onChange={v => { setDsFonts(tokens.designSystem.fonts.map((x, j) => j === i ? { ...x, family: v } : x)); setSaved(false) }} />
                </div>
              ))}
              <button onClick={() => { setDsFonts([...tokens.designSystem.fonts, { id: `font-${Date.now()}`, name: `Font ${tokens.designSystem.fonts.length + 1}`, family: 'system-ui, sans-serif', weight: '400' }]); setSaved(false) }} style={{ background: 'none', border: '1px dashed var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', color: 'var(--color-muted)', fontSize: '0.875rem', fontFamily: 'inherit', width: '100%' }}>
                + Add font
              </button>
            </Section>

            <Section title="Body text">
              <TypoGroup value={tokens.themeStyle.body} onChange={patch => { setBody(patch as Partial<Typo>); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
              <ColourInput label="Text colour" value={tokens.themeStyle.body.colour} onChange={v => { setBody({ colour: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>
          </>
        )}

        {activeTab === 'headings' && (
          <>
            <Section title="Headings">
              {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map(tag => (
                <div key={tag} style={{ marginBottom: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenHeadings(s => { const n = new Set(s); n.has(tag) ? n.delete(tag) : n.add(tag); return n })}
                    style={{ width: '100%', textAlign: 'left', padding: '0.625rem 0.875rem', background: 'var(--admin-bg-subtle)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--color-fg)' }}
                  >
                    <span>{tag.toUpperCase()}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{openHeadings.has(tag) ? '▲' : '▼'}</span>
                  </button>
                  {openHeadings.has(tag) && (
                    <div style={{ padding: '0.875rem' }}>
                      <TypoGroup value={tokens.themeStyle.headings[tag]} onChange={patch => { setHeading(tag, patch as Record<string, unknown>); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
                      <ColourInput label="Colour" value={tokens.themeStyle.headings[tag].colour} onChange={v => { setHeading(tag, { colour: v || undefined }); setSaved(false) }} colours={colours} />
                    </div>
                  )}
                </div>
              ))}
            </Section>

          </>
        )}

        {activeTab === 'buttons' && (
          <Section title="Buttons">
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Default button appearance for public pages. Individual Puck blocks may override these.</p>
            <TypoGroup value={tokens.themeStyle.buttons.typo} onChange={patch => { setButtonTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <ColourInput label="Text colour" value={tokens.themeStyle.buttons.textColour} onChange={v => { setButtons({ textColour: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Background colour" value={tokens.themeStyle.buttons.bgColour} onChange={v => { setButtons({ bgColour: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Border colour" value={tokens.themeStyle.buttons.borderColour} onChange={v => { setButtons({ borderColour: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.75rem' }}>
              <TextField label="Border width" value={tokens.themeStyle.buttons.borderWidth ?? ''} onChange={v => { setButtons({ borderWidth: v || undefined }); setSaved(false) }} hint="e.g. 1px" />
              <TextField label="Border radius" value={tokens.themeStyle.buttons.borderRadius ?? ''} onChange={v => { setButtons({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 6px" />
              <TextField label="Padding" value={tokens.themeStyle.buttons.padding ?? ''} onChange={v => { setButtons({ padding: v || undefined }); setSaved(false) }} hint="e.g. 0.5rem 1rem" />
            </div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--color-fg)' }}>Hover state</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <ColourInput label="Hover text colour" value={tokens.themeStyle.buttons.hover.textColour} onChange={v => { setButtonHover({ textColour: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Hover background" value={tokens.themeStyle.buttons.hover.bgColour} onChange={v => { setButtonHover({ bgColour: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
          </Section>
        )}

        {activeTab === 'images' && (
          <Section title="Images">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <TextField label="Border radius" value={tokens.themeStyle.images.borderRadius ?? ''} onChange={v => { setImages({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 8px" />
              <TextField label="Border width" value={tokens.themeStyle.images.borderWidth ?? ''} onChange={v => { setImages({ borderWidth: v || undefined }); setSaved(false) }} hint="e.g. 1px" />
              <ColourInput label="Border colour" value={tokens.themeStyle.images.borderColour} onChange={v => { setImages({ borderColour: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
          </Section>
        )}

        {activeTab === 'formFields' && (
          <Section title="Form fields">
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Styles applied to inputs, textareas, and selects on public pages.</p>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--color-fg)' }}>Label typography</p>
            <TypoGroup value={tokens.themeStyle.formFields.labelTypo} onChange={patch => { setLabelTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <ColourInput label="Label colour" value={tokens.themeStyle.formFields.labelColour} onChange={v => { setFormFields({ labelColour: v || undefined }); setSaved(false) }} colours={colours} />
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--color-fg)' }}>Field typography</p>
            <TypoGroup value={tokens.themeStyle.formFields.typo} onChange={patch => { setFieldTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <ColourInput label="Text colour" value={tokens.themeStyle.formFields.textColour} onChange={v => { setFormFields({ textColour: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Background colour" value={tokens.themeStyle.formFields.bgColour} onChange={v => { setFormFields({ bgColour: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Border colour" value={tokens.themeStyle.formFields.borderColour} onChange={v => { setFormFields({ borderColour: v || undefined }); setSaved(false) }} colours={colours} />
              <TextField label="Border radius" value={tokens.themeStyle.formFields.borderRadius ?? ''} onChange={v => { setFormFields({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 4px" />
            </div>
          </Section>
        )}

        {activeTab === 'spacing' && (
          <Section title="Block spacing">
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>The default left/right gutter applied to content blocks on public pages, so they don&apos;t run to the screen edges. Individual blocks can override this from their &ldquo;Padding (left/right)&rdquo; setting.</p>
            <div style={{ maxWidth: 260 }}>
              <TextField label="Default block padding (left/right)" value={tokens.themeStyle.spacing?.blockPadding ?? ''} onChange={v => { setSpacing({ blockPadding: v || undefined }); setSaved(false) }} hint="e.g. 1.5rem" />
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, color: 'var(--color-fg)' }}>{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  )
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const isCustom = !!value && !options.some(o => o.value === value)
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">Inherit</option>
        {isCustom && <option value={value}>{value} (custom)</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function ColourInput({ label, value, onChange, colours }: { label: string; value?: string; onChange: (v: string) => void; colours: GlobalColour[] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.375rem', alignItems: 'center' }}>
        {colours.map(c => (
          <button key={c.id} type="button" title={c.name}
            onClick={() => onChange(value === c.light ? '' : c.light)}
            style={{ width: 24, height: 24, borderRadius: 4, background: c.light, border: value === c.light ? '2px solid var(--color-text)' : '1px solid var(--color-border)', cursor: 'pointer', padding: 0, outline: value === c.light ? '2px solid var(--color-success)' : 'none', outlineOffset: 1, flexShrink: 0 }}
          />
        ))}
        {value && (
          <button type="button" onClick={() => onChange('')}
            style={{ width: 24, height: 24, borderRadius: 4, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', padding: 0, fontSize: '0.625rem', color: 'var(--color-muted)', lineHeight: 1 }}
            title="Clear">✕</button>
        )}
      </div>
      <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="#000000 or leave empty to inherit" />
    </div>
  )
}

function TypoGroup({ value, onChange, globalFonts }: { value: Typo; onChange: (patch: Partial<Typo>) => void; globalFonts?: GlobalFont[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
      <FontPickerField label="Font family" value={value.family ?? ''} onChange={v => onChange({ ...value, family: v || undefined })} globalFonts={globalFonts} />
      <SelectField label="Weight" value={value.weight} onChange={v => onChange({ ...value, weight: v || undefined })} options={FONT_WEIGHT_OPTIONS} />
      <TextField label="Size" value={value.size ?? ''} onChange={v => onChange({ ...value, size: v || undefined })} hint="e.g. 1rem" />
      <TextField label="Line height" value={value.lineHeight ?? ''} onChange={v => onChange({ ...value, lineHeight: v || undefined })} hint="e.g. 1.75" />
      <TextField label="Letter spacing" value={value.letterSpacing ?? ''} onChange={v => onChange({ ...value, letterSpacing: v || undefined })} hint="e.g. 0.05em" />
      <SelectField label="Transform" value={value.transform} onChange={v => onChange({ ...value, transform: v || undefined })} options={TRANSFORM_OPTIONS} />
      <SelectField label="Style" value={value.style} onChange={v => onChange({ ...value, style: v || undefined })} options={FONT_STYLE_OPTIONS} />
      <SelectField label="Decoration" value={value.decoration} onChange={v => onChange({ ...value, decoration: v || undefined })} options={TEXT_DECORATION_OPTIONS} />
    </div>
  )
}

function FontPickerField({ label, value, onChange, globalFonts }: { label: string; value: string; onChange: (v: string) => void; globalFonts?: GlobalFont[] }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = search.toLowerCase()
  // Your named global fonts, offered first so they can be reused by name. Picking
  // one stores its family value (what actually renders).
  const filteredGlobals = (globalFonts ?? []).filter(f =>
    f.family && (!q || f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q))
  )
  const filtered = search
    ? POPULAR_FONTS.filter(f => f.toLowerCase().includes(q))
    : POPULAR_FONTS

  return (
    <div className="field" ref={ref} style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setSearch(e.target.value); setOpen(true) }}
        onFocus={() => { setSearch(''); setOpen(true) }}
        placeholder="e.g. Inter or system-ui, sans-serif"
      />
      <span className="field-hint">Pick one of your fonts, search the list, or enter any CSS font-family value.</span>
      {open && (filteredGlobals.length > 0 || filtered.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {filteredGlobals.length > 0 && (
            <>
              <div style={{ padding: '0.375rem 0.75rem 0.25rem', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>Your fonts</div>
              {filteredGlobals.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(f.family); setOpen(false) }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.4375rem 0.75rem', background: f.family === value ? 'var(--color-success-bg)' : 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: f.family === value ? 'var(--color-success)' : 'var(--color-fg)', fontFamily: f.family.includes(',') ? f.family : `${f.family}, sans-serif` }}
                >
                  <span>{f.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontFamily: 'inherit' }}>{f.family}</span>
                </button>
              ))}
              {filtered.length > 0 && <div style={{ borderTop: '1px solid var(--color-border)', margin: '0.25rem 0' }} />}
            </>
          )}
          {filtered.map(font => (
            <button
              key={font}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(font); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4375rem 0.75rem', background: font === value ? 'var(--color-success-bg)' : 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: font === value ? 'var(--color-success)' : 'var(--color-fg)', fontFamily: font.includes(',') ? font : `${font}, sans-serif` }}
            >
              {font}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
