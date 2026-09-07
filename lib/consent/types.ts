export type ConsentCategory = {
  key: string
  label: string
  description: string
  required: boolean
  defaultOn: boolean
}

export type ConsentBannerConfig = {
  enabled: boolean
  style: 'bottom-bar' | 'modal'
  title: string
  body: string
  acceptAllLabel: string
  rejectAllLabel: string
  manageLabel: string
  dismissLabel: string
  categories: ConsentCategory[]
  // Puts an editable copy of the category switches at the top of the page linked
  // as the privacy policy, so a visitor can revisit their choice without waiting
  // for the banner to ask again.
  showPrivacyPagePanel: boolean
  reConsentDays: number
  consentLogRetentionDays: number | null
  categoriesVersion: number
  copyVersion: number
}

export const DEFAULT_CONSENT_BANNER_CONFIG: ConsentBannerConfig = {
  enabled: false,
  style: 'bottom-bar',
  title: 'Cookie preferences',
  body: 'We use cookies to improve your experience. You can choose which types to allow. See our {privacyPolicy} for details.',
  acceptAllLabel: 'Accept all',
  rejectAllLabel: 'Reject all',
  manageLabel: 'Manage preferences',
  dismissLabel: 'Got it',
  categories: [
    {
      key: 'necessary',
      label: 'Necessary',
      description: 'Essential cookies required for the site to function. Cannot be disabled.',
      required: true,
      defaultOn: true,
    },
    {
      key: 'preferences',
      label: 'Preferences',
      description: 'Remembers your settings and choices, such as language, region, or saved display options.',
      required: false,
      defaultOn: false,
    },
    {
      key: 'analytics',
      label: 'Analytics',
      description: 'Help us understand how visitors use the site.',
      required: false,
      defaultOn: false,
    },
    {
      key: 'marketing',
      label: 'Marketing',
      description: 'Allow personalised advertising and tracking.',
      required: false,
      defaultOn: false,
    },
  ],
  showPrivacyPagePanel: true,
  reConsentDays: 365,
  consentLogRetentionDays: null,
  categoriesVersion: 0,
  copyVersion: 0,
}

// The one category a visitor cannot switch off is the one that has to be read
// first, so it is pinned to the top of every list rather than left wherever the
// owner's last drag, an older config or a hand-written payload happened to put
// it. Ordering is presentation only - it never changes which categories exist,
// so it must not re-prompt anyone who has already decided.
export const NECESSARY_CATEGORY_KEY = 'necessary'

export function withNecessaryFirst(categories: ConsentCategory[]): ConsentCategory[] {
  const at = categories.findIndex((c) => c.key === NECESSARY_CATEGORY_KEY)
  if (at <= 0) return categories
  const next = [...categories]
  const [necessary] = next.splice(at, 1)
  next.unshift(necessary!)
  return next
}

export type ConsentDecision = Record<string, boolean>

export type ConsentCookiePayload = {
  version: number
  decision: ConsentDecision
  at: string
}
