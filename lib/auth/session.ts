import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import {
  hashToken,
  generateToken,
  createSession,
  validateSession,
  deleteSession,
  deleteAllUserSessions,
  createTrustedDevice,
  revokeAllTrustedDevices,
  listUserSessions,
  revokeSessionById,
  safeCompare,
} from '@/lib/auth/session-core'
import type { SessionUser } from '@/lib/auth/session-core'

export type { SessionUser }
export {
  generateToken,
  createSession,
  validateSession,
  deleteSession,
  deleteAllUserSessions,
  createTrustedDevice,
  revokeAllTrustedDevices,
  listUserSessions,
  revokeSessionById,
  safeCompare,
}

const SESSION_COOKIE = 'cactus_session'
const TRUSTED_DEVICE_COOKIE = 'cactus_trusted'
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(Date.now() + SESSION_DURATION_MS),
    path: '/',
  })
}

export async function getSessionFromCookie(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return validateSession(token)
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function setTrustedDeviceCookie(
  token: string,
  durationDays: number
): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: durationDays * 24 * 60 * 60,
    path: '/',
  })
}

export async function isTrustedDevice(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value
  if (!token) return false

  const tokenHash = hashToken(token)
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash } })
  if (!device) return false
  if (device.userId !== userId) return false
  if (device.expiresAt < new Date()) {
    await prisma.trustedDevice.delete({ where: { id: device.id } })
    return false
  }

  // Refresh expiry on valid use — find the config for the duration
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { trustDeviceDays: true },
  })
  const days = config?.trustDeviceDays ?? 28
  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000) },
  })

  return true
}
