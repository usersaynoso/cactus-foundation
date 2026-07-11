'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LibraryItem } from './MediaLibrary'

// Aspect presets. `ratio` is width/height; null means free-form (no lock).
const PRESETS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'free', label: 'Free', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '2:3', label: '2:3', ratio: 2 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
]

const MIN = 24 // smallest crop side, in display pixels

type Rect = { x: number; y: number; w: number; h: number }
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// Largest rect of the given aspect that fits `frac` of the display box, centred.
function centredRect(dispW: number, dispH: number, ratio: number | null, frac = 0.85): Rect {
  if (!ratio) {
    const w = dispW * frac
    const h = dispH * frac
    return { x: (dispW - w) / 2, y: (dispH - h) / 2, w, h }
  }
  let w = dispW * frac
  let h = w / ratio
  if (h > dispH * frac) {
    h = dispH * frac
    w = h * ratio
  }
  return { x: (dispW - w) / 2, y: (dispH - h) / 2, w, h }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

export default function MediaImageEditor({
  item,
  onCancel,
  onSaved,
}: {
  item: LibraryItem
  onCancel: () => void
  onSaved: (mode: 'replace' | 'new') => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dispRef = useRef<{ w: number; h: number } | null>(null)
  const ratioRef = useRef<number | null>(null)

  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [ratio, setRatio] = useState<number | null>(null)
  const [activePreset, setActivePreset] = useState('free')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')

  const [saving, setSaving] = useState<'replace' | 'new' | null>(null)
  const [error, setError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [newName, setNewName] = useState('')
  const [naming, setNaming] = useState(false)

  // Measure the rendered image; seed the first crop and keep it proportional
  // across resizes. dispRef/ratioRef mirror the latest values so this stays a
  // []-dep callback without stale reads or setState-in-effect.
  const measure = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const w = img.clientWidth
    const h = img.clientHeight
    if (!w || !h) return
    const prev = dispRef.current
    if (prev && prev.w === w && prev.h === h) return
    dispRef.current = { w, h }
    setDisp({ w, h })
    setCrop((c) => {
      if (!c) return centredRect(w, h, ratioRef.current)
      if (!prev) return c
      const sx = w / prev.w
      const sy = h / prev.h
      return { x: c.x * sx, y: c.y * sy, w: c.w * sx, h: c.h * sy }
    })
  }, [])

  useLayoutEffect(() => {
    const img = imgRef.current
    if (!img) return
    if (img.complete) measure()
    const ro = new ResizeObserver(measure)
    ro.observe(img)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel, saving])

  function applyRatio(key: string, r: number | null) {
    setActivePreset(key)
    setRatio(r)
    ratioRef.current = r
    if (disp) setCrop(centredRect(disp.w, disp.h, r))
  }

  function applyCustom() {
    const w = parseFloat(customW)
    const h = parseFloat(customH)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
    applyRatio('custom', w / h)
  }

  // Pointer drag: move the whole box, or resize from one of the 8 handles,
  // honouring the locked aspect ratio when one is set.
  function startDrag(e: React.PointerEvent, handle: Handle) {
    if (!crop || !disp) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const start = crop
    const l0 = start.x
    const t0 = start.y
    const r0 = start.x + start.w
    const b0 = start.y + start.h

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      if (handle === 'move') {
        setCrop({
          x: clamp(l0 + dx, 0, disp.w - start.w),
          y: clamp(t0 + dy, 0, disp.h - start.h),
          w: start.w,
          h: start.h,
        })
        return
      }

      const left = handle === 'w' || handle === 'nw' || handle === 'sw'
      const right = handle === 'e' || handle === 'ne' || handle === 'se'
      const top = handle === 'n' || handle === 'nw' || handle === 'ne'
      const bottom = handle === 's' || handle === 'sw' || handle === 'se'

      let newL = l0
      let newR = r0
      let newT = t0
      let newB = b0
      if (left) newL = clamp(l0 + dx, 0, r0 - MIN)
      if (right) newR = clamp(r0 + dx, l0 + MIN, disp.w)
      if (top) newT = clamp(t0 + dy, 0, b0 - MIN)
      if (bottom) newB = clamp(b0 + dy, t0 + MIN, disp.h)

      let w = newR - newL
      let h = newB - newT

      if (ratio) {
        // Width drives on corners and E/W handles; height drives on N/S.
        const widthDriven = left || right
        if (widthDriven) {
          h = w / ratio
        } else {
          w = h * ratio
        }
        // Anchor the edge opposite the one being dragged so the box grows the
        // right way, then clamp back inside the frame if the ratio overshot.
        if (left) newL = newR - w
        else newR = newL + w
        if (top) newT = newB - h
        else if (bottom) newB = newT + h
        else {
          // Pure E/W drag: keep vertical centre fixed.
          const cy = (t0 + b0) / 2
          newT = cy - h / 2
          newB = cy + h / 2
        }
        if (!left && !right) {
          // Pure N/S drag: keep horizontal centre fixed.
          const cx = (l0 + r0) / 2
          newL = cx - w / 2
          newR = cx + w / 2
        }
        if (newL < 0 || newR > disp.w || newT < 0 || newB > disp.h) return
      }

      setCrop({ x: newL, y: newT, w: newR - newL, h: newB - newT })
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  async function save(mode: 'replace' | 'new') {
    if (!crop || !disp || !imgRef.current) return
    const scaleX = imgRef.current.naturalWidth / disp.w
    const scaleY = imgRef.current.naturalHeight / disp.h
    const body = {
      mode,
      crop: {
        left: crop.x * scaleX,
        top: crop.y * scaleY,
        width: crop.w * scaleX,
        height: crop.h * scaleY,
      },
      ...(mode === 'new' ? { newName: newName.trim() } : {}),
    }
    setSaving(mode)
    setError('')
    try {
      const res = await fetch(`/api/admin/media/${item.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Edit failed')
      onSaved(mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit failed')
      setSaving(null)
    }
  }

  const handleStyle = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: 12,
    height: 12,
    background: 'var(--color-surface)',
    border: '2px solid var(--color-primary)',
    borderRadius: 2,
    boxSizing: 'border-box',
    ...extra,
  })

  const defaultName = (item.originalName ?? 'image').replace(/\.[^./\\]+$/, '')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit image"
      onClick={() => { if (!saving) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(960px, 94vw)', width: '100%', maxHeight: '92vh', overflow: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>Edit image</h2>
          <button type="button" onClick={() => { if (!saving) onCancel() }} aria-label="Close" style={{ marginLeft: 'auto', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        {/* Ratio presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`btn btn-sm ${activePreset === p.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => applyRatio(p.key, p.ratio)}
            >
              {p.label}
            </button>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.25rem' }}>
            <input
              aria-label="Custom ratio width"
              value={customW}
              onChange={(e) => setCustomW(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="W"
              inputMode="decimal"
              style={ratioInput}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>:</span>
            <input
              aria-label="Custom ratio height"
              value={customH}
              onChange={(e) => setCustomH(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="H"
              inputMode="decimal"
              onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
              style={ratioInput}
            />
            <button
              type="button"
              className={`btn btn-sm ${activePreset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={!customW || !customH}
              onClick={applyCustom}
            >
              Apply
            </button>
          </span>
        </div>

        {/* Image + crop overlay */}
        <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius)', padding: '1rem', overflow: 'hidden' }}>
          <div style={{ position: 'relative', lineHeight: 0, touchAction: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={item.url}
              alt={item.altText ?? ''}
              onLoad={measure}
              draggable={false}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', userSelect: 'none' }}
            />
            {crop && disp && (
              <>
                {/* Shaded area outside the crop - a full overlay with the crop
                    rectangle punched out via an even-odd clip path. */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'var(--color-overlay)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x}px ${crop.y}px, ${crop.x}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y}px, ${crop.x}px ${crop.y}px)` }} />
                <div
                  onPointerDown={(e) => startDrag(e, 'move')}
                  style={{ position: 'absolute', left: crop.x, top: crop.y, width: crop.w, height: crop.h, border: '1px solid var(--color-primary)', boxSizing: 'border-box', cursor: 'move' }}
                >
                  {/* rule-of-thirds guides */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '33.33%', borderLeft: '1px solid rgba(255,255,255,0.4)' }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '66.66%', borderLeft: '1px solid rgba(255,255,255,0.4)' }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', borderTop: '1px solid rgba(255,255,255,0.4)' }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', borderTop: '1px solid rgba(255,255,255,0.4)' }} />
                </div>
                {/* 8 resize handles */}
                <div onPointerDown={(e) => startDrag(e, 'nw')} style={handleStyle({ left: crop.x - 6, top: crop.y - 6, cursor: 'nwse-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'n')} style={handleStyle({ left: crop.x + crop.w / 2 - 6, top: crop.y - 6, cursor: 'ns-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'ne')} style={handleStyle({ left: crop.x + crop.w - 6, top: crop.y - 6, cursor: 'nesw-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'e')} style={handleStyle({ left: crop.x + crop.w - 6, top: crop.y + crop.h / 2 - 6, cursor: 'ew-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'se')} style={handleStyle({ left: crop.x + crop.w - 6, top: crop.y + crop.h - 6, cursor: 'nwse-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 's')} style={handleStyle({ left: crop.x + crop.w / 2 - 6, top: crop.y + crop.h - 6, cursor: 'ns-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'sw')} style={handleStyle({ left: crop.x - 6, top: crop.y + crop.h - 6, cursor: 'nesw-resize' })} />
                <div onPointerDown={(e) => startDrag(e, 'w')} style={handleStyle({ left: crop.x - 6, top: crop.y + crop.h / 2 - 6, cursor: 'ew-resize' })} />
              </>
            )}
          </div>
        </div>

        {error && <div style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>{error}</div>}

        {/* Save controls */}
        {naming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>New filename</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`${defaultName} (edited)`}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) save('new') }}
              style={textInput}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!saving} onClick={() => { setNaming(false); setError('') }}>Back</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!saving || !newName.trim()} onClick={() => save('new')}>
                {saving === 'new' ? 'Saving…' : 'Save new image'}
              </button>
            </div>
          </div>
        ) : confirmReplace ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
              This replaces the original image everywhere it&apos;s used on the site. It can&apos;t be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!saving} onClick={() => setConfirmReplace(false)}>Cancel</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={!!saving} onClick={() => save('replace')}>
                {saving === 'replace' ? 'Saving…' : 'Yes, replace original'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!saving} onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!saving || !crop} onClick={() => { setNewName(`${defaultName} (edited)`); setNaming(true); setError('') }}>Save as new…</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!!saving || !crop} onClick={() => setConfirmReplace(true)}>Save (replaces original)</button>
          </div>
        )}
      </div>
    </div>
  )
}

const ratioInput: React.CSSProperties = { width: '3rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', textAlign: 'center' }
const textInput: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
