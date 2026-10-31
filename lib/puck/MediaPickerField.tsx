'use client'

import { useState, useEffect, useRef } from 'react'
import type { CustomFieldRender } from '@puckeditor/core'
import { MediaPickerModal, type MediaItem } from '@/components/admin/MediaPickerModal'

// For the Puck root ogImageId field — stores Media.id only.
// The public metadata generation looks up the URL server-side.
export const OgImagePickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const displayPreview = value ? preview : null

  useEffect(() => {
    if (!value) return
    fetch(`/api/admin/media?id=${value}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.items?.[0] && setPreview(d.items[0].url))
      .catch(() => null)
  }, [value])

  function handleSelect(item: MediaItem) {
    onChange(item.id)
    setPreview(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'OG image'}
      </label>
      {displayPreview && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={displayPreview ?? ''}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setPreview(null) }}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-destructive-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </div>
  )
}

// Every block field that holds an image URL, keyed by component then field, with
// the label to show in the editor. The picker stores the Worker URL directly so
// the server render can display the image without a DB lookup. Both Puck editors
// run their config through `withImagePickerFields` so adding a new image field
// here is all that's needed — no per-editor wiring to keep in sync.
const IMAGE_PICKER_FIELDS: Record<string, Record<string, string>> = {
  ImageBlock:     { mediaUrl: 'Image' },
  IconLink:       { iconUrl: 'Icon image (SVG or PNG)' },
  SiteLogo:       { imageUrl: 'Logo image (leave blank for the site logo)', imageUrlDark: 'Logo image in dark mode' },
  Card:           { mediaUrl: 'Image' },
  Quote:          { mediaUrl: 'Photo (shown inside the quote, left of the text)' },
  ImageChipPanel: { mediaUrl: 'Image' },
  Hero:           { bgImage: 'Background image', imageUrl: 'Side image (right-image layout)', patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  Section:        { bgImage: 'Background image', patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  CTABanner:      { patternImage: 'Background pattern (image or SVG)', patternImageDark: 'Background pattern in dark mode' },
  // Email wrapper blocks. An email cannot reach a relative path, so what these
  // store has to be the absolute media URL the picker already hands back.
  EmailLogo:      { src: 'Logo image (leave blank for the site logo)' },
  EmailImage:     { src: 'Image' },
}

// The same, for a config's ROOT fields - which are not a component and so cannot
// be keyed by name. Every config that has a root with image fields is listed
// here by the field names it uses; a config whose root has none of them is
// skipped, so one shared list covers the page root and the email wrapper root
// without either editor knowing about it.
const ROOT_IMAGE_PICKER_FIELDS: Record<string, string> = {
  patternImage: 'Background pattern (image or SVG)',
  patternImageDark: 'Background pattern in dark mode',
}

// Same again for fields holding a self-hosted video URL (an mp4/webm in the
// media library, not a YouTube or Vimeo link - those stay plain text fields).
const VIDEO_PICKER_FIELDS: Record<string, Record<string, string>> = {
  FeatureVideo: { videoUrl: 'Video' },
}

// Swap every known media URL text field in a Puck config for the matching media
// picker — image fields for the image picker, video fields for the video one. Components/fields not present in the given config are skipped, so this
// is safe on the layout editor's filtered config too.
export function withImagePickerFields<C>(config: C): C {
  const cfg = config as { components?: Record<string, { fields?: Record<string, unknown> }> }
  if (!cfg?.components) return config
  const components = { ...cfg.components }
  const swap = (map: Record<string, Record<string, string>>, render: CustomFieldRender<string>) => {
    for (const [componentName, fieldLabels] of Object.entries(map)) {
      const component = components[componentName]
      if (!component?.fields) continue
      const fields = { ...component.fields }
      let changed = false
      for (const [fieldName, label] of Object.entries(fieldLabels)) {
        if (!(fieldName in fields)) continue
        fields[fieldName] = { type: 'custom' as const, label, render }
        changed = true
      }
      if (changed) components[componentName] = { ...component, fields }
    }
  }
  swap(IMAGE_PICKER_FIELDS, ImageUrlPickerField)
  swap(VIDEO_PICKER_FIELDS, VideoUrlPickerField)

  // Root fields, same treatment. The root is rebuilt only when it actually
  // carries one of the named fields, so a config without them is returned with
  // its own root object untouched (identity included).
  const cfgRoot = (config as { root?: { fields?: Record<string, unknown> } }).root
  let root = cfgRoot
  if (cfgRoot?.fields) {
    const fields = { ...cfgRoot.fields }
    let changed = false
    for (const [fieldName, label] of Object.entries(ROOT_IMAGE_PICKER_FIELDS)) {
      if (!(fieldName in fields)) continue
      fields[fieldName] = { type: 'custom' as const, label, render: ImageUrlPickerField }
      changed = true
    }
    if (changed) root = { ...cfgRoot, fields }
  }

  return { ...cfg, components, ...(root ? { root } : {}) } as C
}

// For ImageBlock.mediaUrl field — stores the Worker URL directly so the server
// render can display the image without a DB lookup.
export const ImageUrlPickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)

  function handleSelect(item: MediaItem) {
    onChange(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Image'}
      </label>
      {value && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value}
          alt=""
          style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change image' : 'Select image'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-destructive-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} />}
    </div>
  )
}


// For FeatureVideo.videoUrl — the media library picker filtered to videos,
// storing the picked item's url. The preview is the video's own first frame,
// loaded metadata-only so the panel stays cheap.
export const VideoUrlPickerField: CustomFieldRender<string> = ({ value, onChange, field }) => {
  const [open, setOpen] = useState(false)

  function handleSelect(item: MediaItem) {
    onChange(item.url)
    setOpen(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        {(field as { label?: string }).label ?? 'Video'}
      </label>
      {value && (
        <video
          src={value}
          preload="metadata"
          muted
          playsInline
          style={{ width: '100%', maxHeight: 100, objectFit: 'contain', borderRadius: 4, marginBottom: '0.5rem', display: 'block', border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
        >
          {value ? 'Change video' : 'Select video'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ padding: '0.375rem 0.75rem', border: '1px solid var(--color-destructive-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-destructive)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <MediaPickerModal onSelect={handleSelect} onClose={() => setOpen(false)} kind="video" />}
    </div>
  )
}
