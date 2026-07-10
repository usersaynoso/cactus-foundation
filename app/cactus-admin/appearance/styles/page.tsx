'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { DesignTokens, GlobalColour, GlobalFont, Typo, ColourPreset, StatusKey, StatusColour } from '@/lib/design/tokens'
import { DEFAULT_DESIGN_TOKENS, COLOUR_PRESETS, STATUS_KEYS, buildFontHref } from '@/lib/design/tokens'
import { useUnsavedChanges } from '@/components/admin/useUnsavedChanges'
import { UnsavedChangesModal } from '@/components/admin/UnsavedChangesModal'
import { TabStrip } from '@/components/admin/TabStrip'
import { ColourPickerRow } from '@/components/admin/ColourPickerRow'
import { BrandingTab, useBrandingState } from './BrandingTab'
import GOOGLE_FONTS from '@/lib/design/google-fonts.json'
import { POPULAR_FONTS, MAX_FONT_SEARCH_RESULTS } from '@/lib/design/font-options'

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

function matchesColourSnapshot(
  p: Omit<ColourPreset, 'id' | 'name'>,
  snap: { primary: { light: string; dark: string }; linkColour: string; linkHoverColour: string; linkColourDark: string; linkHoverColourDark: string }
): boolean {
  return p.primary.light === snap.primary.light && p.primary.dark === snap.primary.dark &&
    p.linkColour === snap.linkColour && p.linkHoverColour === snap.linkHoverColour &&
    p.linkColourDark === snap.linkColourDark && p.linkHoverColourDark === snap.linkHoverColourDark
}

export default function StylesPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_DESIGN_TOKENS)
  const [activeTab, setActiveTab] = useState<'branding' | 'colours' | 'typography' | 'headings' | 'buttons' | 'images' | 'formFields' | 'spacing'>('branding')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [openHeadings, setOpenHeadings] = useState<Set<string>>(new Set(['h1']))
  // Branding lives on its own endpoint (config.manage) with its own Save button,
  // but shares the page's unsaved-changes guard so navigating away with unsaved
  // branding edits still prompts.
  const branding = useBrandingState()
  const { dirtyRef, pendingHref, setPendingHref } = useUnsavedChanges(() => branding.dirty)
  const presetsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  type UserPreset = { id: string; name: string; tokens: Omit<ColourPreset, 'id' | 'name'> }
  const [userPresets, setUserPresets] = useState<UserPreset[]>([])
  const [presetModalOpen, setPresetModalOpen] = useState(false)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [presetSaving, setPresetSaving] = useState(false)
  const [presetError, setPresetError] = useState('')

  useEffect(() => {
    fetch('/api/admin/appearance/presets')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setUserPresets(d) })
      .catch(() => {})
  }, [])

  const currentColourSnapshot = useMemo(() => {
    const primaryColour = tokens.designSystem.colours.find(c => c.id === 'primary')
      ?? tokens.designSystem.colours[0]
    if (!primaryColour) return null
    return {
      primary: { light: primaryColour.light, dark: primaryColour.dark },
      linkColour: tokens.themeStyle.links.colour ?? '',
      linkHoverColour: tokens.themeStyle.links.hoverColour ?? '',
      linkColourDark: tokens.themeStyle.links.colourDark ?? '',
      linkHoverColourDark: tokens.themeStyle.links.hoverColourDark ?? '',
    }
  }, [tokens])

  // A user preset match wins over a default preset match with identical values,
  // since only one card should show as active at a time.
  const activeUserPreset = useMemo(() => {
    if (!currentColourSnapshot) return null
    return userPresets.find(p => matchesColourSnapshot(p.tokens, currentColourSnapshot)) ?? null
  }, [userPresets, currentColourSnapshot])

  const activePreset = useMemo(() => {
    if (activeUserPreset || !currentColourSnapshot) return null
    return COLOUR_PRESETS.find(p => matchesColourSnapshot(p, currentColourSnapshot)) ?? null
  }, [activeUserPreset, currentColourSnapshot])

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
        if (d.designTokens?.version === 2) {
          const loaded = d.designTokens as DesignTokens
          const dsp = DEFAULT_DESIGN_TOKENS.themeStyle.spacing!
          // Rows saved before breakpoint/gutter fields existed lack those spacing
          // keys, and this replaces the defaults wholesale - so backfill them from
          // DEFAULT_DESIGN_TOKENS. Without this the fields render blank even though
          // buildTokenStyles applies the same 1024px/640px fallbacks at runtime.
          setTokens({
            ...loaded,
            themeStyle: {
              ...loaded.themeStyle,
              spacing: {
                blockPadding: loaded.themeStyle.spacing?.blockPadding ?? dsp.blockPadding,
                tabletBreakpoint: loaded.themeStyle.spacing?.tabletBreakpoint ?? dsp.tabletBreakpoint,
                mobileBreakpoint: loaded.themeStyle.spacing?.mobileBreakpoint ?? dsp.mobileBreakpoint,
              },
            },
          })
        }
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
    // One leave-prompt covers both forms; save whichever is dirty.
    const tokensOk = dirtyRef.current ? await handleSave() : true
    const brandingOk = branding.dirty ? await branding.save() : true
    if (tokensOk && brandingOk && href) { setPendingHref(null); router.push(href) }
    else setPendingHref(null) // save failed - stay put so the error toast is visible
  }, [pendingHref, handleSave, branding, router, setPendingHref, dirtyRef])

  const handleApplyPreset = useCallback((preset: Omit<ColourPreset, 'id'> & { name: string }) => {
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
          links: { ...t.themeStyle.links, colour: preset.linkColour, hoverColour: preset.linkHoverColour, colourDark: preset.linkColourDark, hoverColourDark: preset.linkHoverColourDark },
        },
      }
    })
    dirtyRef.current = false
    setSaved(false)
  }, [dirtyRef])

  const openSavePresetModal = useCallback(() => {
    setPresetNameInput('')
    setPresetError('')
    setPresetModalOpen(true)
  }, [])

  const submitSavePreset = useCallback(async () => {
    const trimmed = presetNameInput.trim()
    if (!trimmed) { setPresetError('Name required'); return }
    if (!currentColourSnapshot) { setPresetError('No colours to save'); return }
    setPresetSaving(true); setPresetError('')
    try {
      const res = await fetch('/api/admin/appearance/presets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, tokens: currentColourSnapshot }),
      })
      const d = await res.json()
      if (!res.ok) { setPresetError(d.error ?? 'Failed to save preset'); return }
      setUserPresets(ps => [...ps, d])
      setPresetModalOpen(false)
    } catch { setPresetError('Failed to save preset') }
    finally { setPresetSaving(false) }
  }, [presetNameInput, currentColourSnapshot])

  const handleUpdatePreset = useCallback(async (preset: { id: string; name: string }) => {
    if (!currentColourSnapshot) return
    if (!confirm(`Update "${preset.name}" with your current colours?`)) return
    try {
      const res = await fetch(`/api/admin/appearance/presets/${preset.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: currentColourSnapshot }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to update preset'); return }
      setUserPresets(ps => ps.map(p => p.id === preset.id ? d : p))
    } catch { setError('Failed to update preset') }
  }, [currentColourSnapshot])

  const handleDeletePreset = useCallback(async (preset: { id: string; name: string }) => {
    if (!confirm(`Delete the "${preset.name}" preset? This can't be undone.`)) return
    try {
      const res = await fetch(`/api/admin/appearance/presets/${preset.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to delete preset'); return }
      setUserPresets(ps => ps.filter(p => p.id !== preset.id))
    } catch { setError('Failed to delete preset') }
  }, [])

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

  const setStatus = (key: StatusKey, patch: StatusColour) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, status: { ...t.themeStyle.status, [key]: { ...t.themeStyle.status?.[key], ...patch } } } }))
  }

  const setLinks = (patch: Partial<DesignTokens['themeStyle']['links']>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, links: { ...t.themeStyle.links, ...patch } } }))
  }

  const setHeading = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', patch: Record<string, unknown>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, headings: { ...t.themeStyle.headings, [tag]: { ...t.themeStyle.headings[tag], ...patch } } } }))
  }

  const setHeadingsFont = (family: string) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, headingsFont: family || undefined } }))
  }

  const setCaption = (patch: Record<string, unknown>) => {
    dirtyRef.current = true
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, caption: { ...t.themeStyle.caption, ...patch } } }))
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

  // Load the tokens' Google fonts in the admin too, so the sticky previews on
  // the Buttons and Form Fields tabs render with the real typefaces.
  const fontHref = useMemo(() => buildFontHref(tokens), [tokens])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-muted)' }}>Loading…</div>

  return (
    <div>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <div className="page-header">
        <h1 className="page-title">Appearance</h1>
        {activeTab === 'branding' ? (
          <button className="btn btn-primary" onClick={() => { void branding.save() }} disabled={branding.saving}>
            {branding.saving ? 'Saving…' : branding.saved ? '✓ Saved' : 'Save branding'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Styles'}
          </button>
        )}
      </div>

      {(activeTab === 'branding' ? branding.error : error) && (
        <div className="alert alert-danger" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 60, maxWidth: 360, margin: 0, boxShadow: 'var(--shadow-elevated)' }}>
          {activeTab === 'branding' ? branding.error : error}
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

      {presetModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-elevated)', maxWidth: 380, width: '100%', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem', color: 'var(--color-fg)' }}>Save as preset</h2>
            <div className="field" style={{ margin: '0 0 0.75rem' }}>
              <label style={{ fontSize: '0.75rem' }}>Preset name</label>
              <input
                type="text"
                value={presetNameInput}
                onChange={e => setPresetNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitSavePreset() }}
                autoFocus
              />
            </div>
            {presetError && <p style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', margin: '0 0 0.75rem' }}>{presetError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPresetModalOpen(false)} disabled={presetSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={submitSavePreset} disabled={presetSaving}>{presetSaving ? 'Saving…' : 'Save preset'}</button>
            </div>
          </div>
        </div>
      )}

      <TabStrip
        items={([
          ['branding',   'Branding'],
          ['colours',    'Colours'],
          ['typography', 'Fonts & Typography'],
          ['headings',   'Headings'],
          ['buttons',    'Buttons'],
          ['images',     'Images'],
          ['formFields', 'Form Fields'],
          ['spacing',    'Spacing & Breakpoints'],
        ] as const).map(([id, label]) => ({ key: id, label, active: activeTab === id, onClick: () => setActiveTab(id) }))}
      />

      <div style={{ padding: '2rem' }}>

        {activeTab === 'branding' && <BrandingTab b={branding} colours={colours} />}

        {activeTab === 'colours' && (
          <>
            <Section
              title="Colour Presets"
              aside={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {!activePreset && !activeUserPreset && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>Customised</span>}
                  {activeUserPreset ? (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={() => handleUpdatePreset(activeUserPreset)}>Update preset</button>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={openSavePresetModal}>Save as preset</button>
                  )}
                </div>
              }
            >
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Quick-start colour schemes. Applying a preset updates your colour palette and link colours - everything else stays as you left it.</p>
              <div style={{ position: 'relative' }}>
                <div ref={presetsScrollRef} className="no-scrollbar" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {userPresets.map(preset => {
                    const isActive = activeUserPreset?.id === preset.id
                    return (
                      <div key={preset.id} style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset({ name: preset.name, ...preset.tokens })}
                          style={{ border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, padding: '0.625rem 0.875rem', background: isActive ? 'var(--color-success-bg)' : 'var(--color-bg)', cursor: 'pointer', textAlign: 'left', minWidth: 110, fontFamily: 'inherit' }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.375rem', color: 'var(--color-fg)', display: 'flex', alignItems: 'center', gap: '0.375rem', paddingRight: '0.75rem' }}>
                            {preset.name}
                            {isActive && <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)' }}>✓</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.3125rem' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 3, background: preset.tokens.primary.light, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Light mode" />
                            <div style={{ width: 18, height: 18, borderRadius: 3, background: preset.tokens.primary.dark, border: '1px solid var(--color-border)', flexShrink: 0 }} title="Dark mode" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset)}
                          title="Delete preset"
                          style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1 }}
                        >✕</button>
                      </div>
                    )
                  })}
                  {COLOUR_PRESETS.map(preset => {
                    const isActive = !activeUserPreset && activePreset?.id === preset.id
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
              <ColourInput label="Background colour" value={tokens.themeStyle.background.colour} onChange={v => { setBackground({ colour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.background.colourDark} onDarkChange={v => { setBackground({ colourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>

            <Section title="Links">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <ColourInput label="Link colour" value={tokens.themeStyle.links.colour} onChange={v => { setLinks({ colour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.links.colourDark} onDarkChange={v => { setLinks({ colourDark: v || undefined }); setSaved(false) }} colours={colours} />
                <ColourInput label="Hover colour" value={tokens.themeStyle.links.hoverColour} onChange={v => { setLinks({ hoverColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.links.hoverColourDark} onDarkChange={v => { setLinks({ hoverColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              </div>
            </Section>

            <Section title="Status boxes">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Accent colours for the success, warning, error and info boxes (the Callout block). The box background and title tints are derived automatically from each accent, in light and dark mode.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {STATUS_KEYS.map(key => (
                  <ColourInput
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={tokens.themeStyle.status?.[key]?.colour}
                    onChange={v => { setStatus(key, { colour: v || undefined }); setSaved(false) }}
                    dark={tokens.themeStyle.status?.[key]?.colourDark}
                    onDarkChange={v => { setStatus(key, { colourDark: v || undefined }); setSaved(false) }}
                    colours={colours}
                  />
                ))}
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
              <ColourInput label="Text colour" value={tokens.themeStyle.body.colour} onChange={v => { setBody({ colour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.body.colourDark} onDarkChange={v => { setBody({ colourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>

            <Section title="Caption / small text">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Small text for labels, badges, and footnotes. Available anywhere via the Caption block, not just form-field labels.</p>
              <TypoGroup value={tokens.themeStyle.caption ?? {}} onChange={patch => { setCaption(patch as Partial<Typo>); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
              <ColourInput label="Text colour" value={tokens.themeStyle.caption?.colour} onChange={v => { setCaption({ colour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.caption?.colourDark} onDarkChange={v => { setCaption({ colourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>
          </>
        )}

        {activeTab === 'headings' && (
          <>
            <Section title="Headings">
              <div style={{ marginBottom: '1rem' }}>
                <FontPickerField label="Headings font (all headings)" value={tokens.themeStyle.headingsFont ?? ''} onChange={v => { setHeadingsFont(v); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>Applies to every heading level. Set a family on an individual level below to override it. Leave empty to inherit the body font.</p>
              </div>
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
                      <ColourInput label="Colour" value={tokens.themeStyle.headings[tag].colour} onChange={v => { setHeading(tag, { colour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.headings[tag].colourDark} onDarkChange={v => { setHeading(tag, { colourDark: v || undefined }); setSaved(false) }} colours={colours} />
                    </div>
                  )}
                </div>
              ))}
            </Section>

          </>
        )}

        {activeTab === 'buttons' && (
          <>
          <Section title="Buttons">
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Default button appearance for public pages. Individual Puck blocks may override these.</p>
            <TypoGroup value={tokens.themeStyle.buttons.typo} onChange={patch => { setButtonTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <ColourInput label="Text colour" value={tokens.themeStyle.buttons.textColour} onChange={v => { setButtons({ textColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.buttons.textColourDark} onDarkChange={v => { setButtons({ textColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Background colour" value={tokens.themeStyle.buttons.bgColour} onChange={v => { setButtons({ bgColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.buttons.bgColourDark} onDarkChange={v => { setButtons({ bgColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Border colour" value={tokens.themeStyle.buttons.borderColour} onChange={v => { setButtons({ borderColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.buttons.borderColourDark} onDarkChange={v => { setButtons({ borderColourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.75rem' }}>
              <TextField label="Border width" value={tokens.themeStyle.buttons.borderWidth ?? ''} onChange={v => { setButtons({ borderWidth: v || undefined }); setSaved(false) }} hint="e.g. 1px" />
              <TextField label="Border radius" value={tokens.themeStyle.buttons.borderRadius ?? ''} onChange={v => { setButtons({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 6px" />
              <TextField label="Padding" value={tokens.themeStyle.buttons.padding ?? ''} onChange={v => { setButtons({ padding: v || undefined }); setSaved(false) }} hint="e.g. 0.5rem 1rem" />
            </div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--color-fg)' }}>Hover state</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <ColourInput label="Hover text colour" value={tokens.themeStyle.buttons.hover.textColour} onChange={v => { setButtonHover({ textColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.buttons.hover.textColourDark} onDarkChange={v => { setButtonHover({ textColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Hover background" value={tokens.themeStyle.buttons.hover.bgColour} onChange={v => { setButtonHover({ bgColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.buttons.hover.bgColourDark} onDarkChange={v => { setButtonHover({ bgColourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
          </Section>
          <StickyPreview tokens={tokens}>
            {mode => <ButtonsPreview tokens={tokens} mode={mode} />}
          </StickyPreview>
          </>
        )}

        {activeTab === 'images' && (
          <Section title="Images">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <TextField label="Border radius" value={tokens.themeStyle.images.borderRadius ?? ''} onChange={v => { setImages({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 8px" />
              <TextField label="Border width" value={tokens.themeStyle.images.borderWidth ?? ''} onChange={v => { setImages({ borderWidth: v || undefined }); setSaved(false) }} hint="e.g. 1px" />
              <ColourInput label="Border colour" value={tokens.themeStyle.images.borderColour} onChange={v => { setImages({ borderColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.images.borderColourDark} onDarkChange={v => { setImages({ borderColourDark: v || undefined }); setSaved(false) }} colours={colours} />
            </div>
          </Section>
        )}

        {activeTab === 'formFields' && (
          <>
          <Section title="Form fields">
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Styles applied to inputs, textareas, and selects on public pages.</p>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--color-fg)' }}>Label typography</p>
            <TypoGroup value={tokens.themeStyle.formFields.labelTypo} onChange={patch => { setLabelTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <ColourInput label="Label colour" value={tokens.themeStyle.formFields.labelColour} onChange={v => { setFormFields({ labelColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.formFields.labelColourDark} onDarkChange={v => { setFormFields({ labelColourDark: v || undefined }); setSaved(false) }} colours={colours} />
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--color-fg)' }}>Field typography</p>
            <TypoGroup value={tokens.themeStyle.formFields.typo} onChange={patch => { setFieldTypo(patch); setSaved(false) }} globalFonts={tokens.designSystem.fonts} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <ColourInput label="Text colour" value={tokens.themeStyle.formFields.textColour} onChange={v => { setFormFields({ textColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.formFields.textColourDark} onDarkChange={v => { setFormFields({ textColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Background colour" value={tokens.themeStyle.formFields.bgColour} onChange={v => { setFormFields({ bgColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.formFields.bgColourDark} onDarkChange={v => { setFormFields({ bgColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <ColourInput label="Border colour" value={tokens.themeStyle.formFields.borderColour} onChange={v => { setFormFields({ borderColour: v || undefined }); setSaved(false) }} dark={tokens.themeStyle.formFields.borderColourDark} onDarkChange={v => { setFormFields({ borderColourDark: v || undefined }); setSaved(false) }} colours={colours} />
              <TextField label="Border radius" value={tokens.themeStyle.formFields.borderRadius ?? ''} onChange={v => { setFormFields({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 4px" />
            </div>
          </Section>
          <StickyPreview tokens={tokens}>
            {mode => <FormFieldsPreview tokens={tokens} mode={mode} />}
          </StickyPreview>
          </>
        )}

        {activeTab === 'spacing' && (
          <>
            <Section title="Block spacing">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>The default left/right gutter applied to content blocks on public pages, so they don&apos;t run to the screen edges. Individual blocks can override this from their &ldquo;Padding (left/right)&rdquo; setting.</p>
              <div style={{ maxWidth: 260 }}>
                <TextField label="Default block padding (left/right)" value={tokens.themeStyle.spacing?.blockPadding ?? ''} onChange={v => { setSpacing({ blockPadding: v || undefined }); setSaved(false) }} hint="e.g. 1.5rem" />
              </div>
            </Section>

            <Section title="Responsive breakpoints">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Screen widths where the Columns and Split blocks switch to fewer columns, so multi-column layouts stack instead of squeezing on smaller screens. Applies on public pages and in the Pages/Layouts editor preview.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 420 }}>
                <TextField label="Tablet breakpoint" value={tokens.themeStyle.spacing?.tabletBreakpoint ?? ''} onChange={v => { setSpacing({ tabletBreakpoint: v || undefined }); setSaved(false) }} hint="e.g. 1024px" />
                <TextField label="Mobile breakpoint" value={tokens.themeStyle.spacing?.mobileBreakpoint ?? ''} onChange={v => { setSpacing({ mobileBreakpoint: v || undefined }); setSaved(false) }} hint="e.g. 640px" />
              </div>
            </Section>
          </>
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

function ColourInput({ label, value, onChange, dark, onDarkChange, colours }: { label: string; value?: string; onChange: (v: string) => void; dark?: string; onDarkChange?: (v: string) => void; colours: GlobalColour[] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <ColourPickerRow value={value} onChange={onChange} colours={colours} mode="light" placeholder="#000000 or leave empty to inherit" />
      {onDarkChange && (
        <div style={{ marginTop: '0.5rem', paddingLeft: '0.625rem', borderLeft: '2px solid var(--color-border)' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-muted)', display: 'block', marginBottom: '0.375rem' }}>Dark mode override (optional)</label>
          <ColourPickerRow value={dark} onChange={onDarkChange} colours={colours} mode="dark" placeholder="Leave empty to reuse the light colour" />
        </div>
      )}
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

// Inline-style equivalent of a stored Typo, for the sticky previews. They can't
// read the public site's CSS vars (buildTokenStyles isn't loaded in the admin),
// so the current unsaved token values are applied directly - which also means
// the preview updates live as you type, before saving.
function typoStyle(v?: Typo): React.CSSProperties {
  return {
    fontFamily: v?.family || undefined,
    fontWeight: v?.weight || undefined,
    fontSize: v?.size || undefined,
    lineHeight: v?.lineHeight || undefined,
    letterSpacing: v?.letterSpacing || undefined,
    textTransform: (v?.transform || undefined) as React.CSSProperties['textTransform'],
    fontStyle: v?.style || undefined,
    textDecoration: v?.decoration || undefined,
  }
}

// Sticks to the bottom of the viewport while its tab content is scrolled, so
// the effect of each control stays visible. Shows light and dark side by side
// on the site's page background colours.
function StickyPreview({ tokens, children }: { tokens: DesignTokens; children: (mode: 'light' | 'dark') => React.ReactNode }) {
  const bg = tokens.themeStyle.background
  return (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 30, background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', padding: '0.75rem 0 1rem', marginTop: '1rem' }}>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>Live preview</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {(['light', 'dark'] as const).map(mode => (
          <div key={mode} style={{ background: mode === 'light' ? (bg.colour || '#ffffff') : (bg.colourDark || bg.colour || '#0f172a'), border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.875rem 1rem' }}>
            <p style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: mode === 'light' ? '#94a3b8' : '#64748b', margin: '0 0 0.625rem' }}>{mode === 'light' ? 'Light mode' : 'Dark mode'}</p>
            {children(mode)}
          </div>
        ))}
      </div>
    </div>
  )
}

function ButtonsPreview({ tokens, mode }: { tokens: DesignTokens; mode: 'light' | 'dark' }) {
  const b = tokens.themeStyle.buttons
  const pick = (light?: string, dark?: string) => (mode === 'dark' ? dark || light : light)
  const primary = tokens.designSystem.colours.find(c => c.id === 'primary') ?? tokens.designSystem.colours[0]
  const primaryHex = mode === 'dark' ? (primary?.dark || primary?.light) : primary?.light
  // Fallback chain mirrors the Button block's: --btn-bg → --color-primary and
  // --btn-text-color → --color-bg (the page background), plus its shape defaults.
  const base: React.CSSProperties = {
    ...typoStyle(b.typo),
    display: 'inline-block',
    fontWeight: b.typo?.weight || 600,
    fontSize: b.typo?.size || '0.9375rem',
    color: pick(b.textColour, b.textColourDark) || (mode === 'light' ? '#ffffff' : '#0f172a'),
    background: pick(b.bgColour, b.bgColourDark) || primaryHex || '#2c7558',
    border: `${b.borderWidth || '0'} solid ${pick(b.borderColour, b.borderColourDark) || 'transparent'}`,
    borderRadius: b.borderRadius || '6px',
    padding: b.padding || '0.625rem 1.5rem',
    cursor: 'default',
    whiteSpace: 'nowrap',
  }
  const hover: React.CSSProperties = {
    ...base,
    color: pick(b.hover.textColour, b.hover.textColourDark) || base.color,
    background: pick(b.hover.bgColour, b.hover.bgColourDark) || base.background,
  }
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={base}>Button</span>
      <span style={hover}>Hover</span>
    </div>
  )
}

function FormFieldsPreview({ tokens, mode }: { tokens: DesignTokens; mode: 'light' | 'dark' }) {
  const f = tokens.themeStyle.formFields
  const pick = (light?: string, dark?: string) => (mode === 'dark' ? dark || light : light)
  const label: React.CSSProperties = {
    ...typoStyle(f.labelTypo),
    display: 'block',
    fontSize: f.labelTypo?.size || '0.875rem',
    fontWeight: f.labelTypo?.weight || 500,
    color: pick(f.labelColour, f.labelColourDark) || (mode === 'light' ? '#111827' : '#f1f5f9'),
    marginBottom: '0.25rem',
  }
  const field: React.CSSProperties = {
    ...typoStyle(f.typo),
    width: '100%',
    boxSizing: 'border-box',
    fontSize: f.typo?.size || '0.9375rem',
    color: pick(f.textColour, f.textColourDark) || (mode === 'light' ? '#111827' : '#f1f5f9'),
    background: pick(f.bgColour, f.bgColourDark) || (mode === 'light' ? '#ffffff' : '#1e293b'),
    border: `1px solid ${pick(f.borderColour, f.borderColourDark) || (mode === 'light' ? '#d1d5db' : '#475569')}`,
    borderRadius: f.borderRadius || 4,
    padding: '0.5rem 0.75rem',
  }
  return (
    <div>
      <label style={label}>Your name</label>
      <input type="text" readOnly value="Sample text" style={field} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
        <div>
          <label style={label}>Topic</label>
          <select style={field} aria-label="Preview select" defaultValue="general">
            <option value="general">General enquiry</option>
          </select>
        </div>
        <div>
          <label style={label}>Message</label>
          <textarea readOnly rows={1} value="Hello there" style={{ ...field, resize: 'none' }} />
        </div>
      </div>
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
  const matches = search ? (GOOGLE_FONTS as string[]).filter(f => f.toLowerCase().includes(q)) : POPULAR_FONTS
  const filtered = search ? matches.slice(0, MAX_FONT_SEARCH_RESULTS) : matches

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
          {search && matches.length > MAX_FONT_SEARCH_RESULTS && (
            <div style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              {matches.length - MAX_FONT_SEARCH_RESULTS} more match - keep typing to narrow down
            </div>
          )}
        </div>
      )}
    </div>
  )
}
