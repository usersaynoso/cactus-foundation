'use client'

import { useEffect, useState } from 'react'
import MemberAvatar from '@/components/members/MemberAvatar'

type AvatarChoice = 'UPLOAD' | 'GRAVATAR' | 'GENERATED'

const AVATAR_CHOICE_LABELS: Record<AvatarChoice, string> = {
  UPLOAD: 'Uploaded photo',
  GRAVATAR: 'Gravatar',
  GENERATED: 'Initials',
}

type Profile = {
  id: string
  username: string
  displayName: string | null
  bio: string | null
  websiteUrl: string | null
  avatarChoice: AvatarChoice
  avatarUrl: string | null
  avatarUploadsEnabled: boolean
  gravatarEnabled: boolean
  hasUploadedAvatar: boolean
  usernameEnabled: boolean
  displayNameEnabled: boolean
  usernameChangesEnabled: boolean
  usernameNextChangeOn: string | null
  usernameRedirects: boolean
  bioEnabled: boolean
  websiteEnabled: boolean
  publicProfile: 'PUBLIC' | 'MEMBERS_ONLY' | 'HIDDEN'
}

type Visibility = { showBio: boolean; showJoinDate: boolean; showWebsite: boolean }

export default function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/members/profile').then((r) => r.json()).then((d: Profile) => {
      setProfile(d)
      setDisplayName(d.displayName ?? '')
      setBio(d.bio ?? '')
      setWebsiteUrl(d.websiteUrl ?? '')
    })
    fetch('/api/members/profile-visibility').then((r) => r.json()).then(setVisibility)
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/members/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Left out entirely rather than sent empty when the site doesn't ask
        // for one: a member who had a display name before the switch went off
        // keeps it, instead of a hidden field quietly blanking it on first save.
        // Bio and website follow the same rule as the display name.
        body: JSON.stringify({
          ...(profile?.displayNameEnabled ? { displayName } : {}),
          ...(profile?.bioEnabled ? { bio } : {}),
          ...(profile?.websiteEnabled ? { websiteUrl } : {}),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
      setMessage('Profile updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(file: File) {
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/members/avatar', { method: 'POST', body: formData })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      setProfile((p) => (p ? { ...p, avatarChoice: 'UPLOAD', avatarUrl: d.url, hasUploadedAvatar: true } : p))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleAvatarRemove() {
    setUploading(true)
    try {
      const res = await fetch('/api/members/avatar', { method: 'DELETE' })
      const d = await res.json()
      // The server decides what replaces it - Gravatar where the site allows
      // it, initials otherwise - so the preview follows its answer rather than
      // assuming initials and disagreeing until the next reload.
      if (res.ok) setProfile((p) => (p ? { ...p, avatarChoice: d.avatarChoice ?? 'GENERATED', avatarUrl: null, hasUploadedAvatar: false } : p))
      else setError(d.error ?? 'Failed to remove avatar')
    } finally {
      setUploading(false)
    }
  }

  async function handleAvatarChoice(avatarChoice: AvatarChoice) {
    const previous = profile?.avatarChoice
    setError('')
    setProfile((p) => (p ? { ...p, avatarChoice } : p))
    const res = await fetch('/api/members/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarChoice }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to change picture')
      if (previous) setProfile((p) => (p ? { ...p, avatarChoice: previous } : p))
    }
  }

  async function handleUsernameSave() {
    setSavingUsername(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/members/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to change username')
      // A real change starts the cooldown; re-casing does not. Re-read rather
      // than guess, so the hint under the box tells the truth straight away.
      const fresh = await fetch('/api/members/profile').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Profile | null
      setProfile((p) => (fresh ? { ...(p ?? fresh), ...fresh } : p ? { ...p, username: d.username } : p))
      setNewUsername('')
      setEditingUsername(false)
      setMessage('Username updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change username')
    } finally {
      setSavingUsername(false)
    }
  }

  // Ticked straight away so the box feels instant, and put back if the save
  // fails - a tick that stays ticked while the server kept the old answer
  // tells the member their profile shows something it does not.
  async function updateVisibility(key: keyof Visibility, value: boolean) {
    setError('')
    setVisibility((v) => (v ? { ...v, [key]: value } : v))
    let failure: string | null = null
    try {
      const res = await fetch('/api/members/profile-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        failure = d.error ?? 'Could not save that change'
      }
    } catch {
      failure = 'Could not save that change'
    }
    if (failure) {
      setVisibility((v) => (v ? { ...v, [key]: !value } : v))
      setError(failure)
    }
  }

  if (!profile || !visibility) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  // Only the sources actually available to this member: an upload they haven't
  // made isn't a choice, and neither is a Gravatar the site has switched off.
  const avatarChoices: AvatarChoice[] = [
    ...(profile.hasUploadedAvatar && profile.avatarUploadsEnabled ? (['UPLOAD'] as const) : []),
    ...(profile.gravatarEnabled ? (['GRAVATAR'] as const) : []),
    'GENERATED',
  ]

  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-4)', color: 'var(--color-text)' }}>
        Profile
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="field">
        <label>Avatar</label>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <MemberAvatar
            memberId={profile.id}
            username={profile.username}
            displayName={displayName || profile.displayName}
            avatarChoice={profile.avatarChoice}
            uploadedUrl={profile.avatarUrl}
            size={56}
          />
          {profile.avatarUploadsEnabled && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }}
            />
          )}
          {profile.hasUploadedAvatar && (
            <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={handleAvatarRemove}>
              Remove
            </button>
          )}
        </div>
        {/* Without this the Gravatar setting was unreachable: nothing else in
            the account area ever moved a member off the initials they were
            created with, so a site could switch Gravatar on and never see one. */}
        {avatarChoices.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {avatarChoices.map((choice) => (
              <label key={choice} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', color: 'var(--color-text)' }}>
                <input
                  type="radio"
                  name="avatarChoice"
                  value={choice}
                  checked={profile.avatarChoice === choice}
                  onChange={() => handleAvatarChoice(choice)}
                />
                {AVATAR_CHOICE_LABELS[choice]}
              </label>
            ))}
          </div>
        )}
        {profile.gravatarEnabled && (
          <span className="field-hint">
            Gravatar shows the picture attached to your email address at gravatar.com. Haven&apos;t got one? You&apos;ll get your initials instead.
          </span>
        )}
      </div>

      {/* Both blocks follow the sign-up switches. A site that never asked for a
          handle generated one from the email address, and putting that in front
          of the member - let alone offering to change it - is showing them a
          field the site decided it didn't want. Same for a display name. */}
      {profile.usernameEnabled && (
        <div className="field">
          <label>Username</label>
          <input type="text" value={profile.username} disabled />
          {/* The change form only exists where the change can succeed. Username
              changes are off by default, and POST /api/members/username 403s on
              that, so the button spent its life being a promise the site had no
              intention of keeping. The read-only box stays either way - members
              are entitled to know their own handle. Behind a button because a
              username is changed once in a blue moon, and an empty box beside it
              on every visit invites somebody to type in it. */}
          {profile.usernameChangesEnabled && !editingUsername && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setNewUsername(profile.username); setEditingUsername(true); setError(''); setMessage('') }}
              >
                Change Username
              </button>
            </div>
          )}
          {profile.usernameChangesEnabled && editingUsername && (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="New username"
                  aria-label="New username"
                  autoComplete="username"
                  maxLength={32}
                  autoFocus
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!newUsername.trim() || newUsername.trim() === profile.username || savingUsername}
                  onClick={handleUsernameSave}
                >
                  {savingUsername ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={savingUsername}
                  onClick={() => { setEditingUsername(false); setNewUsername('') }}
                >
                  Cancel
                </button>
              </div>
              <span className="field-hint">
                Letters, numbers, hyphens and underscores. Capitals are fine.
                {profile.usernameNextChangeOn
                  ? <> You can pick a different name from {profile.usernameNextChangeOn}; changing only the capitals is fine any time.</>
                  : profile.usernameRedirects
                    ? <> Your public profile stays reachable at your old address for a while after changing.</>
                    : null}
              </span>
            </>
          )}
        </div>
      )}

      {profile.displayNameEnabled && (
        <div className="field">
          <label>Display name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
        </div>
      )}

      {profile.bioEnabled && (
        <div className="field">
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
        </div>
      )}

      {profile.websiteEnabled && (
        <div className="field">
          <label>Website</label>
          <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
        </div>
      )}

      <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {/* Only while the site has public profiles at all. Hidden, there is no
          profile for these switches to shape, so offering them would be asking
          the member to decide something that changes nothing. */}
      {profile.publicProfile !== 'HIDDEN' && (
        <>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: 'var(--space-6) 0 var(--space-2)', color: 'var(--color-text)' }}>
            Public profile visibility
          </h3>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            {profile.publicProfile === 'MEMBERS_ONLY'
              ? 'Other signed-in members can see your profile. Choose what it shows.'
              : 'Anyone can see your profile. Choose what it shows.'}{' '}
            <a href={`/members/${encodeURIComponent(profile.username)}`}>View your profile</a>
          </p>
          {profile.bioEnabled && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={visibility.showBio} onChange={(e) => updateVisibility('showBio', e.target.checked)} />
              Show bio
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={visibility.showJoinDate} onChange={(e) => updateVisibility('showJoinDate', e.target.checked)} />
            Show join date
          </label>
          {profile.websiteEnabled && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={visibility.showWebsite} onChange={(e) => updateVisibility('showWebsite', e.target.checked)} />
              Show website
            </label>
          )}
        </>
      )}
    </div>
  )
}
