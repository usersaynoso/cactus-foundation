// Public: which member auth methods are available. Mirrors /api/auth/config
// for the admin login page.
import { NextResponse } from 'next/server'
import { getMembersConfig } from '@/lib/members/config'
import { isTurnstileConfigured } from '@/lib/config/env'

export async function GET() {
  const config = await getMembersConfig()
  return NextResponse.json({
    allowedAuthMethods: config.allowedAuthMethods,
    passwordsEnabled: config.passwordsEnabled,
    turnstileSiteKey: isTurnstileConfigured() ? process.env.TURNSTILE_SITE_KEY : null,
  })
}
