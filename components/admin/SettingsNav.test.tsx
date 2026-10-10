// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsNavProvider, SettingsNavCapture, SettingsSidebar } from './SettingsNav'
import { TabStrip } from './TabStrip'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} }

function Module() {
  const [t, setT] = useState('a')
  return (
    <div>
      <TabStrip items={[{ key: 'a', label: 'Alpha', active: t === 'a', onClick: () => setT('a') }, { key: 'b', label: 'Beta', active: t === 'b', onClick: () => setT('b') }]} />
      <p id="showing">{t}</p>
      {t === 'b' && <TabStrip items={[{ key: 'x', label: 'Inner', active: true }, { key: 'y', label: 'Inner2', active: false }]} />}
    </div>
  )
}

describe('SettingsNav', () => {
  it('captures the first module strip and drives it from the sidebar', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => {
      root.render(
        <SettingsNavProvider>
          <SettingsSidebar nodes={[{ key: 'shop', label: 'Shop', active: true, onClick: () => {}, capturesModuleTabs: true }]} />
          <TabStrip className="settings-top-tabs" items={[{ key: 'core', label: 'Core', active: true }]} />
          <SettingsNavCapture><Module /></SettingsNavCapture>
        </SettingsNavProvider>,
      )
    })
    const tree = () => [...el.querySelectorAll('.settings-sidebar__tree button')].map((b) => `${b.textContent}${b.getAttribute('aria-current') ? '*' : ''}`)
    expect(tree()).toEqual(['Alpha*', 'Beta'])
    expect(el.querySelectorAll('.settings-sub-tabs').length).toBe(1)
    expect(el.querySelector('.settings-top-tabs')?.classList.contains('settings-sub-tabs')).toBe(false)
    const beta = [...el.querySelectorAll('.settings-sidebar__tree button')].find((b) => b.textContent === 'Beta') as HTMLButtonElement
    await act(async () => { beta.click() })
    expect(el.querySelector('#showing')?.textContent).toBe('b')
    expect(tree()).toEqual(['Alpha', 'Beta*'])
    // the inner strip does not take over
    expect(el.querySelectorAll('.settings-sub-tabs').length).toBe(1)
    await act(async () => { root.unmount() })
  })
})
