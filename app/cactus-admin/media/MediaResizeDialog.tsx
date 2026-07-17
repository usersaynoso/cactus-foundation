'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryItem } from './types'
import { useFocusTrap } from './useFocusTrap'
import { filenameOf } from './format'

// "Resize" — scale one or many images down to fit inside a box. The sibling of
// the ratio changer: that one changes an image's shape, this one keeps the shape
// and changes the size. The image keeps its own ratio and is never enlarged, so
// the box is a ceiling rather than a target. The same dialog drives the single
// and bulk paths; only the request it fires and the wording differ.

// Longest-edge presets, in the sizes a website actually wants: a full-width
// banner, a content image, a thumbnail. Labelled by what they're for, because
// "1600" means nothing to someone who just wants their photos smaller.
const PRESETS: { key: string; label: string; hint: string; px: number }[] = [
  { key: '2400', label: 'Extra large', hint: '2400px', px: 2400 },
  { key: '1600', label: 'Large', hint: '1600px', px: 1600 },
  { key: '1000', label: 'Medium', hint: '1000px', px: 1000 },
  { key: '600', label: 'Small', hint: '600px', px: 600 },
]

export type ResizeOutcome = {
  changed: number
  skipped: { reason: string }[]
  failed: number
  mode: 'replace' | 'new'
  bytesSaved: number
}

export default function MediaResizeDialog({
  items,
  onCancel,
  onDone,
  onError,
}: {
  /** One item from the detail panel or context menu; many from the selection bar. */
  items: LibraryItem[]
  onCancel: () => void
  onDone: (outcome: ResizeOutcome) => void
  onError: (message: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef)

  const [presetKey, setPresetKey] = useState('1600')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [mode, setMode] = useState<'replace' | 'new'>('new')
  const [newName, setNewName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  // Media rows carry no width/height, so the source size is read off the preview
  // image once the browser has actually decoded it. Only ever used to inform the
  // user - the server measures the real bytes itself and is the one that decides.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const bulk = items.length > 1
  const preview = items[0]

  // A preset caps the longest edge, which for an unknown mix of portrait and
  // landscape means capping both sides: fit-inside then lets the tighter one win,
  // so the longest edge lands on the preset whichever way round the image is.
  const box = useMemo((): { width: number | null; height: number | null } | null => {
    if (presetKey === 'custom') {
      const w = parseInt(customW, 10)
      const h = parseInt(customH, 10)
      const width = Number.isFinite(w) && w > 0 ? w : null
      const height = Number.isFinite(h) && h > 0 ? h : null
      if (width === null && height === null) return null
      return { width, height }
    }
    const p = PRESETS.find((x) => x.key === presetKey)
    return p ? { width: p.px, height: p.px } : null
  }, [presetKey, customW, customH])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onCancel, saving])

  const defaultName = (preview?.originalName ?? 'image').replace(/\.[^./\\]+$/, '')

  // What the single selected image would come out as — the same fit-inside sum
  // the server will do, so the number shown is the number they get.
  const projected = useMemo(() => {
    if (!natural || !box || bulk) return null
    let scale = 1
    if (box.width !== null) scale = Math.min(scale, box.width / natural.w)
    if (box.height !== null) scale = Math.min(scale, box.height / natural.h)
    if (scale >= 1) return null
    return { w: Math.max(1, Math.round(natural.w * scale)), h: Math.max(1, Math.round(natural.h * scale)) }
  }, [natural, box, bulk])

  const alreadySmaller = !bulk && natural !== null && box !== null && projected === null
  const sizeSuffix = projected ? `${projected.w}x${projected.h}` : 'resized'

  async function run() {
    const first = items[0]
    if (!box || !first) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { width: box.width, height: box.height, mode }
      // A single shared name across a bulk run would just collide, so bulk 'new'
      // lets the server suffix each file with its own new size instead.
      if (mode === 'new' && !bulk) body.newName = newName.trim() || `${defaultName} (${sizeSuffix})`

      if (bulk) {
        const res = await fetch('/api/admin/media/bulk-resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, ids: items.map((i) => i.id) }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Resize failed')
        onDone({ changed: d.changed?.length ?? 0, skipped: d.skipped ?? [], failed: d.failed?.length ?? 0, mode, bytesSaved: d.bytesSaved ?? 0 })
      } else {
        const res = await fetch(`/api/admin/media/${first.id}/resize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Resize failed')
        onDone({
          changed: d.changed ? 1 : 0,
          skipped: d.changed ? [] : [{ reason: d.reason ?? 'Nothing to do' }],
          failed: 0,
          mode,
          bytesSaved: d.changed ? Math.max(0, (d.before ?? 0) - (d.after ?? 0)) : 0,
        })
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Resize failed')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={bulk ? `Resize ${items.length} images` : 'Resize image'}
      onClick={() => { if (!saving) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(640px, 94vw)', width: '100%', maxHeight: '92vh', overflow: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>
            {bulk ? `Resize - ${items.length} images` : 'Resize'}
          </h2>
          <button type="button" onClick={() => { if (!saving) onCancel() }} aria-label="Close" style={closeBtn}>×</button>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {bulk ? 'Each image is' : 'The image is'} scaled down to fit the size below, keeping {bulk ? 'their' : 'its'} shape.
          Anything already smaller is left alone - resizing never blows an image up.
        </p>

        {/* Target size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={sectionLabel}>Fit inside</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`btn btn-sm ${presetKey === p.key ? 'btn-primary' : 'btn-secondary'}`}
                title={`Longest edge ${p.hint}`}
                onClick={() => setPresetKey(p.key)}
              >
                {p.label} <span style={{ opacity: 0.7 }}>{p.hint}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>or</span>
            <input
              aria-label="Custom maximum width in pixels"
              value={customW}
              onChange={(e) => { setCustomW(e.target.value.replace(/[^0-9]/g, '')); setPresetKey('custom') }}
              placeholder="Width"
              inputMode="numeric"
              style={sizeInput}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>×</span>
            <input
              aria-label="Custom maximum height in pixels"
              value={customH}
              onChange={(e) => { setCustomH(e.target.value.replace(/[^0-9]/g, '')); setPresetKey('custom') }}
              placeholder="Height"
              inputMode="numeric"
              style={sizeInput}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>px - leave one blank to let it follow along</span>
          </div>
        </div>

        {/* Preview + what they'll actually get */}
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={sectionLabel}>Preview{bulk ? ` (first of ${items.length})` : ''}</span>
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius)', padding: '1rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.altText ?? ''}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={{ maxWidth: '100%', maxHeight: '32vh', objectFit: 'contain', display: 'block' }}
              />
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {bulk
                ? 'Each image is measured on its own, so a picture already under the size is skipped.'
                : natural
                  ? projected
                    ? `${filenameOf(preview)} is ${natural.w}x${natural.h} and would become ${projected.w}x${projected.h}.`
                    : `${filenameOf(preview)} is ${natural.w}x${natural.h}, which already fits - nothing to do.`
                  : `${filenameOf(preview)} - measuring…`}
            </span>
          </div>
        )}

        {/* Save target */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={sectionLabel}>Save as</span>
          <label style={radioRow}>
            <input type="radio" name="resize-mode" checked={mode === 'new'} onChange={() => setMode('new')} style={{ margin: 0 }} />
            <span>{bulk ? 'New copies - the originals stay as they are' : 'A new image - the original stays as it is'}</span>
          </label>
          <label style={radioRow}>
            <input type="radio" name="resize-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ margin: 0 }} />
            <span>{bulk ? 'Replace the originals everywhere they are used' : 'Replace the original everywhere it is used'}</span>
          </label>
          {mode === 'new' && !bulk && (
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`${defaultName} (${sizeSuffix})`}
              aria-label="New filename"
              style={textInput}
            />
          )}
        </div>

        {/* Actions */}
        {confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
              This replaces {bulk ? `${items.length} images` : 'the original image'} everywhere {bulk ? 'they are' : 'it is'} used on the site,
              at the smaller size. It can&apos;t be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={run}>{saving ? 'Working…' : `Yes, replace ${bulk ? 'them' : 'it'}`}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || !box || alreadySmaller}
              title={!box ? 'Pick a size first' : alreadySmaller ? 'This image already fits inside that size' : undefined}
              onClick={() => { if (mode === 'replace') setConfirming(true); else run() }}
            >
              {saving ? 'Working…' : bulk ? `Resize ${items.length} images` : 'Resize'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const sectionLabel: CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }
const sizeInput: CSSProperties = { width: '4.5rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', textAlign: 'center' }
const textInput: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const radioRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-sm)', color: 'var(--color-text)', cursor: 'pointer' }
const closeBtn: CSSProperties = { marginLeft: 'auto', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'inherit' }
