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
  reConsentDays: 365,
  consentLogRetentionDays: null,
  categoriesVersion: 0,
  copyVersion: 0,
}

export type ConsentDecision = Record<string, boolean>

export type ConsentCookiePayload = {
  version: number
  decision: ConsentDecision
  at: string
}
