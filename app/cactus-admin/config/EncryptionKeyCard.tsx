'use client'

// Settings -> General -> Encryption key. Moves the site onto a new encryption key
// without losing a stored secret or breaking a link already sent. The steps, and
// why the site keeps working through each, are in lib/crypto/rotation.ts; the
// server refuses any step out of order, so this screen only has to be clear.

import { useCallback, useEffect, useState } from 'react'
import { InfoTip } from '@/components/admin/InfoTip'

type Phase = 'no-key' | 'idle' | 'staged' | 'ready' | 'rotated' | 'swapping' | 'mismatch'

type Status = {
  phase: Phase
  stagedFingerprint: string | null
  previousKeys: number
  modulesReadingKeyDirectly: string[]
  localMode: boolean
  canWriteHost: boolean
  redeployHint: string | null
}

type Area = { area: string; values: number }
type DryRun = { areas: Area[]; totalValues: number; unreadable: number; unreadableAreas: string[] }
type HostOutcome = { hostWritten: boolean; redeployed: boolean; message: string | null }

const KEY_SHAPE = /^[0-9a-fA-F]{64}$/

const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '1rem' } as const
const mono = { fontFamily: 'var(--font-mono)', wordBreak: 'break-all' } as const

function makeKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function downloadKey(key: string): void {
  const blob = new Blob(
    [`Encryption key for ${window.location.host}\nSet as ENCRYPTION_KEY wherever this site runs.\n\n${key}\n`],
    { type: 'text/plain' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `encryption-key-${window.location.host}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function fetchStatus(): Promise<Status | null> {
  try {
    const res = await fetch('/api/admin/encryption-key')
    return res.ok ? ((await res.json()) as Status) : null
  } catch {
    return null
  }
}

async function post<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/admin/encryption-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as T & { error?: string }
    if (!res.ok) return { ok: false, error: data.error ?? 'That did not work.' }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Could not reach the site. Check your connection and try again.' }
  }
}

function AreaList({ areas }: { areas: Area[] }) {
  if (areas.length === 0) return <p style={muted}>Nothing stored under the key at all. Quick job.</p>
  return (
    <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem', fontSize: 'var(--text-sm)' }}>
      {areas.map((a) => (
        <li key={a.area}>
          {a.area}: {a.values} {a.values === 1 ? 'value' : 'values'}
        </li>
      ))}
    </ul>
  )
}

function HostNote({ outcome, what }: { outcome: HostOutcome | null; what: string }) {
  if (!outcome) return null
  if (!outcome.hostWritten) {
    return (
      <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
        {outcome.message ?? 'This site cannot change its own settings here.'} Set it by hand instead: {what}, then
        restart or redeploy, and refresh this page.
      </div>
    )
  }
  if (outcome.message) {
    return <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>{outcome.message}</div>
  }
  return null
}

export default function EncryptionKeyCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [source, setSource] = useState<'generate' | 'paste'>('generate')
  const [generated, setGenerated] = useState('')
  const [pasted, setPasted] = useState('')
  const [confirmTail, setConfirmTail] = useState('')
  const [password, setPassword] = useState('')
  const [dryRun, setDryRun] = useState<DryRun | null>(null)
  const [rotated, setRotated] = useState<{ areas: Area[]; alreadyDone: boolean } | null>(null)
  const [hostOutcome, setHostOutcome] = useState<HostOutcome | null>(null)
  const [cleared, setCleared] = useState<string[] | null>(null)

  const refresh = useCallback(async () => {
    const loaded = await fetchStatus()
    if (loaded) {
      setStatus(loaded)
      setLoadError('')
    } else {
      setLoadError('Could not load the encryption key status. Refresh the page to try again.')
    }
  }, [])

  useEffect(() => {
    let live = true
    void fetchStatus().then((s) => {
      if (!live) return
      if (s) setStatus(s)
      else setLoadError('Could not load the encryption key status. Refresh the page to try again.')
    })
    return () => {
      live = false
    }
  }, [])

  const run = async <T,>(body: Record<string, unknown>, then: (data: T) => void) => {
    setBusy(true)
    setError('')
    const result = await post<T>(body)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    then(result.data)
    void refresh()
  }

  if (loadError) return <div className="card"><div className="alert alert-danger">{loadError}</div></div>
  if (!status) return <div className="card"><p style={muted}>Loading…</p></div>

  const chosenKey = source === 'generate' ? generated : pasted.trim()
  const keyShaped = KEY_SHAPE.test(chosenKey)
  const tailOk = source === 'paste' || (keyShaped && confirmTail.trim().toLowerCase() === chosenKey.slice(-6).toLowerCase())
  const blockers = status.modulesReadingKeyDirectly
  const manual = !status.canWriteHost

  return (
    <div id="general-encryption-key" className="card admin-anchor">
      <div className="card-title">
        Encryption key{' '}
        <InfoTip>
          The key that locks away stored secrets (two-factor sign-in, the GitHub connection, module passwords) and
          signs the links your site emails out. Changing it here moves everything across, so nothing is lost.
        </InfoTip>
      </div>

      <p style={muted}>
        Changing the key moves every stored secret onto a new one and keeps the old one on file, so links already in
        customers&apos; inboxes still open. Nobody is signed out and sign-in carries on as normal. It is the sort of
        job best done somewhere quiet, which is to say not five minutes before a sale.
      </p>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

      {blockers.length > 0 && status.phase !== 'no-key' && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          {blockers.join(', ')} {blockers.length === 1 ? 'still reads' : 'still read'} the key the old way, so the
          change is held back until {blockers.length === 1 ? 'it is' : 'they are'} updated. Otherwise the links{' '}
          {blockers.length === 1 ? 'it has' : 'they have'} sent would stop working at the swap.
        </div>
      )}

      {status.phase === 'no-key' && (
        <p style={muted}>This site has no encryption key yet, so there is nothing to change. Setup normally makes one.</p>
      )}

      {status.phase === 'mismatch' && (
        <div className="alert alert-danger" style={{ fontSize: '0.875rem' }}>
          The stored secrets are under a key this copy of the site has not been given. If the site has just moved
          host, set ENCRYPTION_KEY there to the key you rotated to, redeploy, and refresh this page.
        </div>
      )}

      {(status.phase === 'idle' || status.phase === 'staged') && (
        <>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>1. Choose the new key</p>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: 'var(--text-sm)' }}>
            <label>
              <input type="radio" checked={source === 'generate'} onChange={() => setSource('generate')} /> Make one for me
              (recommended)
            </label>
            <label>
              <input type="radio" checked={source === 'paste'} onChange={() => setSource('paste')} /> I have one already
            </label>
          </div>

          {source === 'generate' ? (
            generated ? (
              <>
                <div className="alert alert-warning" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  This is shown once. Your hosting keeps it write-only, so neither it nor Cactus can show it to you
                  again. Copy it or download it now, and put it somewhere safe that is not this website.
                </div>
                <p style={{ ...mono, fontSize: 'var(--text-sm)', margin: '0 0 0.75rem' }}>{generated}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => void navigator.clipboard?.writeText(generated)}>Copy</button>
                  <button className="btn btn-secondary" onClick={() => downloadKey(generated)}>Download as a file</button>
                </div>
                <label style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '1rem' }}>
                  Type its last six characters, to show you have it
                  <input
                    value={confirmTail}
                    onChange={(e) => setConfirmTail(e.target.value)}
                    maxLength={6}
                    style={{ display: 'block', maxWidth: '10rem', marginTop: '0.25rem', ...mono }}
                  />
                </label>
              </>
            ) : (
              <button className="btn btn-secondary" style={{ marginBottom: '1rem' }} onClick={() => setGenerated(makeKey())}>
                Make a key
              </button>
            )
          ) : (
            <label style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '1rem' }}>
              Your key: 64 characters, each 0-9 or a-f
              <input
                type="password"
                autoComplete="off"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '0.25rem', ...mono }}
              />
              {pasted.trim() !== '' && !keyShaped && (
                <span style={{ color: 'var(--color-destructive)' }}>That is not 64 hex characters ({pasted.trim().length} so far).</span>
              )}
            </label>
          )}

          <button
            className="btn btn-primary"
            disabled={busy || !keyShaped || !tailOk}
            onClick={() =>
              void run<HostOutcome>({ action: 'stage', key: chosenKey }, (data) => {
                setHostOutcome(data)
                setGenerated('')
                setPasted('')
                setConfirmTail('')
              })
            }
          >
            {busy ? 'Saving…' : manual ? 'Use this key' : 'Save it to the host and redeploy'}
          </button>

          {status.phase === 'staged' && (
            <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              A new key is saved and waiting for the redeploy to bring it in. That takes a few minutes; refresh this page
              once it is live. {status.redeployHint}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => void refresh()}>Refresh</button>
                <button className="btn btn-secondary" disabled={busy} onClick={() => void run({ action: 'cancel' }, () => setHostOutcome(null))}>
                  Withdraw it
                </button>
              </div>
            </div>
          )}
          <HostNote outcome={hostOutcome} what="add ENCRYPTION_KEY_NEXT with the new key" />
        </>
      )}

      {status.phase === 'ready' && (
        <>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>2. Check everything can be moved</p>
          <p style={muted}>
            The new key is live on the site. First a dry run: it counts every stored secret and proves each one can be
            read. It changes nothing.
          </p>
          <button className="btn btn-secondary" disabled={busy} onClick={() => void run<{ report: DryRun }>({ action: 'dry-run' }, (d) => setDryRun(d.report))}>
            {busy && !dryRun ? 'Checking…' : 'Run the dry run'}
          </button>

          {dryRun && (
            <div style={{ marginTop: '1rem' }}>
              <AreaList areas={dryRun.areas} />
              {dryRun.unreadable > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {dryRun.unreadable} stored {dryRun.unreadable === 1 ? 'value' : 'values'} cannot be read with any key
                  this site holds, most likely carried in from another site&apos;s backup: {dryRun.unreadableAreas.join(', ')}.
                  They are no use to anyone as they are. Clear them (they will need setting up again) and the change
                  can go ahead.
                </div>
              )}
            </div>
          )}

          {dryRun && (
            <>
              <p style={{ fontWeight: 600, margin: '1rem 0 0.5rem' }}>3. Make the change</p>
              <label style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: '0.75rem' }}>
                Your password, to confirm it is you
                <input
                    type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ display: 'block', maxWidth: '20rem', marginTop: '0.25rem' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {dryRun.unreadable > 0 ? (
                  <button
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() =>
                      void run<{ cleared: string[] }>({ action: 'clear-unreadable', password }, (d) => {
                        setCleared(d.cleared)
                        setDryRun(null)
                      })
                    }
                  >
                    Clear these
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={busy || blockers.length > 0}
                    onClick={() =>
                      void run<{ result: { areas: Area[]; alreadyDone: boolean } }>({ action: 'rotate', password }, (d) => {
                        setRotated(d.result)
                        setPassword('')
                      })
                    }
                  >
                    {busy ? 'Moving everything across…' : 'Move everything to the new key'}
                  </button>
                )}
                <button className="btn btn-secondary" disabled={busy} onClick={() => void run({ action: 'cancel' }, () => setDryRun(null))}>
                  Withdraw the new key
                </button>
              </div>
            </>
          )}
          {cleared && (
            <p style={{ ...muted, marginTop: '1rem' }}>
              Cleared: {cleared.length > 0 ? cleared.join(', ') : 'nothing left to clear'}. Run the dry run again.
            </p>
          )}
        </>
      )}

      {status.phase === 'rotated' && (
        <>
          <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
            Everything is now under the new key, and the old one is filed away for checking old links.
          </div>
          {rotated && <AreaList areas={rotated.areas} />}
          <p style={muted}>
            Keep the new key safe: it is the one this site needs from now on, wherever it runs. One step left.
          </p>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>4. Swap it in</p>
          <p style={muted}>
            Staying put? Swap it in below and the site redeploys with the new key as its own. Moving to a new host?
            Set ENCRYPTION_KEY there to the new key and you are done; this site carries on happily until you switch.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => void run<HostOutcome>({ action: 'finish' }, setHostOutcome)}>
              {busy ? 'Swapping…' : manual ? 'I have swapped it' : 'Swap it in and redeploy'}
            </button>
          </div>
          <HostNote outcome={hostOutcome} what="set ENCRYPTION_KEY to the new key and remove ENCRYPTION_KEY_NEXT" />
          <details style={{ fontSize: 'var(--text-sm)' }}>
            <summary>Changed your mind?</summary>
            <p style={{ ...muted, marginTop: '0.5rem' }}>
              Until the swap, the change can be put back exactly as it was.
            </p>
            <input
              type="password"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ maxWidth: '20rem', marginBottom: '0.5rem', display: 'block' }}
            />
            <button className="btn btn-secondary" disabled={busy} onClick={() => void run({ action: 'rollback', password }, () => { setRotated(null); setPassword('') })}>
              Put it back
            </button>
          </details>
        </>
      )}

      {status.phase === 'swapping' && (
        <div className="alert alert-info" style={{ fontSize: '0.875rem' }}>
          The new key is saved as the site&apos;s own and a redeploy is on its way. Once it is live, the job is done and
          this page goes quiet again. {status.redeployHint}
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => void refresh()}>Refresh</button>
          </div>
        </div>
      )}

      {status.phase === 'idle' && status.previousKeys > 0 && (
        <p style={{ ...muted, marginTop: '1rem', marginBottom: 0 }}>
          {status.previousKeys} previous {status.previousKeys === 1 ? 'key is' : 'keys are'} on file for checking old links.
        </p>
      )}
    </div>
  )
}
