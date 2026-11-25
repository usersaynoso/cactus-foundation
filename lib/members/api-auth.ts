import type { Member } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleServerExtensionPointComponents } from '@/lib/modules/extension-points.server'
import { checkRateLimit, clientIpFromHeaders, recordAttempt } from '@/lib/auth/rate-limit'
import { isBehindCloudflare } from '@/lib/config/site'
import { getMemberFromCookie } from '@/lib/members/session'

// Contract for the "core.member-api-auth" extension point, and the helper the
// member account routes use to find out who is asking.
//
// The member account routes (app/api/members/**) were cookie-only: a member's
// browser session was the one credential they knew. A module that ships a
// native app issues its own credential instead (a long random token the app
// sends as `Authorization: Bearer ...`), and the app's member must still be able
// to change their own profile and sign-in settings without a browser. Core does
// not know what a module's token looks like and must not: so a module registers
// a resolver here, and core asks each installed module's resolver, in turn,
// whether a Bearer token is one of theirs.
//
// Registered serverOnly in the module's manifest, no permission. The resolver:
//   - is given the raw token (already stripped of "Bearer ") and the request;
//   - returns null for anything that is not a live credential of its own -
//     unknown, malformed, revoked, wiped, expired - and never throws for those;
//   - returns { memberId, credentialId, label? } for a live one. credentialId is
//     the module's own stable id for that credential (a device row id, say), and
//     is what a step-up grant is bound to (lib/members/api-step-up.ts). label is
//     what the member would call it ("Chris's iPhone"), used for activity
//     entries and a passkey's name; optional.
// Core then loads the member itself and refuses anyone who is not ACTIVE,
// exactly as a cookie session does, so a resolver cannot raise a suspended or
// unverified member from the dead.
//
// What a token caller does NOT get: anything that needs a recent sign-in. A
// cookie session proves "signed in within ten minutes" by its age; a token has
// no such moment, so those routes ask a token caller for a step-up grant
// instead (lib/members/api-step-up.ts). Data export and self-delete stay
// cookie-only on purpose and never call this.
//
// A request carrying both a valid member cookie and a Bearer token is treated as
// the cookie: that is the case the routes were written for, and the origin
// check in proxy.ts covers it. A Bearer token is not an ambient credential, so a
// cross-site page cannot make a browser send one, and a token request needs no
// origin check.

export type MemberApiCredential = {
  memberId: string
  credentialId: string
  label?: string | null
}

export type MemberApiAuthResolver = (token: string, request: Request) => Promise<MemberApiCredential | null>

export type MemberRequestAuth =
  | { via: 'cookie'; member: Member }
  | {
      via: 'token'
      member: Member
      /** The module whose resolver recognised the token (its manifest name). */
      moduleName: string
      /** That module's own id for the credential. */
      credentialId: string
      label: string | null
    }

const POINT = 'core.member-api-auth'
export const RESOLVER_TIMEOUT_MS = 5_000
// Generous: a well-formed request never gets near it, and a real credential is
// 256 bits or so. Anything longer is not a token anyone issued.
const MAX_TOKEN_LENGTH = 512
const TOKEN_PATTERN = /^[\x21-\x7e]+$/

type ExtensionPointEntry = { point: string; id: string }
type NamedResolver = { moduleName: string; resolve: MemberApiAuthResolver }

/** Resolvers from modules that are actually installed, in manifest order. */
async function resolvers(): Promise<NamedResolver[]> {
  const map = moduleServerExtensionPointComponents[POINT] as Record<string, MemberApiAuthResolver> | undefined
  if (!map || Object.keys(map).length === 0) return []

  const out: NamedResolver[] = []
  for (const mod of await getInstalledManifests()) {
    const manifest = mod.manifest as { name?: string; extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.name) continue
    for (const entry of manifest.extensionPoints ?? []) {
      const resolve = entry.point === POINT ? map[entry.id] : undefined
      if (typeof resolve === 'function') out.push({ moduleName: manifest.name, resolve })
    }
  }
  return out
}

/** The Bearer token on a request, or null when there is none worth asking about. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  if (!token || token.length > MAX_TOKEN_LENGTH || !TOKEN_PATTERN.test(token)) return null
  return token
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`did not answer within ${ms}ms`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function validCredential(value: unknown): value is MemberApiCredential {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.memberId === 'string' &&
    v.memberId.length > 0 &&
    typeof v.credentialId === 'string' &&
    v.credentialId.length > 0 &&
    v.credentialId.length <= 200 &&
    (v.label === undefined || v.label === null || typeof v.label === 'string')
  )
}

async function clientIp(request: Request): Promise<string> {
  const trustCloudflare = await isBehindCloudflare().catch(() => false)
  return clientIpFromHeaders((name) => request.headers.get(name), { trustCloudflare })
}

/**
 * Who is asking, by member cookie first and then by a module's Bearer token.
 * Null when neither names an ACTIVE member.
 *
 * Bearer tokens nobody recognises are counted per IP address
 * ('member_api_token'); once an address is over the limit its tokens are not
 * even shown to the resolvers until the window passes. With no resolver
 * installed a Bearer token costs nothing and is simply not a sign-in.
 */
export async function getMemberAuthFromRequest(request: Request): Promise<MemberRequestAuth | null> {
  const cookieMember = await getMemberFromCookie()
  if (cookieMember) return { via: 'cookie', member: cookieMember }

  const token = bearerToken(request)
  if (!token) return null

  const list = await resolvers().catch((error: unknown) => {
    console.error('[members] could not list member API resolvers', error)
    return [] as NamedResolver[]
  })
  if (list.length === 0) return null

  const ip = await clientIp(request)
  const limit = await checkRateLimit('member_api_token', [`ip:${ip}`])
  if (!limit.allowed) return null

  for (const { moduleName, resolve } of list) {
    let credential: unknown = null
    try {
      credential = await withTimeout(Promise.resolve().then(() => resolve(token, request)), RESOLVER_TIMEOUT_MS)
    } catch (error) {
      console.error(`[members] ${moduleName}'s member API resolver failed`, error)
      continue
    }
    if (credential === null || credential === undefined) continue
    if (!validCredential(credential)) {
      console.error(`[members] ${moduleName}'s member API resolver returned something that is not a credential`)
      continue
    }
    const member = await prisma.member.findUnique({ where: { id: credential.memberId } })
    // Same rule as a cookie session (validateMemberSessionDetailed): only an
    // ACTIVE member is anybody. Not counted as a bad token - the credential was
    // real, the account is just not open.
    if (!member || member.status !== 'ACTIVE') return null
    return {
      via: 'token',
      member,
      moduleName,
      credentialId: credential.credentialId,
      label: credential.label?.trim() ? credential.label.trim().slice(0, 100) : null,
    }
  }

  await recordAttempt('member_api_token', [`ip:${ip}`])
  return null
}

/** The member behind a request, by cookie or module token. See getMemberAuthFromRequest. */
export async function getMemberFromRequest(request: Request): Promise<Member | null> {
  return (await getMemberAuthFromRequest(request))?.member ?? null
}
