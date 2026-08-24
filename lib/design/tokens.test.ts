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
  const OPT_OUT = ':not([data-cactus-unstyled]):not([data-cactus-unstyled] *)'

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
    expect(css).toContain(`main button${OPT_OUT}:hover`)
  })

  it('leaves the Button block\'s own variant hovers alone - they are ours to paint', () => {
    expect(css).toContain('main .cactus-btn[data-variant="primary"]:hover')
  })
})
