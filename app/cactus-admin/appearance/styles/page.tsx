'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DesignTokens, GlobalColour, GlobalFont, Typo } from '@/lib/design/tokens'
import { DEFAULT_DESIGN_TOKENS } from '@/lib/design/tokens'

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

export default function StylesPage() {
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_DESIGN_TOKENS)
  const [activeTab, setActiveTab] = useState<'design' | 'theme'>('design')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [openHeadings, setOpenHeadings] = useState<Set<string>>(new Set(['h1']))

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then(r => r.json())
      .then(d => {
        if (d.designTokens?.version === 2) setTokens(d.designTokens as DesignTokens)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load styles'); setLoading(false) })
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch('/api/admin/appearance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designTokens: tokens }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
      else setSaved(true)
    } catch { setError('Save failed') }
    finally { setSaving(false) }
  }, [tokens])

  const setDsColours = (colours: GlobalColour[]) =>
    setTokens(t => ({ ...t, designSystem: { ...t.designSystem, colours } }))

  const setDsFonts = (fonts: GlobalFont[]) =>
    setTokens(t => ({ ...t, designSystem: { ...t.designSystem, fonts } }))

  const setBackground = (patch: Partial<DesignTokens['themeStyle']['background']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, background: { ...t.themeStyle.background, ...patch } } }))

  const setBody = (patch: Partial<DesignTokens['themeStyle']['body']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, body: { ...t.themeStyle.body, ...patch } } }))

  const setLinks = (patch: Partial<DesignTokens['themeStyle']['links']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, links: { ...t.themeStyle.links, ...patch } } }))

  const setHeading = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', patch: Record<string, unknown>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, headings: { ...t.themeStyle.headings, [tag]: { ...t.themeStyle.headings[tag], ...patch } } } }))

  const setButtons = (patch: Partial<DesignTokens['themeStyle']['buttons']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, ...patch } } }))

  const setButtonTypo = (patch: Partial<Typo>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, typo: { ...t.themeStyle.buttons.typo, ...patch } } } }))

  const setButtonHover = (patch: Partial<DesignTokens['themeStyle']['buttons']['hover']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, buttons: { ...t.themeStyle.buttons, hover: { ...t.themeStyle.buttons.hover, ...patch } } } }))

  const setImages = (patch: Partial<DesignTokens['themeStyle']['images']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, images: { ...t.themeStyle.images, ...patch } } }))

  const setFormFields = (patch: Partial<DesignTokens['themeStyle']['formFields']>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, ...patch } } }))

  const setFieldTypo = (patch: Partial<Typo>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, typo: { ...t.themeStyle.formFields.typo, ...patch } } } }))

  const setLabelTypo = (patch: Partial<Typo>) =>
    setTokens(t => ({ ...t, themeStyle: { ...t.themeStyle, formFields: { ...t.themeStyle.formFields, labelTypo: { ...t.themeStyle.formFields.labelTypo, ...patch } } } }))

  const colours = tokens.designSystem.colours

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-muted)' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1.25rem', background: 'var(--admin-bg-subtle)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontWeight: 600, color: 'var(--color-fg)', fontSize: '0.9375rem' }}>Styles</span>
        <span style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {error && <span style={{ color: 'var(--color-danger)' }}>{error}</span>}
          {saved && <span style={{ color: 'var(--color-success)' }}>Saved ✓</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.8125rem', padding: '0.375rem 1rem' }}>
            {saving ? 'Saving…' : 'Save Styles'}
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', padding: '0 1.25rem', background: 'var(--color-bg)' }}>
        {(['design', 'theme'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '0.625rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-muted)', fontSize: '0.875rem', fontFamily: 'inherit', marginBottom: -1 }}
          >
            {tab === 'design' ? 'Design System' : 'Theme Style'}
          </button>
        ))}
      </div>

      <div style={{ padding: '2rem', maxWidth: 780 }}>

        {activeTab === 'design' && (
          <>
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

            <Section title="Global fonts">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Named font definitions. Reference these in Theme Style to maintain consistency across the site.</p>
              {tokens.designSystem.fonts.map((f, i) => (
                <div key={i} style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--admin-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Name</label>
                      <input type="text" value={f.name} onChange={e => { setDsFonts(tokens.designSystem.fonts.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setSaved(false) }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Weight</label>
                      <input type="text" value={f.weight} onChange={e => { setDsFonts(tokens.designSystem.fonts.map((x, j) => j === i ? { ...x, weight: e.target.value } : x)); setSaved(false) }} placeholder="400" />
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
          </>
        )}

        {activeTab === 'theme' && (
          <>
            <Section title="Page background">
              <ColourInput label="Background colour" value={tokens.themeStyle.background.colour} onChange={v => { setBackground({ colour: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>

            <Section title="Body / typography">
              <TypoGroup value={tokens.themeStyle.body} onChange={patch => { setBody(patch as Partial<Typo>); setSaved(false) }} />
              <ColourInput label="Text colour" value={tokens.themeStyle.body.colour} onChange={v => { setBody({ colour: v || undefined }); setSaved(false) }} colours={colours} />
            </Section>

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
                      <TypoGroup value={tokens.themeStyle.headings[tag]} onChange={patch => { setHeading(tag, patch as Record<string, unknown>); setSaved(false) }} />
                      <ColourInput label="Colour" value={tokens.themeStyle.headings[tag].colour} onChange={v => { setHeading(tag, { colour: v || undefined }); setSaved(false) }} colours={colours} />
                    </div>
                  )}
                </div>
              ))}
            </Section>

            <Section title="Links">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <ColourInput label="Link colour" value={tokens.themeStyle.links.colour} onChange={v => { setLinks({ colour: v || undefined }); setSaved(false) }} colours={colours} />
                <ColourInput label="Hover colour" value={tokens.themeStyle.links.hoverColour} onChange={v => { setLinks({ hoverColour: v || undefined }); setSaved(false) }} colours={colours} />
              </div>
            </Section>

            <Section title="Buttons">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Default button appearance for public pages. Individual Puck blocks may override these.</p>
              <TypoGroup value={tokens.themeStyle.buttons.typo} onChange={patch => { setButtonTypo(patch); setSaved(false) }} />
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

            <Section title="Images">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <TextField label="Border radius" value={tokens.themeStyle.images.borderRadius ?? ''} onChange={v => { setImages({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 8px" />
                <TextField label="Border width" value={tokens.themeStyle.images.borderWidth ?? ''} onChange={v => { setImages({ borderWidth: v || undefined }); setSaved(false) }} hint="e.g. 1px" />
                <ColourInput label="Border colour" value={tokens.themeStyle.images.borderColour} onChange={v => { setImages({ borderColour: v || undefined }); setSaved(false) }} colours={colours} />
              </div>
            </Section>

            <Section title="Form fields">
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1rem' }}>Styles applied to inputs, textareas, and selects on public pages.</p>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--color-fg)' }}>Label typography</p>
              <TypoGroup value={tokens.themeStyle.formFields.labelTypo} onChange={patch => { setLabelTypo(patch); setSaved(false) }} />
              <ColourInput label="Label colour" value={tokens.themeStyle.formFields.labelColour} onChange={v => { setFormFields({ labelColour: v || undefined }); setSaved(false) }} colours={colours} />
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '1rem 0 0.5rem', color: 'var(--color-fg)' }}>Field typography</p>
              <TypoGroup value={tokens.themeStyle.formFields.typo} onChange={patch => { setFieldTypo(patch); setSaved(false) }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                <ColourInput label="Text colour" value={tokens.themeStyle.formFields.textColour} onChange={v => { setFormFields({ textColour: v || undefined }); setSaved(false) }} colours={colours} />
                <ColourInput label="Background colour" value={tokens.themeStyle.formFields.bgColour} onChange={v => { setFormFields({ bgColour: v || undefined }); setSaved(false) }} colours={colours} />
                <ColourInput label="Border colour" value={tokens.themeStyle.formFields.borderColour} onChange={v => { setFormFields({ borderColour: v || undefined }); setSaved(false) }} colours={colours} />
                <TextField label="Border radius" value={tokens.themeStyle.formFields.borderRadius ?? ''} onChange={v => { setFormFields({ borderRadius: v || undefined }); setSaved(false) }} hint="e.g. 4px" />
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--color-fg)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>{title}</h2>
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

function TypoGroup({ value, onChange }: { value: Typo; onChange: (patch: Partial<Typo>) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
      <FontPickerField label="Font family" value={value.family ?? ''} onChange={v => onChange({ ...value, family: v || undefined })} />
      <TextField label="Weight" value={value.weight ?? ''} onChange={v => onChange({ ...value, weight: v || undefined })} hint="e.g. 400 or 700" />
      <TextField label="Size" value={value.size ?? ''} onChange={v => onChange({ ...value, size: v || undefined })} hint="e.g. 1rem" />
      <TextField label="Line height" value={value.lineHeight ?? ''} onChange={v => onChange({ ...value, lineHeight: v || undefined })} hint="e.g. 1.75" />
      <TextField label="Letter spacing" value={value.letterSpacing ?? ''} onChange={v => onChange({ ...value, letterSpacing: v || undefined })} hint="e.g. 0.05em" />
      <TextField label="Transform" value={value.transform ?? ''} onChange={v => onChange({ ...value, transform: v || undefined })} hint="uppercase / lowercase / capitalize" />
      <TextField label="Style" value={value.style ?? ''} onChange={v => onChange({ ...value, style: v || undefined })} hint="italic / normal" />
      <TextField label="Decoration" value={value.decoration ?? ''} onChange={v => onChange({ ...value, decoration: v || undefined })} hint="underline / none" />
    </div>
  )
}

function FontPickerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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

  const filtered = search
    ? POPULAR_FONTS.filter(f => f.toLowerCase().includes(search.toLowerCase()))
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
      <span className="field-hint">Type to search or enter any CSS font-family value.</span>
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
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
