import { describe, it, expect } from 'vitest'
import { parseEmailProvider, resolveEmailProvider } from './provider'

// Which way the site's own mail goes. The unchosen case must be the rule every
// site ran on before there was a choice, or an update would quietly move a
// live shop's order confirmations from one service to the other.

const both = { brevo: true, smtp: true }

describe('choosing how the site sends', () => {
  it('keeps the old rule when nothing is chosen', () => {
    expect(resolveEmailProvider(null, both)).toEqual({ provider: 'brevo', fellBack: false })
    expect(resolveEmailProvider(null, { brevo: false, smtp: true })).toEqual({ provider: 'smtp', fellBack: false })
    expect(resolveEmailProvider(null, { brevo: false, smtp: false })).toEqual({ provider: 'smtp', fellBack: false })
  })

  it('honours the choice when both are set up', () => {
    expect(resolveEmailProvider('smtp', both)).toEqual({ provider: 'smtp', fellBack: false })
    expect(resolveEmailProvider('brevo', both)).toEqual({ provider: 'brevo', fellBack: false })
  })

  it('falls back to the one that works rather than not sending, and says so', () => {
    expect(resolveEmailProvider('smtp', { brevo: true, smtp: false })).toEqual({ provider: 'brevo', fellBack: true })
    expect(resolveEmailProvider('brevo', { brevo: false, smtp: true })).toEqual({ provider: 'smtp', fellBack: true })
  })

  it('reads only the two values it knows', () => {
    expect(parseEmailProvider('smtp')).toBe('smtp')
    expect(parseEmailProvider('SMTP')).toBeNull()
    expect(parseEmailProvider('')).toBeNull()
    expect(parseEmailProvider(null)).toBeNull()
  })
})
