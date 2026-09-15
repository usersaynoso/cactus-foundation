import { normalizeResponsiveValue, pickResponsive, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'

// Left/right gutter for the two search blocks, resolved to core's cactus-pad-*
// utility classes (emitted site-wide by lib/design/tokens.ts, so nothing has to
// be imported at render time - the class names ARE the contract).
//
// Why the blocks carry their own gutter at all: a search layout is a bare list
// of blocks, not a page built out of Sections, so on a layout that never got a
// Section the results ran edge to edge on every screen size. Core's own page
// blocks solve it the same way - a "Padding (left/right)" field defaulting to
// the site gutter - and an owner who does drop these into a Section sets it to
// None there.
//
// 'auto' is what an untouched block stores: the caller says what it means for
// that block (the search box only wants a gutter when it is the results page's
// own box - a header box must stay flush with the rest of the header chrome).

export type PaddingSize = 'auto' | 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl'

const PAD_KEYS: ReadonlySet<string> = new Set(['auto', 'default', 'none', 'sm', 'md', 'lg', 'xl'])

export const PADDING_OPTIONS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'default', label: 'Site spacing' },
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small (0.5rem)' },
  { value: 'md', label: 'Medium (1rem)' },
  { value: 'lg', label: 'Large (2rem)' },
  { value: 'xl', label: 'Extra large (4rem)' },
]

// pickResponsive already runs the desktop -> tablet -> mobile cascade, so a
// block padded on desktop is padded on tablet and mobile unless it says
// otherwise; every element carries all three classes exactly as core's
// getPaddingClasses does it. Returns '' when the answer is no padding anywhere,
// keeping the markup of a block that wants none byte-identical to before.
export function searchPaddingClasses(
  padding: ResponsiveValue<string> | string | undefined,
  autoResolvesTo: Exclude<PaddingSize, 'auto'>,
): string {
  const rv = normalizeResponsiveValue<string>(padding)
  const at = (d: Device): string => {
    const value = pickResponsive(rv, d)
    const v = value && PAD_KEYS.has(value) ? value : 'auto'
    return v === 'auto' ? autoResolvesTo : v
  }
  const desktop = at('desktop')
  const tablet = at('tablet')
  const mobile = at('mobile')
  if (desktop === 'none' && tablet === 'none' && mobile === 'none') return ''
  return `cactus-pad-d-${desktop} cactus-pad-t-${tablet} cactus-pad-m-${mobile}`
}
