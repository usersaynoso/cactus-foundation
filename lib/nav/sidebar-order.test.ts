import { describe, it, expect } from 'vitest'
import type { ResolvedNavItem, ResolvedNavSection } from './admin-menu'
import {
  applyNavOrder,
  favouritesAfterDrop,
  favouritesAfterKeyboardMove,
  orderAfterDrop,
  orderAfterKeyboardMove,
  parseNavOrder,
} from './sidebar-order'

function item(id: string): ResolvedNavItem {
  return { id, label: id, path: `/${id}`, icon: 'modules', iconIsSvg: false, isModule: false, restricted: null }
}

function sections(): ResolvedNavSection[] {
  return [
    { id: 'main', label: null, items: [item('dashboard')] },
    { id: 'content', label: 'Content', items: [item('pages'), item('menus'), item('media')] },
    { id: 'system', label: 'System', items: [item('config'), item('users')] },
  ]
}

const ids = (result: ResolvedNavSection[]) =>
  Object.fromEntries(result.map((s) => [s.id, s.items.map((i) => i.id)]))

describe('parseNavOrder', () => {
  it('returns an empty arrangement for anything that is not a map of id lists', () => {
    expect(parseNavOrder('not json')).toEqual({})
    expect(parseNavOrder('[1,2,3]')).toEqual({})
    expect(parseNavOrder('"nope"')).toEqual({})
    expect(parseNavOrder('null')).toEqual({})
  })

  it('keeps only the string ids out of a half-written value', () => {
    expect(parseNavOrder('{"content":["pages",7,null,"menus"],"system":"wrong"}')).toEqual({
      content: ['pages', 'menus'],
    })
  })
})

describe('applyNavOrder', () => {
  it('leaves the server order alone when nothing has been arranged', () => {
    expect(applyNavOrder(sections(), {})).toEqual(sections())
  })

  it('reorders within a section', () => {
    const out = applyNavOrder(sections(), { content: ['media', 'pages', 'menus'] })
    expect(ids(out).content).toEqual(['media', 'pages', 'menus'])
  })

  it('moves a link into a section it did not come from', () => {
    const out = applyNavOrder(sections(), { system: ['media', 'config', 'users'], content: ['pages', 'menus'] })
    expect(ids(out).content).toEqual(['pages', 'menus'])
    expect(ids(out).system).toEqual(['media', 'config', 'users'])
  })

  it('drops ids the server no longer sends', () => {
    const out = applyNavOrder(sections(), { content: ['media', 'mod:/gone', 'pages', 'menus'] })
    expect(ids(out).content).toEqual(['media', 'pages', 'menus'])
  })

  it('renders a link once when a stale arrangement lists it twice', () => {
    const out = applyNavOrder(sections(), { content: ['media', 'pages', 'menus'], system: ['media', 'config', 'users'] })
    expect(ids(out).content).toEqual(['media', 'pages', 'menus'])
    expect(ids(out).system).toEqual(['config', 'users'])
  })

  it('keeps a link the arrangement has never seen, at the end of its own section', () => {
    const withNew = sections()
    withNew[1]!.items.push(item('mod:/new'))
    const out = applyNavOrder(withNew, { content: ['media', 'pages', 'menus'] })
    expect(ids(out).content).toEqual(['media', 'pages', 'menus', 'mod:/new'])
  })
})

describe('orderAfterDrop', () => {
  it('drops above and below the row aimed at', () => {
    expect(orderAfterDrop(sections(), 'media', { kind: 'row', id: 'pages', edge: 'before' })?.content)
      .toEqual(['media', 'pages', 'menus'])
    expect(orderAfterDrop(sections(), 'media', { kind: 'row', id: 'pages', edge: 'after' })?.content)
      .toEqual(['pages', 'media', 'menus'])
  })

  it('carries a link across sections and records the whole tree', () => {
    const out = orderAfterDrop(sections(), 'media', { kind: 'row', id: 'users', edge: 'after' })
    expect(out).toEqual({ main: ['dashboard'], content: ['pages', 'menus'], system: ['config', 'users', 'media'] })
  })

  it('appends when the drop lands on a section rather than a row', () => {
    const out = orderAfterDrop(sections(), 'pages', { kind: 'section', sectionId: 'main' })
    expect(out?.main).toEqual(['dashboard', 'pages'])
    expect(out?.content).toEqual(['menus', 'media'])
  })

  it('changes nothing when a row is dropped on itself or on a section that has gone', () => {
    expect(orderAfterDrop(sections(), 'media', { kind: 'row', id: 'media', edge: 'after' })).toBeNull()
    expect(orderAfterDrop(sections(), 'media', { kind: 'section', sectionId: 'nope' })).toBeNull()
    expect(orderAfterDrop(sections(), 'media', { kind: 'row', id: 'gone', edge: 'after' })).toBeNull()
  })
})

describe('orderAfterKeyboardMove', () => {
  it('nudges a link one place within its section', () => {
    expect(orderAfterKeyboardMove(sections(), 'menus', -1)?.content).toEqual(['menus', 'pages', 'media'])
    expect(orderAfterKeyboardMove(sections(), 'menus', 1)?.content).toEqual(['pages', 'media', 'menus'])
  })

  it('steps off the end of a section into the next one', () => {
    const down = orderAfterKeyboardMove(sections(), 'media', 1)
    expect(down?.content).toEqual(['pages', 'menus'])
    expect(down?.system).toEqual(['config', 'media', 'users'])

    // Up one means past exactly one link, so it lands above the one it passed.
    const up = orderAfterKeyboardMove(sections(), 'pages', -1)
    expect(up?.main).toEqual(['pages', 'dashboard'])
    expect(up?.content).toEqual(['menus', 'media'])
  })

  it('stops at the very top and the very bottom', () => {
    expect(orderAfterKeyboardMove(sections(), 'dashboard', -1)).toBeNull()
    expect(orderAfterKeyboardMove(sections(), 'users', 1)).toBeNull()
    expect(orderAfterKeyboardMove(sections(), 'gone', 1)).toBeNull()
  })
})

describe('favourites', () => {
  const favs = ['pages', 'media', 'users']

  it('reorders by drop', () => {
    expect(favouritesAfterDrop(favs, 'users', { kind: 'row', id: 'pages', edge: 'before' })).toEqual([
      'users', 'pages', 'media',
    ])
    expect(favouritesAfterDrop(favs, 'pages', { kind: 'row', id: 'media', edge: 'after' })).toEqual([
      'media', 'pages', 'users',
    ])
  })

  it('refuses a drop that is not a favourite row', () => {
    expect(favouritesAfterDrop(favs, 'menus', { kind: 'row', id: 'pages', edge: 'before' })).toBeNull()
    expect(favouritesAfterDrop(favs, 'pages', { kind: 'section', sectionId: 'content' })).toBeNull()
    expect(favouritesAfterDrop(favs, 'pages', { kind: 'row', id: 'pages', edge: 'before' })).toBeNull()
  })

  it('nudges by keyboard and stops at either end', () => {
    expect(favouritesAfterKeyboardMove(favs, 'media', -1)).toEqual(['media', 'pages', 'users'])
    expect(favouritesAfterKeyboardMove(favs, 'pages', -1)).toBeNull()
    expect(favouritesAfterKeyboardMove(favs, 'users', 1)).toBeNull()
  })
})
