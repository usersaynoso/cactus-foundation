'use client'

import { useEffect, useState } from 'react'

type MethodPolicy = 'OFF' | 'OPTIONAL' | 'REQUIRED'

type Config = {
  enabled: boolean
  registrationMode: 'OPEN' | 'INVITE_ONLY' | 'APPROVAL_REQUIRED'
  emailVerificationRequired: boolean
  registrationCollectUsername: boolean
  registrationCollectDisplayName: boolean
  registrationCollectPassword: boolean
  authMethodPolicies: {
    PASSKEY: MethodPolicy
    // Two states: there is nothing for a member to enrol, so "required" would
    // behave identically to "optional".
    MAGIC_LINK: 'OFF' | 'OPTIONAL'
    PASSWORD: MethodPolicy
  }
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

// Copy is written for a site owner, so each option says what the member ends up
// doing rather than naming the mechanism.
const AUTH_METHOD_FIELDS = [
  {
    key: 'PASSKEY',
    label: 'Passkey',
    hint: 'Face, fingerprint or screen lock. Nothing to remember and nothing to type.',
    requiredHint: 'Required members are asked to add one the first time they sign in, before anything else.',
    allowRequired: true,
  },
  {
    key: 'MAGIC_LINK',
    label: 'Email sign-in link',
    hint: 'A one-time link to their inbox. Needs no setup, which is why it has no "required" option - the mailbox is the credential.',
    requiredHint: null,
    allowRequired: false,
  },
  {
    key: 'PASSWORD',
    label: 'Password',
    hint: 'Always paired with a short code, so a stolen password on its own is no use to anyone.',
    requiredHint: 'Required members choose one when they sign up, and set up their second step on first sign-in.',
    allowRequired: true,
  },
] as const

// The tabs a member sees in their account area. Listed rather than derived from
// Object.keys so the order is the order of the tabs themselves, and so each one
// can say what switching it off actually takes away.
const ACCOUNT_SECTION_FIELDS = [
  {
    key: 'profile',
    label: 'Profile',
    hint: 'Display name, bio, website, picture and what shows on their public profile. Off, the page is gone and nothing on it can be saved - which is what you want if an account here is only ever a way to sign in.',
  },
  {
    key: 'security',
    label: 'Account & Security',
    hint: 'Their email address, passkeys, password, sign-in codes, active sessions and trusted browsers.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    hint: 'Which emails a member chooses to get. Stays hidden anyway until something on the site offers a choice.',
  },
  {
    key: 'activity',
    label: 'Activity',
    hint: 'A member\'s own history of sign-ins and changes to their account.',
  },
  {
    key: 'dangerZone',
    label: 'Danger zone',
    hint: 'Downloading their data and closing their account.',
  },
] as const

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

  const noMethodsEnabled = AUTH_METHOD_FIELDS.every((m) => config.authMethodPolicies[m.key] === 'OFF')

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
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.registrationCollectUsername} onChange={(e) => update('registrationCollectUsername', e.target.checked)} />
            Ask new members to choose a username
          </label>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            Off hides the field and makes one up from their email address, with a few random digits on the end.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={config.registrationCollectDisplayName} onChange={(e) => update('registrationCollectDisplayName', e.target.checked)} />
            Ask new members for a display name
          </label>
          {/* Only shown while passwords are optional. Off, there is no password
              to ask about; required, the sign-up form has to ask, so a switch
              that changed nothing would be worse than no switch at all. */}
          {config.authMethodPolicies.PASSWORD === 'OPTIONAL' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', cursor: 'pointer' }}>
                <input type="checkbox" checked={config.registrationCollectPassword} onChange={(e) => update('registrationCollectPassword', e.target.checked)} />
                Ask new members to set a password
              </label>
              <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
                Off hides the box and signing up asks for nothing to remember. Members can still add a
                password whenever they like, from the security page in their account.
              </p>
            </>
          )}
          {config.authMethodPolicies.PASSWORD === 'REQUIRED' && (
            <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
              Passwords are set to required, so the sign-up form always asks for one.
            </p>
          )}
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
          <p style={{ fontWeight: 600, margin: 'var(--space-4) 0 var(--space-1)' }}>Account area sections</p>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            Which tabs members get inside their account. Switching one off takes its tab and its summary card
            off the overview too.
          </p>
          {ACCOUNT_SECTION_FIELDS.map((section) => (
            <div key={section.key} style={{ marginBottom: 'var(--space-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.accountSectionsEnabled[section.key]}
                  onChange={(e) => update('accountSectionsEnabled', { ...config.accountSectionsEnabled, [section.key]: e.target.checked })}
                />
                {section.label}
              </label>
              <p className="field-hint" style={{ margin: 'var(--space-1) 0 0 1.6rem' }}>{section.hint}</p>
            </div>
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
          <p style={{ fontWeight: 600, margin: 'var(--space-4) 0 var(--space-1)' }}>Sign-in methods</p>
          <p className="field-hint" style={{ margin: '0 0 var(--space-3)' }}>
            Optional means members may set it up. Required means they must, and are walked through it on
            their way in.
          </p>
          {AUTH_METHOD_FIELDS.map((method) => (
            <div className="field" key={method.key}>
              <label>{method.label}</label>
              <select
                value={config.authMethodPolicies[method.key]}
                onChange={(e) => update('authMethodPolicies', {
                  ...config.authMethodPolicies,
                  [method.key]: e.target.value as MethodPolicy,
                })}
              >
                <option value="OFF">Off - never offered</option>
                <option value="OPTIONAL">Optional - members may use it</option>
                {method.allowRequired && <option value="REQUIRED">Required - every member must set it up</option>}
              </select>
              <span className="field-hint">
                {method.hint}
                {method.requiredHint && config.authMethodPolicies[method.key] === 'REQUIRED' && (
                  <> {method.requiredHint}</>
                )}
              </span>
            </div>
          ))}
          {noMethodsEnabled && (
            <div className="alert alert-danger">
              Every method is off, which leaves nobody - members or you - able to sign in. Turn at least one
              back on before saving.
            </div>
          )}
          {!noMethodsEnabled && config.authMethodPolicies.MAGIC_LINK === 'OFF' && (
            <div className="alert alert-warning">
              With the email sign-in link off, brand-new members have no way in: passkeys and passwords are
              both set up from inside an account they can&apos;t reach yet. Existing members are unaffected.
            </div>
          )}
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
