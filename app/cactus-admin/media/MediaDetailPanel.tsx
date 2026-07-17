'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type { LibraryItem, TagInfo } from './types'
import { formatBytes, formatDate, filenameOf, fileKind } from './format'
import { useFocusTrap } from './useFocusTrap'

// Slide-over that replaces the old lightbox. It's both the viewer (large preview,
// Prev/Next across the loaded list) and the single home for per-item actions and
// tag editing - so the grid card and list row stay uncluttered.
export default function MediaDetailPanel({
  item,
  canManage,
  canDelete,
  hasPrev,
  hasNext,
  loadingNext,
  allTags,
  folderName,
  savingTags,
  savingMeta,
  optimising,
  replacing,
  replaceable,
  onClose,
  onPrev,
  onNext,
  onEdit,
  onChangeRatio,
  onResize,
  onRename,
  onMove,
  onCut,
  onCopy,
  onDelete,
  onOptimise,
  onReplace,
  onCopyLink,
  onDownload,
  onSaveTags,
  onSaveMeta,
}: {
  item: LibraryItem
  canManage: boolean
  canDelete: boolean
  hasPrev: boolean
  hasNext: boolean
  loadingNext: boolean
  allTags: TagInfo[]
  folderName: (id: string | null) => string
  savingTags: boolean
  savingMeta: boolean
  optimising: boolean
  replacing: boolean
  /** True when this item's file is a type the library can accept a replacement for. */
  replaceable: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onEdit: () => void
  onChangeRatio: () => void
  onResize: () => void
  onRename: () => void
  onMove: () => void
  onCut: () => void
  onCopy: () => void
  onDelete: () => void
  onOptimise: () => void
  onReplace: () => void
  onCopyLink: () => void
  onDownload: () => void
  onSaveTags: (names: string[]) => void
  onSaveMeta: (altText: string, isDecorative: boolean) => void
}) {
  const isImage = item.mimeType.startsWith('image/')
  const isSvg = item.mimeType === 'image/svg+xml'
  const canEdit = isImage && !isSvg
  const canOptimise = isImage && !isSvg && !item.optimised
  const filename = filenameOf(item)
  const asideRef = useRef<HTMLElement>(null)
  useFocusTrap(asideRef)
  const [broken, setBroken] = useState(false)

  // Alt text / decorative draft. Same content-keyed re-sync as tags so an
  // ordinary refetch doesn't clobber an in-progress edit but a real change (or
  // switching item via remount) seeds correctly.
  const [altDraft, setAltDraft] = useState(item.altText ?? '')
  const [decorativeDraft, setDecorativeDraft] = useState(item.isDecorative)
  const metaKey = `${item.altText ?? ''} ${item.isDecorative}`
  const [syncedMetaKey, setSyncedMetaKey] = useState(metaKey)
  if (metaKey !== syncedMetaKey) {
    setSyncedMetaKey(metaKey)
    setAltDraft(item.altText ?? '')
    setDecorativeDraft(item.isDecorative)
  }
  const metaDirty = altDraft.trim() !== (item.altText ?? '').trim() || decorativeDraft !== item.isDecorative
  const showAltEditor = canManage && isImage && !isSvg
  const missingAlt = isImage && !isSvg && !item.isDecorative && !item.altText?.trim()

  // Local tag draft. Navigating to another item remounts the panel (parent keys
  // by id), so this seeds correctly on switch. The render-phase reset below then
  // handles the one case a remount doesn't: the SAME item's tags changing under
  // us after a save/refetch - re-sync to the server's version, keyed on content
  // so an ordinary refetch with identical tags never clobbers an in-progress edit.
  const [tagDraft, setTagDraft] = useState<string[]>(item.tags)
  const [tagInput, setTagInput] = useState('')
  const tagsKey = item.tags.join('\u0000')
  const [syncedTagsKey, setSyncedTagsKey] = useState(tagsKey)
  if (tagsKey !== syncedTagsKey) {
    setSyncedTagsKey(tagsKey)
    setTagDraft(item.tags)
  }
  const tagsDirty = tagDraft.length !== item.tags.length || tagDraft.some((t, i) => t !== item.tags[i])
  const suggestions = allTags
    .map((t) => t.name)
    .filter((n) => !tagDraft.includes(n) && tagInput.trim() && n.toLowerCase().includes(tagInput.toLowerCase()))

  function addTag(name: string) {
    const n = name.trim()
    if (n && !tagDraft.includes(n)) setTagDraft([...tagDraft, n])
    setTagInput('')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      if (e.key === 'Escape') onClose()
      else if (!typing && e.key === 'ArrowLeft' && hasPrev) onPrev()
      else if (!typing && e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={filename}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--color-overlay)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <aside
        ref={asideRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100vw)',
          height: '100%',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top bar: nav + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!hasPrev} onClick={onPrev} aria-label="Previous item" title="Previous">‹</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!hasNext || loadingNext} onClick={onNext} aria-label="Next item" title="Next">›</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close panel" title="Close">×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Preview */}
          <div style={{ background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, maxHeight: 320, padding: 'var(--space-4)', overflow: 'hidden' }}>
            {isImage && !broken ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.url} alt={item.altText ?? ''} onError={() => setBroken(true)} style={{ maxWidth: '100%', maxHeight: 288, objectFit: 'contain', display: 'block' }} />
            ) : (
              <span style={{ fontSize: '4rem' }} title={broken ? 'Preview unavailable' : undefined}>{broken ? '🚫' : '📄'}</span>
            )}
          </div>

          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Title + badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', wordBreak: 'break-word' }}>{filename}</h2>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className={`badge ${item.inUse ? 'badge-green' : 'badge-gray'}`}>{item.inUse ? 'In use' : 'Unused'}</span>
                {item.optimised && <span className="badge badge-green">✓ Optimised</span>}
                {item.isDecorative && <span className="badge badge-gray">Decorative</span>}
                {missingAlt && <span className="badge badge-yellow" title="No alt text - add some for accessibility and SEO">No alt text</span>}
              </div>
            </div>

            {/* Metadata */}
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem', fontSize: 'var(--text-sm)' }}>
              <Meta label="Type">{fileKind(item.mimeType)} · {item.mimeType}</Meta>
              <Meta label="Size">{formatBytes(item.sizeBytes)}</Meta>
              <Meta label="Folder">{folderName(item.folderId)}</Meta>
              <Meta label="Uploaded">{formatDate(item.createdAt)}{item.uploadedBy ? ` · ${item.uploadedBy.username}` : ''}</Meta>
            </dl>

            {/* Alt text + decorative flag - the accessibility/SEO description. */}
            {showAltEditor ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={sectionLabel}>Alt text</span>
                <textarea
                  value={altDraft}
                  onChange={(e) => setAltDraft(e.target.value)}
                  disabled={decorativeDraft}
                  rows={2}
                  placeholder={decorativeDraft ? 'Decorative image - no alt text needed' : 'Describe this image for screen readers and search engines…'}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '3.2rem', opacity: decorativeDraft ? 0.6 : 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={decorativeDraft} onChange={(e) => setDecorativeDraft(e.target.checked)} style={{ margin: 0, cursor: 'pointer' }} />
                  Decorative - skip in screen readers
                </label>
                {metaDirty && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={savingMeta} onClick={() => onSaveMeta(altDraft, decorativeDraft)}>{savingMeta ? 'Saving…' : 'Save alt text'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={savingMeta} onClick={() => { setAltDraft(item.altText ?? ''); setDecorativeDraft(item.isDecorative) }}>Reset</button>
                  </div>
                )}
              </div>
            ) : item.altText ? (
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem', fontSize: 'var(--text-sm)' }}>
                <Meta label="Alt text">{item.altText}</Meta>
              </dl>
            ) : null}

            {/* Tags */}
            {canManage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={sectionLabel}>Tags</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {tagDraft.map((n) => (
                    <span key={n} style={editTagChip}>
                      {n}
                      <button type="button" onClick={() => setTagDraft(tagDraft.filter((x) => x !== n))} aria-label={`Remove ${n}`} style={xBtn}>×</button>
                    </span>
                  ))}
                  {tagDraft.length === 0 && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>No tags yet</span>}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                  placeholder="Add a tag and press Enter…"
                  style={inputStyle}
                />
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {suggestions.slice(0, 8).map((s) => (
                      <button key={s} type="button" onClick={() => addTag(s)} style={suggestChip}>+ {s}</button>
                    ))}
                  </div>
                )}
                {tagsDirty && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={savingTags} onClick={() => onSaveTags(tagDraft)}>{savingTags ? 'Saving…' : 'Save tags'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={savingTags} onClick={() => { setTagDraft(item.tags); setTagInput('') }}>Reset</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action footer */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <a className="btn btn-secondary btn-sm" href={item.url} target="_blank" rel="noopener noreferrer">Open original ↗</a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCopyLink}>Copy link</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDownload}>Download</button>
          {canManage && canOptimise && <button type="button" className="btn btn-secondary btn-sm" disabled={optimising} onClick={onOptimise}>{optimising ? 'Optimising…' : 'Optimise'}</button>}
          {canManage && replaceable && <button type="button" className="btn btn-secondary btn-sm" disabled={replacing} title="Swap the file for a fresh one, keeping this item and everything pointing at it" onClick={onReplace}>{replacing ? 'Replacing…' : 'Replace file…'}</button>}
          {canManage && canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>Edit image…</button>}
          {canManage && canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={onChangeRatio}>Change ratio…</button>}
          {canManage && canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={onResize}>Resize…</button>}
          {canManage && <button type="button" className="btn btn-secondary btn-sm" onClick={onRename}>Rename…</button>}
          {canManage && <button type="button" className="btn btn-secondary btn-sm" onClick={onMove}>Move…</button>}
          {canManage && <button type="button" className="btn btn-secondary btn-sm" onClick={onCut}>Cut</button>}
          {canManage && <button type="button" className="btn btn-secondary btn-sm" onClick={onCopy}>Copy</button>}
          {canDelete && <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>}
        </div>
      </aside>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--color-text)', wordBreak: 'break-word' }}>{children}</dd>
    </>
  )
}

const sectionLabel: CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }
const inputStyle: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const editTagChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--text-sm)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }
const suggestChip: CSSProperties = { fontSize: 'var(--text-sm)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px dashed var(--color-border)', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' }
const xBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, fontSize: '0.95rem' }
