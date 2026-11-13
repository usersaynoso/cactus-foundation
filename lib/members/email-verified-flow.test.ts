import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Verify -> claim -> fill, end to end, down both doors: the member clicking the
// link in their inbox, and an admin verifying by hand. Everything between the
// route and the data is the real code (core's hook, the shop's handler, the
// shop's claim-and-fill, core's blanks-only rule); only the database is a fake.

type FakeMember = {
  id: string; email: string; emailVerified: boolean; emailVerifiedAt: Date | null
  status: string; username: string; fullName: string | null; organisation: string | null
  marketingConsent: boolean | null
}
type FakeOrder = {
  id: string; memberId: string | null; customerEmail: string; customerName: string
  customerOrganisation: string | null; marketingConsent: boolean | null; createdAt: Date
  shippingAddress: null; billingAddress: null
}

const db = vi.hoisted(() => ({ members: new Map<string, unknown>(), orders: [] as unknown[] }))
const members = () => db.members as Map<string, FakeMember>
const orders = () => db.orders as FakeOrder[]

vi.mock('@/lib/db/prisma', () => {
  const pick = (m: FakeMember, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, (m as Record<string, unknown>)[k]])) : { ...m }
  return {
    prisma: {
      member: {
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const m = members().get(where.id)
          return m ? pick(m, select) : null
        },
        update: async ({ where, data, select }: { where: { id: string }; data: Partial<FakeMember>; select?: Record<string, boolean> }) => {
          const m = members().get(where.id)!
          Object.assign(m, data)
          return pick(m, select)
        },
        updateMany: async ({ where, data }: { where: { id: string; email: { equals: string } }; data: Partial<FakeMember> }) => {
          const m = members().get(where.id)
          if (m && m.email.toLowerCase() === where.email.equals.toLowerCase()) Object.assign(m, data)
          return { count: 1 }
        },
      },
      memberVerificationToken: { deleteMany: async () => ({ count: 1 }) },
      module: {
        findMany: async () => [
          { manifest: { extensionPoints: [{ point: 'core.member-email-verified', id: 'shop-member-orders' }] } },
        ],
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  }
})

vi.mock('@/lib/modules/live-status', () => ({ INSTALLED_MODULE_WHERE: {} }))
vi.mock('@/lib/modules/extension-points.server', async () => {
  const { shopMemberEmailVerified } = await import('@/modules/shop/lib/member-verified-handler')
  return { moduleServerExtensionPointComponents: { 'core.member-email-verified': { 'shop-member-orders': shopMemberEmailVerified } } }
})

// The shop's data layer: claim and list, faithful to the real SQL's rules.
vi.mock('@/modules/shop/lib/db/orders', () => ({
  claimGuestOrdersForMember: async (memberId: string, email: string) => {
    let n = 0
    for (const o of orders()) {
      if (o.memberId === null && o.customerEmail.toLowerCase() === email.toLowerCase()) { o.memberId = memberId; n++ }
    }
    return n
  },
  listOrdersByMemberId: async (memberId: string) =>
    orders().filter((o) => o.memberId === memberId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
}))
vi.mock('@/modules/shop/lib/db/products', () => ({}))
vi.mock('@/modules/shop/lib/db/shipments', () => ({}))
vi.mock('@/modules/shop/lib/db/refunds', () => ({}))
vi.mock('@/modules/shop/lib/db/digital', () => ({}))
vi.mock('@/modules/shop/lib/db/order-requests', () => ({}))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: async () => ({}) }))

// Route plumbing that is not what is under test.
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: async () => ({ id: 'admin1' }) }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/members/admin-log', () => ({ logMemberAdminAction: async () => {} }))
vi.mock('@/lib/members/config', () => ({ getMembersConfig: async () => ({ registrationMode: 'OPEN', notifyAdminOnPendingApproval: false }) }))
vi.mock('@/lib/members/registration', () => ({
  deriveActivatedStatus: () => 'ACTIVE',
  loginRejectionForStatus: () => null,
}))
vi.mock('@/lib/auth/rate-limit', () => ({ checkAndRecord: async () => ({ allowed: true }), getClientIp: async () => '127.0.0.1' }))
vi.mock('@/lib/members/tokens', () => ({ consumeVerificationToken: async () => ({ memberId: 'm1' }) }))
vi.mock('@/lib/members/admin-notify', () => ({ notifyAdminMemberPendingApproval: async () => {} }))
vi.mock('@/lib/members/session', () => ({ createMemberSession: async () => 'tok', setMemberSessionCookie: async () => {} }))
vi.mock('@/lib/members/activity', () => ({ recordMemberActivity: async () => {} }))

import { POST as adminVerify } from '@/app/api/admin/members/[id]/verify/route'
import { POST as selfVerify } from '@/app/api/members/verify-email/route'
import { notifyMemberEmailVerified } from '@/lib/members/email-verified'

const guestOrder = (over: Partial<FakeOrder> = {}): FakeOrder => ({
  id: 'o1', memberId: null, customerEmail: 'Jo@Example.com', customerName: 'Joanne Bloggs',
  customerOrganisation: 'Bloggs Ltd', marketingConsent: true, createdAt: new Date('2026-11-01'),
  shippingAddress: null, billingAddress: null, ...over,
})

function seed(member: Partial<FakeMember> = {}, order: FakeOrder[] = [guestOrder()]) {
  members().clear()
  members().set('m1', {
    id: 'm1', email: 'jo@example.com', emailVerified: false, emailVerifiedAt: null,
    status: 'PENDING_VERIFICATION', username: 'jo', fullName: null, organisation: null,
    marketingConsent: null, ...member,
  })
  db.orders = order
}

const doors = {
  'self-serve (link in their inbox)': () =>
    selfVerify(new NextRequest('http://localhost/api/members/verify-email', { method: 'POST', body: JSON.stringify({ token: 't' }) })),
  'admin (verified by hand)': () =>
    adminVerify(new NextRequest('http://localhost/api/admin/members/m1/verify', { method: 'POST' }), { params: Promise.resolve({ id: 'm1' }) }),
} as const

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe.each(Object.entries(doors))('verify via %s', (_name, verify) => {
  it('claims the guest order at their address and fills the blank name, company and consent', async () => {
    seed()
    const res = await verify()
    expect(res.status).toBe(200)
    expect(orders()[0]!.memberId).toBe('m1')
    expect(members().get('m1')).toMatchObject({
      emailVerified: true, fullName: 'Joanne Bloggs', organisation: 'Bloggs Ltd', marketingConsent: true,
    })
  })

  it('never overwrites a name the member typed themselves, but still fills the blank company', async () => {
    seed({ fullName: 'Jo B' })
    await verify()
    expect(members().get('m1')).toMatchObject({ fullName: 'Jo B', organisation: 'Bloggs Ltd' })
  })

  it('never overwrites a company the member typed themselves', async () => {
    seed({ organisation: 'Moved Firm' })
    await verify()
    expect(members().get('m1')).toMatchObject({ fullName: 'Joanne Bloggs', organisation: 'Moved Firm' })
  })

  it('leaves an order at somebody else\'s address alone', async () => {
    seed({}, [guestOrder({ customerEmail: 'other@example.com' })])
    await verify()
    expect(orders()[0]!.memberId).toBeNull()
    expect(members().get('m1')).toMatchObject({ fullName: null, organisation: null })
  })

  it('still verifies when the shop side blows up', async () => {
    seed()
    members().get('m1')!.email = 'jo@example.com'
    orders()[0] = new Proxy(guestOrder(), { get() { throw new Error('orders table on fire') } })
    const res = await verify()
    expect(res.status).toBe(200)
    expect(members().get('m1')!.emailVerified).toBe(true)
  })
})

describe('an unverified address', () => {
  it('claims nothing and fills nothing, whatever the caller says', async () => {
    seed()
    await notifyMemberEmailVerified('m1')
    expect(orders()[0]!.memberId).toBeNull()
    expect(members().get('m1')).toMatchObject({ emailVerified: false, fullName: null, organisation: null, marketingConsent: null })
  })
})
