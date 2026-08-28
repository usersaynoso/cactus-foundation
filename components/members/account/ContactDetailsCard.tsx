'use client'

import { useEffect, useState } from 'react'

type Contact = { fullName: string | null; organisation: string | null }

// The overview tab's editable "Your details" card, saved straight to the member
// record and used to fill the checkout's name and organisation boxes in.
//
// Not gated behind the Profile section switch. That one holds the public-profile
// fields; this is the name an order is made out to, and the sites most likely to
// want it (a shop whose members only exist to have somewhere to see their
// orders) are exactly the sites that turn the public profile off.
//
// The organisation sits beside the name rather than on a delivery address: it is
// who the member is, not where a parcel goes, so it stays the same however many
// addresses they save. `collectOrganisation` is the site's own switch - off, the
// box is gone and the route refuses to save one either. `requireOrganisation` is
// the second half of that switch: a trade shop that invoices businesses has no
// use for a member with no company on them, so the card refuses to save without
// one. The route refuses it as well - this is the polite half, not the gate.
//
// No phone number here on purpose: a number belongs to the address a parcel is
// going to, so the shop keeps one per saved address instead.
export default function ContactDetailsCard({ initial, collectOrganisation = true, requireOrganisation = false }: {
  initial: Contact
  collectOrganisation?: boolean
  requireOrganisation?: boolean
}) {
  const initialFullName = initial.fullName ?? ''
  const initialOrganisation = initial.organisation ?? ''
  const [fullName, setFullName] = useState(initialFullName)
  const [organisation, setOrganisation] = useState(initialOrganisation)
  const [saved, setSaved] = useState<Contact>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // The details can arrive on the account a moment AFTER this card was drawn.
  //
  // Somebody who checked out as a guest and then took up the offer of an account
  // has their name and their company sitting on that order, and core copies them
  // across the first time the shop claims it (lib/members/contact.ts). That claim
  // happens inside a section further down this very page, which is later in the
  // render than the read that filled these boxes in - so the record gains a name
  // a fraction of a second after the card decided it had none, and the member is
  // shown two empty boxes and told off for the missing organisation. It comes
  // right on the next reload, which is no comfort to somebody who signed up
  // precisely so as not to type it all again.
  //
  // So: ask once more from the browser, after the page has finished with itself.
  // Only where a box actually came up empty, so a member who already has their
  // details on file never spends the request; and only into a box still holding
  // exactly what the server sent, so it can never land on top of typing.
  const blankOnLoad = !initialFullName.trim() || (collectOrganisation && !initialOrganisation.trim())
  useEffect(() => {
    if (!blankOnLoad) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/members/contact')
        // 204 is the signed-out answer, and there is nothing to read from it.
        if (!res.ok || res.status === 204) return
        const d = await res.json()
        if (cancelled) return
        const fresh: Contact = { fullName: d.fullName ?? null, organisation: d.organisation ?? null }
        setFullName((cur) => (cur === initialFullName && fresh.fullName ? fresh.fullName : cur))
        setOrganisation((cur) => (cur === initialOrganisation && fresh.organisation ? fresh.organisation : cur))
        // Whatever the member has typed, this is what is on file - so it is what
        // "unsaved changes" has to be measured against.
        setSaved(fresh)
      } catch {
        // A card that cannot re-check is still a card the member can type into.
      }
    })()
    return () => { cancelled = true }
  }, [blankOnLoad, initialFullName, initialOrganisation])

  // The confirmation is a note that a save happened, not a permanent state of
  // the page - it goes on its own rather than sitting there until the next one.
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const dirty = fullName !== (saved.fullName ?? '')
    || (collectOrganisation && organisation !== (saved.organisation ?? ''))

  // Only where the site asks for one AND insists on it. Checked on the value
  // rather than on whether it changed: a member who has never had one on file
  // has a blank box the moment they open the page, and letting them save their
  // name past it would leave the record exactly as short as before.
  const organisationMissing = collectOrganisation && requireOrganisation && organisation.trim().length === 0

  async function handleSave() {
    if (organisationMissing) {
      setMessage('')
      setError('Please give an organisation name.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/members/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The organisation is only sent by a site that asks for one. Sending it
        // regardless would have a site with the box switched off posting an
        // empty string over whatever the member had before it was switched off.
        body: JSON.stringify({ fullName, ...(collectOrganisation ? { organisation } : {}) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
      setSaved({ fullName: d.fullName ?? null, organisation: d.organisation ?? null })
      setMessage('Details updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div>
        <h2 className="card-title" style={{ margin: 0 }}>Your details</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Filled in for you at the checkout, so you only type them once.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {/* Side by side where there is room, one under the other where there is
          not. auto-fit rather than a media query: the card sits in a column
          whose width depends on the account layout, so the breakpoint that
          matters is this card's own, not the viewport's.
          `min(100%, 220px)` rather than a bare 220px: with a max-width set, the
          column count gets worked out against that 680 rather than against the
          space actually going, so a plain 220px asked for two columns on a
          phone. Two columns the card could not fit widened the whole account
          past the screen, and the member had to scroll sideways to read their
          own name. Capped at 100%, one column is always allowed to be narrow
          enough to fit. */}
      <div style={{
        display: 'grid',
        gap: 'var(--space-3)',
        gridTemplateColumns: collectOrganisation ? 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' : '1fr',
        maxWidth: collectOrganisation ? 680 : 320,
      }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="member-full-name">Full name</label>
          <input
            id="member-full-name"
            type="text"
            autoComplete="name"
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        {collectOrganisation && (
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="member-organisation">
              {requireOrganisation ? 'Organisation name' : 'Organisation name (optional)'}
            </label>
            <input
              id="member-organisation"
              type="text"
              autoComplete="organization"
              maxLength={120}
              required={requireOrganisation}
              aria-invalid={organisationMissing || undefined}
              aria-describedby={organisationMissing ? 'member-organisation-hint' : undefined}
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
            />
            {organisationMissing && (
              <p id="member-organisation-hint" className="field-hint" style={{ color: 'var(--color-error)' }}>
                Needed on your orders and invoices.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <button className="btn btn-primary btn-sm" disabled={saving || !dirty || organisationMissing} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </div>
  )
}
