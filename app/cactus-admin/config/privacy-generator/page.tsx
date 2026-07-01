'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  assemblePolicyMarkdown,
  DISCLAIMER_TEXT,
  DATA_COLLECTED_OPTIONS,
  PURPOSE_OPTIONS,
  type WizardAnswers,
  type CustomThirdParty,
} from '@/lib/privacy/template'
import { markdownToHtml } from '@/lib/markdown-client'
import type { ConsentBannerConfig, ConsentCategory } from '@/lib/consent/types'

type SiteConfig = {
  siteName?: string
  emailFromAddress?: string
  privacyPolicyPageId?: string | null
  adminPath?: string
  consentBannerConfig?: ConsentBannerConfig | null
}

type Result = {
  pageId: string
  pageSlug: string
  wasLinked: boolean
  hadExistingLink: boolean
}

const STEPS = [
  { key: 'about', title: 'About your site' },
  { key: 'data', title: 'Data you collect' },
  { key: 'purposes', title: 'Why you collect it' },
  { key: 'thirdparties', title: 'Third-party services' },
  { key: 'jurisdiction', title: 'Jurisdiction' },
  { key: 'extras', title: 'Extras' },
]

// Keys that Cactus core always collects - pre-ticked and read-only.
// Email: required for signup. IP: rate limiting + truncated consent records.
// Device: passkey (WebAuthn) registration + session user-agent tracking.
const CORE_DATA = new Set(['emails', 'ip', 'device'])

// Purposes that Cactus always has - pre-ticked and read-only.
const CORE_PURPOSES = new Set(['service', 'account', 'security'])

const DEFAULT_THIRD_PARTIES: ConsentCategory[] = [
  { key: 'analytics', label: 'Analytics', description: 'Understand how visitors use the site', required: false, defaultOn: false },
  { key: 'marketing', label: 'Marketing', description: 'Personalised advertising and tracking', required: false, defaultOn: false },
]

function StepIndicator({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '2rem' }}>
      {STEPS.map((s, i) => {
        const done = i < step
        const active = i === step
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              title={s.title}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 600, flexShrink: 0,
                background: active ? 'var(--color-primary)' : done ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                color: active ? 'var(--color-text-inverse)' : done ? 'var(--color-primary)' : 'var(--color-text-muted)',
                border: `1px solid ${active ? 'var(--color-primary)' : done ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 20, height: 1, background: done ? 'var(--color-primary)' : 'var(--color-border)', flexShrink: 0 }} />
            )}
          </div>
        )
      })}
      <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        {STEPS[step]?.title}
      </span>
    </div>
  )
}

export default function PrivacyGeneratorPage() {
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const gdprTabUrl = `/${adminPath}/config?tab=gdpr`

  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [relinking, setRelinking] = useState(false)
  const [relinked, setRelinked] = useState(false)

  const [thirdPartyOptions, setThirdPartyOptions] = useState<ConsentCategory[]>(DEFAULT_THIRD_PARTIES)
  const [originalPrivacyPageId, setOriginalPrivacyPageId] = useState<string | null>(null)

  const [answers, setAnswers] = useState<WizardAnswers>({
    siteName: '',
    websiteUrl: '',
    contactEmail: '',
    businessAddress: '',
    dataCollected: [...CORE_DATA],
    purposes: [...CORE_PURPOSES],
    thirdParties: [],
    customThirdParties: [],
    jurisdiction: 'unsure',
    cookies: true,
    minimumAge: 'none',
    dpoName: '',
    dpoEmail: '',
  })

  const [newServiceLabel, setNewServiceLabel] = useState('')
  const [newServiceDescription, setNewServiceDescription] = useState('')
  const [addingService, setAddingService] = useState(false)

  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => r.ok ? r.json() : {})
      .then((cfg: SiteConfig) => {
        setOriginalPrivacyPageId(cfg.privacyPolicyPageId ?? null)
        const consent = cfg.consentBannerConfig ?? null
        const nonNecessary = consent?.categories?.filter((c) => !c.required) ?? null
        if (nonNecessary && nonNecessary.length > 0) {
          setThirdPartyOptions(nonNecessary)
          if (consent?.enabled) {
            setAnswers((prev) => ({
              ...prev,
              siteName: cfg.siteName ?? '',
              contactEmail: cfg.emailFromAddress ?? '',
              cookies: true,
              thirdParties: nonNecessary.map((c) => c.key),
            }))
            return
          }
        }
        setAnswers((prev) => ({
          ...prev,
          siteName: cfg.siteName ?? '',
          contactEmail: cfg.emailFromAddress ?? '',
        }))
      })
      .catch(() => {})
  }, [])

  function update<K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function toggleArray(key: 'dataCollected' | 'purposes' | 'thirdParties', value: string) {
    const locked = key === 'dataCollected' ? CORE_DATA : key === 'purposes' ? CORE_PURPOSES : null
    if (locked?.has(value)) return
    setAnswers((prev) => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })
  }

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const markdown = assemblePolicyMarkdown(answers)
      const html = markdownToHtml(markdown)

      // Create the page, trying slug suffixes on conflict
      let pageId = ''
      let pageSlug = ''
      const slugBase = 'privacy-policy'
      for (let attempt = 0; attempt < 10; attempt++) {
        const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt + 1}`
        const res = await fetch('/api/admin/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Privacy Policy', slug, bodyFormat: 'builder', status: 'draft' }),
        })
        if (res.status === 409) continue
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to create page')
        }
        const d = await res.json()
        pageId = d.id
        pageSlug = slug
        break
      }

      if (!pageId) throw new Error('Could not find a free slug for the privacy policy page.')

      // Persist the policy as a single RichTextBlock
      const autosaveRes = await fetch(`/api/admin/pages/${pageId}/autosave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            root: { props: { title: 'Privacy Policy', slug: pageSlug } },
            content: [{ type: 'RichTextBlock', props: { id: pageId, content: html, padding: 'md' } }],
            zones: {},
          },
        }),
      })
      if (!autosaveRes.ok) {
        const d = await autosaveRes.json()
        throw new Error(d.error ?? 'Failed to save policy content')
      }

      // Link privacyPolicyPageId if not already set
      let wasLinked = false
      if (!originalPrivacyPageId) {
        const patchRes = await fetch('/api/admin/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privacyPolicyPageId: pageId }),
        })
        if (patchRes.ok) wasLinked = true
      }

      setResult({ pageId, pageSlug, wasLinked, hadExistingLink: !!originalPrivacyPageId })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  async function relinkToNew() {
    if (!result) return
    setRelinking(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyPolicyPageId: result.pageId }),
      })
      if (!res.ok) throw new Error('Failed to update link')
      setRelinked(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update link')
    } finally {
      setRelinking(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Privacy policy generated</h1>
        </div>
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <strong>Done.</strong> Your privacy policy draft has been created and is ready to review.
        </div>

        {result.hadExistingLink && !relinked && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9375rem' }}>
              Your GDPR settings already point to a different privacy policy page. Would you like to update the link to the newly generated page?
            </p>
            {error && <div className="alert alert-danger" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" disabled={relinking} onClick={relinkToNew}>
                {relinking ? 'Updating…' : 'Point to the new page'}
              </button>
              <button className="btn btn-secondary" onClick={() => router.push(gdprTabUrl)}>
                Keep the existing link
              </button>
            </div>
          </div>
        )}

        {relinked && (
          <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
            The privacy policy link has been updated.
          </div>
        )}

        {result.wasLinked && (
          <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            The privacy policy link in your GDPR settings has been set to the new page.
          </p>
        )}

        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          The page was saved as a <strong>draft</strong>. Review it carefully - and ideally with a legal professional - before publishing. Once you&apos;re happy, open it in the builder and publish it from there.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a href={`/${adminPath}/pages/${result.pageId}`} className="btn btn-primary">
            Open draft in builder
          </a>
          <a href={gdprTabUrl} className="btn btn-secondary">
            Back to GDPR settings
          </a>
        </div>
      </div>
    )
  }

  // ── Disclaimer gate ─────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Privacy policy generator</h1>
          <a href={gdprTabUrl} className="btn btn-secondary">Cancel</a>
        </div>
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          <strong>Before you begin - important notice</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9375rem' }}>
            {DISCLAIMER_TEXT}
          </p>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
          This wizard asks you six quick questions about your site and assembles a reasonable starting-point privacy policy. You&apos;ll get a draft page in your builder to review and edit before publishing.
        </p>
        <button className="btn btn-primary" onClick={() => setStarted(true)}>
          I understand - continue
        </button>
      </div>
    )
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────
  const isLastStep = step === STEPS.length - 1

  function canProceed(): boolean {
    if (step === 0) {
      return !!answers.siteName.trim() && !!answers.contactEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.contactEmail)
    }
    return true
  }

  const coreRowStyle: React.CSSProperties = { opacity: 0.65, cursor: 'default' }
  const optionalDataKeys = DATA_COLLECTED_OPTIONS.filter((o) => !CORE_DATA.has(o.key))
  const optionalPurposeKeys = PURPOSE_OPTIONS.filter((o) => !CORE_PURPOSES.has(o.key))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Privacy policy generator</h1>
        <a href={gdprTabUrl} className="btn btn-secondary">Cancel</a>
      </div>

      <StepIndicator step={step} />

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Step 1 - About */}
      {step === 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Site name <span style={{ color: 'var(--color-destructive)' }}>*</span></label>
              <input
                value={answers.siteName}
                onChange={(e) => update('siteName', e.target.value)}
                placeholder="Acme Ltd"
                autoFocus
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Website URL</label>
              <input
                value={answers.websiteUrl}
                onChange={(e) => update('websiteUrl', e.target.value)}
                placeholder="https://example.com"
                type="url"
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Contact email <span style={{ color: 'var(--color-destructive)' }}>*</span></label>
              <input
                value={answers.contactEmail}
                onChange={(e) => update('contactEmail', e.target.value)}
                placeholder="privacy@example.com"
                type="email"
              />
              <span className="field-hint">For data subject requests. Pre-filled from your email settings.</span>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Business address</label>
              <input
                value={answers.businessAddress}
                onChange={(e) => update('businessAddress', e.target.value)}
                placeholder="123 High Street, London, EC1A 1BB"
              />
              <span className="field-hint">Optional - shown in the contact section.</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 - Data collected */}
      {step === 1 && (
        <div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9375rem' }}>
            Which types of personal information does your site collect? Select all that apply.
          </p>

          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', fontWeight: 500 }}>
            Always collected by Cactus
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            {DATA_COLLECTED_OPTIONS.filter((o) => CORE_DATA.has(o.key)).map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.9375rem', ...coreRowStyle }}>
                <input type="checkbox" checked disabled />
                {opt.label}
              </label>
            ))}
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', fontWeight: 500 }}>
            Also collected (tick any that apply)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {optionalDataKeys.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={answers.dataCollected.includes(opt.key)}
                  onChange={() => toggleArray('dataCollected', opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 - Purposes */}
      {step === 2 && (
        <div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9375rem' }}>
            Why do you collect personal information? Select all that apply.
          </p>

          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', fontWeight: 500 }}>
            Core purposes (always applicable)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            {PURPOSE_OPTIONS.filter((o) => CORE_PURPOSES.has(o.key)).map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.9375rem', ...coreRowStyle }}>
                <input type="checkbox" checked disabled />
                {opt.label}
              </label>
            ))}
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', fontWeight: 500 }}>
            Additional purposes (tick any that apply)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {optionalPurposeKeys.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={answers.purposes.includes(opt.key)}
                  onChange={() => toggleArray('purposes', opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 4 - Third-party services */}
      {step === 3 && (
        <div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9375rem' }}>
            Which types of third-party services does your site use? The policy will mention these in generic terms - no specific vendors named.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
            {thirdPartyOptions.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={answers.thirdParties.includes(opt.key)}
                  onChange={() => toggleArray('thirdParties', opt.key)}
                />
                <span>
                  <strong>{opt.label}</strong>
                  {opt.description && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> - {opt.description}</span>}
                </span>
              </label>
            ))}
          </div>

          {/* Custom services */}
          {answers.customThirdParties.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {answers.customThirdParties.map((svc, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', padding: '0.5rem 0.75rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '0.9375rem' }}>
                  <span style={{ flex: 1 }}>
                    <strong>{svc.label}</strong>
                    {svc.description && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> - {svc.description}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => update('customThirdParties', answers.customThirdParties.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0 0.25rem', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingService ? (
            <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.875rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.75rem' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Service name</label>
                  <input
                    value={newServiceLabel}
                    onChange={(e) => setNewServiceLabel(e.target.value)}
                    placeholder="e.g. Payment processing"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newServiceLabel.trim()) {
                        update('customThirdParties', [...answers.customThirdParties, { label: newServiceLabel.trim(), description: newServiceDescription.trim() }])
                        setNewServiceLabel('')
                        setNewServiceDescription('')
                        setAddingService(false)
                      }
                    }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Description <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
                  <input
                    value={newServiceDescription}
                    onChange={(e) => setNewServiceDescription(e.target.value)}
                    placeholder="e.g. Used to securely handle transactions."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!newServiceLabel.trim()}
                  onClick={() => {
                    update('customThirdParties', [...answers.customThirdParties, { label: newServiceLabel.trim(), description: newServiceDescription.trim() }])
                    setNewServiceLabel('')
                    setNewServiceDescription('')
                    setAddingService(false)
                  }}
                >
                  Add
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAddingService(false); setNewServiceLabel(''); setNewServiceDescription('') }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setAddingService(true)}>
              + Add a custom service
            </button>
          )}

          {answers.thirdParties.length === 0 && answers.customThirdParties.length === 0 && (
            <p className="field-hint" style={{ marginTop: '1rem' }}>
              Nothing selected - the third-party section will be omitted from the policy.
            </p>
          )}
        </div>
      )}

      {/* Step 5 - Jurisdiction */}
      {step === 4 && (
        <div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.9375rem' }}>
            Which jurisdiction(s) apply to your site? This determines which rights clauses appear in the policy.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {([
              { value: 'eu-uk', label: 'EU / UK', hint: 'Adds GDPR and UK GDPR rights clause' },
              { value: 'us', label: 'United States', hint: 'Adds CCPA/CPRA (California) rights clause' },
              { value: 'both', label: 'Both EU/UK and US', hint: 'Adds both GDPR and CCPA rights clauses' },
              { value: 'unsure', label: "I'm not sure / international", hint: 'Omits jurisdiction-specific clauses' },
            ] as const).map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="radio"
                  name="jurisdiction"
                  value={opt.value}
                  checked={answers.jurisdiction === opt.value}
                  onChange={() => update('jurisdiction', opt.value)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>{opt.label}</strong>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.8125rem' }}>{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 6 - Extras */}
      {step === 5 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Cookies</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontWeight: 400, height: 36, marginTop: 1, ...coreRowStyle }}>
                <input type="checkbox" checked disabled />
                Your site uses cookies
              </label>
              <span className="field-hint">Cactus uses session cookies for login.</span>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Minimum age</label>
              <select value={answers.minimumAge} onChange={(e) => update('minimumAge', e.target.value as WizardAnswers['minimumAge'])}>
                <option value="none">No age restriction</option>
                <option value="under-13">Under 13 (COPPA / GDPR children)</option>
                <option value="under-16">Under 16 (EU GDPR default)</option>
              </select>
              <span className="field-hint">Adds a children&apos;s privacy clause if set.</span>
            </div>
          </div>

          {(answers.jurisdiction === 'eu-uk' || answers.jurisdiction === 'both') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Data protection officer name</label>
                <input
                  value={answers.dpoName}
                  onChange={(e) => update('dpoName', e.target.value)}
                  placeholder="Jane Smith"
                />
                <span className="field-hint">Optional - leave blank if you don&apos;t have a designated DPO.</span>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>DPO email</label>
                <input
                  value={answers.dpoEmail}
                  onChange={(e) => update('dpoEmail', e.target.value)}
                  placeholder="dpo@example.com"
                  type="email"
                  disabled={!answers.dpoName}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
        {step > 0 && (
          <button className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        )}
        {!isLastStep && (
          <button className="btn btn-primary" disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        )}
        {isLastStep && (
          <button className="btn btn-primary" disabled={generating} onClick={generate}>
            {generating ? 'Generating…' : 'Generate policy'}
          </button>
        )}
      </div>
    </div>
  )
}
