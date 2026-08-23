import { describe, it, expect } from 'vitest'
import { labelForEnvKeys } from './deployment'

// This string is not decoration. recordDeploymentNeeded dedupes the reasons on
// an open "Changes awaiting deployment" notification BY LABEL, replacing the
// matching entry rather than adding one - so two unrelated saves that produce
// the same label collapse into a single line, and the second one silently
// overwrites the first.
//
// Which is what went wrong on a live site: every key a module declared fell
// past the four core sets into a hardcoded "Media storage settings updated", so
// saving a Square credential overwrote an existing media entry with identical
// text. The notification re-surfaced as unread and said exactly what it had
// said before, and the admin was told to deploy for a reason that had nothing
// to do with what they had just done.

describe('labelForEnvKeys', () => {
  it('names email settings', async () => {
    await expect(labelForEnvKeys(['BREVO_API_KEY'])).resolves.toBe('Email settings updated')
    await expect(labelForEnvKeys(['SMTP_HOST', 'SMTP_PORT'])).resolves.toBe('Email settings updated')
  })

  it('names core payment keys', async () => {
    await expect(labelForEnvKeys(['STRIPE_SECRET_KEY'])).resolves.toBe('Payment provider keys updated')
    await expect(labelForEnvKeys(['PAYPAL_CLIENT_ID'])).resolves.toBe('Payment provider keys updated')
  })

  it('names integration keys', async () => {
    await expect(labelForEnvKeys(['GITHUB_API_TOKEN'])).resolves.toBe('Integration keys updated')
    await expect(labelForEnvKeys(['TURNSTILE_SITE_KEY'])).resolves.toBe('Integration keys updated')
  })

  // Media used to BE the fallback, which is the whole bug. It needs a set of
  // its own, or fixing the fallback would have broken the one case that was
  // accidentally right.
  it('still names media storage, now on its own merits rather than by falling through', async () => {
    await expect(labelForEnvKeys(['CLOUDFLARE_API_TOKEN'])).resolves.toBe('Media storage settings updated')
  })

  // No database in the test environment, so the module lookup throws and is
  // swallowed - which is the behaviour that matters here. A notification that
  // never gets written is a deployment nobody is told about, so the wording
  // degrades and the notice still goes out.
  it('does not call an unrecognised key media storage', async () => {
    const label = await labelForEnvKeys(['SQUARE_APPLICATION_ID'])
    expect(label).not.toBe('Media storage settings updated')
    expect(label).toBe('Site settings updated')
  })

  it('survives being handed nothing at all', async () => {
    await expect(labelForEnvKeys([])).resolves.toBe('Site settings updated')
  })
})
