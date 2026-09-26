// ---------------------------------------------------------------------------
// Which way the site's own email goes: Brevo's API, or an ordinary mail
// account over SMTP.
//
// Both sets of details can be filled in at once (Settings > Emails), and for a
// long time the answer was simply "Brevo if there is a Brevo key, otherwise
// SMTP" - which left an owner with both filled in no way to choose SMTP, and no
// way to tell from the screen which one was in use. SiteConfig.emailProvider is
// the choice. Left unset, it is the old rule exactly, so nothing changes for a
// site until somebody picks.
//
// A choice whose details are missing does not stop the mail. It falls back to
// whichever one IS set up and says so in the log, because an order confirmation
// that never went is worse than one that went the other way - and the settings
// screen warns about exactly this case before it can happen.
//
// Pure, and safe to import from a browser: the settings screen uses the same
// rule to say which one is in use.
// ---------------------------------------------------------------------------

export type EmailProvider = 'brevo' | 'smtp'

export type ProviderAvailability = { brevo: boolean; smtp: boolean }

/** A stored choice, or null for "not chosen" and for anything unrecognised. */
export function parseEmailProvider(value: unknown): EmailProvider | null {
  return value === 'brevo' || value === 'smtp' ? value : null
}

export type ProviderResolution = {
  provider: EmailProvider
  /** True when the choice could not be honoured because its details are
   *  missing, and the other one is carrying the mail instead. */
  fellBack: boolean
}

export function resolveEmailProvider(chosen: EmailProvider | null, available: ProviderAvailability): ProviderResolution {
  if (chosen === 'smtp') {
    if (available.smtp || !available.brevo) return { provider: 'smtp', fellBack: false }
    return { provider: 'brevo', fellBack: true }
  }
  if (chosen === 'brevo') {
    if (available.brevo || !available.smtp) return { provider: 'brevo', fellBack: false }
    return { provider: 'smtp', fellBack: true }
  }
  // Not chosen: the rule every site had before there was a choice.
  return { provider: available.brevo ? 'brevo' : 'smtp', fellBack: false }
}

/** What the environment has for each, on the server. */
export function providerAvailabilityFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
  return { brevo: !!env.BREVO_API_KEY, smtp: !!env.SMTP_HOST }
}
