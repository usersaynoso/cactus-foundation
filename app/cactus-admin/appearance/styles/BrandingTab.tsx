'use client'

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import type { MediaProviderType } from '@prisma/client'
import { envKeysForProvider } from '@/lib/media/providers'
import type { GlobalColour } from '@/lib/design/tokens'
import { ColourPickerRow } from '@/components/admin/ColourPickerRow'

// The branding fields the "Save branding" button persists. A subset of
// SiteConfig, saved to /api/admin/config (config.manage) - the same endpoint and
// permission as when this lived on the Settings page, so nothing about who can
// edit branding changes by it now sitting on the Styles page.
type BrandingConfig = {
  logoMediaId: string | null
  logoDarkMediaId: string | null
  faviconMediaId: string | null
  faviconDarkMediaId: string | null
  appIconMediaId: string | null
  appleTouchIconMediaId: string | null
  webManifest192MediaId: string | null
  webManifest512MediaId: string | null
  appName: string | null
  appShortName: string | null
  themeColor: string | null
  backgroundColor: string | null
}

const EMPTY_BRANDING: BrandingConfig = {
  logoMediaId: null, logoDarkMediaId: null,
  faviconMediaId: null, faviconDarkMediaId: null,
  appIconMediaId: null, appleTouchIconMediaId: null,
  webManifest192MediaId: null, webManifest512MediaId: null,
  appName: null, appShortName: null, themeColor: null, backgroundColor: null,
}

type MediaField = 'logoMediaId' | 'logoDarkMediaId' | 'faviconMediaId' | 'faviconDarkMediaId' | 'appIconMediaId' | 'appleTouchIconMediaId' | 'webManifest192MediaId' | 'webManifest512MediaId'
type PreviewKey = 'logo' | 'logoDark' | 'favicon' | 'faviconDark' | 'appIcon' | 'appleTouch' | 'icon192' | 'icon512'

const EMPTY_PREVIEWS: Record<PreviewKey, string | null> = {
  logo: null, logoDark: null, favicon: null, faviconDark: null,
  appIcon: null, appleTouch: null, icon192: null, icon512: null,
}

export type BrandingState = {
  loading: boolean
  /** A media provider must be configured before uploads can work. */
  mediaReady: boolean
  dirty: boolean
  saving: boolean
  saved: boolean
  error: string
  save: () => Promise<boolean>
  config: BrandingConfig
  siteName: string
  set: <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => void
  previews: Record<PreviewKey, string | null>
  applyMedia: (field: MediaField, preview: PreviewKey, m: { id: string; url: string }) => void
  clearMedia: (field: MediaField, preview: PreviewKey) => void
  handleAppIconUploaded: (m: { id: string; url: string }) => void
  generatingIcons: boolean
  iconGenNote: string
  iconGenError: string
}

// Lives at the Styles page level so branding edits survive tab switches (the
// active tab is conditionally rendered, but this state is not). Loads and saves
// independently of the design tokens - the two have separate endpoints and
// separate Save buttons on purpose.
export function useBrandingState(): BrandingState {
  const [config, setConfig] = useState<BrandingConfig>(EMPTY_BRANDING)
  const [siteName, setSiteName] = useState('')
  const [mediaProvider, setMediaProvider] = useState<MediaProviderType | null>(null)
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const [previews, setPreviews] = useState<Record<PreviewKey, string | null>>(EMPTY_PREVIEWS)
  const [generatingIcons, setGeneratingIcons] = useState(false)
  const [iconGenNote, setIconGenNote] = useState('')
  const [iconGenError, setIconGenError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  // Baseline for unsaved-change detection: set on load and after each save.
  const savedFingerprint = useRef<string>(JSON.stringify(EMPTY_BRANDING))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/config').then((r) => r.json()),
      fetch('/api/admin/env').then((r) => r.json()),
    ]).then(([cfg, envData]) => {
      const c = cfg as Record<string, unknown>
      const next: BrandingConfig = {
        logoMediaId: (c.logoMediaId as string | null) ?? null,
        logoDarkMediaId: (c.logoDarkMediaId as string | null) ?? null,
        faviconMediaId: (c.faviconMediaId as string | null) ?? null,
        faviconDarkMediaId: (c.faviconDarkMediaId as string | null) ?? null,
        appIconMediaId: (c.appIconMediaId as string | null) ?? null,
        appleTouchIconMediaId: (c.appleTouchIconMediaId as string | null) ?? null,
        webManifest192MediaId: (c.webManifest192MediaId as string | null) ?? null,
        webManifest512MediaId: (c.webManifest512MediaId as string | null) ?? null,
        appName: (c.appName as string | null) ?? null,
        appShortName: (c.appShortName as string | null) ?? null,
        themeColor: (c.themeColor as string | null) ?? null,
        backgroundColor: (c.backgroundColor as string | null) ?? null,
      }
      setConfig(next)
      savedFingerprint.current = JSON.stringify(next)
      setSiteName((c.siteName as string | null) ?? '')
      setMediaProvider((c.mediaProvider as MediaProviderType | null) ?? null)
      setPreviews({
        logo: (c.logoUrl as string | null) ?? null,
        logoDark: (c.logoDarkUrl as string | null) ?? null,
        favicon: (c.faviconUrl as string | null) ?? null,
        faviconDark: (c.faviconDarkUrl as string | null) ?? null,
        appIcon: (c.appIconUrl as string | null) ?? null,
        appleTouch: (c.appleTouchUrl as string | null) ?? null,
        icon192: (c.icon192Url as string | null) ?? null,
        icon512: (c.icon512Url as string | null) ?? null,
      })
      setEnvStatus((envData as { vars?: Record<string, boolean> }).vars ?? {})
      setLoading(false)
    }).catch(() => { setError('Failed to load branding'); setLoading(false) })
  }, [])

  // Recompute unsaved state whenever the form diverges from the saved baseline.
  useEffect(() => {
    setDirty(JSON.stringify(config) !== savedFingerprint.current)
  }, [config])

  const set = useCallback(<K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => {
    setConfig((p) => ({ ...p, [key]: value }))
    setSaved(false)
  }, [])

  const applyMedia = useCallback((field: MediaField, preview: PreviewKey, m: { id: string; url: string }) => {
    setConfig((p) => ({ ...p, [field]: m.id }))
    setPreviews((p) => ({ ...p, [preview]: m.url }))
    setSaved(false)
  }, [])

  const clearMedia = useCallback((field: MediaField, preview: PreviewKey) => {
    setConfig((p) => ({ ...p, [field]: null }))
    setPreviews((p) => ({ ...p, [preview]: null }))
    setSaved(false)
  }, [])

  // App-icon source upload: store the source, then ask the server to generate the
  // favicon / Apple touch / PWA icons from it and drop them into state (persisted
  // by "Save branding", same as an ordinary upload).
  const handleAppIconUploaded = useCallback(async (m: { id: string; url: string }) => {
    setConfig((p) => ({ ...p, appIconMediaId: m.id }))
    setPreviews((p) => ({ ...p, appIcon: m.url }))
    setSaved(false)
    setGeneratingIcons(true)
    setIconGenNote('')
    setIconGenError('')
    try {
      const res = await fetch('/api/admin/branding/generate-icons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMediaId: m.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Icon generation failed')
      setConfig((p) => ({
        ...p,
        faviconMediaId: d.favicon.id,
        appleTouchIconMediaId: d.appleTouch.id,
        webManifest192MediaId: d.icon192.id,
        webManifest512MediaId: d.icon512.id,
      }))
      setPreviews((p) => ({
        ...p,
        favicon: d.favicon.url,
        appleTouch: d.appleTouch.url,
        icon192: d.icon192.url,
        icon512: d.icon512.url,
      }))
      setIconGenNote('Generated the favicon, Apple touch icon and app icons from your image. Press Save branding to apply, or replace any individual one below.')
    } catch (err: unknown) {
      setIconGenError(err instanceof Error ? err.message : 'Icon generation failed')
    } finally {
      setGeneratingIcons(false)
    }
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      savedFingerprint.current = JSON.stringify(config)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [config])

  const mediaReady = !!mediaProvider && envKeysForProvider(mediaProvider).every((k) => envStatus[k])

  return {
    loading, mediaReady, dirty, saving, saved, error, save,
    config, siteName, set, previews, applyMedia, clearMedia,
    handleAppIconUploaded, generatingIcons, iconGenNote, iconGenError,
  }
}

// A single logo/favicon slot: preview, upload/replace, and remove. Uploads go
// straight to the media library; the parent stores the returned media id and
// persists it with "Save branding". Any non-SVG upload is silently optimised
// (resized, recompressed) server-side straight after upload - SVG is stored
// as-is since it isn't a raster sharp can shrink.
function BrandingImageField({
  label,
  hint,
  previewUrl,
  square = false,
  previewBackground,
  onUploaded,
  onRemove,
}: {
  label: string
  hint: string
  previewUrl: string | null
  square?: boolean
  /** Fixed preview backdrop (e.g. white behind a light logo) so it stays visible regardless of admin theme. */
  previewBackground?: string
  onUploaded: (media: { id: string; url: string }) => void
  onRemove: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('altText', label)
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')

      let media = { id: d.id as string, url: d.url as string }
      if (d.mimeType !== 'image/svg+xml') {
        try {
          const optRes = await fetch('/api/admin/media/optimise', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId: d.id }),
          })
          const optD = await optRes.json()
          if (optRes.ok && optD.optimised) media = { id: optD.id, url: optD.url }
        } catch {
          // Best-effort - fall back to the un-optimised upload rather than fail the whole action.
        }
      }
      onUploaded(media)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="field" style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media URLs are user-supplied remote hosts, not statically optimisable
          <img
            src={previewUrl}
            alt={`${label} preview`}
            style={{
              height: 64,
              width: square ? 64 : 'auto',
              maxWidth: 240,
              objectFit: 'contain',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '0.35rem',
              background: previewBackground ?? 'var(--color-surface)',
            }}
          />
        ) : (
          <div
            style={{
              height: 64,
              width: square ? 64 : 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            None
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : previewUrl ? 'Replace' : 'Upload'}
          </button>
          {previewUrl && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
      <span className="field-hint">{hint}</span>
      {error && <span style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', display: 'block', marginTop: '0.35rem' }}>{error}</span>}
    </div>
  )
}

// The Branding tab body. All state lives in the useBrandingState hook (held at
// page level) so edits survive tab switches; this component is purely the form.
export function BrandingTab({ b, colours }: { b: BrandingState; colours: GlobalColour[] }) {
  const { config, previews } = b

  if (b.loading) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
  }

  if (!b.mediaReady) {
    return (
      <div className="alert alert-info">
        Logo and favicon upload requires a media provider to be configured first. Choose one and add its credentials on the System page, under Media.
      </div>
    )
  }

  const heading: CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 600, margin: '1.75rem 0 0.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }
  const subNote: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 1.25rem' }
  const genNote: CSSProperties = { fontSize: 'var(--text-sm)', display: 'block', marginTop: '-0.75rem', marginBottom: '1.25rem' }

  return (
    <div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
        Set the logo, icons, and app identity for your site. These replace the default Cactus branding everywhere - browser tabs, bookmarks, and when someone adds your site to their phone. Press <strong>Save branding</strong> when you&apos;re done.
      </p>

      <h3 style={{ ...heading, paddingTop: 0, borderTop: 'none', marginTop: 0 }}>Logo</h3>
      <p style={subNote}>Appears in your site header and on the coming-soon, maintenance, and not-found pages.</p>
      <BrandingImageField
        label="Site logo"
        hint="JPEG, PNG, WebP, GIF, or SVG. Uploads are automatically resized and compressed (SVGs are kept as-is). Preview sits on a fixed white backdrop so it stays visible while you're in dark mode."
        previewUrl={previews.logo}
        previewBackground="#ffffff"
        onUploaded={(m) => b.applyMedia('logoMediaId', 'logo', m)}
        onRemove={() => b.clearMedia('logoMediaId', 'logo')}
      />
      <BrandingImageField
        label="Site logo (dark mode)"
        hint="Optional. Used automatically when a visitor views your site in dark mode. Leave empty to keep the standard logo everywhere. JPEG, PNG, WebP, GIF, or SVG. Preview sits on a fixed black backdrop so it stays visible while you're in light mode."
        previewUrl={previews.logoDark}
        previewBackground="#000000"
        onUploaded={(m) => b.applyMedia('logoDarkMediaId', 'logoDark', m)}
        onRemove={() => b.clearMedia('logoDarkMediaId', 'logoDark')}
      />

      <h3 style={heading}>Favicon &amp; app icons</h3>
      <p style={subNote}>Upload one square app icon and we&apos;ll create the whole set - browser favicon, Apple touch icon, and installable-app icons. Prefer to hand-pick any of them? Replace it below; your override sticks.</p>
      <BrandingImageField
        label="App icon (source)"
        hint="One square image, at least 512×512. Everything below is generated from it. JPEG, PNG, WebP, GIF, or SVG."
        previewUrl={previews.appIcon}
        square
        onUploaded={b.handleAppIconUploaded}
        onRemove={() => { b.clearMedia('appIconMediaId', 'appIcon') }}
      />
      {b.generatingIcons && <span style={{ ...genNote, color: 'var(--color-text-muted)' }}>Generating icons…</span>}
      {!b.generatingIcons && b.iconGenNote && <span style={{ ...genNote, color: 'var(--color-success)' }}>{b.iconGenNote}</span>}
      {!b.generatingIcons && b.iconGenError && <span style={{ ...genNote, color: 'var(--color-destructive)' }}>{b.iconGenError}</span>}
      <BrandingImageField
        label="Favicon"
        hint="The small icon in browser tabs and bookmarks. Auto-filled from your app icon; replace for full control. A square image of at least 96×96 works best."
        previewUrl={previews.favicon}
        square
        onUploaded={(m) => b.applyMedia('faviconMediaId', 'favicon', m)}
        onRemove={() => b.clearMedia('faviconMediaId', 'favicon')}
      />
      <BrandingImageField
        label="Favicon (dark mode)"
        hint="Optional. Shown when the visitor's browser is set to dark mode. Follows the browser setting rather than the toggle on your site. A square image of at least 96×96 works best."
        previewUrl={previews.faviconDark}
        square
        onUploaded={(m) => b.applyMedia('faviconDarkMediaId', 'faviconDark', m)}
        onRemove={() => b.clearMedia('faviconDarkMediaId', 'faviconDark')}
      />
      <BrandingImageField
        label="Apple touch icon"
        hint="Shown when someone adds your site to their home screen on iPhone or iPad. 180×180. Auto-filled from your app icon."
        previewUrl={previews.appleTouch}
        square
        onUploaded={(m) => b.applyMedia('appleTouchIconMediaId', 'appleTouch', m)}
        onRemove={() => b.clearMedia('appleTouchIconMediaId', 'appleTouch')}
      />
      <BrandingImageField
        label="App icon (192×192)"
        hint="Used when your site is installed as an app on Android and desktop. Auto-filled from your app icon."
        previewUrl={previews.icon192}
        square
        onUploaded={(m) => b.applyMedia('webManifest192MediaId', 'icon192', m)}
        onRemove={() => b.clearMedia('webManifest192MediaId', 'icon192')}
      />
      <BrandingImageField
        label="App icon (512×512)"
        hint="The large installable-app icon and splash image. Auto-filled from your app icon."
        previewUrl={previews.icon512}
        square
        onUploaded={(m) => b.applyMedia('webManifest512MediaId', 'icon512', m)}
        onRemove={() => b.clearMedia('webManifest512MediaId', 'icon512')}
      />

      <h3 style={heading}>App name &amp; colours</h3>
      <p style={subNote}>Used when your site is installed as an app, and for the browser toolbar colour on phones. These are separate from the site colour palette on the Colours tab.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>App name</label>
          <input value={config.appName ?? ''} onChange={(e) => b.set('appName', e.target.value)} placeholder={b.siteName || 'Your site name'} />
          <span className="field-hint">The full name shown when the site is installed. Defaults to your site name.</span>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Short name</label>
          <input value={config.appShortName ?? ''} onChange={(e) => b.set('appShortName', e.target.value)} placeholder={b.siteName || 'Short name'} />
          <span className="field-hint">Shown under the app icon on a phone home screen. Keep it short.</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: 'var(--form-gap)' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Theme colour</label>
          <ColourPickerRow value={config.themeColor ?? ''} onChange={(v) => b.set('themeColor', v)} colours={colours} mode="light" placeholder="#ffffff" />
          <span className="field-hint">Colours the browser toolbar on mobile and the installed app.</span>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Background colour</label>
          <ColourPickerRow value={config.backgroundColor ?? ''} onChange={(v) => b.set('backgroundColor', v)} colours={colours} mode="light" placeholder="#ffffff" />
          <span className="field-hint">Shown while the installed app is loading.</span>
        </div>
      </div>
    </div>
  )
}
