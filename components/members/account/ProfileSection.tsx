'use client'

import { useEffect, useState } from 'react'
import MemberAvatar from '@/components/members/MemberAvatar'

type Profile = {
  id: string
  username: string
  displayName: string | null
  bio: string | null
  websiteUrl: string | null
  avatarChoice: 'UPLOAD' | 'GRAVATAR' | 'GENERATED'
  avatarUrl: string | null
  avatarUploadsEnabled: boolean
}

type Visibility = { showBio: boolean; showJoinDate: boolean; showWebsite: boolean }

export default function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
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
        body: JSON.stringify({ displayName, bio, websiteUrl }),
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
      setProfile((p) => (p ? { ...p, avatarChoice: 'UPLOAD', avatarUrl: d.url } : p))
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
      if (res.ok) setProfile((p) => (p ? { ...p, avatarChoice: 'GENERATED', avatarUrl: null } : p))
      else setError(d.error ?? 'Failed to remove avatar')
    } finally {
      setUploading(false)
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
      setProfile((p) => (p ? { ...p, username: d.username } : p))
      setNewUsername('')
      setMessage('Username updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change username')
    } finally {
      setSavingUsername(false)
    }
  }

  async function updateVisibility(key: keyof Visibility, value: boolean) {
    setVisibility((v) => (v ? { ...v, [key]: value } : v))
    await fetch('/api/members/profile-visibility', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
  }

  if (!profile || !visibility) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

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
          {profile.avatarChoice === 'UPLOAD' && (
            <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={handleAvatarRemove}>
              Remove
            </button>
          )}
        </div>
        <span className="field-hint">Current: {profile.avatarChoice.toLowerCase()}</span>
      </div>

      <div className="field">
        <label>Username</label>
        <input type="text" value={profile.username} disabled />
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
            placeholder="New username"
          />
          <button className="btn btn-secondary btn-sm" disabled={!newUsername || savingUsername} onClick={handleUsernameSave}>
            {savingUsername ? 'Saving…' : 'Change'}
          </button>
        </div>
        <span className="field-hint">Your public profile stays reachable at your old address for a while after changing.</span>
      </div>

      <div className="field">
        <label>Display name</label>
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
      </div>

      <div className="field">
        <label>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
      </div>

      <div className="field">
        <label>Website</label>
        <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', margin: 'var(--space-6) 0 var(--space-3)', color: 'var(--color-text)' }}>
        Public profile visibility
      </h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={visibility.showBio} onChange={(e) => updateVisibility('showBio', e.target.checked)} />
        Show bio
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={visibility.showJoinDate} onChange={(e) => updateVisibility('showJoinDate', e.target.checked)} />
        Show join date
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={visibility.showWebsite} onChange={(e) => updateVisibility('showWebsite', e.target.checked)} />
        Show website
      </label>
    </div>
  )
}
