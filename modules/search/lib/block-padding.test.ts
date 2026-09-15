import { describe, it, expect } from 'vitest'
import { searchPaddingClasses } from './block-padding'

describe('searchPaddingClasses', () => {
  it("resolves 'auto' to what the block says it means", () => {
    expect(searchPaddingClasses({ desktop: 'auto' }, 'default')).toBe('cactus-pad-d-default cactus-pad-t-default cactus-pad-m-default')
    expect(searchPaddingClasses({ desktop: 'auto' }, 'none')).toBe('')
  })

  it('treats an unset value as auto', () => {
    expect(searchPaddingClasses(undefined, 'default')).toBe('cactus-pad-d-default cactus-pad-t-default cactus-pad-m-default')
    expect(searchPaddingClasses(undefined, 'none')).toBe('')
  })

  it('cascades desktop -> tablet -> mobile', () => {
    expect(searchPaddingClasses({ desktop: 'lg', mobile: 'sm' }, 'default')).toBe('cactus-pad-d-lg cactus-pad-t-lg cactus-pad-m-sm')
    expect(searchPaddingClasses({ desktop: 'lg', tablet: 'md' }, 'default')).toBe('cactus-pad-d-lg cactus-pad-t-md cactus-pad-m-md')
  })

  it('emits nothing when every breakpoint wants no gutter', () => {
    expect(searchPaddingClasses({ desktop: 'none' }, 'default')).toBe('')
    expect(searchPaddingClasses('none', 'default')).toBe('')
  })

  it('accepts legacy desktop-only string data', () => {
    expect(searchPaddingClasses('md', 'none')).toBe('cactus-pad-d-md cactus-pad-t-md cactus-pad-m-md')
  })

  it('falls back to auto for a value it does not know', () => {
    expect(searchPaddingClasses({ desktop: 'enormous' }, 'default')).toBe('cactus-pad-d-default cactus-pad-t-default cactus-pad-m-default')
  })
})
