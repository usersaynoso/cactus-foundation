'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryItem } from './types'
import { useFocusTrap } from './useFocusTrap'
import { runBulkImageJob } from './bulkImageJob'

// "Change ratio" — reshape one or many images to a new aspect ratio by padding
// them out. Nothing is cropped and nothing is stretched, which is the whole
// point: the image stays whole and the new shape is made up of padding around it.
// The same dialog drives the single-item and bulk paths; only the request it
// fires and the wording differ.

const PRESETS: { key: string; label: string; w: number; h: number }[] = [
  { key: '1:1', label: '1:1', w: 1, h: 1 },
  { key: '3:2', label: '3:2', w: 3, h: 2 },
  { key: '4:3', label: '4:3', w: 4, h: 3 },
  { key: '16:9', label: '16:9', w: 16, h: 9 },
  { key: '2:3', label: '2:3', w: 2, h: 3 },
  { key: '3:4', label: '3:4', w: 3, h: 4 },
  { key: '9:16', label: '9:16', w: 9, h: 16 },
]

type FillKind = 'blur' | 'colour' | 'transparent'

// Only these formats can carry transparency — mirrors supportsTransparentFill
// server-side. A transparent pad on a JPEG would come out black.
const ALPHA_CAPABLE = new Set(['image/png', 'image/webp', 'image/avif', 'image/gif'])

export type AspectOutcome = { changed: number; skipped: { reason: string }[]; failed: number; mode: 'replace' | 'new' }

export default function MediaAspectDialog({
  items,
  onCancel,
  onDone,
  onError,
}: {
  /** One item from the detail panel or context menu; many from the selection bar. */
  items: LibraryItem[]
  onCancel: () => void
  onDone: (outcome: AspectOutcome) => void
  onError: (message: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef)

  const [presetKey, setPresetKey] = useState('1:1')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [fillChoice, setFillChoice] = useState<FillKind>('blur')
  const [colour, setColour] = useState('#ffffff')
  const [mode, setMode] = useState<'replace' | 'new'>('new')
  const [newName, setNewName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  // How far a bulk run has got. Reshaping a few hundred images is a long wait,
  // and a button that just says "Working…" for all of it looks like a hang.
  const [progress, setProgress] = useState(0)

  const bulk = items.length > 1
  const preview = items[0]

  // Transparency is only offered when every selected image can actually hold it.
  // Derived rather than corrected after the fact, so an unusable choice can't be
  // held in state and sent: a JPEG in the selection falls back to blur.
  const anyOpaque = items.some((i) => !ALPHA_CAPABLE.has(i.mimeType))
  const fillKind: FillKind = anyOpaque && fillChoice === 'transparent' ? 'blur' : fillChoice

  const ratio = useMemo(() => {
    if (presetKey === 'custom') {
      const w = parseFloat(customW)
      const h = parseFloat(customH)
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
      return { w, h }
    }
    const p = PRESETS.find((x) => x.key === presetKey)
    return p ? { w: p.w, h: p.h } : null
  }, [presetKey, customW, customH])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onCancel, saving])

  const defaultName = (preview?.originalName ?? 'image').replace(/\.[^./\\]+$/, '')
  const ratioText = ratio ? `${ratio.w}:${ratio.h}` : ''
  const workingLabel = bulk ? `Working… ${progress}/${items.length}` : 'Working…'

  function fillPayload() {
    if (fillKind === 'colour') return { kind: 'colour', colour }
    return { kind: fillKind }
  }

  async function run() {
    const first = items[0]
    if (!ratio || !first) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { ratioW: ratio.w, ratioH: ratio.h, fill: fillPayload(), mode }
      // A single shared name across a bulk run would just collide, so bulk 'new'
      // lets the server suffix each file with the ratio instead.
      if (mode === 'new' && !bulk) body.newName = newName.trim() || `${defaultName} (${ratioText.replace(':', '-')})`

      if (bulk) {
        // Six images reshaped at a time rather than the lot in one long request.
        const tally = await runBulkImageJob(
          '/api/admin/media/bulk-aspect',
          items.map((i) => i.id),
          body,
          { onProgress: (done) => setProgress(done) },
        )
        onDone({ changed: tally.changed.length, skipped: tally.skipped, failed: tally.failed.length, mode })
      } else {
        const res = await fetch(`/api/admin/media/${first.id}/aspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Ratio change failed')
        onDone({ changed: d.changed ? 1 : 0, skipped: d.changed ? [] : [{ reason: d.reason ?? 'Nothing to do' }], failed: 0, mode })
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Ratio change failed')
      setProgress(0)
      setSaving(false)
    }
  }

  // The preview reproduces what the server does: the image contained whole
  // inside a box of the target ratio, padding showing around it.
  const padBackground = fillKind === 'colour'
    ? colour
    : fillKind === 'transparent'
      ? 'repeating-conic-gradient(var(--color-border) 0% 25%, var(--color-surface) 0% 50%) 50% / 16px 16px'
      : 'var(--color-bg-subtle)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={bulk ? `Change ratio of ${items.length} images` : 'Change image ratio'}
      onClick={() => { if (!saving) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(720px, 94vw)', width: '100%', maxHeight: '92vh', overflow: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>
            {bulk ? `Change ratio - ${items.length} images` : 'Change ratio'}
          </h2>
          <button type="button" onClick={() => { if (!saving) onCancel() }} aria-label="Close" style={closeBtn}>×</button>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          The image is padded out to the new shape. Nothing is cropped off and nothing is squashed.
        </p>

        {/* Target ratio */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={sectionLabel}>New ratio</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`btn btn-sm ${presetKey === p.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPresetKey(p.key)}
              >
                {p.label}
              </button>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.25rem' }}>
              <input aria-label="Custom ratio width" value={customW} onChange={(e) => { setCustomW(e.target.value.replace(/[^0-9.]/g, '')); setPresetKey('custom') }} placeholder="W" inputMode="decimal" style={ratioInput} />
              <span style={{ color: 'var(--color-text-muted)' }}>:</span>
              <input aria-label="Custom ratio height" value={customH} onChange={(e) => { setCustomH(e.target.value.replace(/[^0-9.]/g, '')); setPresetKey('custom') }} placeholder="H" inputMode="decimal" style={ratioInput} />
            </span>
          </div>
        </div>

        {/* Padding fill */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={sectionLabel}>Fill the space with</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            <button type="button" className={`btn btn-sm ${fillKind === 'blur' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFillChoice('blur')}>Blurred image</button>
            <button type="button" className={`btn btn-sm ${fillKind === 'colour' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFillChoice('colour')}>Colour</button>
            <button
              type="button"
              className={`btn btn-sm ${fillKind === 'transparent' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={anyOpaque}
              title={anyOpaque ? "JPEGs can't hold transparency - pick a colour or blur" : undefined}
              onClick={() => setFillChoice('transparent')}
            >
              Transparent
            </button>
            {fillKind === 'colour' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.25rem' }}>
                <input type="color" aria-label="Padding colour" value={colour} onChange={(e) => setColour(e.target.value)} style={{ width: '2.2rem', height: '2.2rem', padding: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', cursor: 'pointer' }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColour('#ffffff')}>White</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColour('#000000')}>Black</button>
              </span>
            )}
          </div>
          {anyOpaque && fillKind !== 'transparent' && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Transparent is off because {bulk ? 'some of these are' : 'this is'} a JPEG, which can&apos;t hold it.
            </span>
          )}
        </div>

        {/* Preview */}
        {preview && ratio && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={sectionLabel}>Preview{bulk ? ` (first of ${items.length})` : ''}</span>
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius)', padding: '1rem' }}>
              <div style={{ position: 'relative', aspectRatio: `${ratio.w} / ${ratio.h}`, maxHeight: '38vh', maxWidth: '100%', background: padBackground, border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {fillKind === 'blur' && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={preview.url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px)', transform: 'scale(1.1)' }} />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.url} alt={preview.altText ?? ''} style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
            </div>
          </div>
        )}

        {/* Save target */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={sectionLabel}>Save as</span>
          <label style={radioRow}>
            <input type="radio" name="aspect-mode" checked={mode === 'new'} onChange={() => setMode('new')} style={{ margin: 0 }} />
            <span>{bulk ? 'New copies - the originals stay as they are' : 'A new image - the original stays as it is'}</span>
          </label>
          <label style={radioRow}>
            <input type="radio" name="aspect-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ margin: 0 }} />
            <span>{bulk ? 'Replace the originals everywhere they are used' : 'Replace the original everywhere it is used'}</span>
          </label>
          {mode === 'new' && !bulk && (
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`${defaultName} (${ratioText.replace(':', '-') || 'ratio'})`}
              aria-label="New filename"
              style={textInput}
            />
          )}
        </div>

        {/* Actions */}
        {confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
              This replaces {bulk ? `${items.length} images` : 'the original image'} everywhere {bulk ? 'they are' : 'it is'} used on the site. It can&apos;t be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={run}>{saving ? workingLabel : `Yes, replace ${bulk ? 'them' : 'it'}`}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || !ratio}
              title={!ratio ? 'Pick a ratio first' : undefined}
              onClick={() => { if (mode === 'replace') setConfirming(true); else run() }}
            >
              {saving ? workingLabel : bulk ? `Change ${items.length} images` : 'Change ratio'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const sectionLabel: CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }
const ratioInput: CSSProperties = { width: '3rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', textAlign: 'center' }
const textInput: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const radioRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-sm)', color: 'var(--color-text)', cursor: 'pointer' }
const closeBtn: CSSProperties = { marginLeft: 'auto', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'inherit' }
