import { describe, it, expect } from 'vitest'
import { sanitizeSvgFragment } from '@/lib/sanitize'

// Regression cover for the admin sidebar's module icons: every one of them is a
// bare fragment, and the plain SVG sanitiser reduced all of them to '' (so the
// sidebar showed the generic module puzzle piece for every module link).
describe('sanitizeSvgFragment', () => {
  it('keeps a bare fragment, which the whole-document sanitiser dropped', () => {
    const out = sanitizeSvgFragment('<path d="M9 3h6v3H9z"/><circle cx="12" cy="8" r="3"/>')
    expect(out).toContain('<path')
    expect(out).toContain('<circle')
    expect(out).toContain('M9 3h6v3H9z')
  })

  it('unwraps a module that supplied a complete <svg>', () => {
    const out = sanitizeSvgFragment('<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')
    expect(out).not.toContain('<svg')
    expect(out).toContain('<path')
  })

  it('still strips script and event handlers', () => {
    const out = sanitizeSvgFragment('<path d="M1 1"/><script>alert(1)</script><path onclick="x()" d="M2 2"/>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).toContain('M2 2')
  })

  it('returns empty for markup with nothing drawable in it', () => {
    expect(sanitizeSvgFragment('<script>alert(1)</script>')).toBe('')
  })
})
