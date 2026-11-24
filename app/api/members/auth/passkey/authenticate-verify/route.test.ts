import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'

// The member passkey ceremony end to end, with real WebAuthn signatures: a
// P-256 key pair stands in for the authenticator, and the route verifies the
// assertion against the stored COSE public key with the real library. Only the
// database, the session cookie and the rate limiter are faked.
//
// What is pinned here: "Admins can use their admin passkey to sign in to their
// member account" off changes nothing; on, a staff passkey opens the matching
// member account and nothing else; every refusal answers exactly like an
// unknown credential; and a member passkey still never opens the admin area.

const SITE = 'https://example.test'
const RP_ID = 'example.test'

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  challenges: new Map<string, Row>(),
  memberPasskeys: [] as Row[],
  adminPasskeys: [] as Row[],
  members: [] as Row[],
  membersConfig: {} as Row,
  siteConfigReads: 0,
  sessions: [] as string[],
  activity: [] as Array<{ memberId: string; type: string; opts: unknown }>,
}))

vi.mock('@/lib/db/prisma', () => {
  const byCredential = (rows: Row[], credentialId: string) => rows.find((r) => r.credentialId === credentialId) ?? null
  return {
    prisma: {
      webAuthnChallenge: {
        findUnique: vi.fn(async ({ where }: { where: { challenge: string } }) => db.challenges.get(where.challenge) ?? null),
        delete: vi.fn(async ({ where }: { where: { challenge: string } }) => {
          const row = db.challenges.get(where.challenge)
          if (!row) throw new Error('Record to delete does not exist')
          db.challenges.delete(where.challenge)
          return row
        }),
        deleteMany: vi.fn(async ({ where }: { where: { challenge: string } }) => {
          db.challenges.delete(where.challenge)
          return { count: 1 }
        }),
      },
      memberPasskey: {
        findUnique: vi.fn(async ({ where }: { where: { credentialId: string } }) => {
          const row = byCredential(db.memberPasskeys, where.credentialId)
          if (!row) return null
          return { ...row, member: db.members.find((m) => m.id === row.memberId) }
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = db.memberPasskeys.find((r) => r.id === where.id)!
          Object.assign(row, data)
          return row
        }),
      },
      passkey: {
        findUnique: vi.fn(async ({ where }: { where: { credentialId: string } }) => byCredential(db.adminPasskeys, where.credentialId)),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = db.adminPasskeys.find((r) => r.id === where.id)!
          Object.assign(row, data)
          return row
        }),
      },
      member: {
        findMany: vi.fn(async ({ where, take }: { where: { email: { equals: string } }; take: number }) =>
          db.members
            .filter((m) => String(m.email).toLowerCase() === where.email.equals.toLowerCase())
            .slice(0, take)
        ),
      },
      siteConfig: {
        findUnique: vi.fn(async () => {
          db.siteConfigReads++
          return { membersConfig: db.membersConfig }
        }),
      },
    },
  }
})
vi.mock('@/lib/members/session', () => ({
  createMemberSession: vi.fn(async (memberId: string) => {
    db.sessions.push(memberId)
    return 'session-token'
  }),
  setMemberSessionCookie: vi.fn(async () => {}),
}))
vi.mock('@/lib/members/activity', () => ({
  recordMemberActivity: vi.fn(async (memberId: string, type: string, opts: unknown) => {
    db.activity.push({ memberId, type, opts })
  }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkAndRecord: async () => ({ allowed: true }),
  getClientIp: async () => '127.0.0.1',
}))

import { POST } from './route'
import { verifyAuthentication as verifyAdminAuthentication } from '@/lib/auth/passkey'

// ---------------------------------------------------------------------------
// A tiny software authenticator
// ---------------------------------------------------------------------------

type Authenticator = { credentialId: string; privateKey: KeyObject; cosePublicKey: Uint8Array }

function makeAuthenticator(): Authenticator {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = new Map<number, number | Uint8Array>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, isoBase64URL.toBuffer(jwk.x!)],
    [-3, isoBase64URL.toBuffer(jwk.y!)],
  ])
  return {
    credentialId: isoBase64URL.fromBuffer(randomBytes(16)),
    privateKey,
    cosePublicKey: isoCBOR.encode(cose),
  }
}

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

function assertion(
  auth: Authenticator,
  challenge: string,
  opts: { origin?: string; userVerified?: boolean; counter?: number; signWith?: KeyObject } = {}
) {
  const flags = 0x01 | (opts.userVerified === false ? 0 : 0x04)
  const counter = Buffer.alloc(4)
  counter.writeUInt32BE(opts.counter ?? 1)
  const authenticatorData = Buffer.concat([sha256(RP_ID), Buffer.from([flags]), counter])
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge, origin: opts.origin ?? SITE, crossOrigin: false })
  )
  const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), opts.signWith ?? auth.privateKey)
  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
      authenticatorData: isoBase64URL.fromBuffer(authenticatorData),
      signature: isoBase64URL.fromBuffer(signature),
    },
    clientExtensionResults: {},
  }
}

function issueChallenge(purpose = 'member_authentication', memberId: string | null = null): string {
  const challenge = isoBase64URL.fromBuffer(randomBytes(32))
  db.challenges.set(challenge, { challenge, purpose, memberId, expiresAt: new Date(Date.now() + 60_000) })
  return challenge
}

async function signIn(body: unknown) {
  const res = await POST(
    new NextRequest(`${SITE}/api/members/auth/passkey/authenticate-verify`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
  return { status: res.status, body: await res.json() }
}

// ---------------------------------------------------------------------------
// Fixtures: Chris has an admin passkey and a member account, same address
// ---------------------------------------------------------------------------

let adminKey: Authenticator
let memberKey: Authenticator

function adminPasskeyRow(): Row {
  return db.adminPasskeys[0]!
}

function chrisMember(): Row {
  return db.members.find((m) => m.id === 'member_1')!
}

beforeEach(() => {
  vi.stubEnv('SITE_URL', SITE)
  vi.stubEnv('NODE_ENV', 'test')
  db.challenges.clear()
  db.sessions = []
  db.activity = []
  db.siteConfigReads = 0
  db.membersConfig = { enabled: true, adminPasskeySignInForMembers: true }

  adminKey = makeAuthenticator()
  memberKey = makeAuthenticator()

  const adminUser = { id: 'user_1', email: 'Chris@Example.com', emailVerifiedAt: new Date(), suspendedAt: null }
  db.adminPasskeys = [
    {
      id: 'pk_admin',
      userId: 'user_1',
      credentialId: adminKey.credentialId,
      publicKey: adminKey.cosePublicKey,
      counter: BigInt(0),
      transports: ['internal'],
      user: adminUser,
    },
  ]
  db.members = [
    { id: 'member_1', email: 'chris@example.com', emailVerified: true, status: 'ACTIVE', userId: null },
    { id: 'member_2', email: 'someone@example.com', emailVerified: true, status: 'ACTIVE', userId: null },
  ]
  db.memberPasskeys = [
    {
      id: 'pk_member',
      memberId: 'member_2',
      credentialId: memberKey.credentialId,
      publicKey: memberKey.cosePublicKey,
      counter: BigInt(0),
      transports: ['internal'],
    },
  ]
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const NOT_FOUND = { status: 400, body: { error: 'Passkey not found' } }

describe('member passkey sign-in with the linked admin passkey setting', () => {
  it('signs the admin in to the member account with the same address, and logs it', async () => {
    const challenge = issueChallenge()
    const res = await signIn(assertion(adminKey, challenge, { counter: 7 }))

    expect(res).toEqual({ status: 200, body: { verified: true, memberId: 'member_1' } })
    expect(db.sessions).toEqual(['member_1'])
    expect(db.activity).toEqual([
      { memberId: 'member_1', type: 'login', opts: { metadata: { method: 'PASSKEY', linkedAdminPasskey: true } } },
    ])
    // The counter on the admin row moves on, so the assertion cannot be replayed.
    expect(adminPasskeyRow().counter).toBe(BigInt(7))
    // And the challenge is spent.
    expect(db.challenges.has(challenge)).toBe(false)
  })

  it('refuses a replay of the same assertion', async () => {
    const challenge = issueChallenge()
    const body = assertion(adminKey, challenge)
    expect((await signIn(body)).status).toBe(200)
    expect(await signIn(body)).toEqual({ status: 400, body: { error: 'Invalid or expired challenge' } })
    expect(db.sessions).toEqual(['member_1'])
  })

  it('setting off: an admin passkey is an unknown credential, exactly as before', async () => {
    db.membersConfig = { enabled: true }
    const res = await signIn(assertion(adminKey, issueChallenge()))
    expect(res).toEqual(NOT_FOUND)
    expect(db.sessions).toEqual([])
    expect(adminPasskeyRow().counter).toBe(BigInt(0))
  })

  it('member passkeys work the same with the setting on or off, without reading the setting', async () => {
    let counter = 0
    for (const config of [{ enabled: true }, { enabled: true, adminPasskeySignInForMembers: true }]) {
      counter += 1
      db.membersConfig = config
      db.sessions = []
      db.activity = []
      db.siteConfigReads = 0
      const res = await signIn(assertion(memberKey, issueChallenge(), { counter }))
      expect(res).toEqual({ status: 200, body: { verified: true, memberId: 'member_2' } })
      expect(db.activity[0]?.opts).toEqual({ metadata: { method: 'PASSKEY' } })
      expect(db.siteConfigReads).toBe(0)
    }
  })

  it('setting on but member passkeys switched off: refused', async () => {
    db.membersConfig = { enabled: true, adminPasskeySignInForMembers: true, authMethodPolicies: { PASSKEY: 'OFF' } }
    expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
  })

  describe('every refusal looks like an unknown credential', () => {
    it('an unknown credential (the baseline)', async () => {
      expect(await signIn(assertion(makeAuthenticator(), issueChallenge()))).toEqual(NOT_FOUND)
    })

    it('a signature from the wrong key', async () => {
      const impostor = makeAuthenticator()
      expect(await signIn(assertion(adminKey, issueChallenge(), { signWith: impostor.privateKey }))).toEqual(NOT_FOUND)
      expect(adminPasskeyRow().counter).toBe(BigInt(0))
    })

    it('the wrong origin', async () => {
      expect(await signIn(assertion(adminKey, issueChallenge(), { origin: 'https://evil.test' }))).toEqual(NOT_FOUND)
    })

    it('no user verification', async () => {
      expect(await signIn(assertion(adminKey, issueChallenge(), { userVerified: false }))).toEqual(NOT_FOUND)
    })

    it('an admin challenge rather than a member one', async () => {
      const res = await signIn(assertion(adminKey, issueChallenge('authentication')))
      expect(res).toEqual({ status: 400, body: { error: 'Invalid or expired challenge' } })
    })

    it('no member with the address', async () => {
      db.members = db.members.filter((m) => m.id !== 'member_1')
      expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
    })

    it('an unverified member, a suspended member, a deleted member', async () => {
      for (const patch of [{ emailVerified: false }, { status: 'PENDING_VERIFICATION' }, { status: 'SUSPENDED' }, { status: 'DELETED' }]) {
        Object.assign(chrisMember(), { emailVerified: true, status: 'ACTIVE' }, patch)
        expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
      }
      expect(db.sessions).toEqual([])
    })

    it('an unverified or suspended admin', async () => {
      const user = adminPasskeyRow().user as Row
      user.emailVerifiedAt = null
      expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
      user.emailVerifiedAt = new Date()
      user.suspendedAt = new Date()
      expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
    })

    it('two members matching the address', async () => {
      db.members.push({ id: 'member_3', email: 'CHRIS@example.com', emailVerified: true, status: 'ACTIVE', userId: null })
      expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
    })

    it('a member tied to a different admin', async () => {
      chrisMember().userId = 'user_2'
      expect(await signIn(assertion(adminKey, issueChallenge()))).toEqual(NOT_FOUND)
    })

    it('a challenge scoped to a different member', async () => {
      expect(await signIn(assertion(adminKey, issueChallenge('member_authentication', 'member_2')))).toEqual(NOT_FOUND)
    })
  })

  it('a pending-approval member gets the same answer a member passkey would give', async () => {
    chrisMember().status = 'PENDING_APPROVAL'
    const res = await signIn(assertion(adminKey, issueChallenge()))
    expect(res).toEqual({ status: 403, body: { error: 'Your account is awaiting admin approval.' } })
    expect(db.sessions).toEqual([])
  })
})

describe('one way only', () => {
  it('a member passkey never opens the admin area', async () => {
    const challenge = issueChallenge('authentication')
    await expect(verifyAdminAuthentication(challenge, assertion(memberKey, challenge) as never)).rejects.toThrow(
      'Passkey not found'
    )
  })
})
