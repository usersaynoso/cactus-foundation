'use client'

import type { MemberDetail, MemberProfileFields, MemberSecuritySummary } from './member-detail-types'
import { STATUS_PRESENTATION, TWO_FACTOR_LABELS, formatDate, formatRelative } from './member-detail-format'
import { CheckIcon, CrossIcon, QuestionIcon } from './member-detail-icons'

// The right-hand rail: who this is, whether they may be emailed, and how they
// sign in. Always on screen whichever tab is open, because these are the three
// things somebody is checking before they do anything else on the page.

export function MemberSidePanel({ member, fields, security, now }: { member: MemberDetail; fields: MemberProfileFields; security: MemberSecuritySummary; now: number }) {
  return (
    <aside className="mbr-side" aria-label="Account summary">
      <AccountFacts member={member} fields={fields} security={security} now={now} />
      <MarketingConsentCard consent={member.marketingConsent} />
      <SecurityCard security={security} />
    </aside>
  )
}

function AccountFacts({ member, fields, security, now }: { member: MemberDetail; fields: MemberProfileFields; security: MemberSecuritySummary; now: number }) {
  const status = STATUS_PRESENTATION[member.status]
  return (
    <section className="card" aria-labelledby="mbr-facts-title">
      <div className="mbr-card-head">
        <h2 id="mbr-facts-title" className="card-title">Account</h2>
      </div>
      <dl className="mbr-facts">
        <dt>Status</dt>
        <dd title={status.hint}>{status.label}</dd>
        <dt>Email</dt>
        <dd>
          {member.emailVerified
            ? <span title={member.emailVerifiedAt ? `Verified ${formatDate(member.emailVerifiedAt)}` : undefined}>Verified</span>
            : <span style={{ color: 'var(--color-warning)' }}>Not verified</span>}
        </dd>
        {/* Who the account is made out to - what an order is addressed to and
            what the account page asks for - shown even when blank, so "not
            given" reads as an answer rather than a missing row. */}
        <dt>Full name</dt>
        <dd>{member.fullName || <span className="mbr-card-sub" style={{ display: 'inline' }}>Not given</span>}</dd>
        {(fields.organisation || member.organisation) && (
          <>
            <dt>Organisation</dt>
            <dd>{member.organisation || <span className="mbr-card-sub" style={{ display: 'inline' }}>Not given</span>}</dd>
          </>
        )}
        {member.roleName && (<><dt>Role</dt><dd>{member.roleName}</dd></>)}
        <dt>Joined</dt>
        <dd title={formatDate(member.createdAt)}>{formatRelative(member.createdAt, now)}</dd>
        <dt>Last signed in</dt>
        <dd title={security.lastLoginAt ? formatDate(security.lastLoginAt) : undefined}>{formatRelative(security.lastLoginAt, now)}</dd>
        <dt>Last seen</dt>
        <dd title={security.lastActiveAt ? formatDate(security.lastActiveAt) : undefined}>{formatRelative(security.lastActiveAt, now)}</dd>
      </dl>
    </section>
  )
}

const CONSENT_COPY = {
  yes: { label: 'Happy to hear from you', body: 'Said yes to marketing emails. Fine to include them in newsletters and offers.' },
  no: { label: 'No marketing, please', body: 'Said no to marketing emails. Order updates and account emails still go out as normal.' },
  unknown: { label: 'Never been asked', body: 'Nothing on the site has put the question to them yet, so treat it as a no until it has.' },
} as const

function MarketingConsentCard({ consent }: { consent: boolean | null }) {
  const key = consent === true ? 'yes' : consent === false ? 'no' : 'unknown'
  const copy = CONSENT_COPY[key]
  const Icon = key === 'yes' ? CheckIcon : key === 'no' ? CrossIcon : QuestionIcon
  return (
    <section className="card" aria-labelledby="mbr-consent-title">
      <div className="mbr-card-head">
        <h2 id="mbr-consent-title" className="card-title">Marketing emails</h2>
      </div>
      <div className="mbr-consent">
        <span className={`mbr-consent__dot mbr-consent__dot--${key}`} aria-hidden><Icon /></span>
        <div>
          <p className="mbr-consent__label">{copy.label}</p>
          <p className="mbr-card-sub">{copy.body}</p>
        </div>
      </div>
      <p className="mbr-card-sub" style={{ marginTop: 'var(--space-3)' }}>
        Follows the most recent answer they gave, so a later order can change it.
      </p>
    </section>
  )
}

function SecurityCard({ security }: { security: MemberSecuritySummary }) {
  const twoStep = security.twoFactorMethods.map((m) => TWO_FACTOR_LABELS[m]).join(', ')
  return (
    <section className="card" aria-labelledby="mbr-security-title">
      <div className="mbr-card-head">
        <h2 id="mbr-security-title" className="card-title">Signing in</h2>
      </div>
      <ul className="mbr-checklist">
        <ChecklistRow label="Password" on={security.hasPassword} onText="Set" offText="None" />
        <ChecklistRow
          label="Passkeys"
          on={security.passkeyCount > 0}
          onText={String(security.passkeyCount)}
          offText="None"
        />
        <ChecklistRow label="Two-step" on={twoStep.length > 0} onText={twoStep} offText="Off" />
        <ChecklistRow
          label="Signed-in devices"
          on={security.activeSessionCount > 0}
          onText={String(security.activeSessionCount)}
          offText="None"
        />
      </ul>
    </section>
  )
}

function ChecklistRow({ label, on, onText, offText }: { label: string; on: boolean; onText: string; offText: string }) {
  return (
    <li>
      <span>{label}</span>
      <span className={`mbr-checklist__state${on ? ' mbr-checklist__state--on' : ''}`}>{on ? onText : offText}</span>
    </li>
  )
}
