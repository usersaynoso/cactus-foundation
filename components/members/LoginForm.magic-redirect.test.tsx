// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import LoginForm from './LoginForm'

// The form only asks for an email-link redirect when the page gave it one. The
// sign-in modal and the Puck sign-in block never do, so their links keep
// landing on the account exactly as before.

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let requests: Array<{ url: string; body: unknown }>

beforeEach(() => {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const reply = url.endsWith('/auth/config')
      ? { enabledAuthMethods: ['MAGIC_LINK'] }
      : url.endsWith('/auth/methods')
        ? { passkey: false, password: false, magicLink: true }
        : { ok: true }
    return new Response(JSON.stringify(reply), { status: 200 })
  }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function requestLinkFor(props: Parameters<typeof LoginForm>[0]) {
  await act(async () => root.render(<LoginForm {...props} />))
  const input = container.querySelector('input[type="email"]') as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, 'jo@example.com')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Continue')!
  await act(async () => button.click())
  // Link-only member: Continue sends the link straight away.
  await act(async () => {})
  return requests.find((r) => r.url === '/api/members/auth/magic-link/request')?.body
}

describe('LoginForm email sign-in link request', () => {
  it('sends just the address when no email-link redirect was given', async () => {
    expect(await requestLinkFor({ redirectTo: '/somewhere' })).toEqual({ email: 'jo@example.com' })
  })

  it('sends the redirect alongside the address when the page asked for one', async () => {
    expect(await requestLinkFor({ redirectTo: '/tgf/app-connect', magicLinkRedirect: '/tgf/app-connect' })).toEqual({
      email: 'jo@example.com',
      redirectTo: '/tgf/app-connect',
    })
  })
})
