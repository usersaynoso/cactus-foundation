'use client'

// Settings → Media, "How pictures are served": through the Cloudflare media
// Worker, or straight from the bucket. See lib/media/serving-mode.ts for what the
// two modes mean and why the choice is an environment variable.
//
// The two choices are written into the page's own credential fields, so the
// ordinary Save button stores them alongside the provider's keys and the usual
// "redeploy needed" notice follows. Nothing is written unless the owner picks
// something, so an install that never opens this card stays in Worker mode.
//
// What this card does on its own, against the RUNNING deployment:
//   - reports how many stored picture addresses are still in the other mode's
//     shape, and moves them across on request (only the address changes);
//   - runs a real CORS check against the bucket from this browser.

import { useEffect, useState } from 'react'
import type { MediaProviderType } from '@prisma/client'
import { InfoTip } from '@/components/admin/InfoTip'
import { PROVIDER_LABELS } from '@/lib/media/providers'
import {
  directResizeMode,
  mediaServingMode,
  type DirectResizeMode,
  type MediaServingMode,
} from '@/lib/media/serving-mode'

type Status = { mode: MediaServingMode; resize: DirectResizeMode; pending: number; workerConfigured: boolean }

type CorsResult = { ok: boolean; message: string }

type Props = {
  provider: MediaProviderType
  hostLabel: string
  localMode: boolean
  /** What the owner has picked but not yet saved; empty means "unchanged". */
  modeField: string
  resizeField: string
  onModeChange: (mode: MediaServingMode) => void
  onResizeChange: (resize: DirectResizeMode) => void
  workerUrlSet: boolean
}

async function fetchStatus(): Promise<Status | null> {
  try {
    const res = await fetch('/api/admin/media/serving-mode')
    return res.ok ? ((await res.json()) as Status) : null
  } catch {
    // The card still works without the count; it just cannot offer the move.
    return null
  }
}

function asMode(value: string, fallback: MediaServingMode): MediaServingMode {
  return value === 'direct' || value === 'worker' ? value : fallback
}

function asResize(value: string, fallback: DirectResizeMode): DirectResizeMode {
  return value === 'platform' || value === 'off' ? value : fallback
}

export default function MediaServingModeCard({
  provider,
  hostLabel,
  localMode,
  modeField,
  resizeField,
  onModeChange,
  onResizeChange,
  workerUrlSet,
}: Props) {
  // The mode this deployment was built with (next.config inlines it), and the
  // one the owner has picked - the same until they change it and save.
  const liveMode = mediaServingMode()
  const liveResize = directResizeMode()
  const mode = asMode(modeField, liveMode)
  const resize = asResize(resizeField, liveResize)
  const label = PROVIDER_LABELS[provider]

  const [status, setStatus] = useState<Status | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveResult, setMoveResult] = useState<CorsResult | null>(null)
  const [corsBusy, setCorsBusy] = useState(false)
  const [cors, setCors] = useState<CorsResult | null>(null)

  useEffect(() => {
    let live = true
    void fetchStatus().then((s) => { if (live && s) setStatus(s) })
    return () => { live = false }
  }, [])

  async function loadStatus() {
    const s = await fetchStatus()
    if (s) setStatus(s)
  }

  // The server works through the pictures for as long as one request allows and
  // says how many are left, so this keeps asking until none are - or until a pass
  // moves nothing, which means something is stuck and asking again will not help.
  async function moveAcross() {
    setMoving(true)
    setMoveResult(null)
    let total = 0
    try {
      for (;;) {
        const res = await fetch('/api/admin/media/serving-mode', { method: 'POST' })
        const data = (await res.json().catch(() => null)) as { moved?: number; remaining?: number; error?: string } | null
        if (!res.ok) {
          const done = total > 0 ? ` ${total} were moved before it stopped; press the button again to carry on.` : ''
          setMoveResult({ ok: false, message: `${data?.error ?? 'The pictures could not be moved across.'}${done}` })
          break
        }
        const moved = data?.moved ?? 0
        const remaining = data?.remaining ?? 0
        total += moved
        if (remaining > 0 && moved > 0) {
          setMoveResult({ ok: true, message: `${total} moved so far, ${remaining} to go. Keep this page open.` })
          continue
        }
        setMoveResult(
          remaining > 0
            ? { ok: false, message: `${total} picture address${total === 1 ? '' : 'es'} updated, but ${remaining} would not move. Press the button again, and if they still will not move, check the site's logs.` }
            : { ok: true, message: `${total} picture address${total === 1 ? '' : 'es'} updated, along with the pages and products that show them.` },
        )
        break
      }
      await loadStatus()
    } catch {
      setMoveResult({ ok: false, message: `Could not reach the server.${total > 0 ? ` ${total} were moved first.` : ''} Please try again.` })
    } finally {
      setMoving(false)
    }
  }

  async function testCors() {
    setCorsBusy(true)
    setCors(null)
    let key: string | null = null
    try {
      const res = await fetch('/api/admin/media/cors-check', { method: 'POST' })
      const probe = (await res.json().catch(() => null)) as
        | { key: string; putUrl: string; getUrl: string; contentType: string; body: string; error?: string }
        | null
      if (!res.ok || !probe?.putUrl) {
        setCors({ ok: false, message: probe?.error ?? 'The test could not be started.' })
        return
      }
      key = probe.key
      // A CORS refusal surfaces as a network error with no status at all - the
      // browser will not say more than that, by design.
      try {
        const put = await fetch(probe.putUrl, { method: 'PUT', headers: { 'content-type': probe.contentType }, body: probe.body })
        if (!put.ok) {
          setCors({ ok: false, message: `The bucket refused the test upload (HTTP ${put.status}). Check the key has permission to write.` })
          return
        }
      } catch {
        setCors({ ok: false, message: `The bucket did not let this site upload to it. Add a CORS rule allowing PUT from ${window.location.origin}.` })
        return
      }
      try {
        const got = await fetch(probe.getUrl)
        const text = got.ok ? await got.text() : ''
        if (text !== probe.body) {
          setCors({ ok: false, message: `The test file went up but did not come back as sent (HTTP ${got.status}).` })
          return
        }
      } catch {
        setCors({ ok: false, message: `Uploads work, but the bucket did not let this site read the file back. Add GET and HEAD from ${window.location.origin} to the CORS rule - 3D models need it.` })
        return
      }
      setCors({ ok: true, message: 'All present and correct: this site can upload to the bucket and read from it.' })
    } catch {
      setCors({ ok: false, message: 'Could not reach the server. Please try again.' })
    } finally {
      if (key) {
        await fetch('/api/admin/media/cors-check', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key }),
        }).catch(() => undefined)
      }
      setCorsBusy(false)
    }
  }

  const origin = typeof window === 'undefined' ? 'https://your-site.example' : window.location.origin
  const corsRule = JSON.stringify(
    [{ AllowedOrigins: [origin], AllowedMethods: ['GET', 'HEAD', 'PUT'], AllowedHeaders: ['content-type'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }],
    null,
    2,
  )
  const awaitingRedeploy = mode !== liveMode || (mode === 'direct' && resize !== liveResize)
  const pending = status?.pending ?? 0

  return (
    <div id="media-serving-mode" className="card admin-anchor">
      <div className="card-title">How pictures are served</div>

      <fieldset className="field" disabled={localMode} style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="settings-check" style={{ alignItems: 'flex-start' }}>
          <input type="radio" name="media-serving-mode" checked={mode === 'worker'} onChange={() => onModeChange('worker')} />
          <span>
            Serve through Cloudflare Worker <span style={{ color: 'var(--color-text-muted)' }}>(recommended)</span>
            <span className="field-hint" style={{ display: 'block' }}>
              Pictures are cached close to your visitors and resized to fit each screen, and your {label} bucket is
              barely troubled. Needs the free Cloudflare Worker set up below.
            </span>
          </span>
        </label>
        <label className="settings-check" style={{ alignItems: 'flex-start' }}>
          <input type="radio" name="media-serving-mode" checked={mode === 'direct'} onChange={() => onModeChange('direct')} />
          <span>
            Serve directly from the bucket
            <span className="field-hint" style={{ display: 'block' }}>
              No Cloudflare account needed. The trade-offs: nothing caches pictures in front of the bucket, so every view
              is a download from {label} and its own download charges apply; and resizing is limited (see below).
              Private buckets are fine - each picture is handed out on a short-lived signed link.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === 'worker' && !workerUrlSet && (
        <div className="alert alert-warning" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
          Nothing can be uploaded until the media Worker is deployed - set it up below, or choose to serve directly from
          the bucket instead.
        </div>
      )}

      {mode === 'direct' && (
        <>
          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="media-direct-resize">
              Resizing
              <InfoTip>
                Without the Worker there is nothing in front of the bucket to shrink a large photograph for a small
                screen. Either every visitor gets the original file, or {hostLabel}&apos;s own image optimisation does
                the shrinking.
              </InfoTip>
            </label>
            <select
              id="media-direct-resize"
              value={resize}
              disabled={localMode}
              onChange={(e) => onResizeChange(e.target.value === 'platform' ? 'platform' : 'off')}
            >
              <option value="off">Send pictures at their original size</option>
              <option value="platform">Use {hostLabel}&apos;s image optimisation</option>
            </select>
            <span className="field-hint">
              {resize === 'platform'
                ? `${hostLabel}'s image optimisation has a monthly allowance, and on Vercel's free Hobby plan it is a small one - check your plan before leaving this on. If pictures stop appearing, switch back to original sizes.`
                : 'Costs nothing extra, but pages carry heavier pictures than they need - worth keeping uploads to a sensible size.'}
            </span>
          </div>

          <div className="field">
            <label>
              Bucket CORS
              <InfoTip>
                Files over 4.5 MB go from your browser straight into the bucket, and 3D models are read straight back out
                of it. Both only work if the bucket&apos;s CORS rules let this site in. Smaller pictures upload without it.
              </InfoTip>
            </label>
            <p className="field-hint" style={{ marginTop: 0 }}>
              In your {label} console, open the bucket&apos;s CORS settings and allow {origin} to GET, HEAD and PUT with
              a content-type header. Where a JSON rule is wanted, this one does the job:
            </p>
            <pre style={{ fontSize: '0.75rem', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', padding: '0.6rem', borderRadius: 'var(--radius)', overflowX: 'auto', margin: '0 0 0.5rem' }}>{corsRule}</pre>
            {liveMode === 'direct' ? (
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.875rem' }} disabled={corsBusy || localMode} onClick={testCors}>
                {corsBusy ? 'Testing…' : 'Test CORS'}
              </button>
            ) : (
              <span className="field-hint">The CORS test becomes available once this has been saved and the site redeployed.</span>
            )}
            {cors && (
              <div className={`alert ${cors.ok ? 'alert-success' : 'alert-danger'}`} style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                {cors.message}
              </div>
            )}
          </div>
        </>
      )}

      {awaitingRedeploy && (
        <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
          Save, then redeploy the site (Status tab) for this to take effect. Pictures already uploaded keep working in the
          meantime.
        </div>
      )}

      {!awaitingRedeploy && pending > 0 && (
        <div className="alert alert-warning" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            {pending} picture{pending === 1 ? '' : 's'} still use{pending === 1 ? 's' : ''} the{' '}
            {liveMode === 'direct' ? 'Worker' : 'direct'} address. Moving them across changes the address the site keeps
            for each one, and on every page, product and add-on that shows it - nothing in the bucket is moved, copied or
            deleted, and switching back puts every address back exactly as it was.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            A big library takes a few minutes, so keep this page open until it says it has finished. Visitors may see
            old addresses from cached pages for a while afterwards, so if you are leaving a Worker you have been using,
            keep it running for a day or two.
          </p>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.875rem' }} disabled={moving} onClick={moveAcross}>
            {moving ? 'Moving…' : `Move ${pending} picture${pending === 1 ? '' : 's'} across`}
          </button>
        </div>
      )}

      {moveResult && (
        <div className={`alert ${moveResult.ok ? 'alert-success' : 'alert-danger'}`} style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
          {moveResult.message}
        </div>
      )}
    </div>
  )
}
