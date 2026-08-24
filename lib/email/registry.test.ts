import { describe, expect, it } from 'vitest'
import { emailOverrideValue, listEmailTemplates } from '@/lib/email/registry'

describe('email registry', () => {
  const templates = listEmailTemplates()

  it('registers something', () => {
    expect(templates.length).toBeGreaterThan(0)
  })

  // The heading is added centrally rather than typed into each default, so this
  // is the only thing standing between a module adding a template and that one
  // email arriving without a title while the other forty-six have one.
  it('opens every email with its subject as a heading', () => {
    for (const t of templates) {
      expect(t.bodyHtml.startsWith(`<h3>${t.subject}</h3>\n`), t.key).toBe(true)
    }
  })

  it('keeps the merge tags in the heading rather than baking values in', () => {
    const verify = templates.find((t) => t.key === 'member.verify-email')
    expect(verify?.bodyHtml.split('\n')[0]).toBe('<h3>Verify your {{siteName}} account</h3>')
  })

  it('leaves the original body intact underneath the heading', () => {
    for (const t of templates) {
      expect(t.bodyHtml.split('\n').slice(1).join('\n').length, t.key).toBeGreaterThan(0)
    }
  })

  // A row holding a verbatim copy of the default used to count as an edit, so
  // every email on a live site wore an "Edited" badge nobody earned - and worse,
  // won over the default at send time, freezing that email's wording for good.
  describe('emailOverrideValue', () => {
    it('treats a copy of the default as no override', () => {
      expect(emailOverrideValue('Hello', 'Hello')).toBeNull()
    })

    it('ignores whitespace either side of an otherwise identical copy', () => {
      expect(emailOverrideValue('  Hello\n', 'Hello')).toBeNull()
    })

    it('keeps a genuine edit', () => {
      expect(emailOverrideValue('Hello there', 'Hello')).toBe('Hello there')
    })

    it('passes null and undefined straight through', () => {
      expect(emailOverrideValue(null, 'Hello')).toBeNull()
      expect(emailOverrideValue(undefined, 'Hello')).toBeNull()
    })
  })
})
