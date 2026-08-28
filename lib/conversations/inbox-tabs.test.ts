import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/session'

// Inbox tab resolution, and specifically the suppression rule - the one part of
// the conversation seam that can take a screen AWAY from somebody. Getting it
// wrong does not throw: a colleague simply opens the Inbox one morning and their
// messages are gone, with no tab to click and nothing to explain it.

type Mod = { name: string; manifest: unknown }
let MODULES: Mod[] = []

vi.mock('@/lib/modules/live-status', () => ({
  INSTALLED_MODULE_WHERE: {},
  getInstalledModules: async () => MODULES,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: { module: { findMany: async () => MODULES } },
}))

vi.mock('@/lib/permissions/check', () => ({
  hasPermission: async (user: { permissions: string[] }, key: string) => user.permissions.includes(key),
}))

// Stand-in registry: a tab is any component, a provider has to look like one.
function fakeProvider(channel: string) {
  return { label: channel, channel, capabilities: { reply: false, markRead: false, byIdentity: false }, list: async () => ({ items: [] }), thread: async () => null }
}

vi.mock('@/lib/modules/extension-points', () => ({
  moduleExtensionPointComponents: {
    'core.inbox-tabs': {
      'contact-form': () => null,
      'live-chat': () => null,
      'conversation-hub': () => null,
      notices: () => null,
    },
    'core.conversation-provider': {
      'contact-form': fakeProvider('form'),
      'live-chat': fakeProvider('chat'),
    },
  },
}))

const { resolveInboxTabs } = await import('@/lib/conversations/inbox-tabs')

const CONTACT_FORM: Mod = {
  name: 'contact-form',
  manifest: {
    extensionPoints: [
      { point: 'core.inbox-tabs', id: 'contact-form', label: 'Contact form', order: 10, permission: 'contact.view' },
      { point: 'core.conversation-provider', id: 'contact-form', permission: 'contact.view', serverOnly: true },
    ],
  },
}

const LIVE_CHAT: Mod = {
  name: 'live-chat',
  manifest: {
    extensionPoints: [
      { point: 'core.inbox-tabs', id: 'live-chat', label: 'Live chat', order: 20, permission: 'livechat.view' },
      { point: 'core.conversation-provider', id: 'live-chat', permission: 'livechat.view', serverOnly: true },
    ],
  },
}

function consumer(over: Record<string, unknown> = {}): Mod {
  return {
    name: 'conversation-hub',
    manifest: {
      consumesConversationProviders: true,
      extensionPoints: [
        { point: 'core.inbox-tabs', id: 'conversation-hub', label: 'Hub', order: 5, permission: 'hub.view' },
      ],
      ...over,
    },
  }
}

function user(...permissions: string[]): SessionUser {
  return { id: 'u1', permissions, role: { isProtected: false } } as unknown as SessionUser
}

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id)

beforeEach(() => {
  MODULES = []
})

describe('the core All tab', () => {
  it('appears once two providers resolve', async () => {
    MODULES = [CONTACT_FORM, LIVE_CHAT]
    const { tabs, showAllTab } = await resolveInboxTabs(user('contact.view', 'livechat.view'))
    expect(showAllTab).toBe(true)
    expect(ids(tabs)).toEqual(['contact-form', 'live-chat'])
  })

  it('stays away when only one provider resolves - one channel merged with itself is not a view', async () => {
    MODULES = [CONTACT_FORM]
    const { showAllTab } = await resolveInboxTabs(user('contact.view'))
    expect(showAllTab).toBe(false)
  })

  it('counts only the providers this user may see', async () => {
    MODULES = [CONTACT_FORM, LIVE_CHAT]
    const { showAllTab } = await resolveInboxTabs(user('contact.view'))
    expect(showAllTab).toBe(false)
  })

  it('is nothing at all to a signed-out caller', async () => {
    MODULES = [CONTACT_FORM, LIVE_CHAT]
    expect(await resolveInboxTabs(null)).toEqual({ tabs: [], showAllTab: false })
  })
})

describe('suppression when a module consumes the providers', () => {
  it('hides the provider tabs and the All tab for a user who can see the consumer', async () => {
    MODULES = [CONTACT_FORM, LIVE_CHAT, consumer()]
    const { tabs, showAllTab } = await resolveInboxTabs(
      user('contact.view', 'livechat.view', 'hub.view'),
    )
    expect(ids(tabs)).toEqual(['conversation-hub'])
    expect(showAllTab).toBe(false)
  })

  // E1. The whole reason suppression is resolved per user: this colleague has no
  // consumer tab to be sent to, so taking their own away leaves them nothing.
  it('leaves every tab alone for a user who cannot see the consumer', async () => {
    MODULES = [CONTACT_FORM, LIVE_CHAT, consumer()]
    const { tabs } = await resolveInboxTabs(user('contact.view'))
    expect(ids(tabs)).toEqual(['contact-form'])
  })

  it('suppresses nothing when the stored manifest has not caught up with the flag', async () => {
    // Module.manifest is rewritten from the deployed cactus.module.json at build
    // time, so a freshly installed consumer's copy can be missing the field
    // entirely. A missing flag must never hide anybody's inbox.
    const lagging: Mod = {
      name: 'conversation-hub',
      manifest: {
        extensionPoints: [
          { point: 'core.inbox-tabs', id: 'conversation-hub', label: 'Hub', order: 5, permission: 'hub.view' },
        ],
      },
    }
    MODULES = [CONTACT_FORM, LIVE_CHAT, lagging]
    const { tabs } = await resolveInboxTabs(user('contact.view', 'livechat.view', 'hub.view'))
    expect(ids(tabs)).toEqual(['conversation-hub', 'contact-form', 'live-chat'])
  })

  it('leaves a tab from a module that publishes no provider on screen', async () => {
    const notifier: Mod = {
      name: 'notices',
      manifest: {
        extensionPoints: [
          { point: 'core.inbox-tabs', id: 'notices', label: 'Notices', order: 30, permission: 'notices.view' },
        ],
      },
    }
    MODULES = [CONTACT_FORM, LIVE_CHAT, notifier, consumer()]
    const { tabs } = await resolveInboxTabs(
      user('contact.view', 'livechat.view', 'notices.view', 'hub.view'),
    )
    expect(ids(tabs)).toEqual(['conversation-hub', 'notices'])
  })
})
