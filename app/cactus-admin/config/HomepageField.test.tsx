import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import HomepageField, { fetchHomepageOptions, type HomepageOptions, type HomepageValue } from './HomepageField'
import { homepageOptionValue } from '@/lib/homepage/module-target'

// The Settings > General > Homepage select, rendered to markup: pages as before,
// module content grouped as "<module> · <kind>", and the menu editor's warning
// when the saved module homepage no longer resolves.

const PAGES = [{ id: 'page1', title: 'Home' }]
const NONE: HomepageValue = { homepageId: null, homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null }
const TG: HomepageOptions = {
  groups: [{
    moduleId: 'tg-finance', moduleLabel: 'TG Finance', kind: 'screens', kindLabel: 'Money screens',
    entries: [{ id: 'money', label: 'Money', hint: 'The home of the web app' }],
  }],
  current: null,
}
const MONEY = { moduleId: 'tg-finance', kind: 'screens', entityId: 'money' }
const MONEY_VALUE: HomepageValue = { homepageId: null, homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }

const render = (value: HomepageValue, options: HomepageOptions) =>
  renderToStaticMarkup(<HomepageField value={value} pages={PAGES} options={options} onChange={() => {}} />)

describe('HomepageField', () => {
  it('lists pages flat when no module offers anything, as before', () => {
    const html = render(NONE, { groups: [], current: null })
    expect(html).toContain('<option value="page1">Home</option>')
    expect(html).not.toContain('optgroup')
  })

  it('groups module content under "module · kind" beside the pages', () => {
    const html = render(NONE, TG)
    expect(html).toContain('<optgroup label="Pages">')
    expect(html).toContain('<optgroup label="TG Finance · Money screens">')
    expect(html).toContain('>Money</option>')
  })

  it('selects the saved module homepage', () => {
    const html = render(MONEY_VALUE, { ...TG, current: { ...MONEY, moduleLabel: 'TG Finance', ok: true, label: 'Money' } })
    const value = homepageOptionValue(MONEY).replace(/"/g, '&quot;')
    expect(html).toContain(`<option value="${value}" title="The home of the web app" selected="">Money</option>`)
    expect(html).not.toContain('badge')
  })

  it('warns, as the menu editor does, when the saved content has gone', () => {
    const html = render(
      { ...MONEY_VALUE, homepageEntityId: 'gone' },
      { ...TG, current: { ...MONEY, entityId: 'gone', moduleLabel: 'TG Finance', ok: false, reason: 'not-found' } },
    )
    expect(html).toContain('badge-danger')
    expect(html).toContain('Linked content deleted')
    expect(html).toContain('TG Finance · gone (linked content deleted)')
  })

  it('stops warning once another homepage is chosen', () => {
    const html = render(
      { ...NONE, homepageId: 'page1' },
      { ...TG, current: { ...MONEY, entityId: 'gone', moduleLabel: 'TG Finance', ok: false, reason: 'not-found' } },
    )
    expect(html).not.toContain('badge-danger')
  })
})

describe('fetchHomepageOptions', () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('returns the options and the saved choice, so a save can refresh the warning', async () => {
    const current = { ...MONEY, moduleLabel: 'TG Finance', ok: true, label: 'Money' }
    expect(await fetchHomepageOptions(respond(200, { groups: TG.groups, current }))).toEqual({ groups: TG.groups, current })
  })

  it('treats a missing current as no module homepage', async () => {
    expect(await fetchHomepageOptions(respond(200, { groups: [] }))).toEqual({ groups: [], current: null })
  })

  it('is null on a refusal, a bad body or a network failure, so the select keeps what it had', async () => {
    expect(await fetchHomepageOptions(respond(403, { error: 'Forbidden' }))).toBeNull()
    expect(await fetchHomepageOptions(respond(200, { nope: true }))).toBeNull()
    expect(await fetchHomepageOptions((async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  })
})
