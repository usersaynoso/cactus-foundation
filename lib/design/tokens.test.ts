import { describe, it, expect } from 'vitest'
import { buildTokenStyles } from '@/lib/design/tokens'

// The blanket element rules the Styles panel emits are the ones that reach
// things the site did not draw: a payment provider's own button, a wallet
// button, a chat launcher. Those carry their brand's look by requirement, and
// the hover rule in particular is `!important` with a `background` shorthand -
// which, landing on a Google Pay button, replaces the logo with a flat colour.
//
// So every one of them has to carry the opt-out. Asserted per selector rather
// than by counting, because the failure that matters is a NEW blanket rule
// added later without it.
describe('buildTokenStyles blanket element rules', () => {
  const tokens = {
    themeStyle: {
      links: { colour: '#111', hoverColour: '#222' },
      buttons: {
        bgColour: '#333', textColour: '#fff', borderColour: '#444', borderWidth: '1px',
        hover: { bgColour: '#c8a165', textColour: '#000' },
      },
      images: { borderRadius: '4px' },
      formFields: { bgColour: '#fff', labelColour: '#555' },
    },
  }

  const css = buildTokenStyles(tokens)
  const OPT_OUT = ':not(:where([data-cactus-unstyled],[data-cactus-unstyled] *))'
  const NOT_DISABLED = ':not(:where(:disabled))'

  it.each([
    ['main a', 'links'],
    ['main a', 'link hover'],
    ['main button', 'buttons'],
    ['main img', 'images'],
    ['main input', 'fields'],
    ['main label', 'labels'],
  ])('%s carries the opt-out (%s)', (selector) => {
    // Every occurrence of the bare selector must be followed by the opt-out.
    const bare = new RegExp(`${selector.replace(' ', '\\s')}(?![a-zA-Z0-9_-])(?!\\$\\{)(?!:not)`, 'g')
    const matches = css.match(bare) ?? []
    for (const _ of matches) {
      expect(css).toContain(`${selector}${OPT_OUT}`)
    }
  })

  it('never emits an unscoped blanket button rule', () => {
    expect(css).not.toMatch(/main button\{/)
    expect(css).not.toMatch(/main button:hover/)
  })

  it('still styles the site\'s own buttons', () => {
    expect(css).toContain(`main button${OPT_OUT}{`)
    expect(css).toContain(`main button${OPT_OUT}${NOT_DISABLED}:hover`)
  })

  // A disabled control is not on offer, so it must not light up under the
  // pointer. The rule is `!important`, so a module's own `:not(:disabled)`
  // guard cannot hold it off - the guard has to be here. The resting rule is
  // deliberately not guarded: a disabled button still wears the site's colours,
  // it simply does not react.
  it('never paints a hover state onto a disabled button', () => {
    // The opt-out has a comma inside it, so it is folded to a token first -
    // otherwise a per-selector regex stops halfway through it.
    const flat = css.split(OPT_OUT).join('@OPT@')
    const hovers = flat.match(/main button[^{,]*:hover[^{,]*/g) ?? []
    expect(hovers.length).toBeGreaterThan(0)
    for (const rule of hovers) expect(rule).toContain(NOT_DISABLED)
    expect(css).toContain(`main button${OPT_OUT}{`)
  })

  // A marked child normally takes the theme's hover text colour. `inherit` asks
  // for the button's own instead, which is the same thing wherever a hover text
  // colour is set and the only right answer where only a hover background is:
  // the label keeps its resting colour there, so a child on the white fallback
  // would be the one part that did not match.
  it('lets a marked child take the button\'s own hover colour with "inherit"', () => {
    const plain = css.indexOf(':hover[data-cactus-hover-fg]')
    const inherited = css.indexOf(':hover[data-cactus-hover-fg="inherit"]')
    expect(plain).toBeGreaterThan(-1)
    expect(inherited).toBeGreaterThan(-1)
    expect(css).toMatch(/\[data-cactus-hover-fg="inherit"\][^{]*\{color:inherit !important;\}/)
    // Same weight, both !important - so the specific one has to come second or
    // the plain rule quietly wins and the child is white again.
    expect(inherited).toBeGreaterThan(plain)
  })

  it('leaves the Button block\'s own variant hovers alone - they are ours to paint', () => {
    expect(css).toContain('main .cactus-btn[data-variant="primary"]:hover')
  })

  // The opt-out must cost nothing in specificity. A bare
  // `:not([data-cactus-unstyled])` carries its argument's weight, which took
  // `main button` from (0,0,2) to (0,2,2) - above every module's own
  // `.flt-group-head{background:none}` and its like, so the site's button
  // colour repainted filter heads, quantity steppers and every other bare
  // <button> the platform draws. Wrapped in `:where()` it weighs nothing.
  it('does not let the opt-out outrank a module\'s own button styling', () => {
    expect(css).not.toMatch(/:not\(\[data-cactus-unstyled\]\)/)
    expect(css).toContain(':not(:where([data-cactus-unstyled],[data-cactus-unstyled] *))')
  })
})
