// Public: which member auth methods are available. Mirrors /api/auth/config
// for the admin login page.
import { NextResponse } from 'next/server'
import { getMembersConfig, enabledAuthMethods, registrationPasswordPolicy } from '@/lib/members/config'
import { isTurnstileConfigured } from '@/lib/config/env'

export async function GET() {
  const config = await getMembersConfig()
  return NextResponse.json({
    // Per-method policies for anything that cares whether a method is merely
    // offered or actually compulsory; the flat list of what is switched on at
    // all for everything else.
    authMethodPolicies: config.authMethodPolicies,
    // What the sign-up form should do about a password specifically, which is
    // the PASSWORD policy unless the site has chosen not to ask at sign-up.
    // Sent separately so the form has one value to read rather than a rule to
    // re-derive.
    registrationPasswordPolicy: registrationPasswordPolicy(config),
    enabledAuthMethods: enabledAuthMethods(config),
    turnstileSiteKey: isTurnstileConfigured() ? process.env.TURNSTILE_SITE_KEY : null,
  })
}
