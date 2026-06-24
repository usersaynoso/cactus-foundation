import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession, clearSessionCookie } from '@/lib/auth/session'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('cactus_session')?.value

  if (token) {
    await deleteSession(token).catch(() => {})
  }

  await clearSessionCookie()
  return NextResponse.redirect(new URL('/logged-out', request.url))
}
