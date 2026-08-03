// Public: which member auth methods are available. Mirrors /api/auth/config
// for the admin login page.
import { NextResponse } from 'next/server'
import { getMembersConfig, enabledAuthMethods } from '@/lib/members/config'
import { isTurnstileConfigured } from '@/lib/config/env'

export async function GET() {
  const config = await getMembersConfig()
  return NextResponse.json({
    // Per-method policies for anything that cares whether a method is merely
    // offered or actually compulsory (the registration form's password field);
    // the flat list of what is switched on at all for everything else.
    authMethodPolicies: config.authMethodPolicies,
    enabledAuthMethods: enabledAuthMethods(config),
    turnstileSiteKey: isTurnstileConfigured() ? process.env.TURNSTILE_SITE_KEY : null,
  })
}
