'use client'

import { useEffect, useState } from 'react'

type Config = {
  enabled: boolean
  registrationMode: 'OPEN' | 'INVITE_ONLY' | 'APPROVAL_REQUIRED'
  emailVerificationRequired: boolean
  allowedAuthMethods: string[]
  passwordsEnabled: boolean
  smsTwoFactorPolicy: 'OPTIONAL' | 'REQUIRED'
  trustedBrowserDays: number
  sessionDays: number
  avatarUploadsEnabled: boolean
  gravatarEnabled: boolean
  siteWideMembersOnly: boolean
  siteWideMembersOnlyExceptions: string[]
  guestPreviewEnabled: boolean
  usernameChangesEnabled: boolean
  usernameChangeCooldownDays: number
  usernameRedirectDays: number
  deletionGracePeriodDays: number
  adminNotifyOnDeletion: boolean
  postRegistrationRedirect: string | null
  allowedEmailDomains: string[]
  blockedEmailDomains: string[]
  notifyAdminOnPendingApproval: boolean
  profileVisibility: 'PUBLIC' | 'MEMBERS_ONLY' | 'HIDDEN'
  accountSectionsEnabled: {
    profile: boolean
    security: boolean
    notifications: boolean
    activity: boolean
    dangerZone: boolean
  }
  directoryEnabled: boolean
}

export type MembersSettingsTabKey = 'registration' | 'avatars' | 'usernames' | 'sections' | 'access'
type Tab = MembersSettingsTabKey

const AUTH_METHODS = ['PASSKEY', 'MAGIC_LINK', 'PASSWORD'] as const

function listToText(list: string[]): string {
  return list.join('\n')
}
function textToList(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

export default function MembersSettingsTab({ tab }: { tab: Tab }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [memberAreaPath, setMemberAreaPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/members/settings').then((r) => r.json()).then((d) => {
      setConfig(d.config)
      setMemberAreaPath(d.memberAreaPath)
    })
  }, [])

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function save() {
    if (!config) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/admin/members/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
      setConfig(d.config)
      setMessage('Settings saved.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  return (
    <div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {tab === 'registration' && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.enabled} onChange={(e) => update('enabled', e.target.checked)} />
            <strong>Members system enabled</strong>
          </label>
          <div className="field">
            <label>Registration mode</label>
            <select value={config.registrationMode} onChange={(e) => update('registrationMode', e.target.value as Config['registrationMode'])}>
              <option value="OPEN">Open</option>
              <option value="INVITE_ONLY">Invite only</option>
              <option value="APPROVAL_REQUIRED">Approval required</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.emailVerificationRequired} onChange={(e) => update('emailVerificationRequired', e.target.checked)} />
            Require email verification
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.notifyAdminOnPendingApproval} onChange={(e) => update('notifyAdminOnPendingApproval', e.target.checked)} />
            Notify admins when a member awaits approval
          </label>
          <div className="field">
            <label>Allowed email domains (one per line, empty = all allowed)</label>
            <textarea value={listToText(config.allowedEmailDomains)} onChange={(e) => update('allowedEmailDomains', textToList(e.target.value))} />
          </div>
          <div className="field">
            <label>Blocked email domains (one per line)</label>
            <textarea value={listToText(config.blockedEmailDomains)} onChange={(e) => update('blockedEmailDomains', textToList(e.target.value))} />
          </div>
          <div className="field">
            <label>Post-registration redirect (optional path)</label>
            <input
              type="text"
              value={config.postRegistrationRedirect ?? ''}
              onChange={(e) => update('postRegistrationRedirect', e.target.value || null)}
              placeholder="/"
            />
          </div>
        </div>
      )}

      {tab === 'avatars' && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.avatarUploadsEnabled} onChange={(e) => update('avatarUploadsEnabled', e.target.checked)} />
            Allow avatar uploads
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.gravatarEnabled} onChange={(e) => update('gravatarEnabled', e.target.checked)} />
            Allow Gravatar
          </label>
        </div>
      )}

      {tab === 'usernames' && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.usernameChangesEnabled} onChange={(e) => update('usernameChangesEnabled', e.target.checked)} />
            Allow members to change their username
          </label>
          <div className="field">
            <label>Change cooldown (days)</label>
            <input type="number" min={0} value={config.usernameChangeCooldownDays} onChange={(e) => update('usernameChangeCooldownDays', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Old-username redirect window (days)</label>
            <input type="number" min={0} value={config.usernameRedirectDays} onChange={(e) => update('usernameRedirectDays', Number(e.target.value))} />
          </div>
        </div>
      )}

      {tab === 'sections' && (
        <div>
          <div className="field">
            <label>Public profile visibility</label>
            <select value={config.profileVisibility} onChange={(e) => update('profileVisibility', e.target.value as Config['profileVisibility'])}>
              <option value="PUBLIC">Public</option>
              <option value="MEMBERS_ONLY">Members only</option>
              <option value="HIDDEN">Hidden</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.directoryEnabled} onChange={(e) => update('directoryEnabled', e.target.checked)} />
            Enable public member directory
          </label>
          <p style={{ fontWeight: 600, margin: 'var(--space-4) 0 var(--space-2)' }}>Account area sections</p>
          {(Object.keys(config.accountSectionsEnabled) as Array<keyof Config['accountSectionsEnabled']>).map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.accountSectionsEnabled[key]}
                onChange={(e) => update('accountSectionsEnabled', { ...config.accountSectionsEnabled, [key]: e.target.checked })}
              />
              {key}
            </label>
          ))}
        </div>
      )}

      {tab === 'access' && (
        <div>
          <div className="field">
            <label>Member area path</label>
            <input type="text" value={`/${memberAreaPath}`} disabled />
            <span className="field-hint">Set via the MEMBER_AREA_PATH environment variable - deploy-time only.</span>
          </div>
          <p style={{ fontWeight: 600, margin: 'var(--space-4) 0 var(--space-2)' }}>Allowed sign-in methods</p>
          {AUTH_METHODS.map((method) => (
            <label key={method} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.allowedAuthMethods.includes(method)}
                onChange={(e) => update(
                  'allowedAuthMethods',
                  e.target.checked
                    ? [...config.allowedAuthMethods, method]
                    : config.allowedAuthMethods.filter((m) => m !== method)
                )}
              />
              {method === 'PASSKEY' ? 'Passkey' : method === 'MAGIC_LINK' ? 'Magic link' : 'Password'}
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 'var(--space-3) 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.passwordsEnabled} onChange={(e) => update('passwordsEnabled', e.target.checked)} />
            Enable password sign-in (2FA becomes mandatory)
          </label>
          <div className="field">
            <label>Mobile number for sign-in codes</label>
            <select value={config.smsTwoFactorPolicy} onChange={(e) => update('smsTwoFactorPolicy', e.target.value as Config['smsTwoFactorPolicy'])}>
              <option value="OPTIONAL">Optional - members may add one if they like</option>
              <option value="REQUIRED">Required - members must add one</option>
            </select>
            <span className="field-hint">
              Applies to password sign-in only, and only while a text-message module (such as Twilio)
              is installed and configured. Members without a number are still let in with email codes,
              but are prompted to add one until they do.
            </span>
          </div>
          <div className="field">
            <label>Session duration (days)</label>
            <input type="number" min={1} value={config.sessionDays} onChange={(e) => update('sessionDays', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Trusted browser duration (days)</label>
            <input type="number" min={1} value={config.trustedBrowserDays} onChange={(e) => update('trustedBrowserDays', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Deletion grace period (days)</label>
            <input type="number" min={0} value={config.deletionGracePeriodDays} onChange={(e) => update('deletionGracePeriodDays', Number(e.target.value))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.adminNotifyOnDeletion} onChange={(e) => update('adminNotifyOnDeletion', e.target.checked)} />
            Notify admins when a member requests deletion
          </label>
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-4) 0' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.siteWideMembersOnly} onChange={(e) => update('siteWideMembersOnly', e.target.checked)} />
            Site-wide members-only mode
          </label>
          <div className="field">
            <label>Exceptions (path prefixes, one per line)</label>
            <textarea value={listToText(config.siteWideMembersOnlyExceptions)} onChange={(e) => update('siteWideMembersOnlyExceptions', textToList(e.target.value))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.guestPreviewEnabled} onChange={(e) => update('guestPreviewEnabled', e.target.checked)} />
            Show a guest preview (teaser) instead of a hard block
          </label>
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }} disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  )
}
